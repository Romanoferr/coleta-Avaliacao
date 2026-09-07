/**
 * Application store.
 *
 *   UI → casos de uso (aqui) → domínio (valida) → repositories → backend
 *
 * Backend: Supabase quando VITE_SUPABASE_* configurado; senão localStorage
 * (mesmo comportamento de antes). Nenhuma tela importa `supabase` ou
 * `localStorage` diretamente.
 *
 * Ficha: edição em cópia local + autosave com debounce e confirmação real
 * (saved/saving/pending/error). Rascunho sobrevive a reload/offline via
 * draft cache; Supabase é a fonte de verdade.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Address } from "../domain/address";
import type { CreateOrderInput, ServiceOrder, ServiceOrderStatus, UpdateOrderInput } from "../domain/serviceOrder";
import { DomainError } from "../domain/ids";
import {
  changeServiceOrderStatus,
  createServiceOrder,
  isOrderTerminal,
  reopenServiceOrder,
  softDeleteServiceOrder,
  updateServiceOrder,
} from "../domain/serviceOrder";
import type { Inspection } from "../domain/inspection";
import { setInspectionAnswer } from "../domain/inspection";
import type { DocumentKind, DocumentMeta } from "../domain/document";
import { nowIso } from "../domain/ids";
import type { PropertyType } from "../form-engine/types";
import { getFormDefinition } from "../form-engine/registry";
import { getSupabase, isSupabaseConfigured } from "../infrastructure/supabase/client";
import { RepoError, repoErrorMessage } from "../repositories/errors";
import type { InspectionRef, OrderPatch, Repositories } from "../repositories/ports";
import { browserStorage, createLocalRepos } from "../repositories/local/localRepos";
import { createSupabaseRepos } from "../repositories/supabase/supabaseRepos";
import { loadDb, saveDb } from "../persistence/db";
import { migrateLegacyToV1, readLegacyEvaluation } from "../persistence/migrateV0";
import { useAuth } from "./auth";

const SNAPSHOT_BASE = "coleta-avaliacao:cache:v1";
const DRAFT_BASE = "coleta-avaliacao:draft:";
const CLOUD_MIGRATED_KEY = "coleta-avaliacao:cloud-migrated";
const AUTOSAVE_MS = 1200;

/**
 * Escopo do cache: id do usuário autenticado, ou "local" no modo offline.
 * Nunca misturar dados de principais diferentes no mesmo bucket.
 */
type CacheScope = string;

function snapshotKey(scope: CacheScope): string {
  return `${SNAPSHOT_BASE}:${scope}`;
}

export type Backend = "supabase" | "local";

// ---------- storage helpers (draft cache, snapshot, flags) ----------

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

interface Snapshot {
  at: string;
  orders: ServiceOrder[];
  refs: InspectionRef[];
}

function readSnapshot(scope: CacheScope): Snapshot | null {
  try {
    const raw = storage()?.getItem(snapshotKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.refs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(scope: CacheScope, orders: ServiceOrder[], refs: InspectionRef[]): void {
  try {
    storage()?.setItem(snapshotKey(scope), JSON.stringify({ at: nowIso(), orders, refs }));
  } catch {
    /* ignore */
  }
}

interface DraftCache {
  draft: Inspection;
  baseUpdatedAt: string;
}

function draftKey(scope: CacheScope, id: string): string {
  return `${DRAFT_BASE}${scope}:${id}`;
}

function readDraftCache(scope: CacheScope, inspectionId: string): DraftCache | null {
  try {
    const raw = storage()?.getItem(draftKey(scope, inspectionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftCache;
    if (!parsed.draft || typeof parsed.baseUpdatedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraftCache(scope: CacheScope, inspectionId: string, cache: DraftCache): void {
  try {
    storage()?.setItem(draftKey(scope, inspectionId), JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function clearDraftCache(scope: CacheScope, inspectionId: string): void {
  try {
    storage()?.removeItem(draftKey(scope, inspectionId));
  } catch {
    /* ignore */
  }
}

// ---------- migração legada v0 (modo local) ----------

/**
 * Chaves de cache pré-escopo (snapshot e drafts sem usuário) eram
 * compartilhadas entre logins no mesmo navegador — por isso saem de cena:
 * - modo local (dono único): renomeia para o escopo "local" (preserva trabalho);
 * - modo nuvem: apaga (sem dono atribuível; servidor é a verdade).
 * Roda uma vez; melhor esforço.
 */
function migrateUnscopedCache(scope: CacheScope): void {
  try {
    const s = storage();
    if (!s) return;
    const legacySnap = s.getItem(SNAPSHOT_BASE);
    if (scope === "local") {
      if (legacySnap) s.setItem(snapshotKey(scope), legacySnap);
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(DRAFT_BASE) && k.split(":").length === 3) {
          const raw = s.getItem(k);
          if (raw) s.setItem(`${DRAFT_BASE}${scope}:${k.slice(DRAFT_BASE.length)}`, raw);
          s.removeItem(k);
        }
      }
    }
    s.removeItem(SNAPSHOT_BASE);
    if (scope !== "local") {
      const doomed: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(DRAFT_BASE) && k.split(":").length === 3) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    }
  } catch {
    /* ignore */
  }
}

function ensureLegacyMigration(): void {
  const s = browserStorage();
  if (!s) return;
  const db = loadDb();
  if (db.orders.length > 0 || db.inspections.length > 0) return;
  const legacy = readLegacyEvaluation();
  const migrated = migrateLegacyToV1(legacy);
  if (!migrated) return;
  saveDb({
    ...db,
    orders: [{ ...migrated.order, inspectionId: migrated.inspection.id }],
    inspections: [migrated.inspection],
    migratedFrom: legacy?.id ? [`v0-${legacy.id}`] : ["v0-unknown"],
  });
}

// ---------- diff domínio → patch do repositório ----------

function diffOrderPatch(prev: ServiceOrder, next: ServiceOrder): OrderPatch {
  const patch: OrderPatch = {};
  if (next.number !== prev.number) patch.number = next.number;
  if (next.contractor !== prev.contractor) patch.contractor = next.contractor;
  if (next.receivedAt !== prev.receivedAt) patch.receivedAt = next.receivedAt;
  if (next.inspectionDate !== prev.inspectionDate) patch.inspectionDate = next.inspectionDate;
  if (next.inspectionTime !== prev.inspectionTime) patch.inspectionTime = next.inspectionTime;
  if (next.dueDate !== prev.dueDate) patch.dueDate = next.dueDate;
  if (JSON.stringify(next.address) !== JSON.stringify(prev.address)) patch.address = next.address;
  if (next.contactName !== prev.contactName) patch.contactName = next.contactName;
  if (next.contactPhone !== prev.contactPhone) patch.contactPhone = next.contactPhone;
  if (next.notes !== prev.notes) patch.notes = next.notes;
  if (next.status !== prev.status) patch.status = next.status;
  if (JSON.stringify(next.statusHistory) !== JSON.stringify(prev.statusHistory)) patch.statusHistory = next.statusHistory;
  if (next.deletedAt !== prev.deletedAt) patch.deletedAt = next.deletedAt;
  if (JSON.stringify(next.geo) !== JSON.stringify(prev.geo)) {
    patch.geo = next.geo;
    patch.geocodedAt = next.geo ? nowIso() : null;
  }
  if (next.geocodedAddress !== prev.geocodedAddress) patch.geocodedAddress = next.geocodedAddress;
  return patch;
}

function prefillIdentification(propertyType: PropertyType, inspectionDate: string | null): Inspection["data"] {
  if (!inspectionDate) return {};
  try {
    const form = getFormDefinition(propertyType);
    const ident = form.sections.find((s) => s.id === "identificacao");
    if (!ident) return {};
    const inner: Record<string, string | number | string[]> = {};
    for (const f of ident.fields) {
      if (f.type === "date") inner[f.id] = inspectionDate;
    }
    return Object.keys(inner).length > 0 ? { identificacao: inner } : {};
  } catch {
    return {};
  }
}

// ---------- store ----------

interface Store {
  backend: Backend;
  ready: boolean;
  loadError: string | null;
  /** Snapshot somente-leitura (offline): edições desativadas. */
  stale: boolean;
  reload: () => Promise<void>;
  orders: ServiceOrder[];
  inspectionRefs: InspectionRef[];
  getOrder: (id: string) => ServiceOrder | undefined;
  inspectionOf: (order: ServiceOrder) => InspectionRef | undefined;
  docsByOrder: Record<string, DocumentMeta[]>;
  docsStatus: Record<string, "idle" | "loading" | "ready" | "error">;
  ensureDocuments: (orderId: string) => Promise<void>;
  createOrder: (input: CreateOrderInput) => Promise<ServiceOrder>;
  updateOrder: (id: string, patch: UpdateOrderInput) => Promise<void>;
  changeStatus: (id: string, to: ServiceOrderStatus, note?: string) => Promise<void>;
  reopen: (id: string, to: ServiceOrderStatus) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  startInspection: (orderId: string, propertyType: PropertyType) => Promise<InspectionRef>;
  addDocument: (orderId: string, input: { name: string; kind: DocumentKind }) => Promise<DocumentMeta>;
  deleteDocument: (id: string, orderId: string) => Promise<void>;
  noteInspectionRef: (ref: InspectionRef) => void;
  /** Acesso direto à ficha completa (usado pelo editor com autosave). */
  fetchInspection: (id: string) => Promise<Inspection | null>;
  fetchInspectionByOrder: (orderId: string) => Promise<Inspection | null>;
  saveInspectionPatch: (
    id: string,
    patch: { data?: Inspection["data"]; currentSectionIndex?: number; status?: Inspection["status"]; finishedAt?: string | null },
    expectedUpdatedAt?: string
  ) => Promise<Inspection>;
  cloudMigration: { needed: boolean; running: boolean; result: { orders: number; inspections: number; documents: number; errors: string[] } | null };
  migrateLocalToCloud: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

function friendly(e: unknown): string {
  if (e instanceof DomainError) return e.message;
  return repoErrorMessage(e);
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [backend] = useState<Backend>(() => (isSupabaseConfigured() ? "supabase" : "local"));
  const { status: authStatus, user } = useAuth();
  // Principal dono do cache: uid da sessão, ou "local" no modo offline.
  // null = sem sessão (logout): nada sensível em memória.
  const principal: string | null =
    authStatus === "local" ? "local" : authStatus === "authenticated" && user ? user.id : null;
  const scopeRef = useRef(principal);
  scopeRef.current = principal;
  const repos = useMemo<Repositories>(() => {
    if (backend === "supabase") {
      const client = getSupabase();
      if (client) return createSupabaseRepos(client);
    }
    ensureLegacyMigration();
    const s = browserStorage();
    if (!s) throw new Error("Armazenamento local indisponível.");
    return createLocalRepos(s);
  }, [backend]);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [refs, setRefs] = useState<InspectionRef[]>([]);
  const [docsByOrder, setDocsByOrder] = useState<Record<string, DocumentMeta[]>>({});
  const [docsStatus, setDocsStatus] = useState<Record<string, "idle" | "loading" | "ready" | "error">>({});
  const [migration, setMigration] = useState<{ needed: boolean; running: boolean; result: { orders: number; inspections: number; documents: number; errors: string[] } | null }>({
    needed: false,
    running: false,
    result: null,
  });

  const linkRefs = useCallback((list: ServiceOrder[], r: InspectionRef[]): ServiceOrder[] => {
    return list.map((o) => ({ ...o, inspectionId: r.find((x) => x.orderId === o.id)?.id ?? null }));
  }, []);

  const load = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope) return;
    setLoadError(null);
    try {
      const [list, r] = await Promise.all([repos.orders.list(), repos.inspections.listRefs()]);
      const linked = linkRefs(list, r);
      setOrders(linked);
      setRefs(r);
      setStale(false);
      if (backend === "supabase") writeSnapshot(scope, linked, r);
    } catch (e) {
      if (backend === "supabase") {
        const snap = readSnapshot(scope);
        if (snap) {
          setOrders(snap.orders);
          setRefs(snap.refs);
          setStale(true);
          setReady(true);
          return;
        }
      }
      setLoadError(friendly(e));
    } finally {
      setReady(true);
    }
  }, [repos, backend, linkRefs]);

  const prevPrincipal = useRef<string | null | undefined>(undefined);
  const cacheMigrated = useRef(false);
  useEffect(() => {
    // Aguarda a sessão restaurar antes do primeiro load (evita ler como anon).
    if (authStatus === "loading") return;
    if (!cacheMigrated.current && principal !== null) {
      cacheMigrated.current = true;
      migrateUnscopedCache(principal);
    }
    // Troca de usuário (inclusive logout): descarta tudo do principal anterior
    // ANTES de buscar — RLS filtra o servidor, mas a memória é nossa obrigação.
    if (prevPrincipal.current !== undefined && prevPrincipal.current !== principal) {
      setOrders([]);
      setRefs([]);
      setDocsByOrder({});
      setDocsStatus({});
      setStale(false);
      setLoadError(null);
    }
    prevPrincipal.current = principal;
    if (principal === null) {
      setReady(true);
      return;
    }
    setReady(false);
    void load();
  }, [principal, authStatus, load]);

  // Migração local → nuvem: oferecida uma vez, via ação do usuário.
  useEffect(() => {
    if (backend !== "supabase") return;
    try {
      if (storage()?.getItem(CLOUD_MIGRATED_KEY) === "1") return;
      const local = loadDb();
      if (local.orders.length === 0) {
        storage()?.setItem(CLOUD_MIGRATED_KEY, "1");
        return;
      }
      setMigration((m) => ({ ...m, needed: true }));
    } catch {
      /* sem acesso ao storage: sem migração */
    }
  }, [backend, ready]);

  const requireOrder = useCallback(
    (id: string): ServiceOrder => {
      const order = orders.find((o) => o.id === id);
      if (!order) throw new DomainError("NOT_FOUND", "OS não encontrada.");
      return order;
    },
    [orders]
  );

  const store: Store = useMemo(() => {
    const identities = orders.map((o) => ({ id: o.id, number: o.number, deletedAt: o.deletedAt }));
    return {
      backend,
      ready,
      loadError,
      stale,
      reload: load,
      orders,
      inspectionRefs: refs,
      getOrder: (id) => orders.find((o) => o.id === id),
      inspectionOf: (order) => refs.find((r) => r.orderId === order.id),
      docsByOrder,
      docsStatus,

      ensureDocuments: async (orderId: string) => {
        setDocsStatus((s) => (s[orderId] === "ready" || s[orderId] === "loading" ? s : { ...s, [orderId]: "loading" }));
        try {
          const docs = await repos.documents.listByOrder(orderId);
          setDocsByOrder((m) => ({ ...m, [orderId]: docs }));
          setDocsStatus((s) => ({ ...s, [orderId]: "ready" }));
        } catch {
          setDocsStatus((s) => ({ ...s, [orderId]: s[orderId] === "ready" ? "ready" : "error" }));
        }
      },

      createOrder: async (input) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para criar OS.");
        // Validação de forma + unicidade local (rápida); banco decide em corrida.
        createServiceOrder(input, identities);
        const created = await repos.orders.create(input);
        setOrders((prev) => linkRefs([created, ...prev], refs));
        return created;
      },

      updateOrder: async (id, patch) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para salvar.");
        const order = requireOrder(id);
        const next = updateServiceOrder(order, patch, identities);
        const updated = await repos.orders.update(id, diffOrderPatch(order, next), order.updatedAt);
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...updated, inspectionId: o.inspectionId } : o)));
      },

      changeStatus: async (id, to, note) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para salvar.");
        const order = requireOrder(id);
        const next = changeServiceOrderStatus(order, to, nowIso(), note);
        const updated = await repos.orders.update(id, diffOrderPatch(order, next), order.updatedAt);
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...updated, inspectionId: o.inspectionId } : o)));
      },

      reopen: async (id, to) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para salvar.");
        const order = requireOrder(id);
        const next = reopenServiceOrder(order, to);
        const updated = await repos.orders.update(id, diffOrderPatch(order, next), order.updatedAt);
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...updated, inspectionId: o.inspectionId } : o)));
      },

      deleteOrder: async (id) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para salvar.");
        const order = requireOrder(id);
        const now = nowIso();
        const next = softDeleteServiceOrder(order, now);
        await repos.orders.update(id, diffOrderPatch(order, next), order.updatedAt);
        // Cascata lógica: ficha + documentos acompanham a OS.
        const ref = refs.find((r) => r.orderId === id);
        if (ref) {
          try {
            await repos.inspections.update(ref.id, { deletedAt: now });
          } catch {
            /* melhor esforço: OS já saiu da lista */
          }
          setRefs((prev) => prev.filter((r) => r.id !== ref.id));
        }
        const docs = await repos.documents.listByOrder(id).catch(() => [] as DocumentMeta[]);
        for (const d of docs) {
          try {
            await repos.documents.softDelete(d.id);
          } catch {
            /* melhor esforço */
          }
        }
        setDocsByOrder((m) => {
          const copy = { ...m };
          delete copy[id];
          return copy;
        });
        setOrders((prev) => prev.filter((o) => o.id !== id));
      },

      startInspection: async (orderId, propertyType) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para criar a ficha.");
        const order = requireOrder(orderId);
        if (order.deletedAt !== null) throw new DomainError("ORDER_DELETED", "OS excluída não recebe ficha.");
        if (isOrderTerminal(order))
          throw new DomainError("ORDER_TERMINAL", "OS concluída/cancelada não recebe nova ficha. Reabra a OS primeiro.");
        if (refs.some((r) => r.orderId === orderId))
          throw new DomainError("INSPECTION_EXISTS", "Esta OS já possui ficha. Abra a ficha existente.");
        const created = await repos.inspections.create({
          orderId: order.id,
          propertyType,
          data: prefillIdentification(propertyType, order.inspectionDate),
        });
        const ref: InspectionRef = {
          id: created.id,
          orderId: created.orderId,
          propertyType: created.propertyType,
          status: created.status,
          updatedAt: created.updatedAt,
        };
        setRefs((prev) => [ref, ...prev]);
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, inspectionId: ref.id } : o)));
        return ref;
      },

      addDocument: async (orderId, input) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para salvar.");
        const doc = await repos.documents.create(orderId, input);
        setDocsByOrder((m) => ({ ...m, [orderId]: [doc, ...(m[orderId] ?? [])] }));
        return doc;
      },

      deleteDocument: async (docId, orderId) => {
        if (stale) throw new RepoError("NETWORK", "Sem conexão. Reconecte para salvar.");
        await repos.documents.softDelete(docId);
        setDocsByOrder((m) => ({ ...m, [orderId]: (m[orderId] ?? []).filter((d) => d.id !== docId) }));
      },

      noteInspectionRef: (ref) => {
        setRefs((prev) => {
          const exists = prev.some((r) => r.id === ref.id);
          return exists ? prev.map((r) => (r.id === ref.id ? ref : r)) : [ref, ...prev];
        });
        setOrders((prev) => prev.map((o) => (o.id === ref.orderId ? { ...o, inspectionId: ref.id } : o)));
      },

      fetchInspection: (inspectionId) => repos.inspections.get(inspectionId),

      fetchInspectionByOrder: (orderId) => repos.inspections.getByOrderId(orderId),

      saveInspectionPatch: async (inspectionId, patch, expectedUpdatedAt) => {
        const updated = await repos.inspections.update(inspectionId, patch, expectedUpdatedAt);
        const ref: InspectionRef = {
          id: updated.id,
          orderId: updated.orderId,
          propertyType: updated.propertyType,
          status: updated.status,
          updatedAt: updated.updatedAt,
        };
        setRefs((prev) => prev.map((r) => (r.id === ref.id ? ref : r)));
        return updated;
      },

      cloudMigration: migration,

      migrateLocalToCloud: async () => {
        setMigration((m) => ({ ...m, running: true }));
        const result = { orders: 0, inspections: 0, documents: 0, errors: [] as string[] };
        try {
          const local = loadDb();
          for (const o of local.orders) {
            if (o.deletedAt !== null) continue;
            try {
              const created = await repos.orders.create({
                number: o.number,
                contractor: o.contractor,
                receivedAt: o.receivedAt,
                inspectionDate: o.inspectionDate,
                inspectionTime: o.inspectionTime,
                dueDate: o.dueDate,
                address: o.address,
                contactName: o.contactName,
                contactPhone: o.contactPhone,
                notes: o.notes,
              });
              result.orders += 1;
              if (o.status !== "received") {
                try {
                  await repos.orders.update(created.id, { status: o.status, statusHistory: o.statusHistory });
                } catch {
                  result.errors.push(`OS ${o.number}: status não migrado (recreate manualmente).`);
                }
              }
              const insp = local.inspections.find((i) => i.id === o.inspectionId && i.deletedAt === null);
              if (insp) {
                try {
                  await repos.inspections.create({
                    orderId: created.id,
                    propertyType: insp.propertyType,
                    data: insp.data,
                    currentSectionIndex: insp.currentSectionIndex,
                    status: insp.status,
                    startedAt: insp.startedAt,
                    finishedAt: insp.finishedAt,
                  });
                  result.inspections += 1;
                } catch {
                  result.errors.push(`OS ${o.number}: ficha não migrada.`);
                }
              }
              const docs = local.documents.filter((d) => d.orderId === o.id && d.deletedAt === null);
              for (const d of docs) {
                try {
                  await repos.documents.create(created.id, { name: d.name, kind: d.kind });
                  result.documents += 1;
                } catch {
                  result.errors.push(`OS ${o.number}: documento "${d.name}" não migrado.`);
                }
              }
            } catch {
              result.errors.push(`OS ${o.number}: número duplicado ou inválido na nuvem.`);
            }
          }
          // Recarrega a lista da nuvem e marca a migração como feita.
          const [list, r] = await Promise.all([repos.orders.list(), repos.inspections.listRefs()]);
          setOrders(linkRefs(list, r));
          setRefs(r);
          try {
            storage()?.setItem(CLOUD_MIGRATED_KEY, "1");
          } catch {
            /* ignore */
          }
          setMigration({ needed: result.errors.length > 0, running: false, result });
        } catch (e) {
          setMigration((m) => ({
            ...m,
            running: false,
            result: { ...result, errors: [...result.errors, friendly(e)] },
          }));
        }
      },
    };
  }, [backend, ready, loadError, stale, orders, refs, docsByOrder, docsStatus, repos, linkRefs, load, migration, requireOrder]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("useStore fora do DbProvider");
  return store;
}

// ---------- editor da ficha (cópia local + autosave real) ----------

export type EditorSaveState = "saved" | "saving" | "pending" | "error";

export interface InspectionEditor {
  phase: "loading" | "ready" | "error";
  error: string | null;
  reload: () => Promise<void>;
  order: ServiceOrder | null;
  draft: Inspection | null;
  saveState: EditorSaveState;
  savedAtLabel: string | null;
  saveError: string | null;
  /** Rascunho local mais novo que o servidor (offline ou falha anterior). */
  offlineNote: boolean;
  setAnswer: (sectionId: string, fieldId: string, value: string | number | string[]) => void;
  goSection: (index: number) => void;
  flush: () => Promise<void>;
  finish: () => Promise<void>;
  reopen: () => Promise<void>;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function useInspectionEditor(orderId: string | undefined): InspectionEditor {
  const store = useStore();
  const { user: authUser } = useAuth();
  // Mesmo escopo do DbProvider: rascunho de um usuário nunca é lido por outro.
  const scope = authUser?.id ?? "local";
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [draft, setDraft] = useState<Inspection | null>(null);
  const [saveState, setSaveState] = useState<EditorSaveState>("saved");
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState(false);

  const reposRef = useRef(store);
  reposRef.current = store;
  const baseUpdatedAt = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const draftRef = useRef<Inspection | null>(null);
  draftRef.current = draft;

  const load = useCallback(async () => {
    if (!orderId) {
      setPhase("error");
      setError("OS não informada.");
      return;
    }
    setPhase("loading");
    setError(null);
    setOfflineNote(false);
    try {
      const s = reposRef.current;
      let ord = s.getOrder(orderId) ?? null;
      if (!ord) {
        // Deep-link com cache vazio: recarrega a lista e tenta de novo.
        await s.reload();
        ord = s.getOrder(orderId) ?? null;
      }
      if (!ord || ord.deletedAt !== null) throw new DomainError("NOT_FOUND", "OS não encontrada.");
      setOrder(ord);
      // Busca canônica por order (o pointer do cache pode estar desatualizado).
      const server = await s.fetchInspectionByOrder(orderId);
      if (!server) {
        setDraft(null);
        baseUpdatedAt.current = null;
        setPhase("ready");
        return;
      }
      baseUpdatedAt.current = server.updatedAt;
      const cached = readDraftCache(scope, server.id);
      if (cached && cached.draft.updatedAt > server.updatedAt && cached.draft.orderId === server.orderId) {
        setDraft(cached.draft);
        setOfflineNote(true);
        setSaveState("pending");
      } else {
        setDraft(server);
        clearDraftCache(scope, server.id);
        setSaveState("saved");
        setSavedAtLabel(timeLabel(server.updatedAt));
      }
      setPhase("ready");
    } catch (e) {
      // Offline com rascunho: permite continuar de onde parou.
      setError(e instanceof DomainError ? e.message : repoErrorMessage(e));
      setPhase("error");
    }
  }, [orderId, scope]);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const persist = useCallback(async () => {
    const d = draftRef.current;
    const base = baseUpdatedAt.current;
    if (!d || !base || saving.current) return;
    // Nada a salvar se o rascunho já é o confirmado.
    if (d.updatedAt <= base && saveStateRef.current === "saved") return;
    saving.current = true;
    setSaveState("saving");
    setSaveError(null);
    try {
      const s = reposRef.current;
      const updated = await s.saveInspectionPatch(
        d.id,
        { data: d.data, currentSectionIndex: d.currentSectionIndex },
        base
      );
      baseUpdatedAt.current = updated.updatedAt;
      setDraft((prev) => (prev ? { ...prev, updatedAt: updated.updatedAt } : prev));
      clearDraftCache(scope, d.id);
      setSaveState("saved");
      setSavedAtLabel(timeLabel(updated.updatedAt));
      s.noteInspectionRef({
        id: updated.id,
        orderId: updated.orderId,
        propertyType: updated.propertyType,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof DomainError ? e.message : repoErrorMessage(e));
      writeDraftCache(scope, d.id, { draft: d, baseUpdatedAt: base });
    } finally {
      saving.current = false;
    }
  }, []);

  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;

  const schedule = useCallback(() => {
    setSaveState("pending");
    const d = draftRef.current;
    if (d && baseUpdatedAt.current) writeDraftCache(scope, d.id, { draft: d, baseUpdatedAt: baseUpdatedAt.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist();
    }, AUTOSAVE_MS);
  }, [persist, scope]);

  const mutateDraft = useCallback(
    (fn: (d: Inspection) => Inspection) => {
      setDraft((prev) => {
        if (!prev) return prev;
        return { ...prev, ...fn(prev), updatedAt: nowIso() };
      });
      schedule();
    },
    [schedule]
  );

  return {
    phase,
    error,
    reload: load,
    order,
    draft,
    saveState,
    savedAtLabel,
    saveError,
    offlineNote,
    setAnswer: (sectionId, fieldId, value) =>
      mutateDraft((d) => setInspectionAnswer(d, sectionId, fieldId, value)),
    goSection: (index) =>
      mutateDraft((d) => ({ ...d, currentSectionIndex: Math.max(0, index) })),
    flush: async () => {
      if (timer.current) clearTimeout(timer.current);
      await persist();
      if (saveStateRef.current === "error") {
        const d = draftRef.current;
        throw new Error(d ? "Falha ao salvar." : "Nada a salvar.");
      }
    },
    finish: async () => {
      const d = draftRef.current;
      const base = baseUpdatedAt.current;
      if (!d || !base) throw new Error("Ficha não carregada.");
      if (timer.current) clearTimeout(timer.current);
      await persist();
      const s = reposRef.current;
      const updated = await s.saveInspectionPatch(
        d.id,
        { status: "finished", finishedAt: nowIso() },
        baseUpdatedAt.current ?? undefined
      );
      baseUpdatedAt.current = updated.updatedAt;
      setDraft(updated);
      clearDraftCache(scope, d.id);
      setSaveState("saved");
      setSavedAtLabel(timeLabel(updated.updatedAt));
      s.noteInspectionRef({
        id: updated.id,
        orderId: updated.orderId,
        propertyType: updated.propertyType,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    },
    reopen: async () => {
      const d = draftRef.current;
      const base = baseUpdatedAt.current;
      if (!d || !base) throw new Error("Ficha não carregada.");
      const s = reposRef.current;
      const updated = await s.saveInspectionPatch(d.id, { status: "draft", finishedAt: null }, base);
      baseUpdatedAt.current = updated.updatedAt;
      setDraft(updated);
      setSaveState("saved");
      setSavedAtLabel(timeLabel(updated.updatedAt));
      s.noteInspectionRef({
        id: updated.id,
        orderId: updated.orderId,
        propertyType: updated.propertyType,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    },
  };
}

/** Formata Address de formulário → Address canônico (helper de UI). */
export function addressFromForm(v: Record<string, string>): Address {
  const out: Address = {};
  if (v.street?.trim()) out.street = v.street.trim();
  if (v.number?.trim()) out.number = v.number.trim();
  if (v.complement?.trim()) out.complement = v.complement.trim();
  if (v.district?.trim()) out.district = v.district.trim();
  if (v.city?.trim()) out.city = v.city.trim();
  if (v.state?.trim()) out.state = v.state.trim();
  if (v.postalCode?.trim()) out.postalCode = v.postalCode.trim();
  if (v.raw?.trim()) out.raw = v.raw.trim();
  return out;
}

/**
 * Application store: estado Db (orders + inspections + documents) + casos de uso.
 * Componentes chamam ações daqui; o domínio valida; a persistência salva.
 * Na primeira carga, migra o rascunho legado v0 (se houver) uma única vez.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Address } from "../domain/address";
import type { CreateOrderInput, ServiceOrder, ServiceOrderStatus, UpdateOrderInput } from "../domain/serviceOrder";
import { DomainError } from "../domain/ids";
import {
  changeServiceOrderStatus,
  createServiceOrder,
  isOrderTerminal,
  reopenServiceOrder,
  restoreServiceOrder,
  softDeleteServiceOrder,
  updateServiceOrder,
} from "../domain/serviceOrder";
import type { Inspection } from "../domain/inspection";
import {
  createInspection,
  finishInspection,
  goToInspectionSection,
  reopenInspection,
  setInspectionAnswer,
  softDeleteInspection,
} from "../domain/inspection";
import type { DocumentKind, DocumentMeta } from "../domain/document";
import { createDocumentMeta, softDeleteDocument } from "../domain/document";
import { nowIso } from "../domain/ids";
import type { PropertyType } from "../form-engine/types";
import { getFormDefinition } from "../form-engine/registry";
import type { Db } from "../persistence/db";
import { emptyDb, loadDb, saveDb } from "../persistence/db";
import { migrateLegacyToV1, readLegacyEvaluation } from "../persistence/migrateV0";

function initDb(): Db {
  const db = loadDb();
  const alreadyHasData = db.orders.length > 0 || db.inspections.length > 0;
  if (alreadyHasData) return db;
  const legacy = readLegacyEvaluation();
  const migrated = migrateLegacyToV1(legacy);
  if (!migrated) return db;
  return {
    ...db,
    orders: [migrated.order],
    inspections: [migrated.inspection],
    migratedFrom: legacy?.id ? [`v0-${legacy.id}`] : ["v0-unknown"],
  };
}

interface Store {
  orders: ServiceOrder[];
  inspections: Inspection[];
  documents: DocumentMeta[];
  getOrder: (id: string) => ServiceOrder | undefined;
  getInspection: (id: string) => Inspection | undefined;
  inspectionOf: (order: ServiceOrder) => Inspection | undefined;
  documentsOf: (orderId: string) => DocumentMeta[];
  createOrder: (input: CreateOrderInput) => ServiceOrder;
  updateOrder: (id: string, patch: UpdateOrderInput) => void;
  changeStatus: (id: string, to: ServiceOrderStatus, note?: string) => void;
  reopen: (id: string, to: ServiceOrderStatus) => void;
  deleteOrder: (id: string) => void;
  startInspection: (orderId: string, propertyType: PropertyType) => Inspection;
  setAnswer: (inspectionId: string, sectionId: string, fieldId: string, value: string | number | string[]) => void;
  goSection: (inspectionId: string, index: number) => void;
  finishInspection: (inspectionId: string) => void;
  reopenInspection: (inspectionId: string) => void;
  addDocument: (orderId: string, input: { name: string; kind: DocumentKind }) => DocumentMeta;
  deleteDocument: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

function requireOrder(db: Db, id: string): ServiceOrder {
  const order = db.orders.find((o) => o.id === id);
  if (!order) throw new DomainError("NOT_FOUND", "OS não encontrada.");
  return order;
}

/** Pré-preenche datas da seção identificacao com a data da OS (sem sobrescrever). */
function prefillDatesFromOrder(propertyType: PropertyType, inspectionDate: string | null): Inspection["data"] {
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

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(initDb);

  useEffect(() => {
    saveDb(db);
  }, [db]);

  const mutate = useCallback((fn: (prev: Db) => Db) => setDb((prev) => fn(prev)), []);

  const store: Store = useMemo(() => {
    return {
      orders: db.orders,
      inspections: db.inspections,
      documents: db.documents,
      getOrder: (id) => db.orders.find((o) => o.id === id),
      getInspection: (id) => db.inspections.find((i) => i.id === id),
      inspectionOf: (order) =>
        order.inspectionId ? db.inspections.find((i) => i.id === order.inspectionId && i.deletedAt === null) : undefined,
      documentsOf: (orderId) =>
        db.documents
          .filter((doc) => doc.orderId === orderId && doc.deletedAt === null)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),

      createOrder: (input) => {
        const order = createServiceOrder(input, db.orders, nowIso());
        mutate((prev) => ({ ...prev, orders: [order, ...prev.orders] }));
        return order;
      },

      updateOrder: (id, patch) => {
        mutate((prev) => {
          const order = requireOrder(prev, id);
          const next = updateServiceOrder(order, patch, prev.orders, nowIso());
          return { ...prev, orders: prev.orders.map((o) => (o.id === id ? next : o)) };
        });
      },

      changeStatus: (id, to, note) => {
        mutate((prev) => {
          const order = requireOrder(prev, id);
          const next = changeServiceOrderStatus(order, to, nowIso(), note);
          return { ...prev, orders: prev.orders.map((o) => (o.id === id ? next : o)) };
        });
      },

      reopen: (id, to) => {
        mutate((prev) => {
          const order = requireOrder(prev, id);
          const next = reopenServiceOrder(order, to, nowIso());
          return { ...prev, orders: prev.orders.map((o) => (o.id === id ? next : o)) };
        });
      },

      deleteOrder: (id) => {
        mutate((prev) => {
          const order = requireOrder(prev, id);
          const now = nowIso();
          const next = softDeleteServiceOrder(order, now);
          return {
            ...prev,
            orders: prev.orders.map((o) => (o.id === id ? next : o)),
            inspections: prev.inspections.map((i) =>
              i.orderId === id && i.deletedAt === null ? softDeleteInspection(i, now) : i
            ),
            documents: prev.documents.map((doc) =>
              doc.orderId === id && doc.deletedAt === null ? softDeleteDocument(doc, now) : doc
            ),
          };
        });
      },

      startInspection: (orderId, propertyType) => {
        const order = requireOrder(db, orderId);
        if (order.deletedAt !== null) throw new DomainError("ORDER_DELETED", "OS excluída não recebe ficha.");
        if (isOrderTerminal(order))
          throw new DomainError("ORDER_TERMINAL", "OS concluída/cancelada não recebe nova ficha. Reabra a OS primeiro.");
        if (order.inspectionId !== null)
          throw new DomainError("INSPECTION_EXISTS", "Esta OS já possui ficha. Abra a ficha existente.");
        const inspection = createInspection(
          order.id,
          propertyType,
          { identificacao: prefillDatesFromOrder(propertyType, order.inspectionDate).identificacao ?? {} },
          nowIso()
        );
        mutate((prev) => ({
          ...prev,
          inspections: [inspection, ...prev.inspections],
          orders: prev.orders.map((o) =>
            o.id === orderId ? { ...o, inspectionId: inspection.id, updatedAt: nowIso() } : o
          ),
        }));
        return inspection;
      },

      setAnswer: (inspectionId, sectionId, fieldId, value) => {
        mutate((prev) => ({
          ...prev,
          inspections: prev.inspections.map((i) =>
            i.id === inspectionId ? setInspectionAnswer(i, sectionId, fieldId, value, nowIso()) : i
          ),
        }));
      },

      goSection: (inspectionId, index) => {
        mutate((prev) => ({
          ...prev,
          inspections: prev.inspections.map((i) =>
            i.id === inspectionId ? goToInspectionSection(i, index, nowIso()) : i
          ),
        }));
      },

      finishInspection: (inspectionId) => {
        mutate((prev) => ({
          ...prev,
          inspections: prev.inspections.map((i) =>
            i.id === inspectionId ? finishInspection(i, nowIso()) : i
          ),
        }));
      },

      reopenInspection: (inspectionId) => {
        mutate((prev) => ({
          ...prev,
          inspections: prev.inspections.map((i) =>
            i.id === inspectionId ? reopenInspection(i, nowIso()) : i
          ),
        }));
      },

      addDocument: (orderId, input) => {
        const order = requireOrder(db, orderId);
        if (order.deletedAt !== null) throw new DomainError("ORDER_DELETED", "OS excluída não recebe documentos.");
        const doc = createDocumentMeta(orderId, input, nowIso());
        mutate((prev) => ({ ...prev, documents: [doc, ...prev.documents] }));
        return doc;
      },

      deleteDocument: (id) => {
        mutate((prev) => ({
          ...prev,
          documents: prev.documents.map((doc) => (doc.id === id ? softDeleteDocument(doc, nowIso()) : doc)),
        }));
      },
    };
  }, [db, mutate]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("useStore fora do DbProvider");
  return store;
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

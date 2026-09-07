/**
 * Repositories Supabase (PostgreSQL). Únicos lugares com `supabase.from(...)`.
 * Regras de negócio ficam no domínio + store; aqui só Übersetzen SQL↔domínio,
 * com erros do PostgREST traduzidos para RepoError/DomainError.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "../../domain/ids";
import { normalizeOrderNumber, validateOrderInput } from "../../domain/serviceOrder";
import { createDocumentMeta } from "../../domain/document";
import type { DocumentMeta } from "../../domain/document";
import type { Inspection } from "../../domain/inspection";
import { INSPECTION_SCHEMA_VERSION } from "../../domain/inspection";
import type { ServiceOrder } from "../../domain/serviceOrder";
import type { Database } from "../../infrastructure/supabase/database.types";
import { RepoError } from "../errors";
import type {
  DocumentRepository,
  InspectionRepository,
  NewInspection,
  OrderPatch,
  OrderRepository,
  Repositories,
} from "../ports";
import {
  documentFromRow,
  inspectionFromRow,
  inspectionPatchToColumns,
  inspectionRefFromRow,
  orderFromRow,
  orderPatchToColumns,
} from "./mappers";

type Client = SupabaseClient<Database>;

/**
 * Dono a partir da sessão autenticada (validada no servidor).
 * O frontend nunca escolhe owner_id: ele é derivado aqui e a policy
 * WITH CHECK (auth.uid() = owner_id) valida de novo no banco.
 */
async function requireOwnerId(client: Client): Promise<string> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    const id = data.user?.id;
    if (!id) throw new RepoError("UNAUTHORIZED", "Sessão expirada. Entre de novo.");
    return id;
  } catch (e) {
    if (e instanceof RepoError) throw e;
    throw toRepoError(e, "Não foi possível verificar a sessão.");
  }
}

function isNetworkFailure(e: unknown): boolean {
  if (e instanceof TypeError) return true; // fetch falhou (offline/DNS)
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
}

function toRepoError(e: unknown, fallback = "Falha ao comunicar com o servidor."): RepoError {
  if (e instanceof RepoError || e instanceof DomainError) return e as RepoError;
  if (isNetworkFailure(e)) return new RepoError("NETWORK", "Sem conexão com o servidor.", e);
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = String((e as { code: unknown }).code);
    const message = (e as { message?: unknown }).message;
    const msg = typeof message === "string" ? message : "";
    // Violação de UNIQUE
    if (code === "23505") {
      if (msg.includes("inspections_order_id_key") || msg.includes("order_id")) {
        return new RepoError("DUPLICATE_INSPECTION", "Esta OS já possui ficha.", e);
      }
      return new RepoError("DUPLICATE_ORDER_NUMBER", "Já existe uma OS com este número.", e);
    }
    // RLS / permissão
    if (code === "42501" || msg.toLowerCase().includes("row-level security")) {
      return new RepoError("UNAUTHORIZED", "Acesso negado pelo banco (RLS).", e);
    }
    // 0 linhas em select single
    if (code === "PGRST116") return new RepoError("NOT_FOUND", "Registro não encontrado.", e);
  }
  return new RepoError("UNKNOWN", fallback, e);
}

function notFoundIfEmpty<T>(rows: T[] | null, what: string): T {
  if (!rows || rows.length === 0) throw new RepoError("NOT_FOUND", what);
  return rows[0];
}

class SupabaseOrderRepository implements OrderRepository {
  constructor(private client: Client) {}

  async list(): Promise<ServiceOrder[]> {
    try {
      const { data, error } = await this.client
        .from("orders")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map(orderFromRow);
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async get(id: string): Promise<ServiceOrder | null> {
    try {
      const { data, error } = await this.client.from("orders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? orderFromRow(data) : null;
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async create(input: {
    number: string;
    contractor: string;
    receivedAt: string;
    inspectionDate?: string | null;
    inspectionTime?: string | null;
    dueDate?: string | null;
    address?: import("../../domain/address").Address;
    contactName?: string | null;
    contactPhone?: string | null;
    notes?: string | null;
  }): Promise<ServiceOrder> {
    // Validação de forma no app (rápida); unicidade real é a constraint do banco.
    const errors = validateOrderInput(input, []);
    if (Object.keys(errors).length > 0) throw new DomainError("INVALID_ORDER", "Dados da OS inválidos.", errors);
    const ownerId = await requireOwnerId(this.client);
    try {
      const { data, error } = await this.client
        .from("orders")
        .insert({
          owner_id: ownerId,
          number: normalizeOrderNumber(input.number),
          contractor: input.contractor.trim(),
          received_date: input.receivedAt,
          inspection_date: input.inspectionDate ?? null,
          inspection_time: input.inspectionTime ? `${input.inspectionTime}:00` : null,
          due_date: input.dueDate ?? null,
          address: input.address ?? {},
          contact_name: input.contactName?.trim() ? input.contactName.trim() : null,
          contact_phone: input.contactPhone?.trim() ? input.contactPhone.trim() : null,
          notes: input.notes?.trim() ? input.notes.trim() : null,
          status: "received",
          status_history: [{ from: "received", to: "received", at: new Date().toISOString(), note: "OS criada" }],
        })
        .select("*")
        .single();
      if (error) throw error;
      return orderFromRow(data);
    } catch (e) {
      // Duplicado fora da pré-checagem (corrida ou dado de outro cliente):
      // revalida para devolver erro de campo, não erro genérico.
      if (e instanceof RepoError && e.code === "DUPLICATE_ORDER_NUMBER") {
        throw new DomainError("INVALID_ORDER", "Já existe uma OS com este número.", {
          number: "Já existe uma OS com este número.",
        });
      }
      throw toRepoError(e);
    }
  }

  async update(id: string, patch: OrderPatch, expectedUpdatedAt?: string): Promise<ServiceOrder> {
    try {
      let query = this.client.from("orders").update(orderPatchToColumns(patch)).eq("id", id);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await query.select("*");
      if (error) throw error;
      return orderFromRow(notFoundIfEmpty(data, expectedUpdatedAt ? "Conflito de concorrência." : "OS não encontrada."));
    } catch (e) {
      if (e instanceof RepoError && e.code === "NOT_FOUND" && expectedUpdatedAt) {
        throw new RepoError("CONFLICT", "Os dados mudaram em outro lugar.", e);
      }
      if (e instanceof RepoError && e.code === "DUPLICATE_ORDER_NUMBER") {
        throw new DomainError("INVALID_ORDER", "Já existe uma OS com este número.", {
          number: "Já existe uma OS com este número.",
        });
      }
      throw toRepoError(e);
    }
  }
}

class SupabaseInspectionRepository implements InspectionRepository {
  constructor(private client: Client) {}

  async listRefs() {
    try {
      const { data, error } = await this.client
        .from("inspections")
        .select("id, order_id, property_type, status, updated_at")
        .is("deleted_at", null)
        .limit(1000);
      if (error) throw error;
      return (data ?? []).map(inspectionRefFromRow);
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async get(id: string): Promise<Inspection | null> {
    try {
      const { data, error } = await this.client.from("inspections").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? inspectionFromRow(data) : null;
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async getByOrderId(orderId: string): Promise<Inspection | null> {
    try {
      const { data, error } = await this.client
        .from("inspections")
        .select("*")
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? inspectionFromRow(data) : null;
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async create(input: NewInspection): Promise<Inspection> {
    if (!input.orderId) throw new DomainError("NO_ORDER", "Ficha só pode ser criada a partir de uma OS.");
    const ownerId = await requireOwnerId(this.client);
    try {
      const { data, error } = await this.client
        .from("inspections")
        .insert({
          order_id: input.orderId,
          owner_id: ownerId,
          property_type: input.propertyType,
          status: input.status ?? "draft",
          schema_version: input.schemaVersion ?? INSPECTION_SCHEMA_VERSION,
          form_version: input.formVersion ?? 1,
          current_section: input.currentSectionIndex ?? 0,
          data: input.data ?? {},
          started_at: input.startedAt ?? new Date().toISOString(),
          finished_at: input.finishedAt ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return inspectionFromRow(data);
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async update(
    id: string,
    patch: { data?: import("../../form-engine/types").EvaluationData; currentSectionIndex?: number; status?: import("../../domain/inspection").InspectionStatus; finishedAt?: string | null; deletedAt?: string | null },
    expectedUpdatedAt?: string
  ): Promise<Inspection> {
    try {
      let query = this.client.from("inspections").update(inspectionPatchToColumns(patch)).eq("id", id);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const { data, error } = await query.select("*");
      if (error) throw error;
      return inspectionFromRow(notFoundIfEmpty(data, expectedUpdatedAt ? "Conflito de concorrência." : "Ficha não encontrada."));
    } catch (e) {
      if (e instanceof RepoError && e.code === "NOT_FOUND" && expectedUpdatedAt) {
        throw new RepoError("CONFLICT", "A ficha mudou em outro lugar.", e);
      }
      throw toRepoError(e);
    }
  }
}

class SupabaseDocumentRepository implements DocumentRepository {
  constructor(private client: Client) {}

  async listByOrder(orderId: string): Promise<DocumentMeta[]> {
    try {
      const { data, error } = await this.client
        .from("documents")
        .select("*")
        .eq("order_id", orderId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const mapped = documentFromRow(row);
        return mapped;
      });
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async create(
    orderId: string,
    input: { name: string; kind: import("../../domain/document").DocumentKind; provider?: import("../../domain/document").DocumentProvider; fileUrl?: string | null }
  ): Promise<DocumentMeta> {
    // Validação de forma via domínio (mantém mensagem de campo).
    const validated = createDocumentMeta(orderId, input);
    const ownerId = await requireOwnerId(this.client);
    try {
      const { data, error } = await this.client
        .from("documents")
        .insert({
          order_id: orderId,
          owner_id: ownerId,
          name: validated.name,
          kind: validated.kind,
          provider: validated.provider,
          file_url: validated.fileUrl,
        })
        .select("*")
        .single();
      if (error) throw error;
      return documentFromRow(data);
    } catch (e) {
      throw toRepoError(e);
    }
  }

  async softDelete(id: string): Promise<void> {
    try {
      const { error } = await this.client.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    } catch (e) {
      throw toRepoError(e);
    }
  }
}

export function createSupabaseRepos(client: Client): Repositories {
  return {
    orders: new SupabaseOrderRepository(client),
    inspections: new SupabaseInspectionRepository(client),
    documents: new SupabaseDocumentRepository(client),
  };
}

/**
 * Mapeamento PostgreSQL (snake_case) ↔ domínio (camelCase).
 * Validação defensiva na leitura: enum desconhecido ou JSON malformado
 * vira DomainError CORRUPT (nunca crash, nunca `as any` silencioso).
 */
import type { Address } from "../../domain/address";
import { normalizeAddress } from "../../domain/address";
import type { DocumentKind, DocumentMeta, DocumentProvider, DocumentStorageStatus } from "../../domain/document";
import { DOCUMENT_KIND_LABEL } from "../../domain/document";
import { DomainError } from "../../domain/ids";
import type { Inspection, InspectionStatus } from "../../domain/inspection";
import { INSPECTION_SCHEMA_VERSION } from "../../domain/inspection";
import type { ServiceOrder, ServiceOrderStatus, StatusEvent } from "../../domain/serviceOrder";
import { STATUS_LABEL } from "../../domain/serviceOrder";
import { isValidGeo } from "../../domain/serviceOrder";
import type { EvaluationData, PropertyType } from "../../form-engine/types";
import type { DocumentRow, InspectionRow, InspectionUpdate, OrderRow, OrderUpdate } from "../../infrastructure/supabase/database.types";
import type { InspectionRef, OrderPatch } from "../ports";

const ORDER_STATUSES: readonly string[] = ["received", "scheduled", "inspected", "drafting", "completed", "cancelled"];
const PROPERTY_TYPES: readonly string[] = ["apartment", "land", "house"];
const INSPECTION_STATUSES: readonly string[] = ["draft", "finished"];
const DOC_KINDS: readonly string[] = Object.keys(DOCUMENT_KIND_LABEL);
const DOC_STORAGE: readonly string[] = ["pending_storage", "stored"];
const DOC_PROVIDERS: readonly string[] = ["cloudflare_r2", "supabase_storage", "external_url"];

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function parseAddress(v: unknown): Address {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : null);
  return normalizeAddress({
    street: pick("street"),
    number: pick("number"),
    complement: pick("complement"),
    district: pick("district"),
    city: pick("city"),
    state: pick("state"),
    postalCode: pick("postalCode"),
    raw: pick("raw"),
  });
}

function parseHistory(v: unknown): StatusEvent[] {
  if (!Array.isArray(v)) return [];
  const out: StatusEvent[] = [];
  for (const e of v) {
    if (typeof e !== "object" || e === null) continue;
    const o = e as Record<string, unknown>;
    if (typeof o.from !== "string" || typeof o.to !== "string" || typeof o.at !== "string") continue;
    if (!ORDER_STATUSES.includes(o.from) || !ORDER_STATUSES.includes(o.to)) continue;
    out.push({
      from: o.from as ServiceOrderStatus,
      to: o.to as ServiceOrderStatus,
      at: o.at,
      ...(typeof o.note === "string" ? { note: o.note } : {}),
    });
  }
  return out;
}

function parseData(v: unknown): EvaluationData {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  return v as EvaluationData;
}

export function orderFromRow(row: OrderRow): ServiceOrder {
  if (!ORDER_STATUSES.includes(row.status)) {
    throw new DomainError("CORRUPT_ROW", `Status desconhecido no banco: ${String(row.status)}`);
  }
  return {
    id: row.id,
    number: row.number,
    contractor: row.contractor,
    receivedAt: row.received_date,
    inspectionDate: row.inspection_date,
    inspectionTime: row.inspection_time ? row.inspection_time.slice(0, 5) : null,
    dueDate: row.due_date,
    address: parseAddress(row.address),
    contactName: str(row.contact_name),
    contactPhone: str(row.contact_phone),
    notes: row.notes && row.notes.trim() !== "" ? row.notes : null,
    status: row.status as ServiceOrderStatus,
    // Cache derivado: o vínculo canônico vive em inspections.order_id (UNIQUE).
    // Repositórios preenchem após carregar as refs (ver supabaseRepos).
    inspectionId: null,
    statusHistory: parseHistory(row.status_history),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    geo: isValidGeo({ latitude: row.latitude, longitude: row.longitude })
      ? { latitude: row.latitude as number, longitude: row.longitude as number }
      : null,
    geocodedAddress: typeof row.geocoded_address === "string" && row.geocoded_address ? row.geocoded_address : null,
  };
}

export function inspectionFromRow(row: InspectionRow): Inspection {
  if (!PROPERTY_TYPES.includes(row.property_type)) {
    throw new DomainError("CORRUPT_ROW", `property_type desconhecido: ${String(row.property_type)}`);
  }
  if (!INSPECTION_STATUSES.includes(row.status)) {
    throw new DomainError("CORRUPT_ROW", `inspection status desconhecido: ${String(row.status)}`);
  }
  return {
    id: row.id,
    orderId: row.order_id,
    propertyType: row.property_type as PropertyType,
    status: row.status as InspectionStatus,
    schemaVersion: row.schema_version,
    formVersion: row.form_version,
    currentSectionIndex: row.current_section,
    data: parseData(row.data),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
    deletedAt: row.deleted_at,
  };
}

export function documentFromRow(row: DocumentRow): DocumentMeta {
  if (!DOC_KINDS.includes(row.kind)) {
    throw new DomainError("CORRUPT_ROW", `document kind desconhecido: ${String(row.kind)}`);
  }
  return {
    id: row.id,
    orderId: row.order_id,
    name: row.name,
    kind: row.kind as DocumentKind,
    provider: (DOC_PROVIDERS.includes(row.provider) ? row.provider : "cloudflare_r2") as DocumentProvider,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storageKey: row.storage_key,
    fileUrl: typeof row.file_url === "string" && row.file_url.trim() !== "" ? row.file_url : null,
    storageStatus: (DOC_STORAGE.includes(row.storage_status) ? row.storage_status : "pending_storage") as DocumentStorageStatus,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function inspectionRefFromRow(row: { id: string; order_id: string; property_type: string; status: string; updated_at: string }): InspectionRef {
  return {
    id: row.id,
    orderId: row.order_id,
    propertyType: (PROPERTY_TYPES.includes(row.property_type) ? row.property_type : "apartment") as PropertyType,
    status: (INSPECTION_STATUSES.includes(row.status) ? row.status : "draft") as InspectionStatus,
    updatedAt: row.updated_at,
  };
}

/** Patch do domínio → colunas. updated_at vai por trigger; nunca enviado. */
export function orderPatchToColumns(patch: OrderPatch): OrderUpdate {
  const cols: OrderUpdate = {};
  if (patch.number !== undefined) cols.number = patch.number;
  if (patch.contractor !== undefined) cols.contractor = patch.contractor;
  if (patch.receivedAt !== undefined) cols.received_date = patch.receivedAt;
  if (patch.inspectionDate !== undefined) cols.inspection_date = patch.inspectionDate;
  if (patch.inspectionTime !== undefined) cols.inspection_time = patch.inspectionTime ? `${patch.inspectionTime}:00` : null;
  if (patch.dueDate !== undefined) cols.due_date = patch.dueDate;
  if (patch.address !== undefined) cols.address = patch.address;
  if (patch.contactName !== undefined) cols.contact_name = patch.contactName;
  if (patch.contactPhone !== undefined) cols.contact_phone = patch.contactPhone;
  if (patch.notes !== undefined) cols.notes = patch.notes;
  if (patch.status !== undefined) {
    if (!ORDER_STATUSES.includes(patch.status)) throw new DomainError("INVALID_STATUS", `Status inválido: ${STATUS_LABEL[patch.status]}`);
    cols.status = patch.status;
  }
  if (patch.statusHistory !== undefined) cols.status_history = patch.statusHistory;
  if (patch.deletedAt !== undefined) cols.deleted_at = patch.deletedAt;
  if (patch.geo !== undefined) {
    if (patch.geo !== null && !isValidGeo(patch.geo))
      throw new DomainError("INVALID_GEO", "Coordenadas inválidas.");
    cols.latitude = patch.geo?.latitude ?? null;
    cols.longitude = patch.geo?.longitude ?? null;
  }
  if (patch.geocodedAddress !== undefined) cols.geocoded_address = patch.geocodedAddress;
  if (patch.geocodedAt !== undefined) cols.geocoded_at = patch.geocodedAt;
  return cols;
}

export function inspectionPatchToColumns(patch: { data?: EvaluationData; currentSectionIndex?: number; status?: InspectionStatus; finishedAt?: string | null; deletedAt?: string | null }): InspectionUpdate {
  const cols: InspectionUpdate = {};
  if (patch.data !== undefined) cols.data = patch.data;
  if (patch.currentSectionIndex !== undefined) cols.current_section = patch.currentSectionIndex;
  if (patch.status !== undefined) {
    if (!INSPECTION_STATUSES.includes(patch.status)) throw new DomainError("INVALID_STATUS", "Status de ficha inválido.");
    cols.status = patch.status;
  }
  if (patch.finishedAt !== undefined) cols.finished_at = patch.finishedAt;
  if (patch.deletedAt !== undefined) cols.deleted_at = patch.deletedAt;
  return cols;
}

export { INSPECTION_SCHEMA_VERSION };

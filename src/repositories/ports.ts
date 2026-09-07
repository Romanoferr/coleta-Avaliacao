/**
 * Portas de persistência (contratos). Implementações:
 *   - repositories/local      → localStorage (modo sem Supabase / fallback)
 *   - repositories/supabase   → PostgreSQL via Supabase
 * O domínio NUNCA importa este módulo; a application (store) depende só daqui.
 */
import type { Address } from "../domain/address";
import type { DocumentKind, DocumentMeta, DocumentProvider } from "../domain/document";
import type { Inspection, InspectionStatus } from "../domain/inspection";
import type { EvaluationData, PropertyType } from "../form-engine/types";
import type { ServiceOrder, ServiceOrderStatus, StatusEvent } from "../domain/serviceOrder";

export interface OrderIdentity {
  id: string;
  number: string;
  deletedAt: string | null;
}

/** Campos graváveis de orders, em vocabulário do domínio. */
export interface OrderPatch {
  number?: string;
  contractor?: string;
  receivedAt?: string;
  inspectionDate?: string | null;
  inspectionTime?: string | null;
  dueDate?: string | null;
  address?: Address;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  status?: ServiceOrderStatus;
  statusHistory?: StatusEvent[];
  deletedAt?: string | null;
}

export interface OrderRepository {
  /** OS vivas, mais recentes primeiro (ordenação final é da UI). */
  list(): Promise<ServiceOrder[]>;
  get(id: string): Promise<ServiceOrder | null>;
  /** Valida forma; id/timestamps vêm do backend. 23505 → DUPLICATE_ORDER_NUMBER. */
  create(input: {
    number: string;
    contractor: string;
    receivedAt: string;
    inspectionDate?: string | null;
    inspectionTime?: string | null;
    dueDate?: string | null;
    address?: Address;
    contactName?: string | null;
    contactPhone?: string | null;
    notes?: string | null;
  }): Promise<ServiceOrder>;
  /** expectedUpdatedAt ausente = sem checagem; 0 linhas afetadas → CONFLICT. */
  update(id: string, patch: OrderPatch, expectedUpdatedAt?: string): Promise<ServiceOrder>;
}

/** Linha leve para a lista (evita carregar JSONB de fichas na listagem). */
export interface InspectionRef {
  id: string;
  orderId: string;
  propertyType: PropertyType;
  status: InspectionStatus;
  updatedAt: string;
}

export interface NewInspection {
  orderId: string;
  propertyType: PropertyType;
  data?: EvaluationData;
  currentSectionIndex?: number;
  status?: InspectionStatus;
  schemaVersion?: number;
  formVersion?: number;
  startedAt?: string;
  finishedAt?: string | null;
}

export interface InspectionPatch {
  data?: EvaluationData;
  currentSectionIndex?: number;
  status?: InspectionStatus;
  finishedAt?: string | null;
  deletedAt?: string | null;
}

export interface InspectionRepository {
  listRefs(): Promise<InspectionRef[]>;
  get(id: string): Promise<Inspection | null>;
  getByOrderId(orderId: string): Promise<Inspection | null>;
  /** UNIQUE(order_id) do banco impede a 2ª ficha mesmo em race condition. */
  create(input: NewInspection): Promise<Inspection>;
  update(id: string, patch: InspectionPatch, expectedUpdatedAt?: string): Promise<Inspection>;
}

export interface DocumentRepository {
  listByOrder(orderId: string): Promise<DocumentMeta[]>;
  create(
    orderId: string,
    input: { name: string; kind: DocumentKind; provider?: DocumentProvider; fileUrl?: string | null }
  ): Promise<DocumentMeta>;
  softDelete(id: string): Promise<void>;
}

export interface Repositories {
  orders: OrderRepository;
  inspections: InspectionRepository;
  documents: DocumentRepository;
}

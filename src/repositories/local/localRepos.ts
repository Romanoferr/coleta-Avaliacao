/**
 * Repositories locais: implementam as mesmas portas sobre o Db em
 * localStorage. Usados quando o Supabase não está configurado e como
 * referência de comportamento (testes de contrato).
 * Storage injetável → testes usam memória, app usa localStorage.
 */
import type { Address } from "../../domain/address";
import { normalizeAddress } from "../../domain/address";
import { createDocumentMeta, softDeleteDocument } from "../../domain/document";
import type { DocumentKind, DocumentMeta, DocumentProvider } from "../../domain/document";
import { DomainError, newId, nowIso } from "../../domain/ids";
import type { Inspection, InspectionStatus } from "../../domain/inspection";
import { INSPECTION_SCHEMA_VERSION } from "../../domain/inspection";
import type { CreateOrderInput, ServiceOrder, StatusEvent } from "../../domain/serviceOrder";
import { isValidGeo, normalizeOrderNumber, normalizeStoredOrder, validateOrderInput } from "../../domain/serviceOrder";
import type { EvaluationData, PropertyType } from "../../form-engine/types";
import { DB_SCHEMA_VERSION } from "../../persistence/db";
import type { Db } from "../../persistence/db";
import { RepoError } from "../errors";
import type {
  DocumentRepository,
  InspectionPatch,
  InspectionRef,
  InspectionRepository,
  NewInspection,
  OrderPatch,
  OrderRepository,
} from "../ports";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LOCAL_DB_KEY = "coleta-avaliacao:db:v1";

function toDb(storage: StorageLike): Db {
  try {
    const raw = storage.getItem(LOCAL_DB_KEY);
    if (!raw) return { schemaVersion: DB_SCHEMA_VERSION, orders: [], inspections: [], documents: [] };
    const parsed = JSON.parse(raw) as Partial<Db>;
    if (parsed.schemaVersion !== DB_SCHEMA_VERSION || !Array.isArray(parsed.orders) || !Array.isArray(parsed.inspections)) {
      return { schemaVersion: DB_SCHEMA_VERSION, orders: [], inspections: [], documents: [] };
    }
    return {
      schemaVersion: DB_SCHEMA_VERSION,
      orders: (parsed.orders as ServiceOrder[]).map(normalizeStoredOrder),
      inspections: parsed.inspections as Inspection[],
      documents: Array.isArray(parsed.documents) ? (parsed.documents as DocumentMeta[]) : [],
    };
  } catch {
    return { schemaVersion: DB_SCHEMA_VERSION, orders: [], inspections: [], documents: [] };
  }
}

function persist(storage: StorageLike, db: Db): void {
  try {
    storage.setItem(LOCAL_DB_KEY, JSON.stringify({ ...db, schemaVersion: DB_SCHEMA_VERSION }));
  } catch {
    /* quota/privado: segue em memória */
  }
}

function live<T extends { deletedAt: string | null }>(arr: T[]): T[] {
  return arr.filter((x) => x.deletedAt === null);
}

function applyOrderPatch(order: ServiceOrder, patch: OrderPatch, now: string): ServiceOrder {
  const next: ServiceOrder = { ...order, updatedAt: now };
  if (patch.number !== undefined) next.number = normalizeOrderNumber(patch.number);
  if (patch.contractor !== undefined) next.contractor = patch.contractor;
  if (patch.receivedAt !== undefined) next.receivedAt = patch.receivedAt;
  if (patch.inspectionDate !== undefined) next.inspectionDate = patch.inspectionDate;
  if (patch.inspectionTime !== undefined) next.inspectionTime = patch.inspectionTime;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.address !== undefined) next.address = normalizeAddress(patch.address ?? {});
  if (patch.contactName !== undefined) next.contactName = patch.contactName;
  if (patch.contactPhone !== undefined) next.contactPhone = patch.contactPhone;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.statusHistory !== undefined) next.statusHistory = patch.statusHistory as StatusEvent[];
  if (patch.deletedAt !== undefined) next.deletedAt = patch.deletedAt;
  if (patch.geo !== undefined)
    next.geo = patch.geo === null ? null : { latitude: patch.geo.latitude, longitude: patch.geo.longitude };
  if (patch.geocodedAddress !== undefined) next.geocodedAddress = patch.geocodedAddress;
  return next;
}

class LocalOrderRepository implements OrderRepository {
  constructor(private storage: StorageLike) {}

  private read(): Db {
    return toDb(this.storage);
  }
  private write(db: Db): void {
    persist(this.storage, db);
  }

  async list(): Promise<ServiceOrder[]> {
    return live(this.read().orders).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async get(id: string): Promise<ServiceOrder | null> {
    return this.read().orders.find((o) => o.id === id) ?? null;
  }

  async create(input: CreateOrderInput & { address?: Address }): Promise<ServiceOrder> {
    const db = this.read();
    const errors = validateOrderInput(input, db.orders);
    if (Object.keys(errors).length > 0) throw new DomainError("INVALID_ORDER", "Dados da OS inválidos.", errors);
    const now = nowIso();
    const order: ServiceOrder = {
      id: newId(),
      number: normalizeOrderNumber(input.number),
      contractor: input.contractor.trim(),
      receivedAt: input.receivedAt,
      inspectionDate: input.inspectionDate ?? null,
      inspectionTime: input.inspectionTime ?? null,
      dueDate: input.dueDate ?? null,
      address: normalizeAddress(input.address ?? {}),
      contactName: input.contactName?.trim() ? (input.contactName as string).trim() : null,
      contactPhone: input.contactPhone?.trim() ? (input.contactPhone as string).trim() : null,
      notes: input.notes?.trim() ? (input.notes as string).trim() : null,
      status: "received",
      inspectionId: null,
      statusHistory: [{ from: "received", to: "received", at: now, note: "OS criada" }],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      geo: isValidGeo(input.geo) ? { latitude: input.geo.latitude, longitude: input.geo.longitude } : null,
      geocodedAddress: typeof input.geocodedAddress === "string" && input.geocodedAddress ? input.geocodedAddress : null,
    };
    this.write({ ...db, orders: [order, ...db.orders] });
    return order;
  }

  async update(id: string, patch: OrderPatch, expectedUpdatedAt?: string): Promise<ServiceOrder> {
    const db = this.read();
    const order = db.orders.find((o) => o.id === id);
    if (!order) throw new RepoError("NOT_FOUND", "OS não encontrada.");
    if (expectedUpdatedAt && order.updatedAt !== expectedUpdatedAt) {
      throw new RepoError("CONFLICT", "Os dados mudaram em outro lugar.");
    }
    if (patch.number !== undefined) {
      const errors = validateOrderInput({ number: patch.number }, db.orders, id);
      if (errors.number) throw new DomainError("INVALID_ORDER", errors.number, { number: errors.number });
    }
    const next = applyOrderPatch(order, patch, nowIso());
    this.write({ ...db, orders: db.orders.map((o) => (o.id === id ? next : o)) });
    return next;
  }
}

function toRef(i: Inspection): InspectionRef {
  return { id: i.id, orderId: i.orderId, propertyType: i.propertyType, status: i.status, updatedAt: i.updatedAt };
}

class LocalInspectionRepository implements InspectionRepository {
  constructor(private storage: StorageLike) {}
  private read(): Db {
    return toDb(this.storage);
  }
  private write(db: Db): void {
    persist(this.storage, db);
  }

  async listRefs(): Promise<InspectionRef[]> {
    return live(this.read().inspections).map(toRef);
  }

  async get(id: string): Promise<Inspection | null> {
    return this.read().inspections.find((i) => i.id === id) ?? null;
  }

  async getByOrderId(orderId: string): Promise<Inspection | null> {
    return this.read().inspections.find((i) => i.orderId === orderId && i.deletedAt === null) ?? null;
  }

  async create(input: NewInspection): Promise<Inspection> {
    if (!input.orderId) throw new DomainError("NO_ORDER", "Ficha só pode ser criada a partir de uma OS.");
    const db = this.read();
    if (db.inspections.some((i) => i.orderId === input.orderId && i.deletedAt === null)) {
      throw new RepoError("DUPLICATE_INSPECTION", "Esta OS já possui ficha.");
    }
    if (!["apartment", "land", "house"].includes(input.propertyType)) {
      throw new DomainError("INVALID_INSPECTION", "Tipo de imóvel inválido.");
    }
    const now = nowIso();
    const inspection: Inspection = {
      id: newId(),
      orderId: input.orderId,
      propertyType: input.propertyType as PropertyType,
      status: input.status ?? "draft",
      schemaVersion: input.schemaVersion ?? INSPECTION_SCHEMA_VERSION,
      formVersion: input.formVersion ?? 1,
      currentSectionIndex: input.currentSectionIndex ?? 0,
      data: (input.data ?? {}) as EvaluationData,
      startedAt: input.startedAt ?? now,
      updatedAt: now,
      finishedAt: input.finishedAt ?? null,
      deletedAt: null,
    };
    this.write({ ...db, inspections: [inspection, ...db.inspections] });
    return inspection;
  }

  async update(id: string, patch: InspectionPatch, expectedUpdatedAt?: string): Promise<Inspection> {
    const db = this.read();
    const inspection = db.inspections.find((i) => i.id === id);
    if (!inspection) throw new RepoError("NOT_FOUND", "Ficha não encontrada.");
    if (expectedUpdatedAt && inspection.updatedAt !== expectedUpdatedAt) {
      throw new RepoError("CONFLICT", "A ficha mudou em outro lugar.");
    }
    const now = nowIso();
    const next: Inspection = {
      ...inspection,
      data: patch.data !== undefined ? patch.data : inspection.data,
      currentSectionIndex: patch.currentSectionIndex !== undefined ? patch.currentSectionIndex : inspection.currentSectionIndex,
      status: (patch.status ?? inspection.status) as InspectionStatus,
      finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : inspection.finishedAt,
      deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : inspection.deletedAt,
      updatedAt: now,
    };
    this.write({ ...db, inspections: db.inspections.map((i) => (i.id === id ? next : i)) });
    return next;
  }
}

class LocalDocumentRepository implements DocumentRepository {
  constructor(private storage: StorageLike) {}
  private read(): Db {
    return toDb(this.storage);
  }
  private write(db: Db): void {
    persist(this.storage, db);
  }

  async listByOrder(orderId: string): Promise<DocumentMeta[]> {
    return live(this.read().documents)
      .filter((d) => d.orderId === orderId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async create(
    orderId: string,
    input: { name: string; kind: DocumentKind; provider?: DocumentProvider; fileUrl?: string | null }
  ): Promise<DocumentMeta> {
    const doc = createDocumentMeta(orderId, input);
    const db = this.read();
    this.write({ ...db, documents: [doc, ...db.documents] });
    return doc;
  }

  async softDelete(id: string): Promise<void> {
    const db = this.read();
    this.write({
      ...db,
      documents: db.documents.map((d) => (d.id === id ? softDeleteDocument(d) : d)),
    });
  }
}

export function createLocalRepos(storage: StorageLike): {
  orders: OrderRepository;
  inspections: InspectionRepository;
  documents: DocumentRepository;
} {
  return {
    orders: new LocalOrderRepository(storage),
    inspections: new LocalInspectionRepository(storage),
    documents: new LocalDocumentRepository(storage),
  };
}

/** Storage real do navegador (guards para SSR/teste). */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

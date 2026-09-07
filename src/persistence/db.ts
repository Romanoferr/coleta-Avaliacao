/**
 * Banco local v1 — ports + adaptador localStorage.
 * O domínio nunca importa este módulo; o store (application) depende das
 * interfaces OrderStore/InspectionStore/DocumentStore, implementadas aqui
 * para localStorage. Trocar por Supabase = nova implementação das portas.
 */
import type { DocumentMeta } from "../domain/document";
import type { Inspection } from "../domain/inspection";
import type { ServiceOrder } from "../domain/serviceOrder";

export const DB_KEY = "coleta-avaliacao:db:v1";
export const DB_SCHEMA_VERSION = 1;

export interface Db {
  schemaVersion: number;
  orders: ServiceOrder[];
  inspections: Inspection[];
  documents: DocumentMeta[];
  migratedFrom?: string[];
}

export function emptyDb(): Db {
  return { schemaVersion: DB_SCHEMA_VERSION, orders: [], inspections: [], documents: [] };
}

function isDb(value: unknown): value is Db {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.schemaVersion === DB_SCHEMA_VERSION && Array.isArray(v.orders) && Array.isArray(v.inspections);
}

export function loadDb(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return emptyDb();
    const parsed: unknown = JSON.parse(raw);
    if (!isDb(parsed)) return emptyDb();
    return { ...parsed, documents: Array.isArray(parsed.documents) ? parsed.documents : [] };
  } catch {
    return emptyDb();
  }
}

export function saveDb(db: Db): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify({ ...db, schemaVersion: DB_SCHEMA_VERSION }));
  } catch {
    /* armazenamento indisponível ou cheio: segue em memória */
  }
}

/**
 * Tipos do schema — espelho MANUAL de supabase/migrations/00001_core.
 *
 * ⚠️  NÃO EDITAR para mudar o banco: a fonte de verdade é a migration.
 *     Após `supabase link`, regenere com o comando oficial e sobrescreva
 *     este arquivo (ver package.json → `db:types` e docs/SUPABASE.md):
 *
 *       supabase gen types typescript --linked \
 *         > src/infrastructure/supabase/database.types.ts
 *
 *     Até lá, este espelho é mantido à mão e coberto por teste de mappers.
 */
export type OrderStatusDb = "received" | "scheduled" | "inspected" | "drafting" | "completed" | "cancelled";
export type PropertyTypeDb = "apartment" | "land" | "house";
export type InspectionStatusDb = "draft" | "finished";
export type DocumentKindDb = "photo" | "contract" | "matricula" | "report" | "other";
export type DocumentStorageStatusDb = "pending_storage" | "stored";
export type DocumentProviderDb = "cloudflare_r2" | "supabase_storage" | "external_url";

export type OrderRow = {
  id: string;
  owner_id: string | null;
  number: string;
  contractor: string;
  received_date: string;
  inspection_date: string | null;
  inspection_time: string | null;
  due_date: string | null;
  address: unknown;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  status: OrderStatusDb;
  status_history: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Cache servidor de geocodificação (migration 00005). Nulo = não geocodificada. */
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
}

export type OrderInsert = {
  owner_id: string;
  number: string;
  contractor: string;
  received_date: string;
  inspection_date?: string | null;
  inspection_time?: string | null;
  due_date?: string | null;
  address?: unknown;
  contact_name?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  status?: OrderStatusDb;
  status_history?: unknown;
  latitude?: number | null;
  longitude?: number | null;
  geocoded_at?: string | null;
}

export type InspectionRow = {
  id: string;
  order_id: string;
  owner_id: string | null;
  property_type: PropertyTypeDb;
  status: InspectionStatusDb;
  schema_version: number;
  form_version: number;
  current_section: number;
  data: unknown;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type InspectionInsert = {
  order_id: string;
  owner_id: string;
  property_type: PropertyTypeDb;
  status?: InspectionStatusDb;
  schema_version?: number;
  form_version?: number;
  current_section?: number;
  data?: unknown;
  started_at?: string;
  finished_at?: string | null;
}

export type InspectionRefRow = {
  id: string;
  order_id: string;
  property_type: PropertyTypeDb;
  status: InspectionStatusDb;
  updated_at: string;
}

export type DocumentRow = {
  id: string;
  order_id: string;
  owner_id: string | null;
  name: string;
  kind: DocumentKindDb;
  provider: DocumentProviderDb;
  mime_type: string | null;
  size_bytes: number | null;
  storage_key: string | null;
  file_url: string | null;
  storage_status: DocumentStorageStatusDb;
  created_at: string;
  deleted_at: string | null;
}

export type DocumentInsert = {
  order_id: string;
  owner_id: string;
  name: string;
  kind?: DocumentKindDb;
  provider?: DocumentProviderDb;
  file_url?: string | null;
}

/** Colunas graváveis além do Insert (soft-delete e auditoria). */
export type OrderUpdate = Partial<OrderInsert> & {
  status_history?: unknown;
  deleted_at?: string | null;
  geocoded_at?: string | null;
};

export type InspectionUpdate = Partial<InspectionInsert> & {
  finished_at?: string | null;
  deleted_at?: string | null;
};

export type DocumentUpdate = Partial<DocumentInsert> & {
  deleted_at?: string | null;
};

/** Formato mínimo esperado pelo cliente Supabase tipado. */
export type Database = {
  public: {
    Tables: {
      orders: { Row: OrderRow; Insert: OrderInsert; Update: OrderUpdate; Relationships: [] };
      inspections: { Row: InspectionRow; Insert: InspectionInsert; Update: InspectionUpdate; Relationships: [] };
      documents: { Row: DocumentRow; Insert: DocumentInsert; Update: DocumentUpdate; Relationships: [] };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      order_status: OrderStatusDb;
      property_type: PropertyTypeDb;
      inspection_status: InspectionStatusDb;
      document_kind: DocumentKindDb;
      document_storage_status: DocumentStorageStatusDb;
      document_provider: DocumentProviderDb;
    };
    CompositeTypes: { [_ in never]: never };
  };
}


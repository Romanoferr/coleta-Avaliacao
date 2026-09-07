-- ============================================================================
-- 00001_core - modelo de domínio: orders, inspections, documents
-- Convenção: snake_case, UUID como PK técnica, timestamps com trigger.
-- Decisões (detalhes em docs/SUPABASE.md):
--   - orders.number (texto comercial) separado de orders.id (uuid técnico).
--   - Unicidade do número: índice parcial case-insensitive entre não-excluídas.
--   - Status/imóvel/ficha/documento como ENUM (conjunto fechado, compartilhado
--     com o frontend via src/infrastructure/supabase/database.types.ts).
--   - Endereço e dados da ficha como JSONB (forma evolui sem migration por campo;
--     colunas relacionais para tudo que é filtrado/ordenado/relacionado).
--   - FKs com ON DELETE RESTRICT: exclusão é lógica (deleted_at); hard delete
--     exige remoção explícita dos filhos - nada some por acidente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums (espelham os tipos do domínio; não inventar estados aqui)
-- ----------------------------------------------------------------------------
CREATE TYPE order_status AS ENUM (
  'received', 'scheduled', 'inspected', 'drafting', 'completed', 'cancelled'
);

CREATE TYPE property_type AS ENUM ('apartment', 'land', 'house');

CREATE TYPE inspection_status AS ENUM ('draft', 'finished');

CREATE TYPE document_kind AS ENUM ('photo', 'contract', 'matricula', 'report', 'other');

CREATE TYPE document_storage_status AS ENUM ('pending_storage', 'stored');

-- Onde vivem os bytes. Decisão: Cloudflare R2 como storage primário;
-- Supabase guarda SOMENTE referências (nunca blobs). `supabase_storage`
-- existe como alternativa; `external_url` para links avulsos.
CREATE TYPE document_provider AS ENUM ('cloudflare_r2', 'supabase_storage', 'external_url');

-- ----------------------------------------------------------------------------
-- Trigger único de updated_at (banco como autoridade; app não envia updated_at)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- orders - entidade central
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL CHECK (char_length(number) BETWEEN 1 AND 60),
  contractor text NOT NULL CHECK (char_length(contractor) BETWEEN 1 AND 300),
  received_date date NOT NULL,
  inspection_date date NULL,
  inspection_time time NULL,
  due_date date NULL CHECK (due_date IS NULL OR due_date >= received_date),
  -- Endereço estruturado {street, number, complement, district, city, state,
  -- postalCode, raw}. JSONB: display-only hoje; geocodificação/rota no futuro.
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_name text NULL,
  contact_phone text NULL,
  notes text NULL,
  status order_status NOT NULL DEFAULT 'received',
  -- Auditoria mínima [{from, to, at, note?}]. Apêndice via app; nunca editado.
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

-- Unicidade comercial: mesmo número pode ser reutilizado após soft-delete,
-- mas nunca em duas OS vivas (case-insensitive). É esta constraint - e não o
-- frontend - que impede duplicação em race conditions.
CREATE UNIQUE INDEX orders_number_unique_active
  ON orders (lower(number))
  WHERE deleted_at IS NULL;

-- Consultas reais da UI (lista/agenda/dashboard):
CREATE INDEX orders_status_idx ON orders (status) WHERE deleted_at IS NULL;
CREATE INDEX orders_inspection_date_idx ON orders (inspection_date) WHERE deleted_at IS NULL;
CREATE INDEX orders_due_date_idx ON orders (due_date) WHERE deleted_at IS NULL;
CREATE INDEX orders_received_date_idx ON orders (received_date);
-- Busca textual por contratante (prefixo; contains evolui p/ pg_trgm se preciso):
CREATE INDEX orders_contractor_idx ON orders (contractor);

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- inspections - 0..1 por OS (UNIQUE + app pré-checa; banco decide em corrida)
-- ----------------------------------------------------------------------------
CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders (id) ON DELETE RESTRICT,
  property_type property_type NOT NULL,
  status inspection_status NOT NULL DEFAULT 'draft',
  schema_version int NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  form_version int NOT NULL DEFAULT 1 CHECK (form_version >= 1),
  current_section int NOT NULL DEFAULT 0 CHECK (current_section >= 0),
  -- Respostas do Form Engine {sectionId: {fieldId: valor}}. JSONB de propósito:
  -- formulários evoluem sem migration por pergunta (versionados acima).
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX inspections_property_type_idx ON inspections (property_type);

CREATE TRIGGER inspections_set_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- documents - 0..N por OS (somente metadados + REFERÊNCIAS; bytes no R2).
-- Convenção de chave do objeto (provider-agnóstica, usada no R2):
--   documents/{order_id}/{document_id}/{filename}
-- Upload futuro via Cloudflare Worker (URLs pré-assinadas); o app grava
-- aqui a chave retornada (+ file_url pública quando houver).
-- ----------------------------------------------------------------------------
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  kind document_kind NOT NULL DEFAULT 'other',
  provider document_provider NOT NULL DEFAULT 'cloudflare_r2',
  mime_type text NULL,
  size_bytes bigint NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  storage_key text NULL,
  file_url text NULL,
  storage_status document_storage_status NOT NULL DEFAULT 'pending_storage',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE INDEX documents_order_id_idx ON documents (order_id) WHERE deleted_at IS NULL;

-- updated_at não existe em documents (metadado imutável exceto soft-delete);
-- sem trigger aqui de propósito.

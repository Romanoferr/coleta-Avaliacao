-- ============================================================================
-- 00003_ownership - isolamento por usuário (Supabase Auth)
-- ============================================================================
-- Modelo: User 1→N Orders; Order 1→0..1 Inspection; Order 1→N Documents.
-- Uma inspection/document deve pertencer ao MESMO usuário da OS (trigger).
--
-- owner_id nasce NULLABLE de propósito: linhas legadas (pré-auth) ficam
-- invisíveis para todos até o backfill (docs/SUPABASE.md § Backfill) e a
-- 00004 trava NOT NULL. Nada é apagado.
-- ============================================================================

ALTER TABLE orders ADD COLUMN owner_id uuid REFERENCES auth.users (id);
ALTER TABLE inspections ADD COLUMN owner_id uuid REFERENCES auth.users (id);
ALTER TABLE documents ADD COLUMN owner_id uuid REFERENCES auth.users (id);

CREATE INDEX orders_owner_idx ON orders (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX inspections_owner_idx ON inspections (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_owner_idx ON documents (owner_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- Mesma regra no banco: filho sempre do mesmo dono da OS.
-- Tolera pai com owner NULL (legado pré-backfill); rejeita divergência real.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_same_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_owner uuid;
BEGIN
  SELECT owner_id INTO parent_owner FROM orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % does not exist', NEW.order_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF parent_owner IS NOT NULL AND NEW.owner_id IS NOT NULL AND parent_owner <> NEW.owner_id THEN
    RAISE EXCEPTION 'owner mismatch: registro deve pertencer ao dono da OS'
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inspections_same_owner
  BEFORE INSERT OR UPDATE OF order_id, owner_id ON inspections
  FOR EACH ROW EXECUTE FUNCTION enforce_same_owner();

CREATE TRIGGER documents_same_owner
  BEFORE INSERT OR UPDATE OF order_id, owner_id ON documents
  FOR EACH ROW EXECUTE FUNCTION enforce_same_owner();

-- ----------------------------------------------------------------------------
-- RLS real: fim das policies temporárias.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS tmp_dev_allow_all_orders ON orders;
DROP POLICY IF EXISTS tmp_dev_allow_all_inspections ON inspections;
DROP POLICY IF EXISTS tmp_dev_allow_all_documents ON documents;

-- Uma policy FOR ALL por tabela cobre os 4 acessos:
-- SELECT/UPDATE/DELETE via USING, INSERT via WITH CHECK.
-- anon (sem sessão) fica sem policy → não vê nem escreve nada.
CREATE POLICY owner_all_orders ON orders
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY owner_all_inspections ON inspections
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY owner_all_documents ON documents
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

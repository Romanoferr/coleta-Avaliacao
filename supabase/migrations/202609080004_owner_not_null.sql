-- ============================================================================
-- 00004_owner_not_null — trava owner_id após o backfill
-- ============================================================================
-- Se falhar, é de propósito: existem linhas órfãs. Faça o backfill
-- (docs/SUPABASE.md § Backfill) e rode de novo. Nada é apagado aqui.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE owner_id IS NULL) THEN
    RAISE EXCEPTION 'orders com owner_id NULL — backfill antes (docs/SUPABASE.md)';
  END IF;
  IF EXISTS (SELECT 1 FROM inspections WHERE owner_id IS NULL) THEN
    RAISE EXCEPTION 'inspections com owner_id NULL — backfill antes (docs/SUPABASE.md)';
  END IF;
  IF EXISTS (SELECT 1 FROM documents WHERE owner_id IS NULL) THEN
    RAISE EXCEPTION 'documents com owner_id NULL — backfill antes (docs/SUPABASE.md)';
  END IF;
END;
$$;

ALTER TABLE orders ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE inspections ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN owner_id SET NOT NULL;

-- ============================================================================
-- 00002_rls - Row Level Security (arquivos vivem no Cloudflare R2; aqui só RLS)
-- ============================================================================
-- ⚠️  ESTADO ATUAL: o app NÃO tem autenticação (single-user, sem login).
--     Por isso, as policies abaixo são EXPLICITAMENTE TEMPORÁRIAS (prefixo
--     tmp_dev_): liberam anon+authenticated para desenvolvimento local.
--
-- ⚠️  ANTES DE PRODUÇÃO, com Auth implementado:
--     1. adicionar coluna owner (uuid references auth.users) nas 3 tabelas;
--     2. DROPar as policies tmp_dev_* (ver docs/SUPABASE.md § RLS);
--     3. criar policies `USING (auth.uid() = owner)`.
--
--     Enquanto as tmp_dev_* existirem, QUALQUER pessoa com a anon key lê e
--     escreve tudo. Não exponha esse banco além do time de desenvolvimento.
-- ============================================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- TEMPORÁRIO (dev, sem auth) - remover ao implementar autenticação.
CREATE POLICY tmp_dev_allow_all_orders
  ON orders FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- TEMPORÁRIO (dev, sem auth) - remover ao implementar autenticação.
CREATE POLICY tmp_dev_allow_all_inspections
  ON inspections FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- TEMPORÁRIO (dev, sem auth) - remover ao implementar autenticação.
CREATE POLICY tmp_dev_allow_all_documents
  ON documents FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Storage de arquivos: Cloudflare R2 (decisão de arquitetura).
-- O Supabase guarda SOMENTE referências (documents.provider/key/url) -
-- por isso NÃO criamos bucket nem policies de storage aqui.
--
-- Convenção de chave no R2: documents/{order_id}/{document_id}/{filename}
-- Upload futuro: via Cloudflare Worker com URLs pré-assinadas (o browser
-- nunca guarda tokens R2). Quando o Worker retornar a chave (e URL pública,
-- se houver), o app atualiza documents.storage_key/file_url/storage_status.
-- ----------------------------------------------------------------------------

# Supabase — guia operacional

Fonte de verdade do banco: `supabase/migrations/`. Nada estrutural é criado
no painel — tudo versionado e reproduzível.

## 1. Criar o projeto

1. Acesse https://supabase.com/dashboard → **New project**.
2. Nome: `coleta-avaliacao` (qualquer). Anote o **Database password**
   (só para emergências/CLI local — NUNCA vai para o frontend).
3. Aguarde o provisionamento (~2 min).

## 2 e 3. Obter URL e chave pública

Project Settings → **Data API**:

- **Project URL** → `VITE_SUPABASE_URL`
- **Publishable key** (antiga `anon key`) → `VITE_SUPABASE_ANON_KEY`

> Use SOMENTE a chave pública. `service_role`, database password e JWT
> secret NUNCA entram no frontend nem no repositório.

## 4. Configurar `.env.local`

```bash
copy .env.example .env.local    # Windows
cp .env.example .env.local      # macOS/Linux
```

Preencha as duas variáveis. Sem elas, o app roda em **modo local**
(localStorage) — mesmos fluxos, rodapé "Salvo neste aparelho".

## 5. Executar migrations

Opção A — **CLI** (recomendado, reproduzível):

```bash
npm i -g supabase                 # uma vez
supabase link --project-ref <ref> # <ref> = trecho da URL: https://<ref>.supabase.co
npm run db:push                    # aplica supabase/migrations em ordem
```

Opção B — **painel** (sem CLI): SQL Editor → New query → cole o conteúdo de
cada arquivo de `supabase/migrations/` **em ordem** → Run. (Funciona, mas prefira a CLI.)

Verificação: Table Editor deve mostrar `orders`, `inspections`, `documents`;
em `orders` → Policies, as policies `owner_all_*` (ver § RLS).

## 5b. Usuários (login e-mail + senha, sem cadastro no app)

1. Dashboard → **Authentication → Users → Add user → Create new user**.
2. Preencha e-mail + senha e marque **Auto Confirm user** (sem isso o login
   retorna "e-mail não confirmado").
3. Repita para o segundo usuário de teste (§ Teste dois usuários).
4. O app tem só login: `/` (landing) → `/login` → `/dashboard`.

## 5c. Backfill de owner (registros pré-auth — NÃO apaga nada)

Linhas criadas antes do Auth têm `owner_id` NULL e ficam invisíveis até
o backfill. Para cada usuário de dev (UID em Authentication → Users):

```sql
UPDATE orders SET owner_id = '<UID>' WHERE owner_id IS NULL;
UPDATE inspections SET owner_id = '<UID>' WHERE owner_id IS NULL;
UPDATE documents SET owner_id = '<UID>' WHERE owner_id IS NULL;
```

Só então rode a migration `202609080004_owner_not_null.sql` — ela falha de
propósito se ainda houver órfãos. Ordem completa no banco existente:
`00003` → backfill → `00004`.

## 6. Gerar tipos TypeScript

```bash
npm run db:types
```

Sobrescreve `src/infrastructure/supabase/database.types.ts` com o schema real.
O espelho manual atual existe para o app compilar antes do primeiro link;
após regerar, rode `npm run build` para conferir.

## 7. Seed (opcional, só desenvolvimento)

```bash
npm run db:reset     # ambiente LOCAL da CLI (docker): aplica migrations + seed.sql
```

Contra a nuvem, o seed **não** roda sozinho: execute `supabase/seed.sql`
no SQL Editor se quiser as 3 OS fictícias. Nunca em produção.

## 8. Verificar RLS

No SQL Editor:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- orders/inspections/documents → rowsecurity = true
select policyname, roles, cmd from pg_policies where schemaname = 'public';
-- espera-se owner_all_orders/inspections/documents (TO authenticated).
-- NÃO deve existir nenhuma tmp_dev_*:
select policyname from pg_policies where policyname like 'tmp\_dev\_%';
-- 0 linhas. Se retornar algo, rode a 00003 de novo.
```

### Modelo de segurança (RLS real, por dono)

- `owner_id uuid REFERENCES auth.users(id)` nas 3 tabelas (migration
  `00003`; `00004` trava `NOT NULL` após backfill).
- Policies `owner_all_* FOR ALL TO authenticated USING (auth.uid() =
  owner_id) WITH CHECK (auth.uid() = owner_id)`: SELECT/UPDATE/DELETE só nas
  próprias linhas; INSERT só com o próprio id. `anon` sem policy: zero acesso.
- Trigger `enforce_same_owner()`: ficha/documento sempre do mesmo dono da
  OS (tolera pai com `owner_id` NULL — legado pré-backfill).
- Frontend nunca escolhe dono: repositories injetam `owner_id` a partir de
  `auth.getUser()` (sessão validada no servidor); a policy valida de novo.

### Teste dois usuários (isolamento)

1. Crie User A e User B (§ 5b). Aplique `00003`, backfill, `00004`.
2. Navegador normal: login A → crie OS-1 + ficha. Anote o id da OS-1 (URL).
3. Aba anônima: login B → lista vazia; cole a URL da OS-1 → "não encontrada";
   crie OS-2. (Logout + login no mesmo navegador também recarrega tudo do
   zero — nenhum dado do usuário anterior permanece em memória ou cache.)
4. SQL Editor (service_role implícito do painel — só leitura aqui):
   ```sql
   select number, owner_id from orders where deleted_at is null;
   -- OS-1 com owner A, OS-2 com owner B, sem cruzamento
   ```
5. Login A de novo: só OS-1 visível; edite e exclua normalmente.
6. Tentativa direta via REST com o token de B num id de A deve retornar
   `[]`/404 (RLS), nunca os dados.

## Arquivos: Cloudflare R2 (Supabase só com referências)

Decisão de arquitetura: os bytes vivem no **Cloudflare R2**; o Supabase
guarda em `documents` apenas `provider` (`cloudflare_r2` por padrão),
`storage_key`, `file_url`, `mime_type` e `size_bytes`. Por isso as migrations
**não** criam bucket nem policies de storage.

- Convenção de chave no R2: `documents/{order_id}/{document_id}/{filename}`.
- Upload futuro: via **Cloudflare Worker com URLs pré-assinadas** — o
  browser nunca guarda tokens R2. O Worker devolve a chave (e a URL pública,
  se houver); o app atualiza a linha em `documents` (`stored`).
- `supabase_storage` e `external_url` existem no enum `document_provider`
  como alternativas, sem uso atual.

## 9. Rodar a aplicação

```bash
npm run dev
```

Fluxos de aceitação: criar OS → reload (persiste) → abrir OS → criar ficha →
preencher → reload (persiste) → tentar 2ª ficha (impedido) → editar OS e ficha
→ reload (permanece). Rodapé do Dashboard confirma "Salvo na nuvem".

## 10. Problemas comuns

| Sintoma | Causa provável | Ação |
|---|---|---|
| Rodapé "modo local" com `.env.local` criado | Vite precisa reiniciar após criar/editar `.env*` | Reinicie `npm run dev` |
| `Failed to fetch` / lista não carrega | URL errada ou projeto pausado | Confira URL; reative o projeto no painel |
| `Acesso negado (RLS)` | Migrations RLS não aplicadas | Rode a migration `00002`; confira policies |
| `Já existe OS com este número` ao migrar | Número local colide com a nuvem | Renomeie uma das duas; tente de novo |
| Tela "mudou em outro lugar" | Edição concorrente (2 abas) | Recarregue; o rascunho local é preservado |
| Tipos TS desatualizados após mudar migration | Espelho manual | `npm run db:types` + `npm run build` |

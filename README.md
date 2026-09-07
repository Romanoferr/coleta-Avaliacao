# Coleta Avaliação

Sistema de **ordens de serviço (OS) e fichas de vistoria de imóveis** para uso
em campo no celular: recebe a OS, organiza a agenda, preenche a ficha
(apartamento, terreno) na ordem da ficha de papel e acompanha cada serviço
até a conclusão, com login por usuário e dados isolados por dono.

Stack: React 18 + TypeScript + Vite + Tailwind CSS + React Router +
Supabase (PostgreSQL + Auth + RLS).

## Pré-requisitos

- Node.js 18+ e npm (`node --version`)
- Conta no [Supabase](https://supabase.com) (só para o modo nuvem)

## Início rápido (5 min, sem Supabase)

Funciona de imediato em **modo local** (dados no navegador):

```bash
npm install
npm run dev
```

Abra o endereço exibido (ex.: `http://localhost:5173`).
Para testar no celular na mesma rede: `npm run dev -- --host` e abra o IP
da máquina no navegador do celular.

## Modo nuvem (Supabase)

1. Crie o projeto em https://supabase.com/dashboard → **New project**.
2. Copie o env e preencha com a URL e a chave pública
   (Project Settings → Data API - **somente** a chave pública/anon):
   ```bash
   copy .env.example .env   # Windows
   cp .env.example .env     # macOS/Linux
   ```
3. Aplique as migrations **em ordem** no SQL Editor
   (ou `supabase link` + `npm run db:push`):
   `supabase/migrations/202609080001_core.sql` →
   `202609080002_rls.sql` → `202609080003_ownership.sql` →
   backfill de `owner_id` → `202609080004_owner_not_null.sql`.
4. No Supabase Dashboard: Authentication → Email provider habilitado (+
   Redirect URLs com `/#/reset-password` e `/#/login`, ver `docs/SUPABASE.md`
   § 5b). Opcional: `VITE_APP_URL` no env para o redirect do Auth.
5. Reinicie o `npm run dev` e crie a conta em `/cadastro` (ou entre em `/login`).

Guia completo (RLS, backfill, seed, teste com dois usuários, problemas
comuns): [`docs/SUPABASE.md`](docs/SUPABASE.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Ambiente de desenvolvimento |
| `npm run build` | Typecheck (`tsc`) + build de produção |
| `npm run preview` | Serve o build localmente |
| `npm test` | Testes unitários (vitest) |
| `npm run db:push` | Aplica migrations (requer Supabase CLI linkada) |
| `npm run db:reset` | Reseta o banco local da CLI (docker) + seed |
| `npm run db:types` | Regenera os tipos TS a partir do schema real |

## Estrutura

```text
src/
├── screens/        Landing, Login, Signup, ForgotPassword, ResetPassword, Dashboard, OrderForm, OrderDetail, InspectionScreen
├── state/          Auth (sessão Supabase) e Store (casos de uso + cache por usuário)
├── state/authValidation.ts  Validação e mensagens amigáveis do Auth (testado)
├── domain/         Regras de negócio puras (OS, ficha, documentos, status)
├── repositories/   Portas + implementações (Supabase / localStorage)
├── infrastructure/supabase/  Client único + tipos do schema
├── form-engine/ + forms/      Motor de fichas e roteiros (apartamento, terreno)
├── components/     Biblioteca visual própria
└── application/    Seletores (filtros, contadores do dashboard)
supabase/migrations/  Schema versionado (tabelas, RLS, ownership)
docs/               SUPABASE.md (operação) · UX-FOCUS.md (padrão visual)
```

Rotas: `/` landing → `/login` / `/cadastro` → `/dashboard` (protegida) → `/os/*` (protegida).
Recuperação: `/recuperar-senha` → e-mail → `/reset-password` (pública no fluxo).
Sem `.env`, o app roda em modo local sem login.

## Segurança (resumo)

- Frontend usa **só** a chave pública; `service_role` nunca entra no repo.
- Isolamento por usuário garantido pelo PostgreSQL/RLS (`auth.uid() =
  owner_id`) + trigger de mesmo-dono; `anon` não enxerga nada.
- Nunca commite `.env` (só `.env.example`, sem valores reais).

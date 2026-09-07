-- ============================================================================
-- 00007_billing - base de cobranca (Asaas, link hospedado)
-- Plano MVP: Pro R$ 39,90/mes, primeiro mes R$ 9,90, cartao + Pix.
-- Verdade de acesso fica aqui. Frontend nunca escreve direto em producao:
-- escrita via Edge Functions + webhook. RLS isola por owner_id.
-- ============================================================================

CREATE TYPE billing_status AS ENUM (
  'none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'
);

CREATE TYPE billing_provider AS ENUM ('asaas', 'mock');

-- Cliente do provedor (1 por usuario no MVP).
CREATE TABLE billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id),
  provider billing_provider NOT NULL DEFAULT 'asaas',
  external_customer_id text NULL,
  name text NULL,
  email text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider)
);

-- Assinatura (1 ativa por usuario no MVP).
CREATE TABLE billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id),
  provider billing_provider NOT NULL DEFAULT 'asaas',
  external_subscription_id text NULL,
  plan_id text NOT NULL DEFAULT 'pro',
  status billing_status NOT NULL DEFAULT 'none',
  current_period_end timestamptz NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  promo_first_month boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_subs_owner_idx ON billing_subscriptions (owner_id);

-- Pagamentos espelho do gateway (auditoria + historico do usuario).
CREATE TABLE billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id),
  subscription_id uuid NULL REFERENCES billing_subscriptions (id) ON DELETE SET NULL,
  provider billing_provider NOT NULL DEFAULT 'asaas',
  external_payment_id text NULL,
  amount_cents int NOT NULL CHECK (amount_cents >= 0),
  method text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz NULL,
  refunded_cents int NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_pay_owner_idx ON billing_payments (owner_id);
CREATE UNIQUE INDEX billing_pay_external_uidx
  ON billing_payments (provider, external_payment_id)
  WHERE external_payment_id IS NOT NULL;

-- Eventos de webhook (idempotencia + auditoria).
CREATE TABLE billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider billing_provider NOT NULL DEFAULT 'asaas',
  event_type text NOT NULL,
  external_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE TRIGGER billing_customers_set_updated_at
  BEFORE UPDATE ON billing_customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER billing_subscriptions_set_updated_at
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;

-- Usuario le o proprio billing. Escrita direta bloqueada no app:
-- apenas service_role (Edge Functions) escreve. Leitura via authenticated.
CREATE POLICY billing_customers_read ON billing_customers
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY billing_subscriptions_read ON billing_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY billing_payments_read ON billing_payments
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- Webhook events: sem acesso direto do app, apenas via service_role.
-- Nenhuma policy para authenticated = sem leitura nem escrita pelo frontend.

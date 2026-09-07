-- ============================================================================
-- 00008_billing_rls - trava de acesso por assinatura (paywall no banco)
-- Espelha a regra do frontend (RequireSubscription): active, trialing e
-- past_due passam. none, canceled e unpaid sao bloqueados.
-- service_role (webhook) bypassa RLS e nao e afetado. anon segue sem nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.billing_subscriptions s
    WHERE s.owner_id = auth.uid()
      AND s.status IN ('active', 'trialing', 'past_due')
  );
$$;

-- Policies RESTRICTIVE combinam com AND: alem de ser dono, precisa
-- ter assinatura em dia. Vale para SELECT, INSERT, UPDATE e DELETE.
CREATE POLICY billing_access_orders ON orders
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_active_subscription());

CREATE POLICY billing_access_inspections ON inspections
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_active_subscription());

CREATE POLICY billing_access_documents ON documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_active_subscription());

/**
 * BillingProvider: exposicao de status de assinatura para o frontend.
 * Leitura somente do banco (tabelas billing_*). Escrita somente via webhook.
 * Modo mock: permite navegar nas telas sem liberar acesso real.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { BillingStatus, PlanId } from "../domain/billing";
import { getSupabase, isSupabaseConfigured } from "../infrastructure/supabase/client";
import { useAuth } from "./auth";

interface Billing {
  status: BillingStatus;
  planId: PlanId | null;
  loading: boolean;
  provider: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  externalSubscriptionId: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Billing | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [status, setStatus] = useState<BillingStatus>("none");
  const [planId, setPlanId] = useState<PlanId | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [externalSubscriptionId, setExternalSubscriptionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (authStatus !== "authenticated" || !user) {
      setStatus("none");
      setPlanId(null);
      setProvider(null);
      setCurrentPeriodEnd(null);
      setCancelAtPeriodEnd(false);
      setExternalSubscriptionId(null);
      return;
    }
    if (!isSupabaseConfigured()) return;
    const client = getSupabase();
    if (!client) return;
    setLoading(true);
    try {
      // Tabela billing_* ainda fora de database.types.ts. Usa any ate rodar db:types.
      const sb = client as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              order: (col: string, o: { ascending: boolean }) => {
                limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> };
              };
            };
          };
        };
      };
      const { data } = await sb
        .from("billing_subscriptions")
        .select("status, plan_id, provider, current_period_end, cancel_at_period_end, external_subscription_id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = data as {
        status?: BillingStatus;
        plan_id?: PlanId;
        provider?: string;
        current_period_end?: string | null;
        cancel_at_period_end?: boolean;
        external_subscription_id?: string | null;
      } | null;
      if (row) {
        setStatus(row.status ?? "none");
        setPlanId(row.plan_id ?? null);
        setProvider(row.provider ?? null);
        setCurrentPeriodEnd(row.current_period_end ?? null);
        setCancelAtPeriodEnd(Boolean(row.cancel_at_period_end));
        setExternalSubscriptionId(row.external_subscription_id ?? null);
      } else {
        setStatus("none");
        setPlanId(null);
        setProvider(null);
        setCurrentPeriodEnd(null);
        setCancelAtPeriodEnd(false);
        setExternalSubscriptionId(null);
      }
    } finally {
      setLoading(false);
    }
  }, [authStatus, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      status,
      planId,
      loading,
      provider,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      externalSubscriptionId,
      refresh,
    }),
    [status, planId, loading, provider, currentPeriodEnd, cancelAtPeriodEnd, externalSubscriptionId, refresh]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBilling(): Billing {
  const b = useContext(Ctx);
  if (!b) throw new Error("useBilling fora do BillingProvider");
  return b;
}

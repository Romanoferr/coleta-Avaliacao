/**
 * Client do provedor no frontend.
 * Em sandbox sem chave, usa MockPaymentProvider.
 * Com Edge Function configurada, delega para o backend (que detem a chave Asaas).
 */
import { getSupabase } from "../supabase/client";
import type { CheckoutInput, CheckoutResult, PaymentProvider } from "./provider";
import { MockPaymentProvider } from "./provider";

class EdgePaymentProvider implements PaymentProvider {
  readonly name = "asaas" as const;
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase nao configurado.");
    const { data, error } = await client.functions.invoke("billing-checkout", { body: input });
    if (error) throw error;
    return data as CheckoutResult;
  }
  async cancelSubscription(externalSubscriptionId: string): Promise<void> {
    const client = getSupabase();
    if (!client) throw new Error("Supabase nao configurado.");
    const { error } = await client.functions.invoke("billing-cancel", {
      body: { externalSubscriptionId },
    });
    if (error) throw error;
  }
}

export function getPaymentProvider(): PaymentProvider {
  const enabled = (import.meta.env.VITE_BILLING_ENABLED as string | undefined) === "1";
  if (!enabled) return new MockPaymentProvider();
  try {
    if (!getSupabase()) return new MockPaymentProvider();
  } catch {
    return new MockPaymentProvider();
  }
  return new EdgePaymentProvider();
}

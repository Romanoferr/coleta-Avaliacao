/**
 * Billing: tipos canonicos e catalogo de planos.
 * Fonte de verdade de acesso e o banco (via webhook), nunca o frontend.
 * Provedor real fica atras de PaymentProvider (ver infrastructure/billing).
 */

export type PlanId = "pro";

export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid";

export interface Plan {
  id: PlanId;
  name: string;
  /** Valor cheio mensal em centavos. Ex.: 3990 = R$ 39,90. */
  priceCents: number;
  /** Valor promocional do primeiro mes em centavos. */
  promoFirstMonthCents: number;
  interval: "month";
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 3990,
    promoFirstMonthCents: 990,
    interval: "month",
    features: ["Ordens de servico ilimitadas", "Ficha digital", "Rota do dia", "Documentos por OS"],
  },
};

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Acesso liberado apenas com assinatura em dia. Graca futura entra aqui, nao nas telas. */
export function hasAccess(status: BillingStatus): boolean {
  return status === "active" || status === "trialing";
}

/** Status que merecem aviso, sem bloquear de imediato. */
export function needsAttention(status: BillingStatus): boolean {
  return status === "past_due" || status === "unpaid";
}

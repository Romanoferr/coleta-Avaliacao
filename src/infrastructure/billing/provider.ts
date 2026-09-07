/**
 * Abstracao do provedor de pagamento.
 * O app fala com PaymentProvider. O Asaas fica atras dele.
 * Trocar de gateway nao deve exigir mudar telas.
 */
import type { PlanId } from "../../domain/billing";

export type CheckoutMethod = "card" | "pix";

export interface CheckoutInput {
  planId: PlanId;
  method: CheckoutMethod;
  customer: { name: string; email: string; cpfCnpj?: string; phone?: string };
  promoFirstMonth?: boolean;
}

export interface CheckoutResult {
  /** URL do link hospedado do Asaas (ou mock local). */
  checkoutUrl: string;
  provider: "asaas" | "mock";
  externalId: string;
}

export interface PaymentProvider {
  readonly name: "asaas" | "mock";
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  cancelSubscription(externalSubscriptionId: string): Promise<void>;
}

/** Mock para desenvolver sem chave do Asaas. Nunca libera acesso real sozinho. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const fakeId = `mock_${input.planId}_${Date.now()}`;
    return {
      checkoutUrl: `#/assinatura?mock=${encodeURIComponent(fakeId)}&plan=${input.planId}&method=${input.method}`,
      provider: "mock",
      externalId: fakeId,
    };
  }
  async cancelSubscription(): Promise<void> {
    return;
  }
}

// Edge Function: billing-checkout
// Cria link hospedado no Asaas (assinatura com promocao no 1o mes).
// Roda com service_role. Nunca expoe ASAAS_API_KEY ao frontend.
// Env vars (supabase secrets): ASAAS_API_KEY, ASAAS_BASE_URL, APP_BASE_URL.
//
// MVP: plano pro, 3990 cents, promo 990 cents no primeiro mes.
// Estrategia promo: cria assinatura com desconto na primeira cobranca
// via campo discount da API Asaas. Se a conta nao suportar discount,
// fallback: criar cobranca avulsa promo + assinatura iniciando no mes 2
// (implementar apos validar conta sandbox).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";

const PRICE_CENTS = 3990;
const PROMO_CENTS = 990;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const asaasKey = Deno.env.get("ASAAS_API_KEY") ?? "";
  const asaasBase = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
  const appBase = Deno.env.get("APP_BASE_URL") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
  const user = userData.user;

  let body: { planId?: string; method?: string; customer?: { name?: string; email?: string; cpfCnpj?: string; phone?: string }; promoFirstMonth?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400, headers: corsHeaders });
  }
  if (body.planId !== "pro") {
    return new Response("Plano invalido", { status: 400, headers: corsHeaders });
  }
  const method = body.method === "pix" ? "PIX" : "CREDIT_CARD";
  const usePromo = body.promoFirstMonth !== false;

  if (!asaasKey) {
    // Sem chave: devolve mock para o frontend seguir navegando.
    return json({
      provider: "mock",
      externalId: `mock_${Date.now()}`,
      checkoutUrl: `${appBase}#/assinatura?mock=1&plan=pro`,
    });
  }

  // 1. Garante customer no Asaas (busca por email, senao cria).
  const email = body.customer?.email ?? user.email ?? "";
  const name = body.customer?.name ?? "Assinante";
  let customerId = "";
  const searchRes = await fetch(`${asaasBase}/customers?email=${encodeURIComponent(email)}`, {
    headers: { access_token: asaasKey },
  });
  const searchJson = await searchRes.json().catch(() => ({}));
  const found = searchJson?.data?.[0]?.id;
  const patch: Record<string, unknown> = { name };
  if (body.customer?.cpfCnpj) patch.cpfCnpj = body.customer.cpfCnpj;
  if (body.customer?.phone) patch.mobilePhone = body.customer.phone;
  if (found) {
    customerId = found;
    // Repara cadastros antigos incompletos (ex. sem CPF): o Asaas exige
    // CPF/CNPJ do cliente para gerar cobranca Pix ou cartao.
    await fetch(`${asaasBase}/customers/${customerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", access_token: asaasKey },
      body: JSON.stringify(patch),
    });
  } else {
    const createRes = await fetch(`${asaasBase}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: asaasKey },
      body: JSON.stringify({
        name,
        email,
        cpfCnpj: body.customer?.cpfCnpj,
        mobilePhone: body.customer?.phone,
      }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok) {
      return json(createJson, 502);
    }
    customerId = createJson.id;
  }

  // 2. Cria assinatura mensal com desconto na primeira cobranca.
  const value = PRICE_CENTS / 100;
  const discountValue = usePromo ? (PRICE_CENTS - PROMO_CENTS) / 100 : 0;
  const nextDue = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const subRes = await fetch(`${asaasBase}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: asaasKey },
    body: JSON.stringify({
      customer: customerId,
      billingType: method === "PIX" ? "PIX" : "CREDIT_CARD",
      cycle: "MONTHLY",
      value,
      nextDueDate: nextDue,
      description: "Plano Pro coleta avaliacao",
      externalReference: user.id,
      ...(discountValue > 0
        ? { discount: { value: discountValue, dueDateLimitDays: 0, type: "FIXED" } }
        : {}),
    }),
  });
  const subJson = await subRes.json();
  if (!subRes.ok) {
    return json(subJson, 502);
  }

  // 3. Espelha no banco local (service_role bypassa RLS).
  await supabase.from("billing_customers").upsert(
    { owner_id: user.id, provider: "asaas", external_customer_id: customerId, name, email },
    { onConflict: "owner_id,provider" }
  );
  await supabase.from("billing_subscriptions").insert({
    owner_id: user.id,
    provider: "asaas",
    external_subscription_id: subJson.id,
    plan_id: "pro",
    status: "none",
    promo_first_month: usePromo,
  });

  return json({
    provider: "asaas",
    externalId: subJson.id,
    checkoutUrl: await resolveCheckoutUrl(asaasBase, asaasKey, subJson.id, subJson, appBase),
  });
});

// A assinatura gera a primeira cobranca em seguida. O link dessa cobranca
// (invoiceUrl) e a pagina onde o cliente digita o cartao ou escaneia o Pix,
// incluindo os dados do titular. Sem isso o app devolveria um link vazio.
async function resolveCheckoutUrl(
  asaasBase: string,
  asaasKey: string,
  subscriptionId: string,
  subJson: Record<string, unknown>,
  appBase: string
): Promise<string> {
  if (typeof subJson.invoiceUrl === "string" && subJson.invoiceUrl) {
    return subJson.invoiceUrl;
  }
  try {
    const payRes = await fetch(`${asaasBase}/subscriptions/${subscriptionId}/payments`, {
      headers: { access_token: asaasKey },
    });
    const payJson = await payRes.json().catch(() => ({}));
    const first = payJson?.data?.[0];
    if (first && typeof first.invoiceUrl === "string" && first.invoiceUrl) {
      return first.invoiceUrl;
    }
  } catch {
    // segue para o fallback abaixo
  }
  if (typeof subJson.bankSlipUrl === "string" && subJson.bankSlipUrl) {
    return subJson.bankSlipUrl;
  }
  return `${appBase}#/assinatura?sub=${subscriptionId}`;
}

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

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const asaasKey = Deno.env.get("ASAAS_API_KEY") ?? "";
  const asaasBase = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
  const appBase = Deno.env.get("APP_BASE_URL") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const user = userData.user;

  let body: { planId?: string; method?: string; customer?: { name?: string; email?: string; cpfCnpj?: string }; promoFirstMonth?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (body.planId !== "pro") {
    return new Response("Plano invalido", { status: 400 });
  }
  const method = body.method === "pix" ? "PIX" : "CREDIT_CARD";
  const usePromo = body.promoFirstMonth !== false;

  if (!asaasKey) {
    // Sem chave: devolve mock para o frontend seguir navegando.
    return Response.json({
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
  if (found) {
    customerId = found;
  } else {
    const createRes = await fetch(`${asaasBase}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: asaasKey },
      body: JSON.stringify({ name, email, cpfCnpj: body.customer?.cpfCnpj }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok) {
      return new Response(JSON.stringify(createJson), { status: 502 });
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
    return new Response(JSON.stringify(subJson), { status: 502 });
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

  return Response.json({
    provider: "asaas",
    externalId: subJson.id,
    checkoutUrl: subJson.invoiceUrl ?? subJson.bankSlipUrl ?? `${appBase}#/assinatura?sub=${subJson.id}`,
  });
});

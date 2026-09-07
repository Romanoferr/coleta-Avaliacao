// Edge Function: billing-cancel
// Cancela no fim do periodo: interrompe cobrancas futuras no Asaas mas
// mantem acesso local ate current_period_end (30 dias do ultimo pagamento).
// Roda com service_role. Exige JWT do usuario.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";

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

  let body: { externalSubscriptionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Localiza a assinatura do usuario (prioriza a informada).
  let query = supabase
    .from("billing_subscriptions")
    .select("id, external_subscription_id, status, current_period_end")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (body.externalSubscriptionId) {
    query = query.eq("external_subscription_id", body.externalSubscriptionId);
  }
  const { data: sub } = await query.maybeSingle() as {
    data: { id: string; external_subscription_id: string | null; status: string; current_period_end: string | null } | null;
  };
  if (!sub) {
    return new Response("Assinatura nao encontrada", { status: 404, headers: corsHeaders });
  }

  // Interrompe cobrancas futuras no Asaas sem apagar o historico local.
  // Sem chave (mock), apenas espelha local.
  if (asaasKey && sub.external_subscription_id) {
    const delRes = await fetch(`${asaasBase}/subscriptions/${sub.external_subscription_id}`, {
      method: "DELETE",
      headers: { access_token: asaasKey },
    });
    if (!delRes.ok) {
      const errJson = await delRes.json().catch(() => ({}));
      return json(errJson, 502);
    }
  }

  // Carencia: acesso continua ate o fim do periodo ja pago.
  // Se o periodo for desconhecido, garante 30 dias a partir de agora.
  const periodEnd = sub.current_period_end ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await supabase
    .from("billing_subscriptions")
    // @ts-ignore tipagem parcial fora de database.types
    .update({ cancel_at_period_end: true, current_period_end: periodEnd })
    .eq("id", sub.id);

  return json({ ok: true, access_until: periodEnd });
});

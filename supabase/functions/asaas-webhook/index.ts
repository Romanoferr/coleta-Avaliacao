// Edge Function: asaas-webhook
// Recebe eventos do Asaas, valida token, grava com idempotencia e
// atualiza billing_subscriptions e billing_payments.
// Secrets: ASAAS_WEBHOOK_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Eventos MVP: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE,
// PAYMENT_REFUNDED, SUBSCRIPTION_DELETED.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "";
  const got = req.headers.get("asaas-access-token") ?? "";
  if (!expected || got !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  let body: { event?: string; payment?: Record<string, unknown>; subscription?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const event = body.event ?? "unknown";
  const payment = (body.payment ?? {}) as Record<string, unknown>;
  const payId = String(payment.id ?? `${event}_${Date.now()}`);

  // Idempotencia: ignora duplicado.
  const { error: evtErr } = await supabase.from("billing_webhook_events").insert({
    provider: "asaas",
    event_type: event,
    external_id: payId,
    payload: body,
    processed_at: new Date().toISOString(),
  });
  if (evtErr && evtErr.code === "23505") {
    return Response.json({ ok: true, deduped: true });
  }

  const externalRef = String(
    payment.externalReference ?? (body.subscription as Record<string, unknown> | undefined)?.externalReference ?? ""
  );
  const paymentSubscriptionId = String(payment.subscription ?? "");
  const paymentCustomerId = String(payment.customer ?? "");
  if (!externalRef && !paymentSubscriptionId) {
    return Response.json({ ok: true, skipped: true });
  }

  const findSub = async () => {
    // 1. Via referencia externa (fluxo app, billing-checkout).
    if (externalRef) {
      const { data } = await supabase
        .from("billing_subscriptions")
        .select("id, owner_id")
        .eq("owner_id", externalRef)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    // 2. Via ID da assinatura (fluxo painel, vinculo manual previo).
    if (paymentSubscriptionId) {
      const { data } = await supabase
        .from("billing_subscriptions")
        .select("id, owner_id")
        .eq("external_subscription_id", paymentSubscriptionId)
        .limit(1)
        .maybeSingle();
      return data;
    }
    return null;
  };

  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
    const sub = await findSub();
    const amount = Number(payment.value ?? 39.9);
    if (sub) {
      await supabase.from("billing_subscriptions").update({
        status: "active",
        cancel_at_period_end: false,
      }).eq("id", sub.id);
      if (paymentCustomerId) {
        await supabase.from("billing_customers").upsert(
          { owner_id: sub.owner_id, provider: "asaas", external_customer_id: paymentCustomerId },
          { onConflict: "owner_id,provider" }
        );
      }
      await supabase.from("billing_payments").upsert(
        {
          owner_id: sub.owner_id,
          subscription_id: sub.id,
          provider: "asaas",
          external_payment_id: payId,
          amount_cents: Math.round(amount * 100),
          method: String(payment.billingType ?? "unknown"),
          status: "paid",
          paid_at: new Date().toISOString(),
          raw: body,
        },
        { onConflict: "provider,external_payment_id" }
      );
    }
  } else if (event === "PAYMENT_OVERDUE") {
    const sub = await findSub();
    if (sub) {
      await supabase.from("billing_subscriptions").update({ status: "past_due" }).eq("id", sub.id);
    }
  } else if (event === "PAYMENT_REFUNDED") {
    await supabase.from("billing_payments").update({
      status: "refunded",
      refunded_cents: Math.round(Number(payment.value ?? 0) * 100),
    }).eq("external_payment_id", payId);
  } else if (event === "SUBSCRIPTION_DELETED") {
    const sub = await findSub();
    if (sub) {
      await supabase.from("billing_subscriptions").update({ status: "canceled" }).eq("id", sub.id);
    }
  }

  return Response.json({ ok: true });
});

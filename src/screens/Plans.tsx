/**
 * Planos: tela publica de preco unico (MVP).
 * Pro R$ 39,90/mes, primeiro mes R$ 9,90, cartao ou Pix via link Asaas.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { PLANS, formatBRL } from "../domain/billing";
import { getPaymentProvider } from "../infrastructure/billing/client";
import type { CheckoutMethod } from "../infrastructure/billing/provider";
import { useAuth } from "../state/auth";

export default function Plans() {
  const navigate = useNavigate();
  const { status, user } = useAuth();
  const [method, setMethod] = useState<CheckoutMethod>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = PLANS.pro;

  const start = async () => {
    if (status !== "authenticated") {
      navigate("/cadastro", { replace: true });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const provider = getPaymentProvider();
      const res = await provider.createCheckout({
        planId: "pro",
        method,
        customer: {
          name: (user?.user_metadata as Record<string, unknown> | undefined)?.display_name as string ?? "Assinante",
          email: user?.email ?? "",
        },
        promoFirstMonth: true,
      });
      window.location.href = res.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar checkout.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Assinatura" title="Plano Pro" onBack={() => navigate("/")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="animate-rise mt-6 rounded-3xl bg-ink p-6 text-white">
          <h2 className="text-[22px] font-extrabold">Pro: {formatBRL(plan.priceCents)}/mes</h2>
          <p className="mt-1 text-[14px] text-slate-300">
            Primeiro mes por {formatBRL(plan.promoFirstMonthCents)}. A partir do segundo mes, {formatBRL(plan.priceCents)}.
          </p>
        </section>
        <section className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-5">
          <ul className="text-[14px] text-slate-700">
            {plan.features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMethod("card")}
              className={`h-[48px] flex-1 rounded-2xl border-[1.5px] font-extrabold ${method === "card" ? "border-brand bg-brand/10 text-brand" : "border-slate-200 text-slate-600"}`}
            >
              Cartao
            </button>
            <button
              type="button"
              onClick={() => setMethod("pix")}
              className={`h-[48px] flex-1 rounded-2xl border-[1.5px] font-extrabold ${method === "pix" ? "border-brand bg-brand/10 text-brand" : "border-slate-200 text-slate-600"}`}
            >
              Pix
            </button>
          </div>
          {error ? <p role="alert" className="mt-3 text-[14px] font-bold text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="mt-4 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white disabled:opacity-60"
          >
            {busy ? "Abrindo pagamento…" : "Assinar agora"}
          </button>
          <p className="mt-2 text-center text-[12.5px] text-slate-500">
            Pagamento processado pelo Asaas em ambiente seguro. Sem sua PJ ativa voce pode testar em sandbox e operar como pessoa fisica.
          </p>
        </section>
      </main>
    </div>
  );
}

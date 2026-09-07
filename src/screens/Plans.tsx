/**
 * Planos: tela publica de preco unico (MVP).
 * Pro R$ 39,90/mes, primeiro mes R$ 9,90, cartao ou Pix via link Asaas.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { OsField, osInputCls } from "../components/os";
import { PLANS, formatBRL } from "../domain/billing";
import { getPaymentProvider } from "../infrastructure/billing/client";
import type { CheckoutMethod } from "../infrastructure/billing/provider";
import { useAuth } from "../state/auth";

/** CPF com 11 digitos ou CNPJ com 14, ignorando pontuacao. */
export function validCpfCnpj(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length === 11 || d.length === 14;
}

export default function Plans() {
  const navigate = useNavigate();
  const { status, user, signOut } = useAuth();
  const [method, setMethod] = useState<CheckoutMethod>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(
    ((user?.user_metadata as Record<string, unknown> | undefined)?.display_name as string) ?? ""
  );
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const plan = PLANS.pro;
  const logged = status === "authenticated";

  const leave = () => {
    signOut()
      .then(() => navigate("/", { replace: true }))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Falha ao sair.");
      });
  };

  const start = async () => {
    if (status !== "authenticated") {
      navigate("/cadastro", { replace: true });
      return;
    }
    if (!name.trim()) {
      setError("Informe seu nome completo.");
      return;
    }
    if (!validCpfCnpj(cpfCnpj)) {
      setError("Informe um CPF ou CNPJ válido para a cobrança.");
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
          name: name.trim(),
          email: user?.email ?? "",
          cpfCnpj: cpfCnpj.replace(/\D/g, ""),
          phone: phone.replace(/\D/g, "") || undefined,
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
          {logged ? (
            <div className="mt-4 flex flex-col gap-4">
              <OsField label="Nome completo">
                <input
                  type="text"
                  className={osInputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              </OsField>
              <OsField label="CPF ou CNPJ" hint="Exigido pelo Asaas para gerar a cobrança.">
                <input
                  type="text"
                  className={osInputCls}
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                />
              </OsField>
              <OsField label="Celular (opcional)">
                <input
                  type="tel"
                  className={osInputCls}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 90000-0000"
                  autoComplete="tel"
                />
              </OsField>
            </div>
          ) : null}
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
          {logged ? (
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="h-[48px] w-full rounded-2xl border-[1.5px] border-slate-200 text-[15px] font-extrabold text-slate-600"
              >
                Voltar para a aplicação
              </button>
              <button
                type="button"
                onClick={leave}
                className="h-[48px] w-full rounded-2xl text-[15px] font-extrabold text-slate-500 underline underline-offset-2"
              >
                Sair da conta
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-4 h-[48px] w-full rounded-2xl text-[14px] font-extrabold text-brand underline underline-offset-2"
            >
              Já tem conta? Entrar
            </button>
          )}
        </section>
      </main>
    </div>
  );
}

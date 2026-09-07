/**
 * Assinatura: status atual, historico de pagamentos e acoes.
 * Leitura do banco local. Cancelamento chama Edge Function.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { hasAccess, needsAttention } from "../domain/billing";
import { getPaymentProvider } from "../infrastructure/billing/client";
import { getSupabase, isSupabaseConfigured } from "../infrastructure/supabase/client";
import { useAuth } from "../state/auth";
import { useBilling } from "../state/billing";

interface PayRow {
  id: string;
  amount_cents: number;
  method: string;
  status: string;
  paid_at: string | null;
}

export default function Subscription() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { status, planId, loading, refresh } = useBilling();
  const [pays, setPays] = useState<PayRow[]>([]);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  const cancellable = status === "active" || status === "trialing" || status === "past_due";

  const cancel = () => {
    if (!window.confirm("Cancelar a assinatura? O acesso é bloqueado na hora.")) return;
    setCancelBusy(true);
    setCancelMsg("");
    getPaymentProvider()
      .cancelSubscription("")
      .then(() => refresh().then(() => setCancelMsg("Assinatura cancelada.")))
      .catch((e: unknown) => {
        setCancelMsg(e instanceof Error ? e.message : "Falha ao cancelar.");
      })
      .finally(() => setCancelBusy(false));
  };

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured() || !user) return;
      const client = getSupabase();
      if (!client) return;
      // billing_* fora de database.types.ts ate regenerar tipos. Usa any aqui.
      const sb = client as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              order: (col: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: unknown }>;
              };
            };
          };
        };
      };
      const { data } = await sb
        .from("billing_payments")
        .select("id, amount_cents, method, status, paid_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setPays(data as PayRow[]);
    };
    void load();
  }, [user]);

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Conta" title="Assinatura" onBack={() => navigate("/dashboard")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5">
          {loading ? <p>Carregando…</p> : (
            <>
              <p className="text-[14px] text-slate-500">Plano: <strong>{planId ?? "nenhum"}</strong></p>
              <p className="text-[14px] text-slate-500">Status: <strong>{status}</strong></p>
              {hasAccess(status) ? <p className="mt-2 font-bold text-green-700">Acesso liberado.</p> : null}
              {needsAttention(status) ? <p className="mt-2 font-bold text-amber-700">Pagamento pendente. Regularize para manter o acesso.</p> : null}
              {status === "none" || status === "canceled" ? (
                <button
                  type="button"
                  onClick={() => navigate("/planos")}
                  className="mt-4 h-[56px] w-full rounded-2xl bg-brand font-extrabold text-white"
                >
                  Ver plano Pro
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void refresh()}
                className="mt-2 h-[48px] w-full rounded-2xl border-[1.5px] border-slate-200 font-extrabold text-slate-600"
              >
                Atualizar status
              </button>
              {cancellable ? (
                <>
                  <button
                    type="button"
                    disabled={cancelBusy}
                    onClick={cancel}
                    className="mt-2 h-[48px] w-full rounded-2xl text-[14px] font-extrabold text-red-600 underline underline-offset-2 disabled:opacity-60"
                  >
                    {cancelBusy ? "Cancelando…" : "Cancelar assinatura"}
                  </button>
                  {cancelMsg ? <p className="mt-2 text-[13.5px] font-bold text-slate-600">{cancelMsg}</p> : null}
                </>
              ) : null}
            </>
          )}
        </section>
        <section className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-5">
          <h2 className="font-extrabold">Historico</h2>
          {pays.length === 0 ? <p className="mt-2 text-[13.5px] text-slate-500">Sem pagamentos ainda.</p> : (
            <ul className="mt-2 text-[13.5px]">
              {pays.map((p) => (
                <li key={p.id}>
                  {(p.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {p.method} · {p.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

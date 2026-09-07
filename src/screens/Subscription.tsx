/**
 * Assinatura: status atual, vigencia, pagamentos e acoes da conta.
 * Usa o mesmo shell das demais telas logadas e le o billing espelhado no banco.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, LoadingBlock } from "../components/chrome";
import { formatDateBR } from "../components/os";
import type { BillingStatus } from "../domain/billing";
import { PLANS, effectiveAccess, formatBRL, needsAttention } from "../domain/billing";
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
  created_at: string;
}

const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  none: "Sem assinatura",
  trialing: "Período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  unpaid: "Inadimplente",
};

const BILLING_STATUS_TONE: Record<BillingStatus, string> = {
  none: "app-pill app-pill--muted",
  trialing: "app-pill app-pill--info",
  active: "app-pill app-pill--ok",
  past_due: "app-pill app-pill--warn",
  canceled: "app-pill app-pill--muted",
  unpaid: "app-pill app-pill--danger",
};

function paymentMethodLabel(method: string): string {
  const value = method.trim().toLowerCase();
  if (value === "pix") return "Pix";
  if (value === "card" || value === "credit_card") return "Cartão";
  if (value === "boleto") return "Boleto";
  return method || "Método não informado";
}

function paymentStatusLabel(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === "received" || value === "confirmed" || value === "paid") return "Pago";
  if (value === "pending") return "Pendente";
  if (value === "overdue") return "Atrasado";
  if (value === "refunded") return "Estornado";
  return status || "Sem status";
}

function paymentStatusTone(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === "received" || value === "confirmed" || value === "paid") return "app-pill app-pill--ok";
  if (value === "pending") return "app-pill app-pill--info";
  if (value === "overdue") return "app-pill app-pill--warn";
  if (value === "refunded") return "app-pill app-pill--muted";
  return "app-pill app-pill--muted";
}

function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDateBR(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function Subscription() {
  const navigate = useNavigate();
  const { status: authStatus, user } = useAuth();
  const {
    status,
    planId,
    provider,
    loading,
    refresh,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    externalSubscriptionId,
  } = useBilling();
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");

  const accessLive = effectiveAccess(status, cancelAtPeriodEnd, currentPeriodEnd);
  const currentPlan = planId ? PLANS[planId] : null;
  const periodLabel = cancelAtPeriodEnd
    ? "Acesso até"
    : status === "trialing"
      ? "Teste até"
      : "Ciclo atual até";
  const paymentProvider = useMemo(() => getPaymentProvider(), []);
  const canRequestCancel = paymentProvider.name === "asaas";
  const cancellable =
    authStatus === "authenticated" &&
    (status === "active" || status === "trialing" || status === "past_due") &&
    !cancelAtPeriodEnd &&
    canRequestCancel;

  useEffect(() => {
    const load = async () => {
      if (authStatus !== "authenticated" || !isSupabaseConfigured() || !user) {
        setPayments([]);
        setPaymentsError("");
        return;
      }
      const client = getSupabase();
      if (!client) return;
      setPaymentsLoading(true);
      setPaymentsError("");
      try {
        // billing_* ainda fora de database.types.ts; leitura parcial tipada aqui.
        const sb = client as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              eq: (column: string, value: string) => {
                order: (column: string, options: { ascending: boolean }) => {
                  limit: (value: number) => Promise<{ data: unknown; error?: { message?: string } | null }>;
                };
              };
            };
          };
        };
        const { data, error } = await sb
          .from("billing_payments")
          .select("id, amount_cents, method, status, paid_at, created_at")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw new Error(error.message ?? "Falha ao carregar pagamentos.");
        setPayments((data as PayRow[] | null) ?? []);
      } catch (e) {
        setPaymentsError(e instanceof Error ? e.message : "Falha ao carregar pagamentos.");
      } finally {
        setPaymentsLoading(false);
      }
    };
    void load();
  }, [authStatus, user]);

  const cancel = async () => {
    const endLabel = currentPeriodEnd ? formatDateBR(currentPeriodEnd) : "o fim do período atual";
    const confirmed = window.confirm(
      `Cancelar a renovação automática? Você manterá o acesso até ${endLabel}.`
    );
    if (!confirmed) return;
    setCancelBusy(true);
    setCancelMsg("");
    try {
      await paymentProvider.cancelSubscription(externalSubscriptionId ?? "");
      await refresh();
      setCancelMsg("Cancelamento agendado. Sua assinatura seguirá ativa até o fim do ciclo atual.");
    } catch (e: unknown) {
      setCancelMsg(e instanceof Error ? e.message : "Falha ao cancelar a assinatura.");
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <AppShell
      eyebrow="Conta"
      title="Assinatura"
      description="Acompanhe o plano atual, veja até quando seu acesso fica disponível e gerencie o cancelamento."
      active="billing"
      actions={
        <button type="button" onClick={() => void refresh()} className="app-btn app-btn--secondary app-btn--sm">
          Atualizar status
        </button>
      }
    >
      {authStatus === "local" ? (
        <section className="app-card" style={{ display: "grid", gap: 12 }}>
          <span className="app-pill app-pill--info" style={{ width: "fit-content" }}>
            Modo local
          </span>
          <h2 className="app-card-title">Esta instalação não exige assinatura</h2>
          <p className="app-card-sub">
            O projeto está rodando sem Supabase configurado. Nesse modo, o app funciona localmente e não possui cobrança online para consultar ou cancelar.
          </p>
        </section>
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              alignItems: "start",
            }}
          >
            <article className="app-card" style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <h2 className="app-card-title" style={{ marginRight: "auto" }}>
                  Resumo da assinatura
                </h2>
                <span className={BILLING_STATUS_TONE[status]}>{BILLING_STATUS_LABEL[status]}</span>
              </div>

              {loading ? (
                <LoadingBlock rows={3} label="Carregando status da assinatura…" />
              ) : (
                <>
                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(120px, 160px) 1fr",
                      rowGap: 10,
                      columnGap: 12,
                      margin: 0,
                    }}
                  >
                    <dt style={{ fontSize: 13.5, fontWeight: 700, color: "#5b6b82" }}>Plano</dt>
                    <dd style={{ margin: 0, fontWeight: 800, color: "#0f1e33" }}>
                      {currentPlan ? `${currentPlan.name} · ${formatBRL(currentPlan.priceCents)}/mês` : "Nenhum plano ativo"}
                    </dd>

                    <dt style={{ fontSize: 13.5, fontWeight: 700, color: "#5b6b82" }}>Provedor</dt>
                    <dd style={{ margin: 0, color: "#0f1e33" }}>{provider === "asaas" ? "Asaas" : provider === "mock" ? "Ambiente de demonstração" : "—"}</dd>

                    <dt style={{ fontSize: 13.5, fontWeight: 700, color: "#5b6b82" }}>Status</dt>
                    <dd style={{ margin: 0, color: "#0f1e33" }}>{BILLING_STATUS_LABEL[status]}</dd>

                    <dt style={{ fontSize: 13.5, fontWeight: 700, color: "#5b6b82" }}>{periodLabel}</dt>
                    <dd style={{ margin: 0, color: "#0f1e33" }}>
                      {currentPeriodEnd ? formatDateBR(currentPeriodEnd) : "Ainda não informado"}
                    </dd>
                  </dl>

                  {cancelAtPeriodEnd ? (
                    <p className="app-alert app-alert--warn" style={{ margin: 0 }}>
                      Cancelamento agendado. Sua renovação automática foi interrompida e o acesso segue liberado até {formatDateBR(currentPeriodEnd)}.
                    </p>
                  ) : null}

                  {needsAttention(status) ? (
                    <p className="app-alert app-alert--warn" style={{ margin: 0 }}>
                      Há uma pendência de pagamento. Seu acesso pode ser interrompido se a cobrança não for regularizada.
                    </p>
                  ) : null}

                  {!cancelAtPeriodEnd && accessLive && !needsAttention(status) ? (
                    <p className="app-alert app-alert--info" style={{ margin: 0 }}>
                      Sua assinatura está em dia e o acesso à aplicação segue liberado.
                    </p>
                  ) : null}

                  {!accessLive ? (
                    <p className="app-card-sub" style={{ margin: 0 }}>
                      Sem acesso ativo no momento. Você pode contratar o plano Pro para voltar a usar as áreas protegidas do dashboard.
                    </p>
                  ) : null}
                </>
              )}
            </article>

            <article className="app-card" style={{ display: "grid", gap: 12 }}>
              <h2 className="app-card-title">Ações</h2>
              <p className="app-card-sub" style={{ marginTop: -6 }}>
                Gerencie sua assinatura sem sair do dashboard.
              </p>

              {(status === "none" || status === "canceled" || status === "unpaid") ? (
                <button type="button" onClick={() => navigate("/planos")} className="app-btn app-btn--primary">
                  Ver plano Pro
                </button>
              ) : null}

              {cancellable ? (
                <button type="button" disabled={cancelBusy} onClick={() => void cancel()} className="app-btn app-btn--danger">
                  {cancelBusy ? "Cancelando…" : "Cancelar assinatura"}
                </button>
              ) : null}

              {!canRequestCancel && (status === "active" || status === "trialing" || status === "past_due") ? (
                <p className="app-card-sub" style={{ margin: 0 }}>
                  O cancelamento automático não está disponível neste ambiente de demonstração.
                </p>
              ) : null}

              {cancelMsg ? (
                <p
                  role="status"
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: cancelMsg.toLowerCase().includes("falha") ? "#b91c1c" : "#0f1e33",
                    fontWeight: 700,
                  }}
                >
                  {cancelMsg}
                </p>
              ) : null}
            </article>
          </section>

          <section className="app-card" style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <h2 className="app-card-title" style={{ marginRight: "auto" }}>
                Histórico de pagamentos
              </h2>
              <span className="app-pill app-pill--muted">Últimos 20</span>
            </div>

            {paymentsLoading ? (
              <LoadingBlock rows={4} label="Carregando pagamentos…" />
            ) : paymentsError ? (
              <p role="alert" className="app-alert app-alert--warn" style={{ margin: 0 }}>
                {paymentsError}
              </p>
            ) : payments.length === 0 ? (
              <p className="app-card-sub" style={{ margin: 0 }}>
                Nenhum pagamento encontrado para esta conta ainda.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    style={{
                      border: "1px solid var(--color-line)",
                      borderRadius: 16,
                      padding: 14,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <strong className="tnum" style={{ fontSize: 16, color: "#0f1e33", marginRight: "auto" }}>
                        {formatBRL(payment.amount_cents)}
                      </strong>
                      <span className={paymentStatusTone(payment.status)}>{paymentStatusLabel(payment.status)}</span>
                    </div>
                    <div style={{ display: "grid", gap: 4, color: "#5b6b82", fontSize: 13.5 }}>
                      <span>Método: {paymentMethodLabel(payment.method)}</span>
                      <span>
                        {payment.paid_at ? "Pago em" : "Lançado em"}: {formatDateTimeBR(payment.paid_at ?? payment.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

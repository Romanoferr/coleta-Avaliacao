/**
 * Central de trabalho: o que fazer hoje, acesso rápido a OS e rota,
 * lista com busca, filtros e ordenação. Desktop usa tabela, mobile usa cards.
 */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, ErrorBlock, LoadingBlock } from "../components/chrome";
import { EmptyState, OrderCard, STATUS_EMOJI, formatDateBR } from "../components/os";
import { StatusChip } from "../components/os";
import { addressLine, isOrderOverdue, STATUS_LABEL } from "../domain/serviceOrder";
import type { ServiceOrder, ServiceOrderStatus } from "../domain/serviceOrder";
import { dashboardCounts, filterOrders, sortOrders } from "../application/selectors";
import type { OrderSort, QuickFilter, StatusFilter } from "../application/selectors";
import { useBilling } from "../state/billing";
import { useStore } from "../state/store";

const STATUS_CHIPS: StatusFilter[] = ["all", "received", "scheduled", "inspected", "drafting", "completed", "cancelled"];

function chipLabel(s: StatusFilter): string {
  if (s === "all") return "Todas";
  return `${STATUS_EMOJI[s as ServiceOrderStatus]} ${STATUS_LABEL[s]}`;
}

type DateField = "received" | "inspection" | "due";
type DateMode = "after" | "until" | "between";

interface DateFilterRow {
  id: number;
  field: DateField;
  mode: DateMode;
  from: string;
  to: string;
}

const DATE_FIELD_LABEL: Record<DateField, string> = {
  received: "Recebimento",
  inspection: "Vistoria",
  due: "Conclusão",
};

const DATE_MODE_LABEL: Record<DateMode, string> = {
  after: "Após",
  until: "Até",
  between: "Entre",
};

const SORT_LABEL: Record<OrderSort, string> = {
  agenda: "Agenda: data da vistoria",
  recent: "Recentes: atualizadas por último",
  received: "Recebimento: mais recentes primeiro",
  due: "Conclusão: prazo mais próximo",
};

/** Texto legível do filtro para o resumo (ex.: "Vistoria entre 01/09/2026 e 10/09/2026"). */
function describeDateRow(r: DateFilterRow): string | null {
  const field = DATE_FIELD_LABEL[r.field];
  if (r.mode === "after" && r.from) return `${field} após ${formatDateBR(r.from)}`;
  if (r.mode === "until" && r.to) return `${field} até ${formatDateBR(r.to)}`;
  if (r.mode === "between" && r.from && r.to) {
    const [a, b] = r.from <= r.to ? [r.from, r.to] : [r.to, r.from];
    return `${field} entre ${formatDateBR(a)} e ${formatDateBR(b)}`;
  }
  if (r.mode === "between" && r.from) return `${field} a partir de ${formatDateBR(r.from)}`;
  if (r.mode === "between" && r.to) return `${field} até ${formatDateBR(r.to)}`;
  return null;
}

export default function Dashboard() {
  const { orders, ready, loadError, stale, reload, backend, cloudMigration, migrateLocalToCloud } = useStore();
  const { status: billingStatus } = useBilling();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [quick, setQuick] = useState<QuickFilter>("none");
  const [sort, setSort] = useState<OrderSort>("agenda");
  const [showDates, setShowDates] = useState(false);
  const [dateRows, setDateRows] = useState<DateFilterRow[]>([]);
  const rowSeq = useRef(1);

  /** Junta as linhas em limites por campo (AND entre linhas: maior início, menor fim). */
  const dateFilters = useMemo(() => {
    const froms: Record<DateField, string[]> = { received: [], inspection: [], due: [] };
    const tos: Record<DateField, string[]> = { received: [], inspection: [], due: [] };
    for (const r of dateRows) {
      let from = r.from;
      let to = r.to;
      if (r.mode === "between" && from && to && from > to) [from, to] = [to, from];
      if ((r.mode === "after" || r.mode === "between") && from) froms[r.field].push(from);
      if ((r.mode === "until" || r.mode === "between") && to) tos[r.field].push(to);
    }
    const max = (xs: string[]) => (xs.length ? xs.reduce((a, b) => (a > b ? a : b)) : undefined);
    const min = (xs: string[]) => (xs.length ? xs.reduce((a, b) => (a < b ? a : b)) : undefined);
    const out: {
      receivedFrom?: string;
      receivedTo?: string;
      inspectionFrom?: string;
      inspectionTo?: string;
      dueFrom?: string;
      dueUntil?: string;
    } = {};
    const rf = max(froms.received);
    const rt = min(tos.received);
    const inf = max(froms.inspection);
    const int = min(tos.inspection);
    const df = max(froms.due);
    const dt = min(tos.due);
    if (rf) out.receivedFrom = rf;
    if (rt) out.receivedTo = rt;
    if (inf) out.inspectionFrom = inf;
    if (int) out.inspectionTo = int;
    if (df) out.dueFrom = df;
    if (dt) out.dueUntil = dt;
    return out;
  }, [dateRows]);
  const dateFilterCount = Object.keys(dateFilters).length;

  const counts = useMemo(() => dashboardCounts(orders), [orders]);
  const list = useMemo(
    () => sortOrders(filterOrders(orders, { search, status, quick, ...dateFilters }), sort),
    [orders, search, status, quick, dateFilters, sort]
  );
  const filtering =
    search.trim() !== "" || status !== "all" || quick !== "none" || dateFilterCount > 0;

  function clearDateFilters() {
    setDateRows([]);
  }

  function addDateRow() {
    const id = rowSeq.current++;
    setDateRows((prev) => [...prev, { id, field: "inspection", mode: "between", from: "", to: "" }]);
  }

  function updateDateRow(id: number, patch: Partial<DateFilterRow>) {
    setDateRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeDateRow(id: number) {
    setDateRows((prev) => prev.filter((r) => r.id !== id));
  }

  const pickQuick = (q: QuickFilter) => {
    setQuick((prev) => (prev === q ? "none" : q));
    setStatus("all");
  };

  const cards: { key: QuickFilter | "drafting" | "completed"; label: string; value: number; pill: string }[] = [
    { key: "today", label: "Para hoje", value: counts.today, pill: "app-pill--info" },
    { key: "overdue", label: "Atrasadas", value: counts.overdue, pill: "app-pill--danger" },
    { key: "awaiting", label: "Aguard. vistoria", value: counts.awaiting, pill: "app-pill--warn" },
    { key: "drafting", label: "Em elaboração", value: counts.drafting, pill: "" },
    { key: "completed", label: "Concluídas", value: counts.completed, pill: "app-pill--ok" },
  ];

  const heroLine =
    counts.today === 0
      ? "Nenhuma vistoria agendada para hoje."
      : `${counts.today} ${counts.today === 1 ? "vistoria para hoje" : "vistorias para hoje"}.` +
        (counts.overdue > 0 ? ` ${counts.overdue} ${counts.overdue === 1 ? "atrasada" : "atrasadas"}.` : "");

  return (
    <AppShell
      eyebrow="Vistoria técnica"
      title="Ordens de serviço"
      description="Sua central de trabalho. Acompanhe o dia, encontre qualquer OS e planeje a rota."
      active="home"
      wide
    >
      {stale ? (
        <p className="app-alert app-alert--warn" style={{ marginBottom: 12 }}>
          Sem conexão. Mostrando a última cópia salva. Edições desativadas até reconectar.{" "}
          <button type="button" onClick={() => void reload()} className="underline underline-offset-2">
            Tentar de novo
          </button>
        </p>
      ) : null}
      {billingStatus === "past_due" ? (
        <p className="app-alert app-alert--warn" style={{ marginBottom: 12 }}>
          Pagamento pendente na sua assinatura. Regularize para não perder o acesso.{" "}
          <button type="button" onClick={() => navigate("/assinatura")} className="underline underline-offset-2">
            Ver assinatura
          </button>
        </p>
      ) : null}
      {cloudMigration.needed ? (
        <div className="app-alert app-alert--info" style={{ marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 800 }}>Dados locais encontrados</p>
          <p style={{ margin: "4px 0 0" }}>
            Há OS neste aparelho de antes da nuvem. Envie para o Supabase uma vez. Os dados locais seguem como backup.
          </p>
          {cloudMigration.result ? (
            <p className="tnum" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Enviadas: {cloudMigration.result.orders} OS · {cloudMigration.result.inspections} fichas ·{" "}
              {cloudMigration.result.documents} documentos.
              {cloudMigration.result.errors.length > 0 ? ` ${cloudMigration.result.errors.length} com erro.` : ""}
            </p>
          ) : null}
          {cloudMigration.result?.errors.map((msg, i) => (
            <p key={i} style={{ margin: "4px 0 0", fontSize: 12.5, color: "#b91c1c" }}>
              {msg}
            </p>
          ))}
          <button
            type="button"
            disabled={cloudMigration.running}
            onClick={() => void migrateLocalToCloud()}
            className="app-btn app-btn--primary app-btn--sm"
            style={{ marginTop: 10 }}
          >
            {cloudMigration.running ? "Enviando…" : "Enviar para a nuvem"}
          </button>
        </div>
      ) : null}

      {!ready ? (
        <LoadingBlock rows={4} label="Carregando ordens de serviço…" />
      ) : loadError ? (
        <ErrorBlock message={loadError} onRetry={() => void reload()} />
      ) : (
        <>
          <section className="app-workhero" aria-label="Trabalho de hoje">
            <p className="app-workhero-kicker">Avaliação de imóveis em campo</p>
            <h2 className="app-workhero-title">Trabalho de hoje</h2>
            <p className="tnum app-workhero-sub">{heroLine}</p>
            <div className="app-workhero-actions">
              <button type="button" onClick={() => navigate("/os/new")} className="app-btn app-btn--primary">
                + Nova ordem de serviço
              </button>
              <button type="button" onClick={() => navigate("/rota")} className="app-btn app-btn--light">
                ◎ Otimizar rota do dia
              </button>
            </div>
          </section>

          <section className="app-statgrid" aria-label="Resumo do trabalho" style={{ marginTop: 12 }}>
            {cards.map((c) => {
              const active =
                (c.key === "drafting" && status === "drafting") ||
                (c.key === "completed" && status === "completed") ||
                quick === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (c.key === "drafting" || c.key === "completed") {
                      setStatus((s) => (s === c.key ? "all" : (c.key as StatusFilter)));
                      setQuick("none");
                    } else pickQuick(c.key);
                  }}
                  className={`app-stat${active ? " app-stat--active" : ""}`}
                >
                  <span className="tnum app-stat-num">{c.value}</span>
                  <span className={`app-pill ${c.pill} app-stat-label`}>{c.label}</span>
                </button>
              );
            })}
          </section>

          <section className="app-toolbar" aria-label="Buscar e filtrar" style={{ marginTop: 12 }}>
            <div className="app-toolbar-topline">
              <div className="app-toolbar-search">
                <span className="app-toolbar-search-icon" aria-hidden>
                  ⌕
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nº, contratante, endereço…"
                  aria-label="Buscar ordens de serviço por número, contratante ou endereço"
                  className="app-input app-input--compact"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as OrderSort)}
                className="app-input app-input--compact app-sort-select"
                aria-label={`Ordenar por. Critério atual: ${SORT_LABEL[sort]}`}
              >
                {(Object.keys(SORT_LABEL) as OrderSort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowDates((v) => !v)}
                aria-expanded={showDates}
                className={`app-chip app-dates-toggle${dateFilterCount > 0 ? " app-chip--active" : ""}`}
              >
                <span className="tnum">📅 Datas{dateFilterCount > 0 ? ` (${dateFilterCount})` : ""}</span>
              </button>
            </div>
            <div className="app-chiprail" role="group" aria-label="Filtrar por status">
              {STATUS_CHIPS.map((s) => {
                const active = status === s && quick === "none";
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setStatus(s);
                      setQuick("none");
                    }}
                    className={`app-chip${active ? " app-chip--active" : ""}`}
                  >
                    {chipLabel(s)}
                  </button>
                );
              })}
            </div>
            {showDates && (
              <div className="app-card app-datepanel">
                <p className="app-section-label" style={{ marginBottom: 4 }}>
                  Filtrar por datas
                </p>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#5b6b82" }}>
                  Escolha a data, o período e adicione quantos filtros precisar. Vale a combinação de todos.
                </p>
                {dateRows.length > 0 && (
                  <ul className="app-daterows" aria-label="Filtros de data ativos">
                    {dateRows.map((r, idx) => {
                      const summary = describeDateRow(r);
                      return (
                        <li key={r.id} className="app-daterow">
                          <div className="app-daterow-head">
                            <span className="tnum app-daterow-title">Filtro {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeDateRow(r.id)}
                              className="app-daterow-remove"
                              aria-label={`Remover filtro de data ${idx + 1}`}
                            >
                              <span aria-hidden>×</span> Remover
                            </button>
                          </div>
                          <div className="app-daterow-grid">
                            <label className="app-daterow-field">
                              <span>Data de</span>
                              <select
                                value={r.field}
                                onChange={(e) =>
                                  updateDateRow(r.id, { field: e.target.value as DateField })
                                }
                                className="app-input app-input--compact tnum"
                                aria-label={`Data do filtro ${idx + 1}`}
                              >
                                {(Object.keys(DATE_FIELD_LABEL) as DateField[]).map((f) => (
                                  <option key={f} value={f}>
                                    {DATE_FIELD_LABEL[f]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="app-daterow-field">
                              <span>Período</span>
                              <select
                                value={r.mode}
                                onChange={(e) =>
                                  updateDateRow(r.id, { mode: e.target.value as DateMode })
                                }
                                className="app-input app-input--compact tnum"
                                aria-label={`Período do filtro ${idx + 1}`}
                              >
                                {(Object.keys(DATE_MODE_LABEL) as DateMode[]).map((m) => (
                                  <option key={m} value={m}>
                                    {DATE_MODE_LABEL[m]}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="app-daterow-dates">
                            {(r.mode === "after" || r.mode === "between") && (
                              <label className="app-daterow-field">
                                <span>{r.mode === "between" ? "De" : "A partir de"}</span>
                                <input
                                  type="date"
                                  value={r.from}
                                  onChange={(e) => updateDateRow(r.id, { from: e.target.value })}
                                  className="app-input app-input--compact tnum"
                                  aria-label={`Data inicial do filtro ${idx + 1}`}
                                />
                              </label>
                            )}
                            {(r.mode === "until" || r.mode === "between") && (
                              <label className="app-daterow-field">
                                <span>Até</span>
                                <input
                                  type="date"
                                  value={r.to}
                                  onChange={(e) => updateDateRow(r.id, { to: e.target.value })}
                                  className="app-input app-input--compact tnum"
                                  aria-label={`Data final do filtro ${idx + 1}`}
                                />
                              </label>
                            )}
                          </div>
                          {summary ? (
                            <p className="tnum app-daterow-summary">{summary}</p>
                          ) : (
                            <p className="app-daterow-summary app-daterow-summary--empty">
                              Preencha a data para ativar este filtro.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={addDateRow}
                  className="app-datepanel-add"
                >
                  + Adicionar filtro de data
                </button>
                {dateFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearDateFilters}
                    className="app-btn app-btn--secondary app-btn--sm"
                    style={{ marginTop: 10, width: "100%" }}
                  >
                    Limpar datas
                  </button>
                )}
              </div>
            )}
          </section>

          <section style={{ marginTop: 12 }} aria-live="polite" aria-label="Ordens de serviço">
            {list.length === 0 ? (
              <EmptyState
                title={filtering ? "Nada encontrado" : "Nenhuma OS ainda"}
                hint={
                  filtering
                    ? "Ajuste a busca ou os filtros."
                    : "Crie a primeira ordem de serviço para começar. A ficha é criada dentro da OS."
                }
                actionLabel={filtering ? undefined : "+ Nova ordem de serviço"}
                onAction={filtering ? undefined : () => navigate("/os/new")}
              />
            ) : (
              <>
                <div className="app-tablewrap">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th scope="col">OS</th>
                        <th scope="col">Contratante e endereço</th>
                        <th scope="col">Vistoria</th>
                        <th scope="col">Conclusão</th>
                        <th scope="col">Status</th>
                        <th scope="col">Ficha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((o) => (
                        <OrderRow key={o.id} order={o} onOpen={() => navigate(`/os/${o.id}`)} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="app-mobilelist">
                  {list.map((o) => (
                    <OrderCard key={o.id} order={o} onOpen={() => navigate(`/os/${o.id}`)} />
                  ))}
                </div>
              </>
            )}
          </section>
          <p className="app-muted-center">
            {backend === "supabase" ? "Salvo na nuvem (Supabase)." : "Salvo neste aparelho (modo local)."}
          </p>
        </>
      )}
    </AppShell>
  );
}

function OrderRow({ order, onOpen }: { order: ServiceOrder; onOpen: () => void }) {
  const overdue = isOrderOverdue(order);
  const addr = addressLine(order);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <tr onClick={onOpen} onKeyDown={onKey} tabIndex={0} aria-label={`Abrir OS ${order.number}`}>
      <td>
        <span className={`tnum app-table-os${overdue ? " app-table-os--overdue" : ""}`}>
          {overdue ? "⚠ " : ""}OS {order.number}
        </span>
      </td>
      <td>
        <span className="app-table-main">{order.contractor}</span>
        {addr ? <span className="app-table-sub">{addr}</span> : null}
      </td>
      <td>
        <span className="tnum" style={{ fontWeight: 700 }}>
          {order.inspectionDate ? formatDateBR(order.inspectionDate) : "A agendar"}
        </span>
        {order.inspectionTime ? (
          <span className="tnum app-table-sub">{order.inspectionTime}</span>
        ) : null}
      </td>
      <td>
        <span className="tnum" style={{ fontWeight: 700 }}>
          {order.dueDate ? formatDateBR(order.dueDate) : "·"}
        </span>
      </td>
      <td>
        <StatusChip status={order.status} />
      </td>
      <td>
        {order.inspectionId ? (
          <span className="app-pill app-pill--info">✓ Com ficha</span>
        ) : (
          <span className="app-pill">○ Sem ficha</span>
        )}
      </td>
    </tr>
  );
}

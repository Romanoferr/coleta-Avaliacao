/**
 * Central de trabalho: o que fazer hoje, acesso rápido a OS e rota,
 * lista com busca, filtros e ordenação. Desktop usa tabela, mobile usa cards.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, ErrorBlock, LoadingBlock } from "../components/chrome";
import { EmptyState, OrderCard, STATUS_EMOJI, formatDateBR } from "../components/os";
import { StatusChip } from "../components/os";
import { addressLine, isOrderOverdue, STATUS_LABEL } from "../domain/serviceOrder";
import type { ServiceOrder, ServiceOrderStatus } from "../domain/serviceOrder";
import { dashboardCounts, filterOrders, sortOrders } from "../application/selectors";
import type { OrderSort, QuickFilter, StatusFilter } from "../application/selectors";
import { useStore } from "../state/store";

const STATUS_CHIPS: StatusFilter[] = ["all", "received", "scheduled", "inspected", "drafting", "completed", "cancelled"];

function chipLabel(s: StatusFilter): string {
  if (s === "all") return "Todas";
  return `${STATUS_EMOJI[s as ServiceOrderStatus]} ${STATUS_LABEL[s]}`;
}

export default function Dashboard() {
  const { orders, ready, loadError, stale, reload, backend, cloudMigration, migrateLocalToCloud } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [quick, setQuick] = useState<QuickFilter>("none");
  const [sort, setSort] = useState<OrderSort>("agenda");
  const [showDates, setShowDates] = useState(false);
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedTo, setReceivedTo] = useState("");
  const [inspectionFrom, setInspectionFrom] = useState("");
  const [inspectionTo, setInspectionTo] = useState("");
  const [dueUntil, setDueUntil] = useState("");

  const dateFilters = useMemo(
    () => ({
      ...(receivedFrom ? { receivedFrom } : {}),
      ...(receivedTo ? { receivedTo } : {}),
      ...(inspectionFrom ? { inspectionFrom } : {}),
      ...(inspectionTo ? { inspectionTo } : {}),
      ...(dueUntil ? { dueUntil } : {}),
    }),
    [receivedFrom, receivedTo, inspectionFrom, inspectionTo, dueUntil]
  );
  const dateFilterCount = Object.keys(dateFilters).length;

  const counts = useMemo(() => dashboardCounts(orders), [orders]);
  const list = useMemo(
    () => sortOrders(filterOrders(orders, { search, status, quick, ...dateFilters }), sort),
    [orders, search, status, quick, dateFilters, sort]
  );
  const filtering =
    search.trim() !== "" || status !== "all" || quick !== "none" || dateFilterCount > 0;

  function clearDateFilters() {
    setReceivedFrom("");
    setReceivedTo("");
    setInspectionFrom("");
    setInspectionTo("");
    setDueUntil("");
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
      actions={
        <>
          <button type="button" onClick={() => navigate("/rota")} className="app-btn app-btn--secondary app-btn--sm">
            ◎ Otimizar rota do dia
          </button>
          <button type="button" onClick={() => navigate("/os/new")} className="app-btn app-btn--primary app-btn--sm">
            + Nova OS
          </button>
        </>
      }
    >
      {stale ? (
        <p className="app-alert app-alert--warn" style={{ marginBottom: 12 }}>
          Sem conexão. Mostrando a última cópia salva. Edições desativadas até reconectar.{" "}
          <button type="button" onClick={() => void reload()} className="underline underline-offset-2">
            Tentar de novo
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
            <div className="app-toolbar-row app-toolbar-search">
              <div className="app-toolbar-search" style={{ flex: 1 }}>
                <span className="app-toolbar-search-icon" aria-hidden>
                  ⌕
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nº, contratante, endereço…"
                  aria-label="Buscar ordens de serviço"
                  className="app-input"
                />
              </div>
              <button
                type="button"
                onClick={() => setSort((s) => (s === "agenda" ? "recent" : "agenda"))}
                aria-label={sort === "agenda" ? "Ordenando por agenda. Trocar para recentes." : "Ordenando por recentes. Trocar para agenda."}
                title={sort === "agenda" ? "Ordem: agenda" : "Ordem: recentes"}
                className="app-btn app-btn--secondary app-btn--sm"
                style={{ minHeight: 52 }}
              >
                ⇅
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
            <button
              type="button"
              onClick={() => setShowDates((v) => !v)}
              aria-expanded={showDates}
              className={`app-chip${dateFilterCount > 0 ? " app-chip--active" : ""}`}
            >
              <span className="tnum">📅 Datas{dateFilterCount > 0 ? ` (${dateFilterCount})` : ""}</span>
            </button>
            {showDates && (
              <div className="app-card" style={{ padding: 14, flexBasis: "100%" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 10,
                  }}
                >
                  <label style={{ display: "block" }}>
                    <span className="app-field-label" style={{ fontSize: 13 }}>Recebida de</span>
                    <input
                      type="date"
                      value={receivedFrom}
                      onChange={(e) => setReceivedFrom(e.target.value)}
                      className="app-input tnum"
                      aria-label="Recebida de"
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span className="app-field-label" style={{ fontSize: 13 }}>Recebida até</span>
                    <input
                      type="date"
                      value={receivedTo}
                      onChange={(e) => setReceivedTo(e.target.value)}
                      className="app-input tnum"
                      aria-label="Recebida até"
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span className="app-field-label" style={{ fontSize: 13 }}>Vistoria de</span>
                    <input
                      type="date"
                      value={inspectionFrom}
                      onChange={(e) => setInspectionFrom(e.target.value)}
                      className="app-input tnum"
                      aria-label="Vistoria de"
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span className="app-field-label" style={{ fontSize: 13 }}>Vistoria até</span>
                    <input
                      type="date"
                      value={inspectionTo}
                      onChange={(e) => setInspectionTo(e.target.value)}
                      className="app-input tnum"
                      aria-label="Vistoria até"
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span className="app-field-label" style={{ fontSize: 13 }}>Conclusão até</span>
                    <input
                      type="date"
                      value={dueUntil}
                      onChange={(e) => setDueUntil(e.target.value)}
                      className="app-input tnum"
                      aria-label="Conclusão até"
                      style={{ marginTop: 4 }}
                    />
                  </label>
                </div>
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

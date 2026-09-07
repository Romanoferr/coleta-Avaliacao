/**
 * Tela inicial: Dashboard de trabalho + Lista de OS.
 * Mobile (campo): cartões acionáveis + busca + cards.
 * Desktop: mesma informação em coluna larga; tabela fica para evolução.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { EmptyState, OrderCard } from "../components/os";
import { STATUS_EMOJI } from "../components/os";
import type { ServiceOrderStatus } from "../domain/serviceOrder";
import { STATUS_LABEL } from "../domain/serviceOrder";
import { dashboardCounts, filterOrders, sortOrders } from "../application/selectors";
import type { OrderSort, QuickFilter, StatusFilter } from "../application/selectors";
import { useStore } from "../state/store";
import { useAuth } from "../state/auth";

const STATUS_CHIPS: StatusFilter[] = ["all", "received", "scheduled", "inspected", "drafting", "completed", "cancelled"];

function chipLabel(s: StatusFilter): string {
  if (s === "all") return "Todas";
  return `${STATUS_EMOJI[s as ServiceOrderStatus]} ${STATUS_LABEL[s as ServiceOrderStatus]}`;
}

export default function Dashboard() {
  const { orders, ready, loadError, stale, reload, backend, cloudMigration, migrateLocalToCloud } = useStore();
  const { status: authStatus, user, displayName, signOut } = useAuth();
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

  const cards: { key: QuickFilter | "drafting" | "completed"; label: string; value: number; cls: string }[] = [
    { key: "today", label: "Para hoje", value: counts.today, cls: "bg-blue-50 text-brand" },
    { key: "overdue", label: "Atrasadas", value: counts.overdue, cls: "bg-red-50 text-red-700" },
    { key: "awaiting", label: "Aguard. vistoria", value: counts.awaiting, cls: "bg-amber-50 text-amber-800" },
    { key: "drafting", label: "Em elaboração", value: counts.drafting, cls: "bg-violet-50 text-violet-700" },
    { key: "completed", label: "Concluídas", value: counts.completed, cls: "bg-green-50 text-green-700" },
  ];

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Vistoria técnica" title="Ordens de serviço" />
      <main className="mx-auto max-w-xl px-4 pb-10">
        {authStatus === "authenticated" && user ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[15px] font-extrabold text-brand" aria-hidden>
              {(user.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{displayName ?? user.email}</p>
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => navigate("/login", { replace: true }));
              }}
              className="h-11 shrink-0 rounded-xl border-[1.5px] border-slate-200 px-4 text-[14px] font-bold text-slate-600 active:bg-slate-50"
            >
              Sair
            </button>
          </div>
        ) : null}
        {stale ? (
          <p className="mt-4 rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-4 text-[13.5px] font-bold text-amber-900">
            Sem conexão - mostrando a última cópia salva. Edições desativadas até reconectar.{" "}
            <button type="button" onClick={() => void reload()} className="underline underline-offset-2">
              Tentar de novo
            </button>
          </p>
        ) : null}
        {cloudMigration.needed ? (
          <div className="mt-4 rounded-2xl border-[1.5px] border-brand bg-blue-50 p-4">
            <p className="text-[15px] font-extrabold text-blue-950">Dados locais encontrados</p>
            <p className="mt-0.5 text-[13.5px] leading-snug text-blue-900">
              Há OS neste aparelho de antes da nuvem. Envie-as para o Supabase (uma vez; os dados locais são mantidos como backup).
            </p>
            {cloudMigration.result ? (
              <p className="tnum mt-1 text-[13px] font-semibold text-blue-900">
                Enviadas: {cloudMigration.result.orders} OS · {cloudMigration.result.inspections} fichas ·{" "}
                {cloudMigration.result.documents} documentos.
                {cloudMigration.result.errors.length > 0 ? ` ${cloudMigration.result.errors.length} com erro.` : ""}
              </p>
            ) : null}
            {cloudMigration.result?.errors.map((msg, i) => (
              <p key={i} className="mt-1 text-[12.5px] font-semibold text-red-700">
                {msg}
              </p>
            ))}
            <button
              type="button"
              disabled={cloudMigration.running}
              onClick={() => void migrateLocalToCloud()}
              className="mt-2 h-[52px] w-full rounded-xl bg-brand text-[15px] font-extrabold text-white disabled:opacity-60"
            >
              {cloudMigration.running ? "Enviando…" : "Enviar para a nuvem"}
            </button>
          </div>
        ) : null}
        {!ready ? (
          <section className="mt-4 flex flex-col gap-2.5" aria-label="Carregando">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-slate-200/80 bg-white p-4">
                <div className="h-5 w-1/3 rounded bg-slate-100" />
                <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
              </div>
            ))}
            <p className="text-center text-[13px] font-semibold text-slate-400">Carregando ordens de serviço…</p>
          </section>
        ) : loadError ? (
          <section className="mt-4">
            <p className="rounded-2xl border-[1.5px] border-red-200 bg-red-50 p-4 text-[14px] font-bold text-red-700">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-3 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white"
            >
              Tentar de novo
            </button>
          </section>
        ) : (
          <>
        <section className="animate-rise pt-5">
          <div className="rounded-3xl bg-ink p-6 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Avaliação de imóveis em campo
            </p>
            <h2 className="mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-tight">Trabalho de hoje</h2>
            <p className="tnum mt-1.5 text-[14.5px] leading-snug text-slate-300">
              {counts.today === 0
                ? "Nenhuma vistoria agendada para hoje."
                : `${counts.today} ${counts.today === 1 ? "vistoria" : "vistorias"} para hoje.`}
              {counts.overdue > 0 ? ` ${counts.overdue} atrasada${counts.overdue === 1 ? "" : "s"}.` : ""}
            </p>
            <button
              type="button"
              onClick={() => navigate("/os/new")}
              className="mt-4 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark"
            >
              + Nova ordem de serviço
            </button>
            <button
              type="button"
              onClick={() => navigate("/rota")}
              className="mt-2 h-[56px] w-full rounded-2xl border-[1.5px] border-blue-300/40 bg-white/10 text-[16px] font-extrabold text-white active:bg-white/20"
            >
              🗺️ Otimizar rota do dia
            </button>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-2" aria-label="Resumo do trabalho">
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
                className={`rounded-2xl border-[1.5px] p-3.5 text-left transition-all active:scale-[0.98] ${
                  active ? "border-brand bg-blue-50/60" : "border-slate-200 bg-white"
                }`}
              >
                <span className={`tnum block text-[24px] font-extrabold leading-none ${active ? "text-brand" : ""}`}>
                  {c.value}
                </span>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[12px] font-bold ${c.cls}`}>
                  {c.label}
                </span>
              </button>
            );
          })}
        </section>

        <section className="mt-5">
          <div className="flex gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nº, contratante, endereço…"
              aria-label="Buscar ordens de serviço"
              className="h-[52px] min-w-0 flex-1 rounded-xl border-[1.5px] border-slate-300 bg-white px-4 text-[16px] placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-blue-600/15"
            />
            <button
              type="button"
              onClick={() => setSort((s) => (s === "agenda" ? "recent" : "agenda"))}
              aria-label={sort === "agenda" ? "Ordenando por agenda. Trocar para recentes." : "Ordenando por recentes. Trocar para agenda."}
              className="h-[52px] w-[52px] shrink-0 rounded-xl border-[1.5px] border-slate-200 bg-white text-[20px] text-slate-600 active:bg-slate-50"
            >
              ⇅
            </button>
          </div>
          <p className="tnum mt-1.5 text-[12px] font-semibold text-slate-400">
            {sort === "agenda" ? "Ordem: agenda (data da vistoria)" : "Ordem: atualizadas por último"}
          </p>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filtrar por status">
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
                  className={`h-11 shrink-0 rounded-full border-[1.5px] px-4 text-[14px] font-bold transition-all active:scale-[0.97] ${
                    active ? "border-brand bg-blue-50 text-blue-950" : "border-slate-200 bg-white text-slate-600"
                  }`}
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
            className={`tnum mt-2 flex h-11 w-full items-center justify-between rounded-xl border-[1.5px] px-4 text-[14px] font-bold transition-all active:scale-[0.99] ${
              dateFilterCount > 0
                ? "border-brand bg-blue-50 text-blue-950"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <span>📅 Filtrar por datas{dateFilterCount > 0 ? ` (${dateFilterCount})` : ""}</span>
            <span aria-hidden>{showDates ? "▴" : "▾"}</span>
          </button>
          {showDates && (
            <div className="mt-2 rounded-2xl border border-slate-200/80 bg-white p-4">
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="mb-1 block text-[13px] font-bold text-slate-600">Recebida de</span>
                  <input
                    type="date"
                    value={receivedFrom}
                    onChange={(e) => setReceivedFrom(e.target.value)}
                    className="tnum h-[52px] w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 text-[15px] focus:border-brand focus:outline-none"
                    aria-label="Recebida de"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-bold text-slate-600">Recebida até</span>
                  <input
                    type="date"
                    value={receivedTo}
                    onChange={(e) => setReceivedTo(e.target.value)}
                    className="tnum h-[52px] w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 text-[15px] focus:border-brand focus:outline-none"
                    aria-label="Recebida até"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-bold text-slate-600">Vistoria de</span>
                  <input
                    type="date"
                    value={inspectionFrom}
                    onChange={(e) => setInspectionFrom(e.target.value)}
                    className="tnum h-[52px] w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 text-[15px] focus:border-brand focus:outline-none"
                    aria-label="Vistoria de"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-bold text-slate-600">Vistoria até</span>
                  <input
                    type="date"
                    value={inspectionTo}
                    onChange={(e) => setInspectionTo(e.target.value)}
                    className="tnum h-[52px] w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 text-[15px] focus:border-brand focus:outline-none"
                    aria-label="Vistoria até"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[13px] font-bold text-slate-600">Conclusão até</span>
                  <input
                    type="date"
                    value={dueUntil}
                    onChange={(e) => setDueUntil(e.target.value)}
                    className="tnum h-[52px] w-full rounded-xl border-[1.5px] border-slate-300 bg-white px-3 text-[15px] focus:border-brand focus:outline-none"
                    aria-label="Conclusão até"
                  />
                </label>
              </div>
              {dateFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearDateFilters}
                  className="mt-2.5 h-11 w-full rounded-xl border-[1.5px] border-slate-200 text-[14px] font-bold text-slate-600 active:bg-slate-50"
                >
                  Limpar datas
                </button>
              )}
            </div>
          )}
        </section>

        <section className="mt-3 flex flex-col gap-2.5" aria-live="polite">
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
            list.map((o) => <OrderCard key={o.id} order={o} onOpen={() => navigate(`/os/${o.id}`)} />)
          )}
        </section>
        <p className="mt-3 text-center text-[12px] text-slate-400">
          {backend === "supabase" ? "Salvo na nuvem (Supabase)." : "Salvo neste aparelho (modo local)."}
        </p>
          </>
        )}
      </main>
    </div>
  );
}

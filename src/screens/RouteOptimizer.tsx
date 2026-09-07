/**
 * Tela "Otimizar Rota": data → OSs do usuário → início/fim → TSP (OSRM /trip
 * com fallback heurístico) → ordem + métricas + Google Maps + esquema visual.
 * Isolamento: só opera sobre `useStore().orders` (já filtrado por RLS por
 * usuário); nunca busca OS por id arbitrário.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { EmptyState, StatusChip, formatDateBR, osInputCls, OsField } from "../components/os";
import { todayLocalIso } from "../domain/ids";
import { addressLine } from "../domain/serviceOrder";
import type { ServiceOrder } from "../domain/serviceOrder";
import { useStore } from "../state/store";
import { geocodeAddress } from "../routeOptimizer/geocode";
import { cachedPoint, orderAddressText } from "../routeOptimizer/geo";
import { googleMapsDirectionsUrl } from "../routeOptimizer/maps";
import { computeOptimizedRoute } from "../routeOptimizer/route";
import { ordersForDate, ordersWithoutAddress } from "../routeOptimizer/select";
import type { GeoPoint, InvalidStop, OptimizedRoute, RouteEndpoint, RouteStop } from "../routeOptimizer/types";

type Phase = "idle" | "geocoding" | "optimizing" | "done" | "error";

function formatKm(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function initials(label: string): string {
  return label.trim().slice(0, 2).toUpperCase() || "•";
}

export default function RouteOptimizer() {
  const { orders, ready } = useStore();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayLocalIso());
  const [selected, setSelected] = useState<string[] | null>(null); // null = todas
  const [startText, setStartText] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [endText, setEndText] = useState("");
  const [respectTime, setRespectTime] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<OptimizedRoute | null>(null);
  const [invalid, setInvalid] = useState<InvalidStop[]>([]);
  const [error, setError] = useState<string | null>(null);

  const dayOrders = useMemo(() => ordersForDate(orders, date), [orders, date]);
  const noAddress = useMemo(() => ordersWithoutAddress(orders, date), [orders, date]);
  const selectedIds = useMemo(
    () => (selected === null ? dayOrders.map((o) => o.id) : selected.filter((id) => dayOrders.some((o) => o.id === id))),
    [selected, dayOrders]
  );
  const selectedOrders = useMemo(
    () => dayOrders.filter((o) => selectedIds.includes(o.id)),
    [dayOrders, selectedIds]
  );
  const timedCount = selectedOrders.filter((o) => o.inspectionTime).length;

  const toggle = (id: string) => {
    const base = selected === null ? dayOrders.map((o) => o.id) : selected;
    setSelected(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  function resetForDate(d: string) {
    setDate(d);
    setSelected(null);
    setResult(null);
    setInvalid([]);
    setError(null);
    setPhase("idle");
  }

  async function resolveEndpoint(label: string, text: string): Promise<RouteEndpoint> {
    const t = text.trim();
    if (!t) throw new Error(`Informe o ${label.toLowerCase()}.`);
    const hit = cachedPoint(t);
    if (hit) return { label, address: t, point: hit, source: "cache" };
    const point = await geocodeAddress(t);
    return { label, address: t, point, source: "nominatim" };
  }

  async function optimize() {
    setError(null);
    setResult(null);
    setInvalid([]);
    if (selectedOrders.length === 0) {
      setError("Nenhuma OS selecionada para esta data.");
      setPhase("error");
      return;
    }
    let start: RouteEndpoint;
    try {
      setPhase("geocoding");
      setProgress("Localizando ponto inicial…");
      start = await resolveEndpoint("Ponto inicial", startText);
    } catch {
      setError("Não foi possível localizar o ponto inicial. Confira o endereço.");
      setPhase("error");
      return;
    }
    let end: RouteEndpoint | null = null;
    if (!roundTrip && endText.trim() !== "") {
      try {
        setProgress("Localizando destino final…");
        end = await resolveEndpoint("Destino final", endText);
      } catch {
        setError("Não foi possível localizar o destino final. Confira o endereço ou deixe em branco.");
        setPhase("error");
        return;
      }
    }

    // Geocodifica as OSs selecionadas (cache primeiro; falha isolada por OS).
    const stops: RouteStop[] = [];
    const bad: InvalidStop[] = [];
    for (let i = 0; i < selectedOrders.length; i++) {
      const o = selectedOrders[i];
      setProgress(`Localizando ${i + 1} de ${selectedOrders.length}…`);
      try {
        const point = await geocodeAddress(orderAddressText(o));
        stops.push({
          orderId: o.id,
          order: o,
          point,
          source: cachedPoint(orderAddressText(o)) ? "cache" : "nominatim",
        });
      } catch {
        bad.push({ orderId: o.id, order: o, reason: "Endereço não localizado." });
      }
    }
    // Defesa em profundidade: nunca otimizar OS fora da lista isolada do dia.
    const safe = stops.filter((s) => dayOrders.some((o) => o.id === s.orderId));
    setInvalid(bad);
    if (safe.length === 0) {
      setError("Nenhuma OS pôde ser localizada. Corrija os endereços e tente de novo.");
      setPhase("error");
      return;
    }
    try {
      setPhase("optimizing");
      setProgress("Calculando melhor ordem…");
      const route = await computeOptimizedRoute({
        config: {
          dateIso: date,
          selectedOrderIds: safe.map((s) => s.orderId),
          start,
          roundTrip,
          end,
          respectTime: respectTime && timedCount >= 2,
        },
        stops: safe,
      });
      setResult(route);
      setPhase("done");
      setProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao otimizar a rota.");
      setPhase("error");
    }
  }

  const maps = useMemo(() => {
    if (!result || result.legs.length < 2) return null;
    const pts = result.legs.map((l) => l.point);
    return googleMapsDirectionsUrl({
      origin: pts[0],
      waypoints: pts.slice(1, -1),
      destination: pts[pts.length - 1],
    });
  }, [result]);

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Rota do dia" title="Otimizar rota" onBack={() => navigate("/dashboard")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="pt-4">
          <OsField label="Data das OSs">
            <input
              type="date"
              value={date}
              onChange={(e) => resetForDate(e.target.value)}
              className={osInputCls}
              aria-label="Data das OSs"
            />
          </OsField>
        </section>

        {!ready ? (
          <p className="mt-4 text-center text-[13px] font-semibold text-slate-400">Carregando OSs…</p>
        ) : dayOrders.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={`Nenhuma OS em ${formatDateBR(date)}`}
              hint="Só entram na rota OSs desta data com endereço preenchido."
            />
            {noAddress.length > 0 && (
              <p className="mt-2 rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-4 text-[13.5px] font-bold text-amber-900">
                ⚠ {noAddress.length} OS {noAddress.length === 1 ? "sem" : "sem"} endereço nesta data — preencha o
                endereço na OS para incluí-la.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className="tnum text-[13px] font-bold text-slate-500">
                {formatDateBR(date)} · {selectedIds.length} de {dayOrders.length} selecionadas
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(dayOrders.map((o) => o.id))}
                  className="text-[13px] font-bold text-brand underline underline-offset-2"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-[13px] font-bold text-brand underline underline-offset-2"
                >
                  Nenhuma
                </button>
              </div>
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {dayOrders.map((o) => {
                const checked = selectedIds.includes(o.id);
                return (
                  <li key={o.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] bg-white p-4 transition-all active:scale-[0.99] ${
                        checked ? "border-brand" : "border-slate-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(o.id)}
                        className="mt-1 h-6 w-6 shrink-0 accent-blue-700"
                        aria-label={`Incluir OS ${o.number}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="tnum text-[16px] font-extrabold">OS {o.number}</span>
                          <StatusChip status={o.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-[13.5px] text-slate-600">{addressLine(o)}</span>
                        <span className="tnum mt-1 block text-[12.5px] font-semibold text-slate-500">
                          {o.contractor}
                          {o.inspectionTime ? ` · ⏰ ${o.inspectionTime}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {noAddress.length > 0 && (
              <p className="mt-2 rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-4 text-[13.5px] font-bold text-amber-900">
                ⚠ {noAddress.length} OS sem endereço nesta data — fora da rota até o endereço ser preenchido.
              </p>
            )}

            <section className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4">
              <OsField label="Ponto inicial" hint="De onde você sai (ex.: base, casa, escritório)." required>
                <input
                  value={startText}
                  onChange={(e) => setStartText(e.target.value)}
                  placeholder="Rua, número, cidade/UF"
                  className={osInputCls}
                  autoComplete="street-address"
                />
              </OsField>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={roundTrip}
                  onChange={(e) => setRoundTrip(e.target.checked)}
                  className="h-6 w-6 shrink-0 accent-blue-700"
                />
                <span className="text-[15px] font-bold">Voltar ao ponto de partida</span>
              </label>
              {!roundTrip && (
                <OsField label="Destino final" hint="Opcional — vazio = rota aberta (termina na última OS).">
                  <input
                    value={endText}
                    onChange={(e) => setEndText(e.target.value)}
                    placeholder="Opcional"
                    className={osInputCls}
                    autoComplete="street-address"
                  />
                </OsField>
              )}
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={respectTime}
                  onChange={(e) => setRespectTime(e.target.checked)}
                  className="mt-0.5 h-6 w-6 shrink-0 accent-blue-700"
                />
                <span>
                  <span className="block text-[15px] font-bold">Respeitar horários agendados</span>
                  <span className="block text-[13px] text-slate-500">
                    {timedCount >= 2
                      ? `${timedCount} OS com horário viram âncoras cronológicas.`
                      : "Ativo quando 2+ OS selecionadas tiverem horário."}
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => void optimize()}
                disabled={phase === "geocoding" || phase === "optimizing" || selectedIds.length === 0}
                className="h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark disabled:opacity-60"
              >
                {phase === "geocoding" || phase === "optimizing" ? "Otimizando…" : "Otimizar rota"}
              </button>
              {(phase === "geocoding" || phase === "optimizing") && (
                <p className="text-center text-[13px] font-semibold text-slate-500" role="status">
                  {progress}
                </p>
              )}
            </section>
          </>
        )}

        {error && (
          <p className="mt-4 rounded-2xl border-[1.5px] border-red-200 bg-red-50 p-4 text-[14px] font-bold text-red-700" role="alert">
            {error}
          </p>
        )}

        {invalid.length > 0 && (
          <section className="mt-4 rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-4" aria-label="Endereços não localizados">
            <p className="text-[15px] font-extrabold text-amber-900">
              ⚠ {invalid.length} OS não {invalid.length === 1 ? "pôde" : "puderam"} ser localizada
            </p>
            {invalid.map((inv) => (
              <div key={inv.orderId} className="mt-2 flex items-center gap-2 rounded-xl bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="tnum text-[14px] font-extrabold">OS {inv.order.number}</p>
                  <p className="truncate text-[13px] text-slate-500">{addressLine(inv.order)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/os/${inv.orderId}/edit`)}
                  className="h-11 shrink-0 rounded-xl border-[1.5px] border-slate-200 px-4 text-[14px] font-bold text-slate-600 active:bg-slate-50"
                >
                  Corrigir endereço
                </button>
              </div>
            ))}
            <p className="mt-2 text-[13px] font-semibold text-amber-900">
              A otimização seguiu sem {invalid.length === 1 ? "ela" : "elas"}. Corrija e toque em Recalcular.
            </p>
          </section>
        )}

        {result && (
          <section className="mt-4" aria-label="Rota otimizada" aria-live="polite">
            <div className="rounded-3xl bg-ink p-5 text-white">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Rota otimizada</p>
              <p className="tnum mt-1 text-[15px] font-bold">
                {formatKm(result.totalKm)} · {formatMinutes(result.totalMinutes)} · {result.stops.length}{" "}
                {result.stops.length === 1 ? "parada" : "paradas"}
              </p>
              <p className="mt-1 text-[12.5px] font-semibold text-slate-300">
                {result.roadBased ? "🛣️ Distância/tempo pela malha viária (OSRM)." : "📏 Estimativa local (sem roteador)."}
              </p>
              {result.timeWarnings.map((w, i) => (
                <p key={i} className="mt-2 rounded-xl bg-amber-500/20 p-3 text-[13px] font-bold text-amber-200">
                  ⏰ {w}
                </p>
              ))}
              {result.notes.map((n, i) => (
                <p key={i} className="mt-1.5 text-[12.5px] font-semibold text-slate-300">
                  ℹ️ {n}
                </p>
              ))}
              {maps?.truncated && (
                <p className="mt-1.5 text-[12.5px] font-semibold text-slate-300">
                  ℹ️ Rota com muitas paradas: o Google Maps abre as {10} primeiras — a ordem completa está abaixo.
                </p>
              )}
            </div>

            <RouteSchema legs={result.legs} />

            <ol className="mt-3 flex flex-col gap-1.5">
              {result.legs.map((leg, i) => (
                <li
                  key={`${leg.orderId ?? leg.label}-${i}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3"
                >
                  <span
                    className={`tnum flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold ${
                      leg.orderId ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
                    }`}
                    aria-hidden
                  >
                    {leg.orderId ? i : i === 0 ? "📍" : "🏁"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-extrabold">{leg.label}</span>
                    {leg.orderId && (
                      <span className="block truncate text-[13px] text-slate-500">
                        {addressLine(result.stops.find((s) => s.orderId === leg.orderId)?.order as ServiceOrder)}
                      </span>
                    )}
                  </span>
                  {i < result.legs.length - 1 && <span className="text-slate-300" aria-hidden>↓</span>}
                </li>
              ))}
            </ol>

            <div className="mt-3 flex flex-col gap-2">
              {maps && (
                <a
                  href={maps.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-[60px] items-center justify-center rounded-2xl bg-green-700 text-[17px] font-extrabold text-white active:bg-green-800"
                >
                  Abrir no Google Maps
                </a>
              )}
              <button
                type="button"
                onClick={() => void optimize()}
                className="h-[56px] w-full rounded-2xl border-[1.5px] border-slate-200 bg-white text-[16px] font-bold text-slate-600 active:bg-slate-50"
              >
                Recalcular
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/** Esquema visual numerado (sem dependência de mapa): reflete a ordem exata. */
function RouteSchema({ legs }: { legs: OptimizedRoute["legs"] }) {
  const pts = useMemo(() => project(legs.map((l) => l.point)), [legs]);
  return (
    <figure className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-3" aria-label="Esquema da rota">
      <svg viewBox="0 0 100 62" className="h-44 w-full" role="img" aria-label="Esquema numerado da rota">
        {pts.length > 1 && (
          <polyline
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#1d4ed8"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="3 2"
          />
        )}
        {pts.map((p, i) => {
          const isEnd = i === pts.length - 1 && pts.length > 1;
          const isStart = i === 0;
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="6.5"
                fill={isStart ? "#0f172a" : isEnd && legs[i].orderId === null ? "#15803d" : "#1d4ed8"}
              />
              <text x={p.x} y={p.y + 3.4} textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff">
                {isStart ? "S" : legs[i].orderId ? String(i) : "F"}
              </text>
              <text x={p.x} y={Math.min(60, p.y + 12)} textAnchor="middle" fontSize="4.4" fontWeight="700" fill="#475569">
                {initials(legs[i].label).slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[12px] font-semibold text-slate-400">
        Esquema da ordem calculada — use o Google Maps para navegar.
      </figcaption>
    </figure>
  );
}

function project(points: GeoPoint[]): { x: number; y: number }[] {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 0.01;
  const spanLng = maxLng - minLng || 0.01;
  // Degenerado (tudo no mesmo ponto): distribui em círculo.
  if (spanLat < 1e-9 && spanLng < 1e-9) {
    return points.map((_, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, points.length);
      return { x: 50 + 28 * Math.cos(a), y: 31 + 20 * Math.sin(a) };
    });
  }
  return points.map((p) => ({
    x: 10 + ((p.lng - minLng) / spanLng) * 80,
    y: 8 + ((maxLat - p.lat) / spanLat) * 46,
  }));
}

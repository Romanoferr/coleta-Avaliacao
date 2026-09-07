/**
 * Tela "Otimizar Rota": data → OSs do usuário → início/fim → TSP (OSRM /trip
 * com fallback heurístico) → ordem + métricas + Google Maps + esquema visual.
 * Isolamento: só opera sobre `useStore().orders` (já filtrado por RLS por
 * usuário); nunca busca OS por id arbitrário.
 */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, ErrorBlock, LoadingBlock } from "../components/chrome";
import { EmptyState, StatusChip, formatDateBR, osInputCls, OsField } from "../components/os";
import { todayLocalIso } from "../domain/ids";
import { addressLine } from "../domain/serviceOrder";
import type { ServiceOrder } from "../domain/serviceOrder";
import { useStore } from "../state/store";
import { nominatimProvider } from "../routeOptimizer/geocode";
import { cachedPoint, storePoint } from "../routeOptimizer/geo";
import { googleMapsSegmentUrls } from "../routeOptimizer/maps";
import { resolveManyPoints } from "../routeOptimizer/coordinates";
import { computeOptimizedRoute, measuredInFixedOrder } from "../routeOptimizer/route";
import { SERVICE_MINUTES_PER_STOP } from "../routeOptimizer/route";
import { ordersForDate, ordersWithoutAddress } from "../routeOptimizer/select";
import type { GeoPoint, InvalidStop, OptimizedRoute, RouteConfig, RouteEndpoint, RouteStop } from "../routeOptimizer/types";

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
  const { orders, ready, updateOrder } = useStore();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayLocalIso());
  const [selected, setSelected] = useState<string[] | null>(null); // null = todas
  const [startText, setStartText] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [endText, setEndText] = useState("");
  const [serviceMinutes, setServiceMinutes] = useState(SERVICE_MINUTES_PER_STOP);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [result, setResult] = useState<OptimizedRoute | null>(null);
  const [invalid, setInvalid] = useState<InvalidStop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  /** Base da última medição (pontos + início/fim) para reordenação manual. */
  const lastInputRef = useRef<{ stops: RouteStop[]; start: RouteEndpoint; end: RouteEndpoint | null; roundTrip: boolean; dateIso: string } | null>(null);

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

  function clampServiceMinutes(v: number): number {
    if (!Number.isFinite(v)) return SERVICE_MINUTES_PER_STOP;
    return Math.min(480, Math.max(0, Math.round(v)));
  }

  function buildConfig(
    base: { start: RouteEndpoint; end: RouteEndpoint | null; roundTrip: boolean; dateIso: string; stops: RouteStop[] }
  ): RouteConfig {
    return {
      dateIso: base.dateIso,
      selectedOrderIds: base.stops.map((s) => s.orderId),
      start: base.start,
      roundTrip: base.roundTrip,
      end: base.end,
      serviceMinutes: clampServiceMinutes(serviceMinutes),
    };
  }

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
    setProgressPct(null);
  }

  async function resolveEndpoint(label: string, text: string): Promise<RouteEndpoint> {
    const t = text.trim();
    if (!t) throw new Error(`Informe o ${label.toLowerCase()}.`);
    const hit = cachedPoint(t);
    if (hit) return { label, address: t, point: hit, source: "cache" };
    const point = await nominatimProvider.geocode(t);
    if (!point) throw new Error("Endereço não localizado.");
    storePoint(t, point);
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

    // Coordenadas das OSs: banco → cache → provider, com persistência
    // best-effort e dedupe por endereço (ver coordinates.ts). Falha isolada.
    setPhase("geocoding");
    setProgress("Localizando endereços…");
    setProgressPct(0);
    const { stops, invalid: bad } = await resolveManyPoints(selectedOrders, {
      provider: nominatimProvider,
      persist: (orderId, geo, key) => updateOrder(orderId, { geo, geocodedAddress: key }),
      onProgress: (done, total) => {
        setProgress(`Localizando endereços… ${done}/${total}`);
        setProgressPct(total === 0 ? null : done / total);
      },
    });
    // Defesa em profundidade: nunca otimizar OS fora da lista isolada do dia.
    const safe = stops.filter((s) => dayOrders.some((o) => o.id === s.orderId));
    setInvalid(bad);
    if (safe.length === 0) {
      setError("Nenhuma OS pôde ser localizada. Corrija os endereços e tente de novo.");
      setPhase("error");
      setProgressPct(null);
      return;
    }
    try {
      setPhase("optimizing");
      setProgress("Calculando melhor rota…");
      setProgressPct(null);
      // Ordem SEMPRE por deslocamento (horários nunca influenciam a ordenação).
      const base = { start, roundTrip, end, dateIso: date, stops: safe };
      lastInputRef.current = base;
      const route = await computeOptimizedRoute({ config: buildConfig(base), stops: safe });
      setResult(route);
      setPhase("done");
      setProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao otimizar a rota.");
      setPhase("error");
    }
  }

  /** Reordenação manual: troca duas paradas e remede SEM reotimizar. */
  async function moveStop(orderId: string, dir: -1 | 1) {
    const base = lastInputRef.current;
    if (!result || !base || recalculating) return;
    const cur = result.stops;
    const i = cur.findIndex((s) => s.orderId === orderId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    setRecalculating(true);
    try {
      const pts = [base.start.point, ...next.map((s) => s.point)];
      if (base.roundTrip) pts.push(base.start.point);
      else if (base.end) pts.push(base.end.point);
      const r = await measuredInFixedOrder(next, pts, buildConfig({ ...base, stops: next }), [
        "Ordem ajustada manualmente - métricas recalculadas sem reotimizar.",
      ]);
      setResult(r);
    } finally {
      setRecalculating(false);
    }
  }

  const segments = useMemo(() => {
    if (!result || result.legs.length < 2) return [];
    return googleMapsSegmentUrls(
      result.legs.map((l) => ({ point: l.point, address: l.address })),
      result.legs.map((l) => l.label)
    );
  }, [result]);

  return (
    <AppShell
      eyebrow="Rota do dia"
      title="Otimizar rota"
      description="Escolha a data, selecione as OSs e defina origem e destino. A plataforma calcula a sequência de visitas."
      active="route"
      wide
    >
      <div className="app-routegrid">
        <div>
          <section className="app-card">
            <OsField label="Data das OSs">
              <input
                type="date"
                value={date}
                onChange={(e) => resetForDate(e.target.value)}
                className={`${osInputCls} tnum`}
                aria-label="Data das OSs"
              />
            </OsField>
          </section>

          {!ready ? (
            <div style={{ marginTop: 12 }}>
              <LoadingBlock rows={3} label="Carregando OSs…" />
            </div>
          ) : dayOrders.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <EmptyState
                title={`Nenhuma OS em ${formatDateBR(date)}`}
                hint="Só entram na rota OSs desta data com endereço preenchido."
              />
              {noAddress.length > 0 && (
                <p className="app-alert app-alert--warn" style={{ marginTop: 10 }}>
                  ⚠ {noAddress.length} OS sem endereço nesta data. Preencha o
                  endereço na OS para incluí-la.
                </p>
              )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 14 }}>
              <p className="tnum" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#5b6b82" }}>
                {formatDateBR(date)} · {selectedIds.length} de {dayOrders.length} selecionadas
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setSelected(dayOrders.map((o) => o.id))}
                  className="app-btn app-btn--ghost app-btn--sm"
                  style={{ minHeight: 36, padding: "4px 10px" }}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="app-btn app-btn--ghost app-btn--sm"
                  style={{ minHeight: 36, padding: "4px 10px" }}
                >
                  Nenhuma
                </button>
              </div>
            </div>
            <ul className="app-selectlist" style={{ marginTop: 10 }}>
              {dayOrders.map((o) => {
                const checked = selectedIds.includes(o.id);
                return (
                  <li key={o.id}>
                    <label
                      className={`app-selectitem${checked ? " app-selectitem--checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(o.id)}
                        aria-label={`Incluir OS ${o.number}`}
                      />
                      <span className="app-selectitem-main">
                        <span className="app-selectitem-top">
                          <span className="tnum app-selectitem-num">OS {o.number}</span>
                          <StatusChip status={o.status} />
                        </span>
                        <span className="app-selectitem-addr">{addressLine(o)}</span>
                        <span className="tnum app-selectitem-sub">
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
              <p className="app-alert app-alert--warn" style={{ marginTop: 10 }}>
                ⚠ {noAddress.length} OS sem endereço nesta data. Fora da rota até o endereço ser preenchido.
              </p>
            )}

            <section className="app-card" style={{ marginTop: 12 }}>
              <div className="app-fieldstack">
              <OsField label="Ponto inicial" hint="De onde você sai (ex.: base, casa, escritório)." required>
                <input
                  value={startText}
                  onChange={(e) => setStartText(e.target.value)}
                  placeholder="Rua, número, cidade/UF"
                  className={osInputCls}
                  autoComplete="street-address"
                />
              </OsField>
              <label className="app-check">
                <input
                  type="checkbox"
                  checked={roundTrip}
                  onChange={(e) => setRoundTrip(e.target.checked)}
                />
                Voltar ao ponto de partida
              </label>
              {!roundTrip && (
                <OsField label="Destino final" hint="Opcional. Vazio = rota aberta (termina na última OS).">
                  <input
                    value={endText}
                    onChange={(e) => setEndText(e.target.value)}
                    placeholder="Opcional"
                    className={osInputCls}
                    autoComplete="street-address"
                  />
                </OsField>
              )}
              <OsField
                label="Tempo médio por atendimento (min)"
                hint="Usado só na previsão de chegadas e avisos de atraso."
              >
                <input
                  type="number"
                  value={serviceMinutes}
                  min={0}
                  max={480}
                  step={5}
                  onChange={(e) => setServiceMinutes(clampServiceMinutes(Number(e.target.value)))}
                  className={`${osInputCls} tnum`}
                  aria-label="Tempo médio por atendimento em minutos"
                />
              </OsField>
              <p className="app-alert app-alert--info" style={{ margin: 0 }}>
                A ordem inicial segue os horários agendados, do mais cedo para o mais tarde. Paradas sem horário
                entram pelo menor desvio. Ajuste com as setas na lista abaixo.
              </p>
              <button
                type="button"
                onClick={() => void optimize()}
                disabled={phase === "geocoding" || phase === "optimizing" || selectedIds.length === 0}
                className="app-btn app-btn--primary"
                style={{ width: "100%" }}
              >
                {phase === "geocoding" || phase === "optimizing" ? "Otimizando…" : "Otimizar rota"}
              </button>
              {(phase === "geocoding" || phase === "optimizing") && (
                <div role="status" aria-live="polite">
                  <p className="app-muted-center">{progress}</p>
                  {progressPct !== null ? (
                    <div className="app-meter" aria-hidden>
                      <div
                        className="app-meter-fill"
                        style={{ width: `${Math.round(progressPct * 100)}%` }}
                      />
                    </div>
                  ) : (
                    <div className="app-meter" aria-hidden>
                      <div className="app-meter-fill" style={{ width: "35%" }} />
                    </div>
                  )}
                </div>
              )}
              </div>
            </section>
          </>
        )}
        </div>
        <div>

          {error ? <ErrorBlock message={error} onRetry={() => void optimize()} /> : null}

          {invalid.length > 0 && (
            <section className="app-card" style={{ marginTop: 12 }} aria-label="Endereços não localizados">
              <p className="app-alert app-alert--warn" style={{ margin: 0 }}>
                ⚠ {invalid.length} OS não {invalid.length === 1 ? "pôde" : "puderam"} ser localizada
              </p>
              {invalid.map((inv) => (
                <div key={inv.orderId} className="app-route-step" style={{ marginTop: 8 }}>
                  <span className="app-route-step-main">
                    <span className="tnum app-route-step-title">OS {inv.order.number}</span>
                    <span className="app-route-step-sub">{addressLine(inv.order)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/os/${inv.orderId}/edit`)}
                    className="app-btn app-btn--secondary app-btn--sm"
                    style={{ flexShrink: 0 }}
                  >
                    Corrigir endereço
                  </button>
                </div>
              ))}
              <p className="app-muted-center" style={{ textAlign: "left" }}>
                A otimização seguiu sem {invalid.length === 1 ? "ela" : "elas"}. Corrija e toque em Recalcular.
              </p>
            </section>
          )}

          {result && (
          <section style={{ marginTop: 12 }} aria-label="Rota otimizada" aria-live="polite">
            <div className="app-route-result">
              <p className="app-route-result-kicker">Rota otimizada</p>
              <p className="tnum app-route-result-main">
                {formatKm(result.totalKm)} · {formatMinutes(result.totalMinutes)} · {result.stops.length}{" "}
                {result.stops.length === 1 ? "parada" : "paradas"}
              </p>
              <p className="app-route-result-sub">
                {result.roadBased ? "Distância e tempo pela malha viária (OSRM)." : "Estimativa local (sem roteador)."}
              </p>
              {result.suggestedDeparture && (
                <p className="app-route-note">
                  Saia até às {result.suggestedDeparture} para cumprir o primeiro horário (considerando{" "}
                  {clampServiceMinutes(serviceMinutes)} min de atendimento por parada).
                </p>
              )}
              {result.timeWarnings.map((w, i) => (
                <p key={i} className="app-route-warn">
                  ⏰ {w}
                </p>
              ))}
              {result.notes.map((n, i) => (
                <p key={i} className="app-route-info">
                  ℹ️ {n}
                </p>
              ))}
              {segments.length > 1 && (
                <p className="app-route-info">
                  Rota com muitas paradas: o Maps abre em {segments.length} trechos navegáveis. A rota completa
                  (ordem otimizada) está preservada abaixo.
                </p>
              )}
            </div>

            <RouteSchema legs={result.legs} />

            <ol className="app-route-steps" aria-label="Ordem das paradas (ajustável)">
              {result.legs.map((leg, i) => {
                const tl = leg.orderId ? result.timeline.find((t) => t.orderId === leg.orderId) : undefined;
                // Posição entre as OSs (ignora início/fim) para os botões ↑↓.
                const stopIdx = leg.orderId ? result.stops.findIndex((s) => s.orderId === leg.orderId) : -1;
                return (
                <li
                  key={`${leg.orderId ?? leg.label}-${i}`}
                  className="app-route-step"
                >
                  <span
                    className={`tnum app-route-num${leg.orderId ? "" : " app-route-num--point"}`}
                    aria-hidden
                  >
                    {leg.orderId ? i : i === 0 ? "📍" : "🏁"}
                  </span>
                  <span className="app-route-step-main">
                    <span className="app-route-step-title">{leg.label}</span>
                    {leg.orderId && (
                      <span className="app-route-step-sub">
                        {addressLine(result.stops.find((s) => s.orderId === leg.orderId)?.order as ServiceOrder)}
                      </span>
                    )}
                    {tl?.scheduled && (
                      <span
                        className={`tnum app-pill app-route-eta${tl.lateBy > 0 ? " app-route-eta--late" : " app-pill--info"}`}
                      >
                        ⏰ {tl.scheduled} · chegada ~{tl.eta}
                        {tl.lateBy > 0 ? ` · ⚠ +${tl.lateBy}min` : ""}
                      </span>
                    )}
                  </span>
                  {stopIdx >= 0 && (
                    <span className="app-route-move" role="group" aria-label={`Reordenar ${leg.label}`}>
                      <button
                        type="button"
                        disabled={recalculating || stopIdx === 0}
                        onClick={() => void moveStop(leg.orderId as string, -1)}
                        aria-label={`Subir ${leg.label}`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={recalculating || stopIdx === result.stops.length - 1}
                        onClick={() => void moveStop(leg.orderId as string, 1)}
                        aria-label={`Descer ${leg.label}`}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </li>
                );
              })}
            </ol>
            {recalculating && (
              <p className="app-muted-center" role="status">
                Recalculando métricas…
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {segments.length === 1 && (
                <a
                  href={segments[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="app-btn app-btn--maps"
                  style={{ width: "100%", flexDirection: "row" }}
                >
                  Abrir no Google Maps
                </a>
              )}
              {segments.length > 1 && (
                <div className="app-card" style={{ padding: 14 }}>
                  <p className="app-card-title" style={{ fontSize: 15 }}>Navegar por trechos</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {segments.map((s) => (
                      <a
                        key={s.index}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="app-btn app-btn--maps app-btn--sm"
                        style={{ width: "100%", flexDirection: "row", textDecoration: "none" }}
                      >
                        {s.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => void optimize()}
                className="app-btn app-btn--secondary"
                style={{ width: "100%" }}
              >
                Recalcular
              </button>
            </div>
          </section>
        )}
        </div>
      </div>
    </AppShell>
  );
}

/** Esquema visual numerado (sem dependência de mapa): reflete a ordem exata. */
function RouteSchema({ legs }: { legs: OptimizedRoute["legs"] }) {
  const pts = useMemo(() => project(legs.map((l) => l.point)), [legs]);
  return (
    <figure className="app-card" style={{ marginTop: 12, padding: 14 }} aria-label="Esquema da rota">
      <svg viewBox="0 0 100 62" style={{ height: 176, width: "100%" }} role="img" aria-label="Esquema numerado da rota">
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
      <figcaption className="app-muted-center">
        Esquema da ordem calculada. Use o Google Maps para navegar.
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

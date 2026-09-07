/**
 * Controlador da otimização: ordem inicial CRONOLÓGICA (agendamento, do mais
 * cedo para o mais tarde) + medição na malha viária (OSRM /route) com fallback
 * em linha reta. Puro e testável (rede injetável).
 * REGRA: a ordem inicial nunca é "otimizada" por deslocamento - o cliente
 * ajusta na mão (↑↓) se quiser. Horários servem para ordenar (cronologia),
 * exibir e prever chegadas. `serviceMinutes` (configurável) vale só para
 * previsão de chegadas/avisos.
 * (Os módulos osrm /trip e optimize seguem disponíveis, mas o fluxo atual
 * não reordena automaticamente por deslocamento.)
 */
import { estimateMinutes, haversineKm, orderAddressText } from "./geo";
import { distanceMatrix, pathKm } from "./optimize";
import { fetchRouteMetrics } from "./osrm";
import type { GeoPoint, OptimizedRoute, RouteConfig, RouteEndpoint, RouteStop, TimelineEntry } from "./types";

/** Atendimento médio padrão por parada (vistoria + deslocamento interno). */
export const SERVICE_MINUTES_PER_STOP = 50;

export function timeToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(min: number): string {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function travelMinutes(a: GeoPoint, b: GeoPoint): number {
  return estimateMinutes(haversineKm(a, b));
}

export interface ResolvedInput {
  config: RouteConfig;
  stops: RouteStop[];
}

function legLabel(stop: RouteStop): string {
  return `OS ${stop.order.number}`;
}

export interface Timeline {
  entries: TimelineEntry[];
  /** Minutos desde 00:00 sugeridos para sair; null sem horários. */
  suggestedDepartureMin: number | null;
  totalLate: number;
}

/**
 * Simula o cronograma: deslocamento estimado + `serviceMinutes` de
 * atendimento por parada. Ancora a saída para chegar ao 1º horário em ponto
 * (aguardar é permitido: nunca se "adianta" um horário). Sem OS com horário,
 * não há o que simular. NÃO reordena nada - só relata.
 */
export function simulateTimeline(
  stops: RouteStop[],
  start: GeoPoint,
  serviceMinutes: number = SERVICE_MINUTES_PER_STOP
): Timeline {
  const scheduled = (s: RouteStop): number | null =>
    s.order.inspectionTime ? timeToMinutes(s.order.inspectionTime) : null;
  const firstTimed = stops.find((s) => scheduled(s) !== null);
  if (!firstTimed) return { entries: [], suggestedDepartureMin: null, totalLate: 0 };

  // Custo (desloc + atendimento) até o 1º horário → sugere a saída.
  let lead = 0;
  let prev = start;
  for (const s of stops) {
    const t = travelMinutes(prev, s.point);
    if (s === firstTimed) {
      lead += t;
      break;
    }
    lead += t + serviceMinutes;
    prev = s.point;
  }
  const departure = (scheduled(firstTimed) as number) - lead;

  const entries: TimelineEntry[] = [];
  let totalLate = 0;
  let clock = departure;
  prev = start;
  for (const s of stops) {
    const arrival = clock + travelMinutes(prev, s.point);
    prev = s.point;
    const sch = scheduled(s);
    const lateBy = sch !== null ? Math.max(0, Math.round(arrival - sch)) : 0;
    totalLate += lateBy;
    if (sch !== null) clock = Math.max(arrival, sch);
    else clock = arrival;
    clock += serviceMinutes;
    entries.push({
      orderId: s.orderId,
      number: s.order.number,
      eta: minutesToTime(arrival),
      scheduled: sch !== null && s.order.inspectionTime ? s.order.inspectionTime.slice(0, 5) : null,
      lateBy,
    });
  }
  return { entries, suggestedDepartureMin: Math.round(departure), totalLate };
}

/** Avisos de atraso previsto (horários são só exibidos; a ordem é por deslocamento). */
export function delayWarnings(timeline: Timeline, serviceMinutes: number): string[] {
  return timeline.entries
    .filter((e) => e.lateBy > 0 && e.scheduled)
    .map(
      (e) =>
        `Conflito de horário: OS ${e.number} (${e.scheduled}) - chegada prevista ~${e.eta}, ~${e.lateBy} min após o horário (considerando ~${serviceMinutes} min de atendimento por parada).`
    );
}

/** Monta cronograma + avisos para uma ordem final (qualquer engine). */
function buildSchedule(
  ordered: RouteStop[],
  start: GeoPoint,
  serviceMinutes: number
): { timeline: TimelineEntry[]; suggestedDeparture: string | null; timeWarnings: string[] } {
  const timeline = simulateTimeline(ordered, start, serviceMinutes);
  return {
    timeline: timeline.entries,
    suggestedDeparture: timeline.suggestedDepartureMin !== null ? minutesToTime(timeline.suggestedDepartureMin) : null,
    timeWarnings: delayWarnings(timeline, serviceMinutes),
  };
}

function buildLegs(
  ordered: RouteStop[],
  start: RouteEndpoint,
  end: RouteEndpoint | null,
  roundTrip: boolean
): OptimizedRoute["legs"] {
  const legs: OptimizedRoute["legs"] = [
    { label: start.label || "Ponto inicial", point: start.point, orderId: null, address: start.address },
    ...ordered.map((s) => ({
      label: legLabel(s),
      point: s.point,
      orderId: s.orderId,
      address: orderAddressText(s.order),
    })),
  ];
  if (roundTrip)
    legs.push({ label: start.label || "Ponto inicial", point: start.point, orderId: null, address: start.address });
  else if (end)
    legs.push({ label: end.label || "Destino final", point: end.point, orderId: null, address: end.address });
  return legs;
}

function fullPoints(ordered: RouteStop[], start: GeoPoint, end: GeoPoint | null, roundTrip: boolean): GeoPoint[] {
  const pts = [start, ...ordered.map((s) => s.point)];
  if (roundTrip) pts.push(start);
  else if (end) pts.push(end);
  return pts;
}

/**
 * Ordem inicial da rota: agendamento do mais cedo para o mais tarde.
 * Paradas sem horário entram onde geram o menor desvio (só deslocamento,
 * sem mexer na sequência cronológica). Sem nenhum horário, mantém a
 * ordem de entrada (determinístico e transparente).
 */
export function initialOrderBySchedule(stops: RouteStop[], start: GeoPoint): RouteStop[] {
  const timed = stops
    .filter((s) => s.order.inspectionTime)
    .sort((a, b) => {
      const ta = a.order.inspectionTime as string;
      const tb = b.order.inspectionTime as string;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.order.number.localeCompare(b.order.number, "pt-BR");
    });
  const free = stops.filter((s) => !s.order.inspectionTime);
  if (timed.length === 0) return [...stops];

  const ordered: RouteStop[] = [...timed];
  for (const f of free) {
    let bestIdx = ordered.length;
    let bestExtra = Infinity;
    for (let i = 0; i <= ordered.length; i++) {
      const prev = i === 0 ? start : ordered[i - 1].point;
      const next = i === ordered.length ? null : ordered[i].point;
      const extra =
        haversineKm(prev, f.point) + (next ? haversineKm(f.point, next) - haversineKm(prev, next) : 0);
      if (extra < bestExtra) {
        bestExtra = extra;
        bestIdx = i;
      }
    }
    ordered.splice(bestIdx, 0, f);
  }
  return ordered;
}

export async function computeOptimizedRoute(
  input: ResolvedInput,
  fetchFn: typeof fetch = fetch
): Promise<OptimizedRoute> {
  const { config, stops } = input;
  const notes: string[] = [];

  if (stops.length === 0) {
    throw new Error("Nenhuma OS válida para otimizar.");
  }

  const endPoint = config.roundTrip ? null : config.end?.point ?? null;

  // Ordem inicial cronológica; medição sem reordenar (ajuste fino é manual).
  const working = initialOrderBySchedule(stops, config.start.point);
  if (working.length !== stops.length) {
    throw new Error("Falha interna ao ordenar as paradas.");
  }
  if (stops.some((s) => s.order.inspectionTime)) {
    notes.push(
      "Ordem inicial por horário agendado (do mais cedo para o mais tarde); paradas sem horário inseridas pelo menor desvio. Ajuste manualmente com ↑↓ se precisar."
    );
  }
  const points = fullPoints(working, config.start.point, endPoint, config.roundTrip);
  return measuredInFixedOrder(working, points, config, notes, fetchFn);
}

/**
 * Mede uma ordem DEFINIDA (otimização de 1 OS ou reordenação manual):
 * tenta métricas viárias sem reordenar, senão linha reta. Nunca altera
 * a sequência recebida.
 */
export async function measuredInFixedOrder(
  ordered: RouteStop[],
  points: GeoPoint[],
  config: RouteConfig,
  notes: string[] = [],
  fetchFn: typeof fetch = fetch
): Promise<OptimizedRoute> {
  let km: number | null = null;
  let minutes: number | null = null;
  let roadBased = false;
  try {
    const m = await fetchRouteMetrics(points, fetchFn);
    km = m.km;
    minutes = m.minutes;
    roadBased = true;
  } catch {
    const m = distanceMatrix(points);
    km = pathKm(points.map((_, i) => i), m, config.roundTrip);
    minutes = estimateMinutes(km);
    notes.push("Sem conexão com o roteador - distância em linha reta.");
  }
  const schedule = buildSchedule(ordered, config.start.point, config.serviceMinutes);
  return {
    stops: ordered,
    legs: buildLegs(ordered, config.start, config.roundTrip ? null : config.end, config.roundTrip),
    totalKm: km,
    totalMinutes: minutes,
    engine: roadBased ? "osrm-trip" : "heuristic-2opt",
    roadBased,
    timeWarnings: schedule.timeWarnings,
    notes,
    timeline: schedule.timeline,
    suggestedDeparture: schedule.suggestedDeparture,
  };
}

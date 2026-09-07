/**
 * Controlador da otimização: âncoras de horário → OSRM /trip (malha viária)
 * → fallback heurístico 2-opt. Puro e testável (rede injetável).
 */
import { estimateMinutes, haversineKm } from "./geo";
import { distanceMatrix, optimizeOrder, pathKm } from "./optimize";
import { OsrmError, fetchRouteMetrics, fetchTrip } from "./osrm";
import type { GeoPoint, OptimizedRoute, RouteConfig, RouteEndpoint, RouteStop } from "./types";

export interface ResolvedInput {
  config: RouteConfig;
  stops: RouteStop[];
}

function legLabel(stop: RouteStop): string {
  return `OS ${stop.order.number}`;
}

/** OS com horário viram âncoras cronológicas; livres entram por best-insertion. */
export function applyTimeAnchors(stops: RouteStop[], start: GeoPoint): RouteStop[] {
  const timed = stops.filter((s) => s.order.inspectionTime).sort((a, b) =>
    (a.order.inspectionTime as string) < (b.order.inspectionTime as string) ? -1 : 1
  );
  const free = stops.filter((s) => !s.order.inspectionTime);
  if (timed.length < 2 || free.length === 0) return stops;

  const ordered: RouteStop[] = [...timed];
  for (const f of free) {
    let bestIdx = ordered.length;
    let bestCost = Infinity;
    for (let i = 0; i <= ordered.length; i++) {
      const prev = i === 0 ? start : ordered[i - 1].point;
      const next = i === ordered.length ? null : ordered[i].point;
      const cost =
        haversineKm(prev, f.point) + (next ? haversineKm(f.point, next) - haversineKm(prev, next) : 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    ordered.splice(bestIdx, 0, f);
  }
  return ordered;
}

/** Avisos quando a ordem calculada conflita com horários agendados. */
export function detectTimeWarnings(stopsInOrder: RouteStop[]): string[] {
  const timed = stopsInOrder
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.order.inspectionTime);
  for (let k = 0; k < timed.length - 1; k++) {
    const a = timed[k].s.order.inspectionTime as string;
    const b = timed[k + 1].s.order.inspectionTime as string;
    if (a > b) {
      return [
        `A ordem otimizada passa na OS ${timed[k + 1].s.order.number} (${b}) antes da OS ${
          timed[k].s.order.number
        } (${a}). Ative "Respeitar horários" para priorizar a agenda.`,
      ];
    }
  }
  return [];
}

function buildLegs(
  ordered: RouteStop[],
  start: RouteEndpoint,
  end: RouteEndpoint | null,
  roundTrip: boolean
): OptimizedRoute["legs"] {
  const legs: OptimizedRoute["legs"] = [
    { label: start.label || "Ponto inicial", point: start.point, orderId: null },
    ...ordered.map((s) => ({ label: legLabel(s), point: s.point, orderId: s.orderId })),
  ];
  if (roundTrip) legs.push({ label: start.label || "Ponto inicial", point: start.point, orderId: null });
  else if (end) legs.push({ label: end.label || "Destino final", point: end.point, orderId: null });
  return legs;
}

function fullPoints(ordered: RouteStop[], start: GeoPoint, end: GeoPoint | null, roundTrip: boolean): GeoPoint[] {
  const pts = [start, ...ordered.map((s) => s.point)];
  if (roundTrip) pts.push(start);
  else if (end) pts.push(end);
  return pts;
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

  // 1 OS: sem otimização — só mede o deslocamento.
  if (stops.length === 1) {
    const pts = fullPoints(stops, config.start.point, endPoint, config.roundTrip);
    return measuredInFixedOrder(stops, pts, config, notes, fetchFn);
  }

  const working = config.respectTime ? applyTimeAnchors(stops, config.start.point) : [...stops];
  const anchored = config.respectTime && working !== stops;
  if (anchored) notes.push("Horários agendados preservados como âncoras; demais paradas inseridas pelo menor desvio.");

  const points = fullPoints(working, config.start.point, endPoint, config.roundTrip);
  const endFixed = !config.roundTrip && endPoint !== null;

  // Com âncoras ativas a ordem é contratual: mede na malha viária sem reordenar.
  if (anchored) {
    return measuredInFixedOrder(working, points, config, notes, fetchFn);
  }

  // Tentativa primária: TSP na malha viária.
  try {
    const trip = await fetchTrip({ points, roundTrip: config.roundTrip, endFixed }, fetchFn);
    // trip.order cobre pontos móveis; reconstrói a ordem das OSs.
    const movable = trip.waypointOrder.filter((i) => i > 0 && (endFixed ? i < points.length - 1 : true));
    const ordered = movable.map((i) => working[i - 1]);
    // Segurança: se o serviço devolver conjunto incompleto, cai no fallback.
    if (ordered.length !== working.length || new Set(ordered).size !== working.length) {
      throw new OsrmError("Resposta do OSRM inconsistente.");
    }
    let km = trip.distanceMeters / 1000;
    let minutes = Math.round(trip.durationSeconds / 60);
    if (!Number.isFinite(km) || km <= 0) {
      const m = distanceMatrix(points);
      km = pathKm(trip.waypointOrder, m, config.roundTrip);
      minutes = estimateMinutes(km);
    }
    const timeWarnings = config.respectTime ? [] : detectTimeWarnings(ordered);
    return {
      stops: ordered,
      legs: buildLegs(ordered, config.start, config.roundTrip ? null : config.end, config.roundTrip),
      totalKm: km,
      totalMinutes: minutes,
      engine: "osrm-trip",
      roadBased: true,
      timeWarnings,
      notes,
    };
  } catch (e) {
    notes.push(
      e instanceof OsrmError
        ? `Roteador indisponível (${e.message}) — usando heurística local.`
        : "Roteador indisponível — usando heurística local."
    );
  }

  // Fallback: heurística local sobre os pontos (já com âncoras, se ativas).
  const movableIdx = working.map((_, i) => i + 1);
  let ordered: RouteStop[];
  if (anchored) {
    ordered = working;
  } else {
    const m = distanceMatrix(points);
    const order = optimizeOrder(m, { roundTrip: config.roundTrip, endFixed });
    ordered = order.filter((i) => movableIdx.includes(i)).map((i) => working[i - 1]);
  }
  const orderedPoints = fullPoints(ordered, config.start.point, endPoint, config.roundTrip);
  const m2 = distanceMatrix(orderedPoints);
  const seq = orderedPoints.map((_, i) => i);
  const km = pathKm(seq, m2, false);
  const timeWarnings = config.respectTime ? [] : detectTimeWarnings(ordered);
  return {
    stops: ordered,
    legs: buildLegs(ordered, config.start, config.roundTrip ? null : config.end, config.roundTrip),
    totalKm: km,
    totalMinutes: estimateMinutes(km),
    engine: "heuristic-2opt",
    roadBased: false,
    timeWarnings,
    notes,
  };
}

/** Ordem fixa (1 OS, âncoras): tenta métricas viárias, senão linha reta. */
async function measuredInFixedOrder(
  ordered: RouteStop[],
  points: GeoPoint[],
  config: RouteConfig,
  notes: string[],
  fetchFn: typeof fetch
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
    km = pathKm(points.map((_, i) => i), m, false);
    minutes = estimateMinutes(km);
    notes.push("Sem conexão com o roteador — distância em linha reta.");
  }
  return {
    stops: ordered,
    legs: buildLegs(ordered, config.start, config.roundTrip ? null : config.end, config.roundTrip),
    totalKm: km,
    totalMinutes: minutes,
    engine: roadBased ? "osrm-trip" : "heuristic-2opt",
    roadBased,
    timeWarnings: [],
    notes,
  };
}

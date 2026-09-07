/**
 * Cliente OSRM (OpenStreetMap Routing Machine) — sem chave, sem custo.
 * - /trip: resolve o TSP na malha viária (ordem otimizada + distância/tempo).
 * - /route: mede distância/tempo de uma ordem já definida.
 * Base pública de demonstração; sobrescrevível via VITE_OSRM_BASE_URL
 * (auto-hospedado) sem mudar código. Qualquer falha → erro tipado para o
 * controlador cair no fallback heurístico.
 */
import type { GeoPoint } from "./types";

export const OSRM_TRIP_LIMIT = 100;

export function osrmBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  return (env.VITE_OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
}

function coord(p: GeoPoint): string {
  return `${p.lng},${p.lat}`;
}

export interface TripRequest {
  points: GeoPoint[];
  roundTrip: boolean;
  /** Destino fixo (último ponto). Ignorado quando roundTrip. */
  endFixed: boolean;
}

export function tripUrl(base: string, req: TripRequest): string {
  const path = req.points.map(coord).join(";");
  const params = new URLSearchParams({
    overview: "false",
    steps: "false",
  });
  // source=first trava a origem. Circuito (roundtrip): o retorno ao início é
  // implícito — enviar `destination=first` aqui faz o OSRM responder HTTP 400.
  params.set("source", "first");
  if (!req.roundTrip && req.endFixed) params.set("destination", "last");
  else if (!req.roundTrip) params.set("destination", "any");
  params.set("roundtrip", req.roundTrip ? "true" : "false");
  return `${base}/trip/v1/driving/${path}?${params.toString()}`;
}

export function routeUrl(base: string, points: GeoPoint[]): string {
  const path = points.map(coord).join(";");
  return `${base}/route/v1/driving/${path}?overview=false&steps=false`;
}

export interface TripResult {
  /** Ordem dos waypoints (índices na entrada). */
  waypointOrder: number[];
  distanceMeters: number;
  durationSeconds: number;
}

export class OsrmError extends Error {
  constructor(message: string, public readonly causeText?: string) {
    super(message);
    this.name = "OsrmError";
  }
}

interface TripResponse {
  code?: string;
  message?: string;
  trips?: { distance?: number; duration?: number; geometry?: unknown }[];
  waypoints?: { waypoint_index?: number }[];
}

export function parseTripResponse(json: TripResponse, size: number): TripResult {
  if (json.code !== "Ok" || !json.trips?.length || !json.waypoints?.length) {
    throw new OsrmError(`OSRM /trip rejeitou a rota (${json.code ?? "sem código"}).`, json.message);
  }
  const trip = json.trips[0];
  const order = json.waypoints
    .map((w, position) => ({ position, index: w.waypoint_index ?? position }))
    .sort((a, b) => a.position - b.position)
    .map((w) => w.index);
  if (order.length !== size) {
    throw new OsrmError("OSRM /trip retornou waypoints incompletos.");
  }
  return {
    waypointOrder: order,
    distanceMeters: trip.distance ?? 0,
    durationSeconds: trip.duration ?? 0,
  };
}

export async function fetchTrip(
  req: TripRequest,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 15000
): Promise<TripResult> {
  if (req.points.length > OSRM_TRIP_LIMIT) {
    throw new OsrmError(`Acima do limite do OSRM /trip (${OSRM_TRIP_LIMIT} paradas).`);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(tripUrl(osrmBase(), req), { signal: ctrl.signal });
    if (!res.ok) throw new OsrmError(`OSRM /trip HTTP ${res.status}.`);
    const json = (await res.json()) as TripResponse;
    return parseTripResponse(json, req.points.length);
  } catch (e) {
    if (e instanceof OsrmError) throw e;
    throw new OsrmError("Falha de rede ao consultar o OSRM.", e instanceof Error ? e.message : undefined);
  } finally {
    clearTimeout(timer);
  }
}

interface RouteResponse {
  code?: string;
  routes?: { distance?: number; duration?: number }[];
}

export async function fetchRouteMetrics(
  points: GeoPoint[],
  fetchFn: typeof fetch = fetch,
  timeoutMs = 15000
): Promise<{ km: number; minutes: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(routeUrl(osrmBase(), points), { signal: ctrl.signal });
    if (!res.ok) throw new OsrmError(`OSRM /route HTTP ${res.status}.`);
    const json = (await res.json()) as RouteResponse;
    const r = json.code === "Ok" ? json.routes?.[0] : undefined;
    if (!r) throw new OsrmError("OSRM /route sem rota.");
    return {
      km: (r.distance ?? 0) / 1000,
      minutes: Math.round((r.duration ?? 0) / 60),
    };
  } catch (e) {
    if (e instanceof OsrmError) throw e;
    throw new OsrmError("Falha de rede ao medir a rota.", e instanceof Error ? e.message : undefined);
  } finally {
    clearTimeout(timer);
  }
}

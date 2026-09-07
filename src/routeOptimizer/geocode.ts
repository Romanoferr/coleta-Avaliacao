/**
 * Geocodificação via Nominatim (OpenStreetMap) — sem chave, sem custo.
 * Política de uso respeitada: 1 req/s, User-Agent identificável, cache
 * persistente (geo.ts) para nunca repetir o mesmo endereço. Reversível via
 * VITE_NOMINATIM_BASE_URL sem mudar código.
 */
import { cachedPoint, isValidPoint, storePoint } from "./geo";
import type { GeoPoint } from "./types";

export function nominatimBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  return (env.VITE_NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
}

export class GeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

interface SearchResponse {
  lat?: string;
  lon?: string;
}

const MIN_INTERVAL_MS = 1100;
let lastCallAt = 0;

async function throttle(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export async function geocodeAddress(
  addressText: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 12000
): Promise<GeoPoint> {
  const text = addressText.trim();
  if (!text) throw new GeocodeError("Endereço vazio.");
  const hit = cachedPoint(text);
  if (hit) return hit;

  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url =
      `${nominatimBase()}/search?` +
      new URLSearchParams({ format: "jsonv2", limit: "1", q: text, countrycodes: "br" }).toString();
    const res = await fetchFn(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new GeocodeError(`Geocodificação HTTP ${res.status}.`);
    const json = (await res.json()) as SearchResponse[];
    const first = Array.isArray(json) ? json[0] : undefined;
    const point = first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
    if (!isValidPoint(point)) throw new GeocodeError("Endereço não localizado.");
    storePoint(text, point);
    return point;
  } catch (e) {
    if (e instanceof GeocodeError) throw e;
    throw new GeocodeError("Falha de rede na geocodificação.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Provedor de geocodificação - interface desacoplada do algoritmo.
 * O restante do app depende só de `GeocodeProvider.geocode()`; trocar o
 * serviço (ex.: Photon, serviço próprio) = nova implementação, sem tocar na otimização.
 * Hoje: Nominatim (OSM) - sem chave, sem custo. Política de uso: 1 req/s
 * (throttle), timeout e erro tipado. `null` = endereço não localizado.
 */
import { isValidPoint } from "./geo";
import type { GeoPoint } from "./types";

export interface GeocodeProvider {
  readonly name: string;
  geocode(address: string): Promise<GeoPoint | null>;
}

export class GeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

export function nominatimBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
  return (env.VITE_NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
}

interface SearchResponse {
  lat?: string;
  lon?: string;
}

const MIN_INTERVAL_MS = 1100;
let lastCallAt = 0;

async function throttle(minIntervalMs: number): Promise<void> {
  const wait = minIntervalMs - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export interface NominatimOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Intervalo mínimo entre chamadas (política de uso; 0 só em testes). */
  minIntervalMs?: number;
}

export function createNominatimProvider(opts: NominatimOptions = {}): GeocodeProvider {
  const base = (opts.baseUrl ?? nominatimBase()).replace(/\/+$/, "");
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 12000;
  const minIntervalMs = opts.minIntervalMs ?? MIN_INTERVAL_MS;
  return {
    name: "nominatim",
    async geocode(address: string): Promise<GeoPoint | null> {
      const text = address.trim();
      if (!text) return null;
      await throttle(minIntervalMs);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const url =
          `${base}/search?` +
          new URLSearchParams({ format: "jsonv2", limit: "1", q: text, countrycodes: "br" }).toString();
        const res = await fetchFn(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        if (!res.ok) throw new GeocodeError(`Geocodificação HTTP ${res.status}.`);
        const json = (await res.json()) as SearchResponse[];
        const first = Array.isArray(json) ? json[0] : undefined;
        const point = first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
        return isValidPoint(point) ? point : null;
      } catch (e) {
        if (e instanceof GeocodeError) throw e;
        throw new GeocodeError("Falha de rede na geocodificação.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Provedor padrão da aplicação (Nominatim público). */
export const nominatimProvider: GeocodeProvider = createNominatimProvider();

/**
 * Atalho legado (sem cache): prefira `resolveManyPoints` (coordinates.ts),
 * que aplica o fluxo banco → cache → provider → persistência.
 */
export async function geocodeAddress(addressText: string): Promise<GeoPoint> {
  const point = await nominatimProvider.geocode(addressText);
  if (!point) throw new GeocodeError("Endereço não localizado.");
  return point;
}

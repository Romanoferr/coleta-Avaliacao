/**
 * Geometria e cache local de coordenadas — puro, sem rede.
 * Cache em localStorage evita geocodificar o mesmo endereço repetidamente.
 */
import { formatAddress } from "../domain/address";
import type { ServiceOrder } from "../domain/serviceOrder";
import type { GeoPoint } from "./types";

const CACHE_KEY = "coleta-avaliacao:geocache:v1";
const MAX_ENTRIES = 1000;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371.0088;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Velocidade média urbana conservadora para estimar tempo do fallback. */
export const FALLBACK_KMH = 30;

export function estimateMinutes(km: number): number {
  return Math.round((km / FALLBACK_KMH) * 60);
}

/** Chave estável do endereço (normaliza caixa/espaço/pontuação). */
export function addressKey(address: string): string {
  return address
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto geocodificável da OS: partes + cidade/UF quando houver. */
export function orderAddressText(order: ServiceOrder): string {
  const line = formatAddress(order.address);
  const city = [order.address.city, order.address.state].filter(Boolean).join("/");
  if (!line) return "";
  // formatAddress já inclui cidade/UF; garante país para o Nominatim.
  if (city && !/brasil/i.test(line)) return `${line}, Brasil`;
  return /brasil/i.test(line) ? line : `${line}, Brasil`;
}

type Cache = Record<string, GeoPoint>;

function readCache(storage: Storage | null): Cache {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Cache;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function cachedPoint(addressText: string, s: Storage | null = storage()): GeoPoint | null {
  const cache = readCache(s);
  return cache[addressKey(addressText)] ?? null;
}

export function storePoint(addressText: string, point: GeoPoint, s: Storage | null = storage()): void {
  try {
    const cache = readCache(s);
    cache[addressKey(addressText)] = point;
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
    }
    s?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota/privado: segue sem cache */
  }
}

export function isValidPoint(p: GeoPoint | null | undefined): p is GeoPoint {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

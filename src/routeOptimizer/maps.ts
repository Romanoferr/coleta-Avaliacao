/**
 * Integração com Google Maps — APENAS navegação (URL pública, sem chave).
 * A otimização acontece no OSRM/heurística; esta URL preserva exatamente a
 * ordem calculada (origem → waypoints → destino). Limite documentado: o
 * Google aceita bem até ~10 pontos na URL; acima disso enviamos os
 * primeiros e sinalizamos (a ordem completa permanece visível no app).
 */
import type { GeoPoint } from "./types";

/** Máximo de pontos (origem + paradas + destino) embutidos na URL. */
export const MAPS_URL_LIMIT = 10;

function fmt(p: GeoPoint): string {
  return `${p.lat},${p.lng}`;
}

export interface MapsRouteInput {
  origin: GeoPoint;
  /** Paradas intermediárias NA ORDEM otimizada. */
  waypoints: GeoPoint[];
  destination: GeoPoint;
}

export function googleMapsDirectionsUrl(input: MapsRouteInput): { url: string; truncated: boolean } {
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    origin: fmt(input.origin),
    destination: fmt(input.destination),
  });
  let truncated = false;
  let wps = input.waypoints;
  const total = 2 + wps.length;
  if (total > MAPS_URL_LIMIT) {
    wps = wps.slice(0, MAPS_URL_LIMIT - 2);
    truncated = true;
  }
  if (wps.length > 0) params.set("waypoints", wps.map(fmt).join("|"));
  return { url: `https://www.google.com/maps/dir/?${params.toString()}`, truncated };
}

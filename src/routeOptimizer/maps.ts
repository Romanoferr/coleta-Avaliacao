/**
 * Integração com Google Maps - APENAS navegação (URL pública, sem chave).
 * A otimização acontece no OSRM/heurística; esta URL preserva exatamente a
 * ordem calculada (origem → waypoints → destino). Limite documentado: o
 * Google aceita bem até ~10 pontos na URL (ver segmentos abaixo).
 *
 * IMPORTANTE: cada ponto vai como TEXTO de endereço quando disponível
 * (o que o usuário digitou/cadastrou), e só como "lat,lng" em último caso.
 * Texto faz o Google geocodificar com o próprio motor e exibir o endereço
 * correto; coordenada faria ele mostrar um rótulo reverso aproximado
 * (ex.: número vizinho), parecendo "endereço errado".
 */
import type { GeoPoint } from "./types";

/** Máximo de pontos (origem + paradas + destino) embutidos na URL. */
export const MAPS_URL_LIMIT = 10;

/** Um ponto de navegação: texto de endereço preferido, coordenada de reserva. */
export interface MapRef {
  point: GeoPoint;
  address?: string | null;
}

function fmt(ref: MapRef): string {
  const text = (ref.address ?? "").trim();
  if (text) return text;
  return `${ref.point.lat},${ref.point.lng}`;
}

export interface MapsRouteInput {
  origin: MapRef;
  /** Paradas intermediárias NA ORDEM otimizada. */
  waypoints: MapRef[];
  destination: MapRef;
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

/**
 * Navegação por segmentos: divide a sequência completa de pontos em trechos
 * de no máximo MAPS_URL_LIMIT pontos, com sobreposição (o fim de um trecho
 * é o início do próximo). A ordem otimizada é preservada integralmente -
 * só muda como ela é aberta no Maps.
 */
export interface RouteSegment {
  index: number;
  total: number;
  label: string;
  url: string;
}

export function googleMapsSegmentUrls(refs: MapRef[], labels: string[]): RouteSegment[] {
  if (refs.length < 2) return [];
  const chunks: MapRef[][] = [];
  const labelChunks: string[][] = [];
  let i = 0;
  while (i < refs.length - 1) {
    const slice = refs.slice(i, i + MAPS_URL_LIMIT);
    if (slice.length < 2) break;
    chunks.push(slice);
    labelChunks.push(labels.slice(i, i + MAPS_URL_LIMIT));
    i += MAPS_URL_LIMIT - 1; // sobrepõe: continua de onde parou
  }
  return chunks.map((pts, idx) => {
    const { url } = googleMapsDirectionsUrl({
      origin: pts[0],
      waypoints: pts.slice(1, -1),
      destination: pts[pts.length - 1],
    });
    const first = labelChunks[idx][0] ?? "";
    const last = labelChunks[idx][labelChunks[idx].length - 1] ?? "";
    return {
      index: idx + 1,
      total: chunks.length,
      label: `Trecho ${idx + 1} de ${chunks.length}: ${first} → ${last}`,
      url,
    };
  });
}

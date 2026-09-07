/**
 * Otimizador de Rotas — tipos do módulo.
 * Separação: types (contratos) → geo/select (puro, sem rede) → geocode/osrm
 * (rede, sem chave) → optimize (heurística/controlador) → maps (URL pública).
 */
import type { ServiceOrder } from "../domain/serviceOrder";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteStop {
  /** Id técnico da OS (nunca exibido; usado só para lookup na lista isolada). */
  orderId: string;
  order: ServiceOrder;
  point: GeoPoint;
  /** Origem da coordenada (rastreabilidade do custo/precisão). */
  source: "osrm" | "nominatim" | "cache" | "manual";
}

export interface RouteEndpoint {
  label: string;
  address: string;
  point: GeoPoint;
  source: RouteStop["source"];
}

export interface RouteConfig {
  dateIso: string;
  /** Ids das OS selecionadas (subconjunto das OS do usuário na data). */
  selectedOrderIds: string[];
  start: RouteEndpoint;
  /** true = circuito (volta ao início). Quando true, `end` é ignorado. */
  roundTrip: boolean;
  /** null/undefined = rota aberta (termina na última OS). */
  end: RouteEndpoint | null;
  /** true = âncoras cronológicas para OS com horário (padrão). */
  respectTime: boolean;
}

export type RouteEngine = "osrm-trip" | "heuristic-2opt";

export interface OptimizedRoute {
  /** Paradas na ordem de visitação (só OSs; início/fim ficam em `legs`). */
  stops: RouteStop[];
  /** Sequência completa de visitação: início → OSs → fim/início. */
  legs: { label: string; point: GeoPoint; orderId: string | null }[];
  totalKm: number;
  totalMinutes: number;
  engine: RouteEngine;
  /** true quando distância/tempo vieram da malha viária (OSRM). */
  roadBased: boolean;
  timeWarnings: string[];
  notes: string[];
}

export interface InvalidStop {
  orderId: string;
  order: ServiceOrder;
  reason: string;
}

export interface TimeConflict {
  orderId: string;
  number: string;
  time: string;
}

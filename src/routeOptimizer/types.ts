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
  source: "stored" | "osrm" | "nominatim" | "cache" | "manual";
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
  /**
   * Minutos médios de atendimento por parada (configurável na UI).
   * Usado SÓ para previsão de chegadas/avisos — nunca para ordenar.
   */
  serviceMinutes: number;
}

export type RouteEngine = "osrm-trip" | "heuristic-2opt";

/** Previsão de chegada de uma parada (cronograma com atendimento médio). */
export interface TimelineEntry {
  orderId: string;
  /** Número comercial da OS (exibição). */
  number: string;
  /** "HH:MM" prevista de chegada (pode diferir do agendado). */
  eta: string;
  /** "HH:MM" agendado, quando houver. */
  scheduled: string | null;
  /** Minutos após o horário (0 = no horário). */
  lateBy: number;
}

export interface OptimizedRoute {
  /** Paradas na ordem de visitação (só OSs; início/fim ficam em `legs`). */
  stops: RouteStop[];
  /** Sequência completa de visitação: início → OSs → fim/início. */
  legs: {
    label: string;
    point: GeoPoint;
    orderId: string | null;
    /**
     * Texto do endereço como digitado (OSs) ou informado (início/fim).
     * O Google Maps recebe este texto — não a coordenada — para exibir
     * exatamente o endereço de origem (coordenadas servem só à otimização).
     */
    address: string | null;
  }[];
  totalKm: number;
  totalMinutes: number;
  engine: RouteEngine;
  /** true quando distância/tempo vieram da malha viária (OSRM). */
  roadBased: boolean;
  timeWarnings: string[];
  notes: string[];
  /** Cronograma previsto (mesma ordem de `stops`); vazio sem horários. */
  timeline: TimelineEntry[];
  /** "HH:MM" sugerida de saída para cumprir o 1º horário; null sem horários. */
  suggestedDeparture: string | null;
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

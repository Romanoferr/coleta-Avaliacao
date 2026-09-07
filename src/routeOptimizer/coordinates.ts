/**
 * Resolução de coordenadas das OSs - fluxo oficial:
 *
 *   OS tem geo válida + geocodedAddress == endereço atual? → usa (stored)
 *   senão: cache local por endereço normalizado? → usa + persiste (cache)
 *   senão: provider.geocode() → persiste no banco + cache local (provider)
 *   provider retornou null / rede falhou → OS inválida (não quebra a rota)
 *
 * - Um endereço = uma chamada ao provider (dedupe por addressKey), mesmo
 *   com várias OSs no mesmo local.
 * - Persistência é best-effort: falha de rede/RLS/OS terminal nunca quebra
 *   a otimização (a rota segue com a coordenada em memória).
 * - Segurança: `persist` é o store.updateOrder (RLS no banco); esta camada
 *   nunca inventa owner nem atualiza OS fora da lista isolada recebida.
 */
import { isValidGeo } from "../domain/serviceOrder";
import type { ServiceOrder } from "../domain/serviceOrder";
import type { GeocodeProvider } from "./geocode";
import { addressKey, cachedPoint, orderAddressText, storePoint } from "./geo";
import type { GeoPoint, InvalidStop, RouteStop } from "./types";

export interface ResolvedPoint {
  point: GeoPoint;
  source: RouteStop["source"];
  /** true quando veio do banco ou do cache (sem chamada de rede). */
  reused: boolean;
}

export interface ResolveDeps {
  provider: GeocodeProvider;
  /** Best-effort (pode lançar - será contido aqui). */
  persist?: (orderId: string, geo: { latitude: number; longitude: number }, key: string) => Promise<unknown>;
  onProgress?: (done: number, total: number) => void;
}

export interface ResolveResult {
  stops: RouteStop[];
  invalid: InvalidStop[];
}

async function safePersist(deps: ResolveDeps, orderId: string, point: GeoPoint, key: string): Promise<void> {
  if (!deps.persist) return;
  try {
    await deps.persist(orderId, { latitude: point.lat, longitude: point.lng }, key);
  } catch {
    /* best-effort: rota segue com a coordenada em memória */
  }
}

export async function resolveManyPoints(orders: ServiceOrder[], deps: ResolveDeps): Promise<ResolveResult> {
  const stops: RouteStop[] = [];
  const invalid: InvalidStop[] = [];

  // Dedupe: um endereço normalizado = um grupo (uma chamada ao provider).
  const groups = new Map<string, { text: string; orders: ServiceOrder[] }>();
  for (const o of orders) {
    const text = orderAddressText(o);
    if (!text) {
      invalid.push({ orderId: o.id, order: o, reason: "Endereço vazio." });
      continue;
    }
    const key = addressKey(text);
    const g = groups.get(key);
    if (g) g.orders.push(o);
    else groups.set(key, { text, orders: [o] });
  }

  const total = groups.size;
  let done = 0;
  const tick = () => {
    done++;
    deps.onProgress?.(done, total);
  };

  for (const [key, group] of groups) {
    // 1. Reuso do banco por OS (endereço atual == endereço geocodificado).
    const pending: ServiceOrder[] = [];
    for (const o of group.orders) {
      const stored: GeoPoint | null =
        isValidGeo(o.geo) && o.geocodedAddress === key
          ? { lat: o.geo.latitude, lng: o.geo.longitude }
          : null;
      if (stored) {
        stops.push({ orderId: o.id, order: o, point: stored, source: "stored" });
      } else {
        pending.push(o);
      }
    }
    if (pending.length === 0) {
      tick();
      continue;
    }
    // 2. Cache local compartilhado pelo grupo.
    const hit = cachedPoint(group.text);
    if (hit) {
      for (const o of pending) {
        stops.push({ orderId: o.id, order: o, point: hit, source: "cache" });
        await safePersist(deps, o.id, hit, key);
      }
      tick();
      continue;
    }
    // 3. Provider (uma chamada por endereço único).
    let point: GeoPoint | null = null;
    try {
      point = await deps.provider.geocode(group.text);
    } catch {
      point = null;
    }
    if (!point) {
      for (const o of pending) {
        invalid.push({ orderId: o.id, order: o, reason: "Endereço não localizado." });
      }
      tick();
      continue;
    }
    storePoint(group.text, point);
    const source: RouteStop["source"] = deps.provider.name === "nominatim" ? "nominatim" : "cache";
    for (const o of pending) {
      stops.push({ orderId: o.id, order: o, point, source });
      await safePersist(deps, o.id, point, key);
    }
    tick();
  }

  // Defesa em profundidade: preserva a ordem de entrada das OSs válidas.
  const rank = new Map(orders.map((o, i) => [o.id, i]));
  stops.sort((a, b) => (rank.get(a.orderId) ?? 0) - (rank.get(b.orderId) ?? 0));
  return { stops, invalid };
}

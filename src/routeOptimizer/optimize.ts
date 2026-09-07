/**
 * Heurística TSP local (nearest-neighbor + 2-opt) - fallback determinístico
 * e offline. NÃO é a estratégia primária: o controlador tenta primeiro o
 * OSRM /trip (malha viária real); esta heurística assume quando a rede falha
 * ou o volume excede o limite do serviço.
 *
 * Complexidade: O(n²) construção + O(k·n²) melhoria - adequado a dezenas de OSs.
 */
import type { GeoPoint } from "./types";
import { estimateMinutes, haversineKm } from "./geo";

export function distanceMatrix(points: GeoPoint[]): number[][] {
  return points.map((a) => points.map((b) => (a === b ? 0 : haversineKm(a, b))));
}

export interface OptimizeOpts {
  /** Fecha o circuito no ponto inicial. */
  roundTrip: boolean;
  /** Último ponto é destino fixo (não participa da permutação). */
  endFixed: boolean;
}

/**
 * points[0] = início (fixo). points[1..n] = paradas permutáveis.
 * Com endFixed, o último ponto é destino fixo. Retorna a ordem dos índices.
 */
export function optimizeOrder(matrix: number[][], opts: OptimizeOpts): number[] {
  const n = matrix.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const last = n - 1;
  const movable: number[] = [];
  for (let i = 1; i < (opts.endFixed ? last : n); i++) movable.push(i);

  // nearest-neighbor a partir do início
  const order = [0];
  const unvisited = new Set(movable);
  let current = 0;
  while (unvisited.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const c of unvisited) {
      const d = matrix[current][c];
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    order.push(best);
    unvisited.delete(best);
    current = best;
  }
  if (opts.endFixed) order.push(last);

  twoOpt(order, matrix, opts);
  return order;
}

function tourLength(order: number[], matrix: number[][], roundTrip: boolean): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += matrix[order[i]][order[i + 1]];
  if (roundTrip) total += matrix[order[order.length - 1]][order[0]];
  return total;
}

/** 2-opt com extremidades fixas (início; fim quando endFixed ou circuito). */
function twoOpt(order: number[], matrix: number[][], opts: OptimizeOpts): void {
  const fixedEnd = opts.endFixed || opts.roundTrip;
  let improved = true;
  let guard = 0;
  while (improved && guard < 100) {
    improved = false;
    guard++;
    const end = order.length - (fixedEnd ? 1 : 0);
    for (let i = 1; i < end - 1; i++) {
      for (let k = i + 1; k < end; k++) {
        const before = tourLength(order, matrix, opts.roundTrip);
        reverseSegment(order, i, k);
        if (tourLength(order, matrix, opts.roundTrip) < before - 1e-9) {
          improved = true;
        } else {
          reverseSegment(order, i, k); // desfaz
        }
      }
    }
  }
}

function reverseSegment(order: number[], i: number, k: number): void {
  while (i < k) {
    const t = order[i];
    order[i] = order[k];
    order[k] = t;
    i++;
    k--;
  }
}

export function pathKm(order: number[], matrix: number[][], roundTrip: boolean): number {
  return tourLength(order, matrix, roundTrip);
}

export function pathMinutes(km: number): number {
  return estimateMinutes(km);
}

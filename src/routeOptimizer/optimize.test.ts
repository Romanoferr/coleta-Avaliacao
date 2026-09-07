import { describe, expect, it } from "vitest";
import { distanceMatrix, optimizeOrder, pathKm } from "./optimize";

const P = (lat: number, lng: number) => ({ lat, lng });

describe("optimize (nearest-neighbor + 2-opt)", () => {
  it("rota aberta mantém início fixo e visita todas", () => {
    // Início em (0,0); paradas em linha no eixo x.
    const pts = [P(0, 0), P(3, 0), P(1, 0), P(2, 0)];
    const m = distanceMatrix(pts);
    const order = optimizeOrder(m, { roundTrip: false, endFixed: false });
    expect(order[0]).toBe(0);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    expect(order).toEqual([0, 2, 3, 1]); // 1 → 2 → 3 na ordem espacial
  });

  it("destino personalizado fica por último", () => {
    const pts = [P(0, 0), P(1, 0), P(2, 0), P(9, 9)];
    const m = distanceMatrix(pts);
    const order = optimizeOrder(m, { roundTrip: false, endFixed: true });
    expect(order[0]).toBe(0);
    expect(order[order.length - 1]).toBe(3);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
  });

  it("2-opt melhora (ou empata) o vizinho mais próximo", () => {
    const pts = [P(0, 0), P(1, 1), P(1, -1), P(-1, -1), P(-1, 1), P(0.1, 0)];
    const m = distanceMatrix(pts);
    const order = optimizeOrder(m, { roundTrip: true, endFixed: false });
    expect(order[0]).toBe(0);
    // Circuito não pior que a ordem de entrada
    const naive = pathKm([0, 1, 2, 3, 4, 5], m, true);
    expect(pathKm(order, m, true)).toBeLessThanOrEqual(naive);
  });

  it("casos degenerados: 0 a 2 pontos", () => {
    expect(optimizeOrder(distanceMatrix([P(0, 0)]), { roundTrip: false, endFixed: false })).toEqual([0]);
    expect(
      optimizeOrder(distanceMatrix([P(0, 0), P(1, 1)]), { roundTrip: true, endFixed: false })
    ).toEqual([0, 1]);
  });

  it("é determinístico", () => {
    const pts = [P(0, 0), P(5, 1), P(2, 8), P(7, 3), P(1, 4)];
    const m = distanceMatrix(pts);
    const a = optimizeOrder(m, { roundTrip: false, endFixed: false });
    const b = optimizeOrder(m, { roundTrip: false, endFixed: false });
    expect(a).toEqual(b);
  });
});

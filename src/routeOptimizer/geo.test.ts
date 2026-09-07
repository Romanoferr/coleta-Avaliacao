import { describe, expect, it } from "vitest";
import { addressKey, estimateMinutes, haversineKm, isValidPoint } from "./geo";

describe("geo", () => {
  it("haversine: São Paulo → Rio ≈ 360 km", () => {
    const km = haversineKm({ lat: -23.5505, lng: -46.6333 }, { lat: -22.9068, lng: -43.1729 });
    expect(km).toBeGreaterThan(340);
    expect(km).toBeLessThan(380);
  });

  it("haversine: mesmo ponto = 0", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });

  it("addressKey normaliza caixa, acento e pontuação", () => {
    expect(addressKey("Rua São João, 100 — Centro")).toBe(addressKey("rua sao joao 100 centro"));
  });

  it("isValidPoint rejeita nulo e 0,0", () => {
    expect(isValidPoint(null)).toBe(false);
    expect(isValidPoint({ lat: 0, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: -23.5, lng: -46.6 })).toBe(true);
  });

  it("estimateMinutes usa 30 km/h", () => {
    expect(estimateMinutes(30)).toBe(60);
  });
});

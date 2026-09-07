import { describe, expect, it } from "vitest";
import { MAPS_URL_LIMIT, googleMapsDirectionsUrl, googleMapsSegmentUrls } from "./maps";
import type { MapRef } from "./maps";

const P = (lat: number, lng: number, address?: string | null): MapRef => ({
  point: { lat, lng },
  address,
});

describe("maps", () => {
  it("preserva a ordem calculada (origem → waypoints → destino)", () => {
    const { url, truncated } = googleMapsDirectionsUrl({
      origin: P(0, 0),
      waypoints: [P(1, 1), P(2, 2)],
      destination: P(3, 3),
    });
    expect(truncated).toBe(false);
    expect(url).toContain("origin=0%2C0");
    expect(url).toContain("destination=3%2C3");
    const wps = new URL(url).searchParams.get("waypoints");
    expect(wps).toBe("1,1|2,2");
  });

  it("usa o texto do endereço quando disponível (rótulo fiel ao digitado)", () => {
    const { url } = googleMapsDirectionsUrl({
      origin: P(0, 0, "Base, São Paulo, SP"),
      waypoints: [P(1, 1, "Rua X, 100, São Paulo, SP")],
      destination: P(3, 3),
    });
    const q = new URL(url).searchParams;
    expect(q.get("origin")).toBe("Base, São Paulo, SP");
    expect(q.get("waypoints")).toBe("Rua X, 100, São Paulo, SP");
    expect(q.get("destination")).toBe("3,3"); // sem texto → coordenada
  });

  it("trunca além do limite e sinaliza", () => {
    const wps = Array.from({ length: MAPS_URL_LIMIT }, (_, i) => P(i, i));
    const { truncated } = googleMapsDirectionsUrl({ origin: P(0, 0), waypoints: wps, destination: P(9, 9) });
    expect(truncated).toBe(true);
  });

  it("sem waypoints gera URL válida", () => {
    const { url } = googleMapsDirectionsUrl({ origin: P(0, 0), waypoints: [], destination: P(1, 1) });
    expect(new URL(url).searchParams.get("waypoints")).toBeNull();
  });
});

describe("maps por segmentos", () => {
  const pts = (n: number) => Array.from({ length: n }, (_, i) => P(i, i));
  const labels = (n: number) => Array.from({ length: n }, (_, i) => `Parada ${i}`);

  function urlPoints(url: string): number {
    const q = new URL(url).searchParams;
    const wps = q.get("waypoints");
    return 2 + (wps ? wps.split("|").length : 0);
  }

  it("até o limite = 1 trecho", () => {
    const segs = googleMapsSegmentUrls(pts(MAPS_URL_LIMIT), labels(MAPS_URL_LIMIT));
    expect(segs).toHaveLength(1);
    expect(urlPoints(segs[0].url)).toBe(MAPS_URL_LIMIT);
  });

  it("acima do limite divide com sobreposição e preserva a ordem", () => {
    const n = MAPS_URL_LIMIT + 5; // 15 pontos, limite 10
    const segs = googleMapsSegmentUrls(pts(n), labels(n));
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) expect(urlPoints(s.url)).toBeLessThanOrEqual(MAPS_URL_LIMIT);
    // Continuidade: destino de um trecho = origem do próximo
    for (let i = 0; i < segs.length - 1; i++) {
      const a = new URL(segs[i].url).searchParams.get("destination");
      const b = new URL(segs[i + 1].url).searchParams.get("origin");
      expect(a).toBe(b);
    }
    // Ordem global preservada: primeiro ponto do 1º = início; último do fim = destino
    expect(new URL(segs[0].url).searchParams.get("origin")).toBe("0,0");
    expect(new URL(segs[segs.length - 1].url).searchParams.get("destination")).toBe(`${n - 1},${n - 1}`);
    expect(segs[0].label).toMatch(/Trecho 1 de \d+/);
  });

  it("segmentos carregam o texto do endereço na ordem", () => {
    const refs = [P(0, 0, "Origem A"), P(1, 1, "Meio B"), P(2, 2, "Fim C")];
    const segs = googleMapsSegmentUrls(refs, ["O", "M", "F"]);
    expect(segs).toHaveLength(1);
    const q = new URL(segs[0].url).searchParams;
    expect(q.get("origin")).toBe("Origem A");
    expect(q.get("waypoints")).toBe("Meio B");
    expect(q.get("destination")).toBe("Fim C");
  });

  it("menos de 2 pontos = sem segmentos", () => {
    expect(googleMapsSegmentUrls([P(0, 0)], ["Só"])).toEqual([]);
  });
});

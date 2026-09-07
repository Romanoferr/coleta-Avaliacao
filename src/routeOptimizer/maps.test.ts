import { describe, expect, it } from "vitest";
import { MAPS_URL_LIMIT, googleMapsDirectionsUrl } from "./maps";

const P = (lat: number, lng: number) => ({ lat, lng });

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

import { describe, expect, it } from "vitest";
import { OsrmError, parseTripResponse, routeUrl, tripUrl } from "./osrm";

describe("osrm", () => {
  it("tripUrl trava origem e destino (circuito)", () => {
    const url = tripUrl("https://x", {
      points: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      roundTrip: true,
      endFixed: false,
    });
    expect(url).toContain("source=first");
    expect(url).toContain("destination=first");
    expect(url).toContain("roundtrip=true");
    expect(url).toContain("2,1"); // lng,lat
  });

  it("tripUrl com destino personalizado usa last", () => {
    const url = tripUrl("https://x", {
      points: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      roundTrip: false,
      endFixed: true,
    });
    expect(url).toContain("destination=last");
  });

  it("routeUrl lista coordenadas lng,lat", () => {
    expect(routeUrl("https://x", [{ lat: 1, lng: 2 }])).toContain("/2,1");
  });

  it("parseTripResponse reconstrói a ordem", () => {
    const r = parseTripResponse(
      {
        code: "Ok",
        trips: [{ distance: 5000, duration: 600 }],
        waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      },
      3
    );
    expect(r.waypointOrder).toEqual([0, 2, 1]);
    expect(r.distanceMeters).toBe(5000);
    expect(r.durationSeconds).toBe(600);
  });

  it("parseTripResponse rejeita erro e resposta incompleta", () => {
    expect(() => parseTripResponse({ code: "NoRoute" }, 2)).toThrowError(OsrmError);
    expect(() =>
      parseTripResponse(
        { code: "Ok", trips: [{ distance: 1, duration: 1 }], waypoints: [{ waypoint_index: 0 }] },
        2
      )
    ).toThrowError(OsrmError);
  });
});

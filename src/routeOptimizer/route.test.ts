import { describe, expect, it, vi } from "vitest";
import { createServiceOrder } from "../domain/serviceOrder";
import type { ServiceOrder } from "../domain/serviceOrder";
import { applyTimeAnchors, computeOptimizedRoute, detectTimeWarnings } from "./route";
import type { RouteConfig, RouteStop } from "./types";

const BASE = { contractor: "Banco X", receivedAt: "2026-09-01" };
let seq = 0;

function order(number: string, time?: string): ServiceOrder {
  seq++;
  return createServiceOrder(
    {
      ...BASE,
      number,
      inspectionDate: "2026-09-07",
      ...(time ? { inspectionTime: time } : {}),
      address: { street: `Rua ${number}`, number: "10", city: "São Paulo", state: "SP" },
    },
    []
  );
}

function stop(o: ServiceOrder, lat: number, lng = 0): RouteStop {
  return { orderId: o.id, order: o, point: { lat, lng }, source: "cache" };
}

function config(over: Partial<RouteConfig> = {}): RouteConfig {
  return {
    dateIso: "2026-09-07",
    selectedOrderIds: [],
    start: { label: "Base", address: "Base", point: { lat: 0, lng: 0 }, source: "manual" },
    roundTrip: false,
    end: null,
    respectTime: true,
    ...over,
  };
}

function okFetch(trip?: { order: number[]; distance?: number; duration?: number }) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/trip/")) {
      const n = trip?.order.length ?? 3;
      return {
        ok: true,
        json: async () => ({
          code: "Ok",
          trips: [{ distance: trip?.distance ?? 9000, duration: trip?.duration ?? 900 }],
          waypoints: (trip?.order ?? Array.from({ length: n }, (_, i) => i)).map((waypoint_index) => ({
            waypoint_index,
          })),
        }),
      };
    }
    return { ok: true, json: async () => ({ code: "Ok", routes: [{ distance: 4000, duration: 480 }] }) };
  });
}

type FetchMock = ReturnType<typeof okFetch>;
function asFetch(fn: FetchMock): typeof fetch {
  return fn as unknown as typeof fetch;
}

const failFetch = vi.fn(async () => {
  throw new Error("offline");
});
function failFetchAs(): typeof fetch {
  return failFetch as unknown as typeof fetch;
}

describe("route (controlador)", () => {
  it("rota aberta usa a ordem do OSRM com métricas viárias", async () => {
    const a = order("1");
    const b = order("2");
    const c = order("3");
    const r = await computeOptimizedRoute(
      { config: config({ respectTime: false }), stops: [stop(a, 1), stop(b, 2), stop(c, 3)] },
      asFetch(okFetch({ order: [0, 3, 2, 1] }))
    );
    expect(r.stops.map((s) => s.order.number)).toEqual(["3", "2", "1"]);
    expect(r.engine).toBe("osrm-trip");
    expect(r.roadBased).toBe(true);
    expect(r.totalKm).toBeCloseTo(9, 5);
    expect(r.legs[0].orderId).toBeNull();
    expect(r.legs).toHaveLength(4); // início + 3 OSs
  });

  it("retorno ao início fecha o circuito", async () => {
    const a = order("1");
    const b = order("2");
    const fetchFn = okFetch({ order: [0, 1, 2] });
    const r = await computeOptimizedRoute(
      { config: config({ roundTrip: true, respectTime: false }), stops: [stop(a, 1), stop(b, 2)] },
      asFetch(fetchFn)
    );
    expect(String(fetchFn.mock.calls[0][0])).toContain("destination=first");
    expect(r.legs[r.legs.length - 1].point).toEqual(r.legs[0].point);
  });

  it("destino personalizado trava o fim e aparece por último", async () => {
    const a = order("1");
    const b = order("2");
    const end = { label: "Casa", address: "Casa", point: { lat: 9, lng: 9 }, source: "manual" as const };
    const fetchFn = okFetch({ order: [0, 2, 1, 3] });
    const r = await computeOptimizedRoute(
      { config: config({ end, respectTime: false }), stops: [stop(a, 1), stop(b, 2)] },
      asFetch(fetchFn)
    );
    expect(String(fetchFn.mock.calls[0][0])).toContain("destination=last");
    expect(r.stops.map((s) => s.order.number)).toEqual(["2", "1"]);
    expect(r.legs[r.legs.length - 1].label).toBe("Casa");
  });

  it("uma OS não otimiza: mede deslocamento direto", async () => {
    const a = order("1");
    const r = await computeOptimizedRoute(
      { config: config({ respectTime: false }), stops: [stop(a, 1)] },
      asFetch(okFetch())
    );
    expect(r.stops).toHaveLength(1);
    expect(r.totalKm).toBeGreaterThan(0);
  });

  it("sem OS válidas lança erro amigável", async () => {
    await expect(computeOptimizedRoute({ config: config(), stops: [] }, asFetch(okFetch()))).rejects.toThrowError(
      /Nenhuma OS/
    );
  });

  it("OSRM fora do ar: fallback heurístico sem quebrar", async () => {
    const a = order("1");
    const b = order("2");
    const r = await computeOptimizedRoute(
      { config: config({ respectTime: false }), stops: [stop(a, 3), stop(b, 1)] },
      failFetchAs()
    );
    expect(r.engine).toBe("heuristic-2opt");
    expect(r.roadBased).toBe(false);
    expect(r.stops.map((s) => s.order.number)).toEqual(["2", "1"]); // mais próxima primeiro
    expect(r.notes.join(" ")).toMatch(/heurística/i);
  });

  it("respeitar horários ancora a agenda e não gera avisos", async () => {
    const cedo = order("101", "08:00");
    const tarde = order("102", "14:00");
    const livre = order("103");
    // Livre fica colada à "cedo"; sem âncora o TSP passaria tarde antes.
    const stops = [stop(cedo, 1), stop(tarde, 50), stop(livre, 1.1)];
    const anchored = applyTimeAnchors(stops, { lat: 0, lng: 0 });
    expect(anchored.map((s) => s.order.number)).toEqual(["101", "103", "102"]);

    const r = await computeOptimizedRoute({ config: config({ respectTime: true }), stops }, failFetchAs());
    expect(r.stops.map((s) => s.order.number)).toEqual(["101", "103", "102"]);
    expect(r.timeWarnings).toEqual([]);
    expect(r.roadBased).toBe(false);
  });

  it("sem respeitar horários, conflito gera aviso", () => {
    const a = order("101", "14:00");
    const b = order("102", "08:00");
    // Ordem calculada passa b(08:00) depois de a(14:00) → OK; inverte para testar aviso.
    expect(detectTimeWarnings([stop(a, 1), stop(b, 2)])).toHaveLength(1);
    expect(detectTimeWarnings([stop(b, 2), stop(a, 1)])).toEqual([]);
  });

  it("usuário sem permissão: controlador só enxerga a lista recebida", async () => {
    // O controlador nunca busca OS por id — só ordena `stops` resolvidos pela tela
    // a partir do store isolado (RLS). Com lista vazia, recusa em vez de buscar.
    await expect(computeOptimizedRoute({ config: config(), stops: [] }, failFetchAs())).rejects.toThrow();
  });
});

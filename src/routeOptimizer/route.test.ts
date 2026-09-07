import { describe, expect, it, vi } from "vitest";
import { createServiceOrder } from "../domain/serviceOrder";
import type { ServiceOrder } from "../domain/serviceOrder";
import { computeOptimizedRoute, delayWarnings, initialOrderBySchedule, measuredInFixedOrder, minutesToTime, simulateTimeline, timeToMinutes } from "./route";
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
    serviceMinutes: 50,
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
  it("ordem inicial é cronológica, com métricas da malha viária", async () => {
    const a = order("1", "14:00");
    const b = order("2", "08:00");
    const c = order("3"); // sem horário e longe → entra no fim pelo menor desvio
    const r = await computeOptimizedRoute(
      { config: config(), stops: [stop(a, 0.01), stop(b, 0.02), stop(c, 5)] },
      asFetch(okFetch())
    );
    expect(r.stops.map((s) => s.order.number)).toEqual(["2", "1", "3"]);
    expect(r.engine).toBe("osrm-trip");
    expect(r.roadBased).toBe(true);
    expect(r.totalKm).toBeCloseTo(4, 5); // mock /route: 4000 m
    expect(r.legs[0].orderId).toBeNull();
    expect(r.legs).toHaveLength(4); // início + 3 OSs
    // Legs carregam o endereço digitado (o Maps recebe texto, não coordenada).
    expect(r.legs[1].address).toContain("Rua 2");
    expect(r.legs[0].address).toBe("Base");
  });

  it("retorno ao início fecha o circuito", async () => {
    const a = order("1");
    const b = order("2");
    const fetchFn = okFetch();
    const r = await computeOptimizedRoute(
      { config: config({ roundTrip: true }), stops: [stop(a, 1), stop(b, 2)] },
      asFetch(fetchFn)
    );
    expect(String(fetchFn.mock.calls[0][0])).toContain("/route/");
    expect(r.legs[r.legs.length - 1].point).toEqual(r.legs[0].point);
  });

  it("destino personalizado aparece por último", async () => {
    const a = order("1");
    const b = order("2");
    const end = { label: "Casa", address: "Casa", point: { lat: 9, lng: 9 }, source: "manual" as const };
    const fetchFn = okFetch();
    const r = await computeOptimizedRoute(
      { config: config({ end }), stops: [stop(a, 1), stop(b, 2)] },
      asFetch(fetchFn)
    );
    expect(String(fetchFn.mock.calls[0][0])).toContain("/route/");
    expect(r.stops).toHaveLength(2);
    expect(r.legs[r.legs.length - 1].label).toBe("Casa");
  });

  it("uma OS não otimiza: mede deslocamento direto", async () => {
    const a = order("1");
    const r = await computeOptimizedRoute(
      { config: config({ serviceMinutes: 50 }), stops: [stop(a, 1)] },
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

  it("roteador fora do ar: mede em linha reta sem reordenar", async () => {
    const a = order("1");
    const b = order("2");
    const r = await computeOptimizedRoute(
      { config: config({ serviceMinutes: 50 }), stops: [stop(a, 3), stop(b, 1)] },
      failFetchAs()
    );
    expect(r.engine).toBe("heuristic-2opt");
    expect(r.roadBased).toBe(false);
    expect(r.stops.map((s) => s.order.number)).toEqual(["1", "2"]); // sem horários: ordem de entrada
    expect(r.notes.join(" ")).toMatch(/linha reta/i);
  });

  it("ordenação inicial é cronológica; sem-horário entra pelo menor desvio", async () => {
    const a = order("101", "14:00");
    const b = order("102", "08:00");
    const livre = order("103"); // longe: vai para o fim
    const stops = [stop(a, 0.01), stop(b, 0.05), stop(livre, 5)];
    const r = await computeOptimizedRoute({ config: config(), stops }, failFetchAs());
    expect(r.stops.map((s) => s.order.number)).toEqual(["102", "101", "103"]);
    // Horários seguem explícitos no cronograma.
    expect(r.timeline.map((t) => t.scheduled)).toEqual(["08:00", "14:00", null]);
  });

  it("delayWarnings relata atraso com número, horário e ETA", () => {
    const a = order("101", "14:00");
    const b = order("102", "08:00");
    const timeline = simulateTimeline([stop(a, 1), stop(b, 2)], { lat: 0, lng: 0 });
    const warnings = delayWarnings(timeline, 50);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/OS 102.*08:00/);
  });

  it("usuário sem permissão: controlador só enxerga a lista recebida", async () => {
    // O controlador nunca busca OS por id - só ordena `stops` resolvidos pela tela
    // a partir do store isolado (RLS). Com lista vazia, recusa em vez de buscar.
    await expect(computeOptimizedRoute({ config: config(), stops: [] }, failFetchAs())).rejects.toThrow();
  });

  it("coordenadas duplicadas (mesmo endereço): todas visitadas, sem travar", async () => {
    const a = order("1");
    const b = order("2");
    const c = order("3");
    const r = await computeOptimizedRoute(
      { config: config({ serviceMinutes: 50 }), stops: [stop(a, 1), stop(b, 1), stop(c, 2)] },
      failFetchAs()
    );
    expect(r.stops.map((s) => s.order.number).sort()).toEqual(["1", "2", "3"]);
    expect(r.legs[0].orderId).toBeNull();
    expect(r.totalKm).toBeGreaterThanOrEqual(0);
  });

  it("volume (60 OSs, roteador fora): heurística completa e determinística", async () => {
    const stops = Array.from({ length: 60 }, (_, i) => {
      const o = order(`V${i}`);
      return stop(o, (i * 37) % 10, (i * 53) % 10);
    });
    const cfg = config({ serviceMinutes: 50 });
    const r1 = await computeOptimizedRoute({ config: cfg, stops }, failFetchAs());
    const r2 = await computeOptimizedRoute({ config: cfg, stops }, failFetchAs());
    expect(r1.stops).toHaveLength(60);
    expect(new Set(r1.stops.map((s) => s.orderId)).size).toBe(60);
    expect(r1.stops.map((s) => s.orderId)).toEqual(r2.stops.map((s) => s.orderId));
    expect(r1.engine).toBe("heuristic-2opt");
  });

  it("circuito com fallback local retorna ao início na métrica", async () => {    const a = order("1");
    const b = order("2");
    const r = await computeOptimizedRoute(
      { config: config({ roundTrip: true, serviceMinutes: 50 }), stops: [stop(a, 1), stop(b, 2)] },
      failFetchAs()
    );
    expect(r.legs[r.legs.length - 1].point).toEqual(r.legs[0].point);
    // Inclui a perna de retorno (0→1, 1→2, 2→0 em linha reta)
    expect(r.totalKm).toBeGreaterThan(0);
  });

  it("cronológica com livre no meio (menor desvio) e atraso sinalizado", async () => {
    const cedo = order("101", "08:00");
    const tarde = order("102", "08:30");
    const livre = order("103");
    const stops = [stop(cedo, 0.01), stop(tarde, 0.02), stop(livre, 0.015)];
    const r = await computeOptimizedRoute({ config: config(), stops }, failFetchAs());
    expect(r.stops.map((s) => s.order.number)).toEqual(["101", "103", "102"]);
    expect(r.timeline.map((t) => t.eta)).toEqual(["08:00", "08:51", "09:42"]);
    expect(r.timeline.map((t) => t.lateBy)).toEqual([0, 0, 72]);
    expect(r.suggestedDeparture).toBe("07:58");
    expect(r.timeWarnings).toHaveLength(1);
    expect(r.timeWarnings[0]).toMatch(/OS 102.*08:30.*09:42.*72 min/);
  });

  it("uma OS com horário sugere a saída sem avisos", async () => {
    const a = order("1", "09:00");
    const r = await computeOptimizedRoute(
      { config: config({ serviceMinutes: 50 }), stops: [stop(a, 0.01)] },
      failFetchAs()
    );
    expect(r.suggestedDeparture).toBe("08:58");
    expect(r.timeline).toHaveLength(1);
    expect(r.timeline[0].lateBy).toBe(0);
    expect(r.timeWarnings).toEqual([]);
  });

  it("simulateTimeline: sem horários não há cronograma", () => {
    const a = order("1");
    const t = simulateTimeline([stop(a, 0.01)], { lat: 0, lng: 0 });
    expect(t.entries).toEqual([]);
    expect(t.suggestedDepartureMin).toBeNull();
    expect(t.totalLate).toBe(0);
  });

  it("initialOrderBySchedule: sem horários mantém a entrada; empate desempatado", () => {
    const a = order("2");
    const b = order("1");
    expect(initialOrderBySchedule([stop(a, 1), stop(b, 2)], { lat: 0, lng: 0 }).map((s) => s.order.number)).toEqual([
      "2",
      "1",
    ]);
    // Mesmo horário: desempate por número.
    const c = order("2", "08:00");
    const d = order("1", "08:00");
    expect(initialOrderBySchedule([stop(c, 1), stop(d, 2)], { lat: 0, lng: 0 }).map((s) => s.order.number)).toEqual([
      "1",
      "2",
    ]);
  });

  it("timeToMinutes/minutesToTime: conversões", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(minutesToTime(510)).toBe("08:30");
    expect(minutesToTime(478)).toBe("07:58");
  });

  it("tempo de atendimento configurável altera o cronograma", () => {
    const cedo = order("101", "08:00");
    const tarde = order("102", "08:45");
    const stops = [stop(cedo, 0.01), stop(tarde, 0.02)];
    const t50 = simulateTimeline(stops, { lat: 0, lng: 0 }, 50);
    const t20 = simulateTimeline(stops, { lat: 0, lng: 0 }, 20);
    // Com 50min a OS 102 atrasa; com 20min chega no horário.
    expect(t50.entries[1].lateBy).toBeGreaterThan(0);
    expect(t20.entries[1].lateBy).toBe(0);
    expect(t20.entries[1].eta).not.toBe(t50.entries[1].eta);
  });

  it("remedição manual preserva a ordem dada e recalcula métricas", async () => {
    const a = order("1");
    const b = order("2");
    const cfg = config();
    const sa = stop(a, 0.02);
    const sb = stop(b, 0.01);
    // Ordem manual invertida (b antes de a) é respeitada, não reotimizada.
    const r = await measuredInFixedOrder(
      [sb, sa],
      [cfg.start.point, sb.point, sa.point],
      cfg,
      ["Ordem ajustada manualmente."],
      failFetchAs()
    );
    expect(r.stops.map((s) => s.order.number)).toEqual(["2", "1"]);
    expect(r.roadBased).toBe(false);
    expect(r.notes.join(" ")).toMatch(/manual/i);
    expect(r.totalKm).toBeGreaterThan(0);
  });
});

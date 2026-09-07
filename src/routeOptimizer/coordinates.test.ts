import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceOrder } from "../domain/serviceOrder";
import type { ServiceOrder } from "../domain/serviceOrder";
import type { GeocodeProvider } from "./geocode";
import { addressKey, cachedPoint, orderAddressText, storePoint } from "./geo";
import { resolveManyPoints } from "./coordinates";

const BASE = { contractor: "Banco X", receivedAt: "2026-09-01" };

function make(number: string, street: string, extra: Record<string, unknown> = {}): ServiceOrder {
  return createServiceOrder(
    {
      ...BASE,
      number,
      inspectionDate: "2026-09-07",
      address: { street, number: "10", city: "São Paulo", state: "SP" },
      ...extra,
    },
    []
  );
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

function fakeProvider(point: { lat: number; lng: number } | null = { lat: -23.5, lng: -46.6 }) {
  return {
    provider: { name: "fake", geocode: vi.fn(async () => point) } as GeocodeProvider,
    calls() {
      return (this.provider.geocode as ReturnType<typeof vi.fn>).mock.calls.length;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("coordinates (banco → cache → provider → persiste)", () => {
  it("reutiliza geo do banco sem chamar provider nem persistir", async () => {
    const o = make("1", "Rua A");
    const key = addressKey(orderAddressText(o));
    const stored = { ...o, geo: { latitude: -23.5, longitude: -46.6 }, geocodedAddress: key };
    const f = fakeProvider();
    const persist = vi.fn(async (_orderId: string, _geo: { latitude: number; longitude: number }, _key: string) => {});
    const r = await resolveManyPoints([stored], { provider: f.provider, persist });
    expect(r.stops).toHaveLength(1);
    expect(r.stops[0].source).toBe("stored");
    expect(r.invalid).toEqual([]);
    expect(f.calls()).toBe(0);
    expect(persist).not.toHaveBeenCalled();
  });

  it("endereço alterado invalida a coordenada armazenada", async () => {
    const o = make("1", "Rua Nova"); // geocodedAddress refere-se ao endereço antigo
    const stale = { ...o, geo: { latitude: -23.5, longitude: -46.6 }, geocodedAddress: "rua antiga 10" };
    const f = fakeProvider({ lat: -23.6, lng: -46.7 });
    const r = await resolveManyPoints([stale], { provider: f.provider });
    expect(f.calls()).toBe(1);
    expect(r.stops[0].point).toEqual({ lat: -23.6, lng: -46.7 });
    expect(r.stops[0].source).not.toBe("stored");
  });

  it("cache local evita o provider e persiste no banco", async () => {
    const o = make("1", "Rua B");
    storePoint(orderAddressText(o), { lat: -23.5, lng: -46.6 });
    expect(cachedPoint(orderAddressText(o))).not.toBeNull();
    const f = fakeProvider();
    const persist = vi.fn(async (_orderId: string, _geo: { latitude: number; longitude: number }, _key: string) => {});
    const r = await resolveManyPoints([o], { provider: f.provider, persist });
    expect(f.calls()).toBe(0);
    expect(r.stops[0].source).toBe("cache");
    expect(persist).toHaveBeenCalledTimes(1);
    const [orderId, geo, key] = persist.mock.calls[0] as [string, { latitude: number }, string];
    expect(orderId).toBe(o.id);
    expect(geo).toEqual({ latitude: -23.5, longitude: -46.6 });
    expect(key).toBe(addressKey(orderAddressText(o)));
  });

  it("provider com sucesso alimenta cache e banco", async () => {
    const o = make("1", "Rua C");
    const f = fakeProvider({ lat: -23.1, lng: -46.1 });
    const persist = vi.fn(async (_orderId: string, _geo: { latitude: number; longitude: number }, _key: string) => {});
    const r = await resolveManyPoints([o], { provider: f.provider, persist });
    expect(f.calls()).toBe(1);
    expect(r.stops[0].point).toEqual({ lat: -23.1, lng: -46.1 });
    expect(cachedPoint(orderAddressText(o))).toEqual({ lat: -23.1, lng: -46.1 });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("provider null ou com erro → OS inválida, sem quebrar", async () => {
    const f = fakeProvider(null);
    const r1 = await resolveManyPoints([make("1", "Rua X")], { provider: f.provider });
    expect(r1.stops).toEqual([]);
    expect(r1.invalid.map((x) => x.order.number)).toEqual(["1"]);

    const throwing = { name: "fake", geocode: vi.fn(async () => { throw new Error("rede"); }) } as GeocodeProvider;
    const r2 = await resolveManyPoints([make("2", "Rua Y")], { provider: throwing });
    expect(r2.invalid.map((x) => x.order.number)).toEqual(["2"]);
  });

  it("erro de persistência (RLS/rede/OS terminal) não quebra a rota", async () => {
    const o = make("1", "Rua D");
    const f = fakeProvider();
    const persist = vi.fn(async () => { throw new Error("RLS"); });
    const r = await resolveManyPoints([o], { provider: f.provider, persist });
    expect(r.stops).toHaveLength(1); // segue com a coordenada em memória
    expect(r.invalid).toEqual([]);
  });

  it("múltiplas OSs no mesmo endereço = uma chamada ao provider", async () => {
    const a = make("1", "Rua Mesma");
    const b = make("2", "Rua Mesma");
    const f = fakeProvider({ lat: -23.9, lng: -46.9 });
    const persist = vi.fn(async (_orderId: string, _geo: { latitude: number; longitude: number }, _key: string) => {});
    const progress: [number, number][] = [];
    const r = await resolveManyPoints([a, b], {
      provider: f.provider,
      persist,
      onProgress: (d, t) => void progress.push([d, t]),
    });
    expect(f.calls()).toBe(1);
    expect(r.stops).toHaveLength(2);
    expect(r.stops[0].point).toEqual(r.stops[1].point);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(progress[progress.length - 1]).toEqual([1, 1]); // 1 endereço único
  });

  it("ordem de entrada preservada e progresso por endereço único", async () => {
    const a = make("3", "Rua Z");
    const b = make("1", "Rua Z"); // mesmo endereço de a
    const c = make("2", "Rua W");
    const f = fakeProvider();
    const seen: [number, number][] = [];
    const r = await resolveManyPoints([a, b, c], {
      provider: f.provider,
      onProgress: (d, t) => void seen.push([d, t]),
    });
    expect(f.calls()).toBe(2);
    expect(r.stops.map((s) => s.order.number)).toEqual(["3", "1", "2"]);
    expect(seen[seen.length - 1]).toEqual([2, 2]);
  });
});

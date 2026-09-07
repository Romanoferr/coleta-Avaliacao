import { describe, expect, it, vi } from "vitest";
import { GeocodeError, createNominatimProvider, geocodeAddress } from "./geocode";

function jsonFetch(payload: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => payload })) as unknown as typeof fetch;
}

describe("nominatim provider", () => {
  it("mapeia lat/lon e retorna null quando vazio", async () => {
    const p = createNominatimProvider({ fetchFn: jsonFetch([{ lat: "-23.5", lon: "-46.6" }]), timeoutMs: 1000, minIntervalMs: 0 });
    expect(await p.geocode("Rua A, 1")).toEqual({ lat: -23.5, lng: -46.6 });
    const empty = createNominatimProvider({ fetchFn: jsonFetch([]), timeoutMs: 1000, minIntervalMs: 0 });
    expect(await empty.geocode("Rua Inexistente")).toBeNull();
  });

  it("resultado inválido (0,0) vira null", async () => {
    const p = createNominatimProvider({ fetchFn: jsonFetch([{ lat: "0", lon: "0" }]), timeoutMs: 1000, minIntervalMs: 0 });
    expect(await p.geocode("Lugar nenhum")).toBeNull();
  });

  it("HTTP erro e falha de rede viram GeocodeError", async () => {
    const bad = createNominatimProvider({ fetchFn: jsonFetch({}, false), timeoutMs: 1000, minIntervalMs: 0 });
    await expect(bad.geocode("Rua A")).rejects.toThrowError(GeocodeError);
    const down = createNominatimProvider({
      fetchFn: (async () => { throw new Error("down"); }) as unknown as typeof fetch,
      timeoutMs: 1000,
      minIntervalMs: 0,
    });
    await expect(down.geocode("Rua A")).rejects.toThrowError(GeocodeError);
  });

  it("endereço vazio retorna null sem rede", async () => {
    const fetchFn = jsonFetch([]);
    const p = createNominatimProvider({ fetchFn, timeoutMs: 1000, minIntervalMs: 0 });
    expect(await p.geocode("   ")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("atalho legado lança quando não localiza", async () => {
    await expect(geocodeAddress("   ")).rejects.toThrowError(GeocodeError);
  });
});

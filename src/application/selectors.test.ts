import { describe, expect, it } from "vitest";
import { createServiceOrder } from "../domain/serviceOrder";
import type { CreateOrderInput } from "../domain/serviceOrder";
import { filterOrders, sortOrders } from "./selectors";

const BASE = { contractor: "Banco X", receivedAt: "2026-09-01" };
let seq = 0;

function make(over: Partial<CreateOrderInput> = {}) {
  seq++;
  return createServiceOrder({ ...BASE, number: `T${seq}`, inspectionDate: null, ...over }, []);
}

const baseFilters = { search: "", status: "all" as const, quick: "none" as const };

describe("selectors (filtros por data)", () => {
  it("recebimento de/até (inclusivo)", () => {
    const a = make({ receivedAt: "2026-09-01" });
    const b = make({ receivedAt: "2026-09-10" });
    const c = make({ receivedAt: "2026-09-20" });
    const list = [a, b, c];
    expect(filterOrders(list, { ...baseFilters, receivedFrom: "2026-09-10" }).map((o) => o.number)).toEqual([
      b.number,
      c.number,
    ]);
    expect(filterOrders(list, { ...baseFilters, receivedTo: "2026-09-10" }).map((o) => o.number)).toEqual([
      a.number,
      b.number,
    ]);
    expect(
      filterOrders(list, { ...baseFilters, receivedFrom: "2026-09-05", receivedTo: "2026-09-15" }).map((o) => o.number)
    ).toEqual([b.number]);
  });

  it("vistoria de/até; 'a agendar' fica de fora quando filtrado", () => {
    const a = make({ inspectionDate: "2026-09-05" });
    const b = make({ inspectionDate: "2026-09-12" });
    const c = make({ inspectionDate: null });
    const list = [a, b, c];
    expect(filterOrders(list, { ...baseFilters, inspectionFrom: "2026-09-10" }).map((o) => o.number)).toEqual([
      b.number,
    ]);
    expect(filterOrders(list, { ...baseFilters, inspectionTo: "2026-09-10" }).map((o) => o.number)).toEqual([
      a.number,
    ]);
    expect(filterOrders(list, baseFilters)).toHaveLength(3); // sem filtro, tudo passa
  });

  it("conclusão até; sem prazo fica de fora quando filtrado", () => {
    const a = make({ dueDate: "2026-09-08" });
    const b = make({ dueDate: "2026-09-30" });
    const c = make({ dueDate: null });
    expect(
      filterOrders([a, b, c], { ...baseFilters, dueUntil: "2026-09-10" }).map((o) => o.number)
    ).toEqual([a.number]);
  });

  it("conclusão a partir de; entre combina os dois limites", () => {
    const a = make({ dueDate: "2026-09-08" });
    const b = make({ dueDate: "2026-09-20" });
    const c = make({ dueDate: null });
    expect(
      filterOrders([a, b, c], { ...baseFilters, dueFrom: "2026-09-10" }).map((o) => o.number)
    ).toEqual([b.number]);
    expect(
      filterOrders([a, b, c], { ...baseFilters, dueFrom: "2026-09-01", dueUntil: "2026-09-10" }).map(
        (o) => o.number
      )
    ).toEqual([a.number]);
  });

  it("combina com status e busca", () => {
    const a = make({ receivedAt: "2026-09-02", inspectionDate: "2026-09-06" });
    const list = [a];
    expect(
      filterOrders(list, { ...baseFilters, status: "received", receivedFrom: "2026-09-01" })
    ).toHaveLength(1);
    expect(
      filterOrders(list, { ...baseFilters, status: "scheduled", receivedFrom: "2026-09-01" })
    ).toHaveLength(0);
  });

  it("ordena por recebimento (mais recentes primeiro)", () => {
    const a = make({ receivedAt: "2026-09-01" });
    const b = make({ receivedAt: "2026-09-20" });
    const c = make({ receivedAt: "2026-09-10" });
    expect(sortOrders([a, b, c], "received").map((o) => o.number)).toEqual([
      b.number,
      c.number,
      a.number,
    ]);
  });

  it("ordena por conclusão (prazo mais próximo; sem prazo por último)", () => {
    const a = make({ dueDate: "2026-09-30" });
    const b = make({ dueDate: "2026-09-08" });
    const c = make({ dueDate: null });
    expect(sortOrders([a, b, c], "due").map((o) => o.number)).toEqual([
      b.number,
      a.number,
      c.number,
    ]);
  });
});

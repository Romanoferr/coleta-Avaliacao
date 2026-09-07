import { describe, expect, it } from "vitest";
import { createServiceOrder } from "../domain/serviceOrder";
import { ordersForDate, ordersWithoutAddress } from "./select";

const BASE = { contractor: "Banco X", receivedAt: "2026-09-01" };

function make(number: string, inspectionDate: string | null, street?: string, time?: string) {
  return createServiceOrder(
    {
      ...BASE,
      number,
      inspectionDate,
      ...(time ? { inspectionTime: time } : {}),
      ...(street ? { address: { street, number: "10", city: "São Paulo", state: "SP" } } : {}),
    },
    []
  );
}

describe("select", () => {
  it("filtra pela data e exige endereço válido", () => {
    const a = make("1", "2026-09-07", "Rua A");
    const b = make("2", "2026-09-07"); // sem endereço
    const c = make("3", "2026-09-08", "Rua C");
    expect(ordersForDate([a, b, c], "2026-09-07").map((o) => o.number)).toEqual(["1"]);
  });

  it("exclui OS deletadas", () => {
    const a = make("1", "2026-09-07", "Rua A");
    const deleted = { ...a, deletedAt: "2026-09-01T00:00:00.000Z", number: "9" };
    expect(ordersForDate([a, deleted], "2026-09-07").map((o) => o.number)).toEqual(["1"]);
  });

  it("ordena por horário e depois por número", () => {
    const a = make("3", "2026-09-07", "Rua A", "14:00");
    const b = make("1", "2026-09-07", "Rua B", "08:00");
    const c = make("2", "2026-09-07", "Rua C");
    expect(ordersForDate([a, b, c], "2026-09-07").map((o) => o.number)).toEqual(["2", "1", "3"]);
  });

  it("lista OS sem endereço para o alerta", () => {
    const a = make("1", "2026-09-07");
    expect(ordersWithoutAddress([a], "2026-09-07").map((o) => o.number)).toEqual(["1"]);
  });

  it("opera só sobre a lista recebida (isolamento por usuário vem do store/RLS)", () => {
    expect(ordersForDate([], "2026-09-07")).toEqual([]);
  });
});

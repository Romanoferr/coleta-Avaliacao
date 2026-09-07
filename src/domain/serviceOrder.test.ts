import { describe, expect, it } from "vitest";
import { DomainError } from "./ids";
import {
  canTransition,
  changeServiceOrderStatus,
  createServiceOrder,
  isOrderOverdue,
  isValidGeo,
  normalizeOrderNumber,
  normalizeStoredOrder,
  reopenServiceOrder,
  softDeleteServiceOrder,
  updateServiceOrder,
  validateOrderInput,
} from "./serviceOrder";

const BASE = { number: "1234", contractor: "Banco X", receivedAt: "2026-09-01" };

describe("serviceOrder", () => {
  it("cria OS válida com defaults", () => {
    const o = createServiceOrder(BASE, []);
    expect(o.number).toBe("1234");
    expect(o.status).toBe("received");
    expect(o.inspectionId).toBeNull();
    expect(o.deletedAt).toBeNull();
    expect(o.id).toMatch(/^[0-9a-f-]{36}$/); // UUID puro (compatível com uuid do banco)
    expect(o.statusHistory).toHaveLength(1);
  });

  it("normaliza número e rejeita duplicado (case-insensitive)", () => {
    expect(normalizeOrderNumber("  12  34  ")).toBe("12 34");
    const o = createServiceOrder(BASE, []);
    const errs = validateOrderInput({ number: " 1234 " }, [o]);
    expect(errs.number).toMatch(/existe/i);
  });

  it("exige number/contractor/receivedAt", () => {
    expect(() => createServiceOrder({ number: "", contractor: "X", receivedAt: "2026-09-01" }, [])).toThrowError(DomainError);
    expect(() => createServiceOrder({ number: "1", contractor: "  ", receivedAt: "2026-09-01" }, [])).toThrowError(DomainError);
    expect(() => createServiceOrder({ number: "1", contractor: "X", receivedAt: "x" }, [])).toThrowError(DomainError);
  });

  it("rejeita dueDate anterior ao recebimento", () => {
    expect(() =>
      createServiceOrder({ ...BASE, number: "2", dueDate: "2026-08-01" }, [])
    ).toThrowError(DomainError);
  });

  it("máquina de status: transições válidas e inválidas", () => {
    expect(canTransition("received", "scheduled")).toBe(true);
    expect(canTransition("received", "completed")).toBe(false);
    const o = createServiceOrder(BASE, []);
    // Agendar exige data de vistoria
    expect(() => changeServiceOrderStatus(o, "scheduled")).toThrowError(/vistoria/);
    const dated = { ...o, inspectionDate: "2026-09-05" };
    const s1 = changeServiceOrderStatus(dated, "scheduled");
    expect(s1.statusHistory).toHaveLength(2);
    const s2 = changeServiceOrderStatus({ ...s1, inspectionId: "x" }, "inspected");
    expect(s2.status).toBe("inspected");
    expect(() => changeServiceOrderStatus(s2, "received")).toThrowError(DomainError);
  });

  it("terminal não edita nem transiciona; reabertura é explícita", () => {
    const o = createServiceOrder(BASE, []);
    const done = changeServiceOrderStatus({ ...o, status: "drafting" }, "completed");
    expect(() => updateServiceOrder(done, { contractor: "Y" }, [])).toThrowError(/somente leitura/);
    expect(() => changeServiceOrderStatus(done, "inspected")).toThrowError(DomainError);
    const re = reopenServiceOrder(done, "inspected");
    expect(re.status).toBe("inspected");
    expect(re.statusHistory[re.statusHistory.length - 1]?.note).toBe("Reaberta");
    expect(() => reopenServiceOrder(re, "received")).toThrowError(/Só OS concluída/);
  });

  it("soft-delete e overdue", () => {
    const o = createServiceOrder({ ...BASE, dueDate: "2026-09-02" }, []);
    expect(isOrderOverdue(o, "2026-09-10")).toBe(true);
    expect(isOrderOverdue(o, "2026-09-01")).toBe(false);
    const del = softDeleteServiceOrder(o);
    expect(del.deletedAt).not.toBeNull();
    expect(isOrderOverdue(del, "2026-09-10")).toBe(false);
  });

  it("geo: cria nulo, valida faixa e atualiza via patch", () => {
    const o = createServiceOrder(BASE, []);
    expect(o.geo).toBeNull();
    expect(o.geocodedAddress).toBeNull();
    expect(isValidGeo({ latitude: -23.5, longitude: -46.6 })).toBe(true);
    expect(isValidGeo({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isValidGeo({ latitude: 91, longitude: 0 })).toBe(false);
    expect(validateOrderInput({ geo: { latitude: 91, longitude: 0 } }, [])).toHaveProperty("geo");
    const g = updateServiceOrder(
      o,
      { geo: { latitude: -23.5, longitude: -46.6 }, geocodedAddress: "rua a 10" },
      []
    );
    expect(g.geo).toEqual({ latitude: -23.5, longitude: -46.6 });
    expect(g.geocodedAddress).toBe("rua a 10");
  });

  it("normalizeStoredOrder tolera snapshot legado sem geo", () => {
    const legacy = { ...createServiceOrder(BASE, []) } as Record<string, unknown>;
    delete legacy.geo;
    delete legacy.geocodedAddress;
    const n = normalizeStoredOrder(legacy as never);
    expect(n.geo).toBeNull();
    expect(n.geocodedAddress).toBeNull();
  });
});

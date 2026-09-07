import { describe, expect, it } from "vitest";
import { DomainError } from "./ids";
import { createInspection, finishInspection, goToInspectionSection, setInspectionAnswer } from "./inspection";

describe("inspection", () => {
  it("só nasce de uma OS", () => {
    expect(() => createInspection("", "apartment")).toThrowError(DomainError);
    const i = createInspection("order-1", "land", { identificacao: { data_vistoria: "2026-09-05" } });
    expect(i.orderId).toBe("order-1");
    expect(i.status).toBe("draft");
    expect(i.schemaVersion).toBe(1);
    expect(i.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("resposta, seção e conclusão", () => {
    const i = createInspection("o", "apartment");
    const a = setInspectionAnswer(i, "s", "f", "x");
    expect(a.data.s?.f).toBe("x");
    expect(a.updatedAt).not.toBe("");
    const g = goToInspectionSection(a, 3);
    expect(g.currentSectionIndex).toBe(3);
    expect(goToInspectionSection(g, -9).currentSectionIndex).toBe(0);
    const f = finishInspection(g);
    expect(f.status).toBe("finished");
    expect(f.finishedAt).not.toBeNull();
  });
});

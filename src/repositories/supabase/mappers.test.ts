import { describe, expect, it } from "vitest";
import { DomainError } from "../../domain/ids";
import type { InspectionRow, OrderRow } from "../../infrastructure/supabase/database.types";
import { documentFromRow, inspectionFromRow, orderFromRow } from "./mappers";

const baseOrder: OrderRow = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "99999999-9999-4999-8999-999999999999",
  number: "1001",
  contractor: "Banco X",
  received_date: "2026-09-01",
  inspection_date: "2026-09-05",
  inspection_time: "09:30:00",
  due_date: null,
  address: { street: "Rua A", number: "1", nope: 42 },
  contact_name: "  ",
  contact_phone: "(43) 99999-0001",
  notes: "",
  status: "scheduled",
  status_history: [{ from: "received", to: "scheduled", at: "2026-09-02T10:00:00Z" }, { bogus: true }],
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
  deleted_at: null,
  latitude: null,
  longitude: null,
  geocoded_at: null,
};

describe("mappers supabase", () => {
  it("order: snake→camel, time fatiado, JSON defensivo", () => {
    const o = orderFromRow(baseOrder);
    expect(o.receivedAt).toBe("2026-09-01");
    expect(o.inspectionTime).toBe("09:30");
    expect(o.address).toMatchObject({ street: "Rua A", number: "1" });
    expect(o.contactName).toBeNull(); // "  " → null
    expect(o.notes).toBeNull(); // "" → null
    expect(o.statusHistory).toHaveLength(1); // entrada inválida descartada
    expect(o.inspectionId).toBeNull(); // vínculo canônico vive em inspections
  });

  it("order: enum desconhecido vira CORRUPT (nunca crash)", () => {
    expect(() => orderFromRow({ ...baseOrder, status: "flying" as never })).toThrowError(DomainError);
  });

  it("inspection: data preservada, versão mantida", () => {
    const row: InspectionRow = {
      id: "a",
      order_id: "b",
      owner_id: "99999999-9999-4999-8999-999999999999",
      property_type: "land",
      status: "draft",
      schema_version: 1,
      form_version: 1,
      current_section: 2,
      data: { identificacao: { data_vistoria: "2026-09-05" } },
      started_at: "2026-09-01T10:00:00Z",
      finished_at: null,
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-02T10:00:00Z",
      deleted_at: null,
    };
    const i = inspectionFromRow(row);
    expect(i.currentSectionIndex).toBe(2);
    expect(i.data.identificacao).toMatchObject({ data_vistoria: "2026-09-05" });
    expect(i.schemaVersion).toBe(1);
  });

  it("document: storage_status inválido cai para pending_storage", () => {
    const d = documentFromRow({
      id: "d",
      order_id: "o",
      owner_id: "99999999-9999-4999-8999-999999999999",
      name: "X",
      kind: "photo",
      provider: "cloudflare_r2",
      mime_type: null,
      size_bytes: null,
      storage_key: null,
      file_url: null,
      storage_status: "weird" as never,
      created_at: "2026-09-01T10:00:00Z",
      deleted_at: null,
    });
    expect(d.storageStatus).toBe("pending_storage");
    expect(d.provider).toBe("cloudflare_r2");
  });
});

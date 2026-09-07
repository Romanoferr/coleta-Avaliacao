import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "../../domain/ids";
import { RepoError } from "../errors";
import { createLocalRepos } from "./localRepos";
import type { StorageLike } from "./localRepos";

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("local repositories (contrato válido para qualquer backend)", () => {
  let storage: StorageLike;
  let repos: ReturnType<typeof createLocalRepos>;

  beforeEach(() => {
    storage = memoryStorage();
    repos = createLocalRepos(storage);
  });

  it("OS: create/get/list/update com conflito otimista", async () => {
    const created = await repos.orders.create({ number: "10", contractor: "B", receivedAt: "2026-09-01" });
    expect(created.id).toBeTruthy();
    expect(await repos.orders.get(created.id)).toMatchObject({ number: "10" });
    expect(await repos.orders.list()).toHaveLength(1);

    // duplicado → DomainError com erro de campo (mesma forma da UI)
    await expect(repos.orders.create({ number: "10", contractor: "C", receivedAt: "2026-09-01" })).rejects.toMatchObject({
      name: "DomainError",
    });

    const updated = await repos.orders.update(created.id, { contractor: "B2" }, created.updatedAt);
    expect(updated.contractor).toBe("B2");
    await expect(repos.orders.update(created.id, { contractor: "B3" }, created.updatedAt)).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies { code: string });
  });

  it("ficha: uma por OS, busca por order", async () => {
    const o = await repos.orders.create({ number: "20", contractor: "B", receivedAt: "2026-09-01" });
    const f = await repos.inspections.create({ orderId: o.id, propertyType: "apartment", data: { a: { b: "x" } } });
    expect(f.data.a).toMatchObject({ b: "x" });
    await expect(repos.inspections.create({ orderId: o.id, propertyType: "land" })).rejects.toBeInstanceOf(RepoError);
    expect(await repos.inspections.getByOrderId(o.id)).toMatchObject({ id: f.id });
    const refs = await repos.inspections.listRefs();
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ orderId: o.id, propertyType: "apartment", status: "draft" });
  });

  it("documentos: metadados e soft-delete", async () => {
    const o = await repos.orders.create({ number: "30", contractor: "B", receivedAt: "2026-09-01" });
    await expect(repos.documents.create(o.id, { name: "  ", kind: "photo" })).rejects.toBeInstanceOf(DomainError);
    const d = await repos.documents.create(o.id, { name: "Matrícula", kind: "matricula" });
    expect(d.storageStatus).toBe("pending_storage");
    expect(await repos.documents.listByOrder(o.id)).toHaveLength(1);
    await repos.documents.softDelete(d.id);
    expect(await repos.documents.listByOrder(o.id)).toHaveLength(0);
  });
});

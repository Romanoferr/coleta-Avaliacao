/**
 * Documento relacionado à OS — nesta etapa, SOMENTE metadados.
 * `storageKey` é null até existir storage real; o acesso a bytes passará
 * por uma porta (StoragePort) futura. Nada aqui conhece provedor algum.
 */
import { DomainError, newId, nowIso } from "./ids";

export type DocumentKind = "photo" | "contract" | "matricula" | "report" | "other";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  photo: "Foto",
  contract: "Contrato",
  matricula: "Matrícula",
  report: "Laudo/relatório",
  other: "Outro",
};

export type DocumentStorageStatus = "pending_storage" | "stored";

export interface DocumentMeta {
  id: string;
  orderId: string;
  name: string;
  kind: DocumentKind;
  mimeType: string | null;
  sizeBytes: number | null;
  storageKey: string | null;
  storageStatus: DocumentStorageStatus;
  createdAt: string;
  deletedAt: string | null;
}

export function createDocumentMeta(
  orderId: string,
  input: { name: string; kind: DocumentKind },
  now = nowIso()
): DocumentMeta {
  if (!orderId) throw new DomainError("NO_ORDER", "Documento pertence a uma OS.");
  const name = input.name.trim();
  if (!name) throw new DomainError("INVALID_DOCUMENT", "Informe o nome do documento.", { name: "Informe o nome do documento." });
  return {
    id: newId("doc"),
    orderId,
    name,
    kind: input.kind,
    mimeType: null,
    sizeBytes: null,
    storageKey: null,
    storageStatus: "pending_storage",
    createdAt: now,
    deletedAt: null,
  };
}

export function softDeleteDocument(doc: DocumentMeta, now = nowIso()): DocumentMeta {
  if (doc.deletedAt !== null) return doc;
  return { ...doc, deletedAt: now };
}

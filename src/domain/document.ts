/**
 * Documento relacionado à OS — SOMENTE metadados + referência ao arquivo.
 * Os bytes vivem no Cloudflare R2 (decisão de arquitetura); o Supabase
 * guarda provider + chave (+ URL pública quando houver). O acesso aos bytes
 * passará por URLs do R2 (futuro Worker com URLs pré-assinadas).
 * Nada aqui conhece provedor algum.
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

/** Onde vivem os bytes. R2 é o primário; demais valores para exceções. */
export type DocumentProvider = "cloudflare_r2" | "supabase_storage" | "external_url";

export const DOCUMENT_PROVIDER_LABEL: Record<DocumentProvider, string> = {
  cloudflare_r2: "Cloudflare R2",
  supabase_storage: "Supabase Storage",
  external_url: "Link externo",
};

export type DocumentStorageStatus = "pending_storage" | "stored";

export interface DocumentMeta {
  id: string;
  orderId: string;
  name: string;
  kind: DocumentKind;
  /** Provedor dos bytes. Default: R2. */
  provider: DocumentProvider;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Chave do objeto no provedor. Convenção R2: documents/{order_id}/{document_id}/{filename} */
  storageKey: string | null;
  /** URL pública/pré-assinada em cache (quando houver). */
  fileUrl: string | null;
  storageStatus: DocumentStorageStatus;
  createdAt: string;
  deletedAt: string | null;
}

const PROVIDERS: readonly string[] = ["cloudflare_r2", "supabase_storage", "external_url"];

export function createDocumentMeta(
  orderId: string,
  input: { name: string; kind: DocumentKind; provider?: DocumentProvider; fileUrl?: string | null },
  now = nowIso()
): DocumentMeta {
  if (!orderId) throw new DomainError("NO_ORDER", "Documento pertence a uma OS.");
  const name = input.name.trim();
  if (!name) throw new DomainError("INVALID_DOCUMENT", "Informe o nome do documento.", { name: "Informe o nome do documento." });
  const provider = input.provider && (PROVIDERS as readonly string[]).includes(input.provider)
    ? input.provider
    : "cloudflare_r2";
  const fileUrl = input.fileUrl?.trim() ? (input.fileUrl as string).trim() : null;
  return {
    id: newId(),
    orderId,
    name,
    kind: input.kind,
    provider,
    mimeType: null,
    sizeBytes: null,
    storageKey: null,
    fileUrl,
    storageStatus: "pending_storage",
    createdAt: now,
    deletedAt: null,
  };
}

export function softDeleteDocument(doc: DocumentMeta, now = nowIso()): DocumentMeta {
  if (doc.deletedAt !== null) return doc;
  return { ...doc, deletedAt: now };
}

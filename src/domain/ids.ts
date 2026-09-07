/** Identidades e relógios do domínio. Puro, sem dependência de UI ou storage. */

/**
 * Identidade técnica: UUID v4 puro (compatível com `uuid` do PostgreSQL).
 * O id nunca é exibido ao usuário — o número comercial da OS vive em `number`.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback (navegadores muito antigos): UUID v4 pseudo-aleatório.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Data local de hoje em yyyy-mm-dd (para agenda/prazos, sem fuso). */
export function todayLocalIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isValidDateIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

export function isValidTimeHHMM(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** Erro de regra de negócio. A UI traduz `code` em mensagem amigável. */
export class DomainError extends Error {
  code: string;
  fields?: Record<string, string>;
  constructor(code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fields = fields;
  }
}

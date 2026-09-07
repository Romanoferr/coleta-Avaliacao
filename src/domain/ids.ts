/** Identidades e relógios do domínio. Puro, sem dependência de UI ou storage. */

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  return `${prefix}_${rand}`;
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

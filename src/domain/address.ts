/**
 * Endereço como objeto de valor.
 * Estruturado para permitir agenda/rota futura, com escape `raw`
 * para quando a OS chega com endereço incompleto ("próximo ao mercado").
 * Todos os campos opcionais: endereço ausente bloqueia só a agenda,
 * nunca a criação da OS.
 */
export interface Address {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  /** Texto corrido quando não dá para decompor. */
  raw?: string | null;
}

export const EMPTY_ADDRESS: Address = {};

function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** Linha(s) exibível(is) do endereço. Prioriza partes; cai para `raw`. */
export function formatAddress(a: Address | null | undefined): string {
  if (!a) return "";
  const streetLine = [clean(a.street), clean(a.number)].filter(Boolean).join(", ");
  const parts = [
    streetLine,
    clean(a.complement),
    clean(a.district),
    [clean(a.city), clean(a.state)].filter(Boolean).join("/"),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" - ");
  return clean(a.raw);
}

export function isAddressEmpty(a: Address | null | undefined): boolean {
  return formatAddress(a) === "";
}

/** Normaliza um Address vindo de formulário ("" vira null). */
export function normalizeAddress(a: Address): Address {
  const out: Address = {};
  (Object.keys(a) as (keyof Address)[]).forEach((k) => {
    const v = clean(a[k]);
    if (v) out[k] = v;
  });
  return out;
}

/**
 * Helpers de exibição de respostas (legado v0 removido: o hook useEvaluation
 * foi aposentado quando a OS virou a entidade central; a leitura do rascunho
 * antigo vive em persistence/migrateV0.ts).
 */
export function formatAnswer(value: string | number | string[] | undefined): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join("; ") : "—";
  return String(value);
}

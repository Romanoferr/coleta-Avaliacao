/**
 * Migração v0 → v1 (única, idempotente por construção: roda só quando
 * existe rascunho legado E o db ainda está vazio; a chave antiga é preservada).
 *
 * v0: Evaluation solto em "coleta-avaliacao:current", com "O.S. Nº" digitado
 *     dentro da ficha (identificacao.os).
 * v1: ServiceOrder (number = valor da ficha) + Inspection vinculada.
 */
import type { EvaluationData, PropertyType } from "../form-engine/types";
import { isValidDateIso, nowIso, todayLocalIso } from "../domain/ids";
import type { Inspection } from "../domain/inspection";
import { createInspection } from "../domain/inspection";
import type { ServiceOrder } from "../domain/serviceOrder";
import { createServiceOrder } from "../domain/serviceOrder";

export const LEGACY_KEY = "coleta-avaliacao:current";

interface LegacyEvaluation {
  id?: string;
  propertyType?: PropertyType;
  startedAt?: string;
  data?: EvaluationData;
  finished?: boolean;
  currentSectionIndex?: number;
}

export function readLegacyEvaluation(): LegacyEvaluation | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyEvaluation;
    if (!parsed || (parsed.propertyType !== "apartment" && parsed.propertyType !== "land" && parsed.propertyType !== "house"))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function datePart(iso: string | undefined): string {
  if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  return todayLocalIso();
}

function sectionText(data: EvaluationData | undefined, sectionId: string, fieldId: string): string {
  const v = data?.[sectionId]?.[fieldId];
  return typeof v === "string" ? v.trim() : "";
}

/** Constrói Order + Inspection a partir do rascunho legado. null = nada a migrar. */
export function migrateLegacyToV1(legacy: LegacyEvaluation | null): { order: ServiceOrder; inspection: Inspection } | null {
  if (!legacy || !legacy.propertyType || legacy.propertyType === "house") return null;
  const now = nowIso();
  const data = legacy.data ?? {};
  const rawNumber = sectionText(data, "identificacao", "os");
  const contractor =
    sectionText(data, "identificacao", "cliente") ||
    sectionText(data, "identificacao", "empresa") ||
    "A identificar";
  const fichaDate =
    sectionText(data, "identificacao", "data") || sectionText(data, "identificacao", "data_vistoria");
  const order = createServiceOrder(
    {
      number: rawNumber || `SEM-NUMERO-${(legacy.id ?? "x").slice(-4).toUpperCase()}`,
      contractor,
      receivedAt: datePart(legacy.startedAt),
      inspectionDate: isValidDateIso(fichaDate) ? fichaDate : null,
    },
    [],
    now
  );
  const inspection: Inspection = {
    ...createInspection(order.id, legacy.propertyType, data, legacy.startedAt ?? now),
    currentSectionIndex: legacy.currentSectionIndex ?? 0,
    ...(legacy.finished
      ? { status: "finished" as const, finishedAt: now }
      : {}),
  };
  return {
    order: legacy.finished
      ? {
          ...order,
          status: "inspected" as const,
          statusHistory: [
            ...order.statusHistory,
            { from: "received" as const, to: "inspected" as const, at: now, note: "Migrada com ficha concluída" },
          ],
        }
      : order,
    inspection,
  };
}

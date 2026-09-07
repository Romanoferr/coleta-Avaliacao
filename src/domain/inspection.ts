/**
 * Ficha de vistoria (Inspection).
 * Recurso pertencente a UMA ServiceOrder (orderId imutável).
 * O formato de `data` é o mesmo do Evaluation atual - nenhuma resposta
 * existente precisa ser transformada.
 */
import type { EvaluationData, PropertyType } from "../form-engine/types";
import { DomainError, newId, nowIso } from "./ids";

export type InspectionStatus = "draft" | "finished";

export interface Inspection {
  id: string;
  /** FK obrigatória e imutável para a OS dona. */
  orderId: string;
  propertyType: PropertyType;
  status: InspectionStatus;
  schemaVersion: number;
  formVersion: number;
  currentSectionIndex: number;
  data: EvaluationData;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  /** Soft-delete (acompanha a OS em cascata). */
  deletedAt: string | null;
}

export const INSPECTION_SCHEMA_VERSION = 1;

export function createInspection(
  orderId: string,
  propertyType: PropertyType,
  prefill: EvaluationData = {},
  now = nowIso()
): Inspection {
  if (!orderId) throw new DomainError("NO_ORDER", "Ficha só pode ser criada a partir de uma OS.");
  return {
    id: newId(),
    orderId,
    propertyType,
    status: "draft",
    schemaVersion: INSPECTION_SCHEMA_VERSION,
    formVersion: 1,
    currentSectionIndex: 0,
    data: prefill,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    deletedAt: null,
  };
}

export function finishInspection(inspection: Inspection, now = nowIso()): Inspection {
  if (inspection.status === "finished") return inspection;
  return { ...inspection, status: "finished", finishedAt: now, updatedAt: now };
}

export function reopenInspection(inspection: Inspection, now = nowIso()): Inspection {
  if (inspection.status === "draft") return inspection;
  return { ...inspection, status: "draft", finishedAt: null, updatedAt: now };
}

export function setInspectionAnswer(
  inspection: Inspection,
  sectionId: string,
  fieldId: string,
  value: string | number | string[],
  now = nowIso()
): Inspection {
  return {
    ...inspection,
    updatedAt: now,
    data: {
      ...inspection.data,
      [sectionId]: { ...inspection.data[sectionId], [fieldId]: value },
    },
  };
}

export function goToInspectionSection(inspection: Inspection, index: number, now = nowIso()): Inspection {
  return { ...inspection, currentSectionIndex: Math.max(0, index), updatedAt: now };
}

export function softDeleteInspection(inspection: Inspection, now = nowIso()): Inspection {
  if (inspection.deletedAt !== null) return inspection;
  return { ...inspection, deletedAt: now, updatedAt: now };
}

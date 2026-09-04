import { useCallback, useEffect, useState } from "react";
import {
  emptyEvaluation,
  type Evaluation,
  type PropertyType,
} from "../form-engine/types";

const STORAGE_KEY = "coleta-avaliacao:current";

function load(): Evaluation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Evaluation;
    if (!parsed.propertyType || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Estado da avaliação em curso.
 * Hoje: useState + localStorage (evita perda em campo).
 * Futuro: trocar `persist` por escrita em banco sem mudar a interface —
 * `Evaluation` já tem id/propertyType/data/versionáveis.
 */
export function useEvaluation() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(() => load());

  useEffect(() => {
    try {
      if (evaluation) localStorage.setItem(STORAGE_KEY, JSON.stringify(evaluation));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* armazenamento indisponível: segue sem persistir */
    }
  }, [evaluation]);

  const start = useCallback((propertyType: PropertyType) => {
    setEvaluation(emptyEvaluation(propertyType));
  }, []);

  const resume = useCallback(() => {
    setEvaluation(load());
  }, []);

  const discard = useCallback(() => {
    setEvaluation(null);
  }, []);

  const setAnswer = useCallback(
    (sectionId: string, fieldId: string, value: string | number | string[]) => {
      setEvaluation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          data: {
            ...prev.data,
            [sectionId]: { ...prev.data[sectionId], [fieldId]: value },
          },
        };
      });
    },
    []
  );

  const goToSection = useCallback((index: number) => {
    setEvaluation((prev) =>
      prev ? { ...prev, currentSectionIndex: index, updatedAt: new Date().toISOString() } : prev
    );
  }, []);

  const finish = useCallback(() => {
    setEvaluation((prev) =>
      prev ? { ...prev, finished: true, updatedAt: new Date().toISOString() } : prev
    );
  }, []);

  return { evaluation, start, resume, discard, setAnswer, goToSection, finish, hasDraft: !!evaluation && !evaluation.finished };
}

export function formatAnswer(value: string | number | string[] | undefined): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join("; ") : "—";
  return String(value);
}

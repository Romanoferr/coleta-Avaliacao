/**
 * Motor de formulários baseado em configuração.
 *
 * Ideia fundamental: a ESTRUTURA (seções/campos/opções/ordem, vinda das
 * fichas físicas) vive em arquivos de dados (`src/forms/*`), enquanto a
 * APRESENTAÇÃO vive em componentes reutilizáveis (`src/components/*`).
 *
 * Para adicionar Casa no futuro: criar `src/forms/house.ts` exportando um
 * `FormDefinition` e registrar em `registry.ts`. Nenhum componente precisa mudar.
 */

export type PropertyType = "apartment" | "house" | "land";

export type FieldType =
  | "text"
  | "number"
  | "counter" // stepper +/- para quantidades (quartos, vagas...)
  | "currency" // R$
  | "date"
  | "tel" // contato (teclado telefone, sem validação rígida)
  | "textarea"
  | "radio" // seleção única - cards tocáveis
  | "checkbox" // seleção múltipla - chips/cards tocáveis
  | "yesno" // Sim/Não segmentado
  | "compass" // seleção única de direção - rosa dos ventos tocável
  | "subtitle"; // apenas título de subgrupo dentro da seção (sem valor)

export interface FieldOption {
  value: string;
  label: string;
}

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  /** Texto de ajuda curto exibido abaixo do label */
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
  /** Permite "Outros + detalhe" - exibe campo livre complementar */
  allowOtherDetail?: boolean;
  otherDetailLabel?: string;
  otherDetailId?: string;
  /** Para number/counter */
  min?: number;
  /** N. de linhas do textarea */
  rows?: number;
}

export interface FormSection {
  id: string;
  title: string;
  /** Subtítulo curto orientando a coleta em campo */
  description?: string;
  order: number;
  fields: FormField[];
}

export interface FormDefinition {
  propertyType: PropertyType;
  title: string;
  subtitle: string;
  sections: FormSection[];
}

/** Respostas: sectionId -> fieldId -> valor. checkbox = string[], demais = string/number */
export type SectionAnswers = Record<string, string | number | string[]>;
export type EvaluationData = Record<string, SectionAnswers>;

export interface Evaluation {
  id: string;
  propertyType: PropertyType;
  startedAt: string;
  updatedAt: string;
  currentSectionIndex: number;
  data: EvaluationData;
  finished?: boolean;
}

export function emptyEvaluation(propertyType: PropertyType): Evaluation {
  const now = new Date().toISOString();
  return {
    id: `eval-${Date.now()}`,
    propertyType,
    startedAt: now,
    updatedAt: now,
    currentSectionIndex: 0,
    data: {},
    finished: false,
  };
}

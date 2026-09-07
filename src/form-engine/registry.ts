import type { FormDefinition, PropertyType } from "../form-engine/types";
import { apartmentForm } from "../forms/apartment";
import { houseForm } from "../forms/house";
import { landForm } from "../forms/land";

export interface PropertyTypeMeta {
  type: PropertyType;
  label: string;
  icon: string;
  description: string;
  available: boolean;
  availableNote?: string;
}

export const PROPERTY_TYPES: PropertyTypeMeta[] = [
  {
    type: "house",
    label: "Casa",
    icon: "🏠",
    description: "Unidade isolada",
    available: true,
  },
  {
    type: "apartment",
    label: "Apartamento",
    icon: "🏢",
    description: "Unidade em prédio",
    available: true,
  },
  {
    type: "land",
    label: "Terreno",
    icon: "🌳",
    description: "Sem construção",
    available: true,
  },
];

const forms: Record<string, FormDefinition> = {
  apartment: apartmentForm,
  house: houseForm,
  land: landForm,
};

export function getFormDefinition(type: PropertyType): FormDefinition {
  const def = forms[type];
  if (!def) throw new Error(`Formulário não disponível para: ${type}`);
  return def;
}

export function isTypeAvailable(type: PropertyType): boolean {
  return Boolean(forms[type]);
}

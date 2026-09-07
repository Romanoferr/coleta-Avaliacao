/**
 * Ordem de Serviço — entidade central do produto.
 * Representa o serviço contratado/recebido. NÃO contém dados técnicos
 * da vistoria (esses vivem em Inspection) nem bytes de arquivos (Document).
 */
import type { Address } from "./address";
import { formatAddress, isAddressEmpty, normalizeAddress } from "./address";
import { DomainError, isValidDateIso, isValidTimeHHMM, newId, nowIso, todayLocalIso } from "./ids";

export type ServiceOrderStatus =
  | "received"
  | "scheduled"
  | "inspected"
  | "drafting"
  | "completed"
  | "cancelled";

export const TERMINAL_STATUSES: readonly ServiceOrderStatus[] = ["completed", "cancelled"];

export const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  received: "Recebida",
  scheduled: "Agendada",
  inspected: "Vistoriada",
  drafting: "Em elaboração",
  completed: "Concluída",
  cancelled: "Cancelada",
};

/** De → para. `scheduled → scheduled` existe para reagendamento (troca de data). */
const TRANSITIONS: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> = {
  received: ["scheduled", "cancelled"],
  scheduled: ["scheduled", "inspected", "cancelled"],
  inspected: ["scheduled", "drafting", "completed", "cancelled"],
  drafting: ["inspected", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export interface StatusEvent {
  from: ServiceOrderStatus;
  to: ServiceOrderStatus;
  at: string;
  note?: string;
}

export interface ServiceOrder {
  /** Identidade técnica estável. Nunca exibida como "número". */
  id: string;
  /** Número comercial/visível da OS. Único entre não-excluídas. */
  number: string;
  contractor: string;
  receivedAt: string; // yyyy-mm-dd
  inspectionDate: string | null; // yyyy-mm-dd | null = a agendar
  inspectionTime: string | null; // HH:MM
  dueDate: string | null; // yyyy-mm-dd
  address: Address;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  status: ServiceOrderStatus;
  /** Ponteiro que impõe 1↔0..1: null = sem ficha. */
  inspectionId: string | null;
  statusHistory: StatusEvent[];
  createdAt: string;
  updatedAt: string;
  /** Soft-delete em tudo. Lista esconde; purga futura. */
  deletedAt: string | null;
}

export interface CreateOrderInput {
  number: string;
  contractor: string;
  receivedAt: string;
  inspectionDate?: string | null;
  inspectionTime?: string | null;
  dueDate?: string | null;
  address?: Address;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export type UpdateOrderInput = Partial<
  Pick<
    ServiceOrder,
    | "number"
    | "contractor"
    | "receivedAt"
    | "inspectionDate"
    | "inspectionTime"
    | "dueDate"
    | "address"
    | "contactName"
    | "contactPhone"
    | "notes"
  >
>;

/** Normalização do número comercial: trim. Unicidade é case-insensitive. */
export function normalizeOrderNumber(n: string): string {
  return n.trim().replace(/\s+/g, " ");
}

function optText(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Valida entrada de formulário. Retorna erros por campo (vazio = válido). */
export function validateOrderInput(
  input: CreateOrderInput | UpdateOrderInput,
  existing: Pick<ServiceOrder, "id" | "number" | "deletedAt">[],
  selfId?: string
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.number !== undefined) {
    const n = normalizeOrderNumber(input.number);
    if (!n) errors.number = "Informe o número da OS.";
    else if (
      existing.some(
        (o) => o.deletedAt === null && o.id !== selfId && normalizeOrderNumber(o.number).toLowerCase() === n.toLowerCase()
      )
    )
      errors.number = "Já existe uma OS com este número.";
  }
  if (input.contractor !== undefined && !input.contractor.trim())
    errors.contractor = "Informe o contratante.";
  if (input.receivedAt !== undefined && !isValidDateIso(input.receivedAt))
    errors.receivedAt = "Data de recebimento inválida.";
  if (input.inspectionDate !== undefined && input.inspectionDate !== null && !isValidDateIso(input.inspectionDate))
    errors.inspectionDate = "Data da vistoria inválida.";
  if (input.inspectionTime !== undefined && input.inspectionTime !== null && !isValidTimeHHMM(input.inspectionTime))
    errors.inspectionTime = "Hora inválida (HH:MM).";
  if (input.dueDate !== undefined && input.dueDate !== null && !isValidDateIso(input.dueDate))
    errors.dueDate = "Data para conclusão inválida.";
  const received = input.receivedAt ?? null;
  const due = input.dueDate ?? null;
  if (received && due && isValidDateIso(received) && isValidDateIso(due) && due < received)
    errors.dueDate = "Conclusão não pode ser anterior ao recebimento.";
  return errors;
}

export function createServiceOrder(
  input: CreateOrderInput,
  existing: Pick<ServiceOrder, "id" | "number" | "deletedAt">[],
  now = nowIso()
): ServiceOrder {
  const errors = validateOrderInput(input, existing);
  if (Object.keys(errors).length > 0) throw new DomainError("INVALID_ORDER", "Dados da OS inválidos.", errors);
  return {
    id: newId(),
    number: normalizeOrderNumber(input.number),
    contractor: input.contractor.trim(),
    receivedAt: input.receivedAt,
    inspectionDate: input.inspectionDate ?? null,
    inspectionTime: input.inspectionTime ?? null,
    dueDate: input.dueDate ?? null,
    address: normalizeAddress(input.address ?? {}),
    contactName: optText(input.contactName),
    contactPhone: optText(input.contactPhone),
    notes: optText(input.notes),
    status: "received",
    inspectionId: null,
    statusHistory: [{ from: "received", to: "received", at: now, note: "OS criada" }],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** Edição de dados (não muda status nem vínculo da ficha). */
export function updateServiceOrder(
  order: ServiceOrder,
  patch: UpdateOrderInput,
  existing: Pick<ServiceOrder, "id" | "number" | "deletedAt">[],
  now = nowIso()
): ServiceOrder {
  if (order.deletedAt !== null) throw new DomainError("ORDER_DELETED", "OS excluída não pode ser editada.");
  if (order.status === "completed" || order.status === "cancelled")
    throw new DomainError("ORDER_TERMINAL", "OS concluída/cancelada é somente leitura. Reabra antes de editar.");
  const errors = validateOrderInput(patch, existing, order.id);
  if (Object.keys(errors).length > 0) throw new DomainError("INVALID_ORDER", "Dados da OS inválidos.", errors);
  const next: ServiceOrder = { ...order, updatedAt: now };
  if (patch.number !== undefined) next.number = normalizeOrderNumber(patch.number);
  if (patch.contractor !== undefined) next.contractor = patch.contractor.trim();
  if (patch.receivedAt !== undefined) next.receivedAt = patch.receivedAt;
  if (patch.inspectionDate !== undefined) next.inspectionDate = patch.inspectionDate;
  if (patch.inspectionTime !== undefined) next.inspectionTime = patch.inspectionTime;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.address !== undefined) next.address = normalizeAddress(patch.address);
  if (patch.contactName !== undefined) next.contactName = optText(patch.contactName);
  if (patch.contactPhone !== undefined) next.contactPhone = optText(patch.contactPhone);
  if (patch.notes !== undefined) next.notes = optText(patch.notes);
  // Reagendar = trocar data/hora de OS agendada: registra evento sem mudar estado.
  if (
    order.status === "scheduled" &&
    (patch.inspectionDate !== undefined || patch.inspectionTime !== undefined) &&
    (next.inspectionDate !== order.inspectionDate || next.inspectionTime !== order.inspectionTime)
  ) {
    next.statusHistory = [
      ...next.statusHistory,
      { from: "scheduled", to: "scheduled", at: now, note: "Reagendada" },
    ];
  }
  return next;
}

export function canTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Troca de estado com auditoria. Reagendamento passa por updateServiceOrder. */
export function changeServiceOrderStatus(
  order: ServiceOrder,
  to: ServiceOrderStatus,
  now = nowIso(),
  note?: string
): ServiceOrder {
  if (order.deletedAt !== null) throw new DomainError("ORDER_DELETED", "OS excluída não muda de status.");
  if (to === "scheduled" && order.inspectionDate === null && order.status !== "scheduled")
    throw new DomainError("NO_INSPECTION_DATE", "Defina a data da vistoria antes de agendar.");
  if (!canTransition(order.status, to) || (order.status === to && to !== "scheduled"))
    throw new DomainError(
      "INVALID_TRANSITION",
      `Transição inválida: ${STATUS_LABEL[order.status]} → ${STATUS_LABEL[to]}.`
    );
  return {
    ...order,
    status: to,
    updatedAt: now,
    statusHistory: [...order.statusHistory, { from: order.status, to, at: now, ...(note ? { note } : {}) }],
  };
}

/** Reabertura explícita e auditada de estado terminal. */
export function reopenServiceOrder(order: ServiceOrder, to: ServiceOrderStatus, now = nowIso()): ServiceOrder {
  if (!(TERMINAL_STATUSES as readonly string[]).includes(order.status))
    throw new DomainError("NOT_TERMINAL", "Só OS concluída/cancelada pode ser reaberta.");
  if ((TERMINAL_STATUSES as readonly string[]).includes(to))
    throw new DomainError("INVALID_REOPEN", "Reabertura precisa de um estado de trabalho.");
  if (!["received", "scheduled", "inspected", "drafting"].includes(to))
    throw new DomainError("INVALID_REOPEN", "Estado de reabertura inválido.");
  return {
    ...order,
    status: to,
    updatedAt: now,
    statusHistory: [...order.statusHistory, { from: order.status, to, at: now, note: "Reaberta" }],
  };
}

export function softDeleteServiceOrder(order: ServiceOrder, now = nowIso()): ServiceOrder {
  if (order.deletedAt !== null) return order;
  return { ...order, deletedAt: now, updatedAt: now };
}

export function restoreServiceOrder(order: ServiceOrder, now = nowIso()): ServiceOrder {
  if (order.deletedAt === null) return order;
  return { ...order, deletedAt: null, updatedAt: now };
}

// ---------- Leituras derivadas (nunca persistidas) ----------

export function orderDisplayTitle(order: ServiceOrder): string {
  return `OS ${order.number} · ${order.contractor}`;
}

/** Data+hora combinadas para ordenação da agenda. null = a agendar. */
export function inspectionDateTime(order: ServiceOrder): string | null {
  if (!order.inspectionDate) return null;
  return `${order.inspectionDate}T${order.inspectionTime ?? "00:00"}`;
}

export function isOrderTerminal(order: ServiceOrder): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(order.status);
}

export function isOrderOverdue(order: ServiceOrder, today = todayLocalIso()): boolean {
  return order.deletedAt === null && !isOrderTerminal(order) && order.dueDate !== null && order.dueDate < today;
}

/** Atenção operacional: atrasada, ou vistoria já passou e segue sem ficha. */
export function orderNeedsAttention(order: ServiceOrder, today = todayLocalIso()): boolean {
  if (order.deletedAt !== null || isOrderTerminal(order)) return false;
  if (isOrderOverdue(order, today)) return true;
  return (
    order.inspectionId === null &&
    order.inspectionDate !== null &&
    order.inspectionDate < today &&
    (order.status === "scheduled" || order.status === "inspected")
  );
}

export function addressLine(order: ServiceOrder): string {
  return formatAddress(order.address);
}

export function hasUsableAddress(order: ServiceOrder): boolean {
  return !isAddressEmpty(order.address);
}

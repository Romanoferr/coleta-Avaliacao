/**
 * Peças visuais da OS (estendem docs/UX-FOCUS.md: StatusChip + OSCard).
 * Regra herdada: nada depende só de cor — chip sempre tem texto.
 */
import type { ReactNode } from "react";
import type { ServiceOrder, ServiceOrderStatus } from "../domain/serviceOrder";
import { STATUS_LABEL } from "../domain/serviceOrder";
import { addressLine, isOrderOverdue, orderNeedsAttention } from "../domain/serviceOrder";

const CHIP: Record<ServiceOrderStatus, string> = {
  received: "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-50 text-brand",
  inspected: "bg-amber-50 text-amber-800",
  drafting: "bg-violet-50 text-violet-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-slate-100 text-slate-400",
};

const DOT: Record<ServiceOrderStatus, string> = {
  received: "bg-slate-400",
  scheduled: "bg-brand",
  inspected: "bg-amber-500",
  drafting: "bg-violet-500",
  completed: "bg-green-600",
  cancelled: "bg-slate-300",
};

export function StatusChip({ status }: { status: ServiceOrderStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${CHIP[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** dd/mm/yyyy a partir de yyyy-mm-dd (sem fuso). */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatTimeShort(hhmm: string | null | undefined): string {
  return hhmm ?? "";
}

export function OrderCard({
  order,
  onOpen,
}: {
  order: ServiceOrder;
  onOpen: () => void;
}) {
  const overdue = isOrderOverdue(order);
  const attention = orderNeedsAttention(order);
  const addr = addressLine(order);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border-[1.5px] border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,30,51,0.05)] transition-all focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.99] active:border-brand"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="tnum truncate text-[16px] font-extrabold tracking-tight">OS {order.number}</p>
        <StatusChip status={order.status} />
      </div>
      <p className="mt-0.5 truncate text-[14px] font-semibold text-slate-600">{order.contractor}</p>
      {addr ? <p className="mt-0.5 truncate text-[13px] text-slate-500">{addr}</p> : null}
      <div className="tnum mt-2 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-slate-500">
        {order.inspectionDate ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            📅 {formatDateBR(order.inspectionDate)}
            {order.inspectionTime ? ` · ${order.inspectionTime}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1">A agendar</span>
        )}
        {order.inspectionId ? (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-brand">✓ Com ficha</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">○ Sem ficha</span>
        )}
        {overdue ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">⚠ Atrasada</span>
        ) : attention ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">⚠ Atenção</span>
        ) : null}
      </div>
    </button>
  );
}

export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
      <p className="text-[16px] font-extrabold tracking-tight">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-[32ch] text-[13.5px] leading-snug text-slate-500">{hint}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 h-[52px] w-full rounded-2xl bg-brand text-[16px] font-extrabold text-white active:bg-brand-dark"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Linha rótulo/valor para a aba Dados. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="text-[12px] font-bold uppercase tracking-[0.06em] text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-[15.5px] font-semibold leading-snug">{children}</dd>
    </div>
  );
}

/** Sheet inferior de confirmação destrutiva (2 toques, sem digitar). */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onCancel} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="text-[18px] font-extrabold tracking-tight">{title}</p>
        <p className="mt-1 text-[14px] leading-snug text-slate-500">{message}</p>
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-[56px] shrink-0 basis-[38%] rounded-2xl border-[1.5px] border-slate-200 text-[16px] font-bold text-slate-600 active:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-[56px] flex-1 rounded-2xl bg-red-600 text-[16px] font-extrabold text-white active:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Invólucro de campo do formulário da OS (label + erro em linha). */
export function OsField({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block">
        <span className="text-[15px] font-bold leading-snug">
          {label}
          {required ? (
            <span className="ml-1 text-brand" aria-hidden>
              *
            </span>
          ) : null}
        </span>
        {hint ? <span className="mt-0.5 block text-[13px] font-normal text-slate-500">{hint}</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-[13px] font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}

export const osInputCls =
  "w-full min-h-[56px] rounded-xl border-[1.5px] border-slate-300 bg-white px-4 text-[16px] text-ink placeholder:text-slate-400 transition-colors focus:border-brand focus:outline-none focus:ring-4 focus:ring-blue-600/15";

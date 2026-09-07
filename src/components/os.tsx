/**
 * Peças visuais da OS na mesma identidade do institucional.
 * Regra herdada: nada depende só de cor, o chip sempre tem texto.
 */
import type { ReactNode } from "react";
import type { ServiceOrder, ServiceOrderStatus } from "../domain/serviceOrder";
import { STATUS_LABEL } from "../domain/serviceOrder";
import { addressLine, isOrderOverdue, orderNeedsAttention } from "../domain/serviceOrder";

const CHIP: Record<ServiceOrderStatus, string> = {
  received: "app-status--received",
  scheduled: "app-status--scheduled",
  inspected: "app-status--inspected",
  drafting: "app-status--drafting",
  completed: "app-status--completed",
  cancelled: "app-status--cancelled",
};

/** Emoji por status (nunca só cor: chip sempre tem texto + emoji). */
export const STATUS_EMOJI: Record<ServiceOrderStatus, string> = {
  received: "📥",
  scheduled: "📅",
  inspected: "🔍",
  drafting: "✏️",
  completed: "✅",
  cancelled: "🚫",
};

export function StatusChip({ status }: { status: ServiceOrderStatus }) {
  return (
    <span className={`app-status ${CHIP[status]}`}>
      <span aria-hidden>{STATUS_EMOJI[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** dd/mm/yyyy a partir de yyyy-mm-dd (sem fuso). */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "·";
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
      className={`app-oscard${overdue ? " app-oscard--overdue" : ""}`}
    >
      <span className="app-oscard-top">
        <span className="tnum app-oscard-num">OS {order.number}</span>
        <StatusChip status={order.status} />
      </span>
      <span className="app-oscard-contractor">{order.contractor}</span>
      {addr ? <span className="app-oscard-addr">{addr}</span> : null}
      <span className="tnum app-oscard-meta">
        {order.inspectionDate ? (
          <span className="app-pill">
            📅 {formatDateBR(order.inspectionDate)}
            {order.inspectionTime ? ` · ${order.inspectionTime}` : ""}
          </span>
        ) : (
          <span className="app-pill">A agendar</span>
        )}
        {order.inspectionId ? (
          <span className="app-pill app-pill--info">✓ Com ficha</span>
        ) : (
          <span className="app-pill app-pill--warn">○ Sem ficha</span>
        )}
        {overdue ? (
          <span className="app-pill app-pill--danger">⚠ Atrasada</span>
        ) : attention ? (
          <span className="app-pill app-pill--warn">⚠ Atenção</span>
        ) : null}
      </span>
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
    <div className="app-empty">
      <span className="app-empty-icon" aria-hidden>
        ◌
      </span>
      <p className="app-empty-title">{title}</p>
      {hint ? <p className="app-empty-hint">{hint}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="app-btn app-btn--primary app-empty-btn">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Linha rótulo/valor para a aba Dados. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="app-detail">
      <dt className="app-detail-label">{label}</dt>
      <dd className="app-detail-value">{children}</dd>
    </div>
  );
}

/** Confirmação destrutiva em 2 toques, sem digitar. */
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
    <div className="app-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="app-modal-backdrop" onClick={onCancel} aria-hidden />
      <div className="app-modal-card">
        <p className="app-modal-title">{title}</p>
        <p className="app-modal-msg">{message}</p>
        <div className="app-modal-actions">
          <button
            type="button"
            onClick={onCancel}
            className="app-btn app-btn--secondary app-modal-cancel"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="app-btn app-btn--danger app-modal-confirm"
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
    <div className="app-field">
      <label className="app-field-labelwrap">
        <span className="app-field-label">
          {label}
          {required ? (
            <span className="app-field-req" aria-hidden>
              *
            </span>
          ) : null}
        </span>
        {hint ? <span className="app-field-hint">{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <p className="app-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const osInputCls = "app-input";

/**
 * Biblioteca visual do produto (ver docs/UX-FOCUS.md §4).
 * Header claro + progresso fino, navegação inferior fixa com safe-area,
 * cards de seleção, anel de conclusão. Sem gradientes, sem sombras decorativas.
 */

export type SaveState = "saved" | "saving" | "pending" | "error";

const SAVE_DOT: Record<SaveState, string> = {
  saved: "animate-save-ping bg-green-600",
  saving: "bg-amber-500",
  pending: "bg-amber-500",
  error: "bg-red-500",
};

const SAVE_TEXT: Record<SaveState, string> = {
  saved: "Salvo",
  saving: "Salvando…",
  pending: "Alterações pendentes",
  error: "Erro ao salvar",
};

export function SaveBadge({ state, time }: { state: SaveState; time?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600"
      role="status"
      aria-live="polite"
    >
      <span key={state + (time ?? "")} className={`h-2 w-2 rounded-full ${SAVE_DOT[state]}`} />
      {state === "saved" ? `Salvo${time ? ` • ${time}` : ""}` : SAVE_TEXT[state]}
    </span>
  );
}

export function AppHeader({
  eyebrow,
  title,
  onBack,
  save,
}: {
  eyebrow: string;
  title: string;
  onBack?: () => void;
  save?: { state: SaveState; time?: string };
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-1.5 px-3 py-2.5">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[26px] leading-none text-slate-600 transition-colors active:bg-slate-100"
          >
            ‹
          </button>
        ) : (
          <BrandMark />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{eyebrow}</p>
          <h1 className="truncate text-[17px] font-bold leading-tight text-ink">{title}</h1>
        </div>
        {save && <SaveBadge state={save.state} time={save.time} />}
      </div>
    </header>
  );
}

export function BrandMark() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-lg font-extrabold text-white">
      ⌂
    </span>
  );
}

export function ProgressHairline({ ratio }: { ratio: number }) {
  return (
    <div className="h-[3px] bg-slate-200/70" aria-hidden>
      <div
        className="h-full bg-brand transition-[width] duration-300 ease-out"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

export function SectionHeader({
  step,
  total,
  title,
  description,
  answered,
  ofFields,
}: {
  step: number;
  total: number;
  title: string;
  description?: string;
  answered?: number;
  ofFields?: number;
}) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,30,51,0.05)]">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand tnum">
          Etapa {step} de {total}
        </p>
        <p className="text-[12px] font-bold text-slate-400 tnum">{pct}%</p>
      </div>
      <h2 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-[14px] leading-snug text-slate-500">{description}</p>}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {answered !== undefined && ofFields !== undefined && ofFields > 0 && (
        <p className="mt-2 text-[12px] font-medium text-slate-400 tnum">
          {answered}/{ofFields} campos preenchidos
        </p>
      )}
    </div>
  );
}

export function BottomNav({
  onBack,
  onNext,
  backLabel = "Voltar",
  nextLabel,
  nextHint,
}: {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel: string;
  nextHint?: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-xl gap-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="h-[60px] shrink-0 basis-[30%] rounded-2xl border-[1.5px] border-slate-200 bg-white text-[17px] font-bold text-slate-600 transition-all focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.98] active:bg-slate-50"
          >
            ‹ {backLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="h-[60px] flex-1 rounded-2xl bg-brand text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.99] active:bg-brand-dark"
        >
          <span className="block text-[17px] font-extrabold leading-tight">{nextLabel}</span>
          {nextHint && <span className="block truncate px-3 text-[12px] font-medium text-blue-100">{nextHint}</span>}
        </button>
      </div>
    </div>
  );
}

export function TypeCard({
  icon,
  title,
  description,
  meta,
  disabled,
  onSelect,
}: {
  icon: string;
  title: string;
  description: string;
  meta?: string;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-disabled={disabled}
      className={`group flex w-full items-center gap-4 rounded-2xl border-[1.5px] p-4 text-left transition-all ${
        disabled
          ? "border-slate-200 bg-slate-50 opacity-70"
          : "border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,30,51,0.05)] focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.99] active:border-brand active:bg-blue-50/60"
      }`}
    >
      <span
        className={`flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl text-[30px] ${
          disabled ? "bg-slate-100" : "bg-blue-50"
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[18px] font-extrabold tracking-tight">{title}</span>
          {disabled ? (
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Em breve
            </span>
          ) : (
            meta && (
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-green-700">
                {meta}
              </span>
            )
          )}
        </span>
        <span className="mt-0.5 block text-[14px] leading-snug text-slate-500">{description}</span>
      </span>
      {!disabled && (
        <span className="shrink-0 text-[24px] font-bold text-slate-300 transition-colors group-active:text-brand" aria-hidden>
          ›
        </span>
      )}
    </button>
  );
}

export function CompletionRing({ ratio, size = 76 }: { ratio: number; size?: number }) {
  const pct = Math.round(ratio * 100);
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct}% concluído`}
    >
      <svg width={size} height={size} viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-[17px] font-extrabold text-ink tnum">{pct}%</span>
    </div>
  );
}

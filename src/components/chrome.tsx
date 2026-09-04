export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round(((current + 1) / total) * 100);
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function BottomNav({
  onBack,
  onNext,
  backLabel = "Voltar",
  nextLabel = "Continuar",
  showBack = true,
}: {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  showBack?: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-xl gap-3">
        {showBack && onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="h-14 flex-1 rounded-xl border-2 border-slate-200 bg-white text-lg font-semibold text-slate-700 active:bg-slate-50"
          >
            {backLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNext}
          className="h-14 flex-[2] rounded-xl bg-blue-600 text-lg font-bold text-white shadow-sm active:bg-blue-700"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

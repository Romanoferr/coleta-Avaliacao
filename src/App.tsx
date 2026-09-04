import { useMemo, useState } from "react";
import { BottomNav, ProgressBar } from "./components/chrome";
import { FieldRenderer } from "./components/fields";
import { PROPERTY_TYPES, getFormDefinition } from "./form-engine/registry";
import type { FormDefinition } from "./form-engine/types";
import { formatAnswer, useEvaluation } from "./state/evaluation";

type Screen = "home" | "type" | "form" | "review" | "done";

export default function App() {
  const { evaluation, start, discard, setAnswer, goToSection, finish } = useEvaluation();
  const [screen, setScreen] = useState<Screen>("home");

  const form: FormDefinition | null = useMemo(() => {
    if (!evaluation) return null;
    try {
      return getFormDefinition(evaluation.propertyType);
    } catch {
      return null;
    }
  }, [evaluation]);

  const sectionIndex = evaluation?.currentSectionIndex ?? 0;
  const section = form?.sections[sectionIndex];
  const total = form?.sections.length ?? 0;

  const goReview = () => setScreen("review");

  // ---------- HOME ----------
  if (screen === "home") {
    return (
      <Shell title="Coleta Avaliação" subtitle="Vistoria de imóveis em campo">
        <div className="flex flex-col gap-4 pt-6">
          <div className="rounded-2xl bg-slate-900 p-6 text-white">
            <p className="text-sm font-medium uppercase tracking-wider text-slate-300">Mobile-first</p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight">
              Nova avaliação em minutos, direto do celular.
            </h1>
            <p className="mt-2 text-slate-300">
              Sem papel. Sem digitação desnecessária. Os dados ficam salvos no aparelho durante a visita.
            </p>
          </div>

          {evaluation && !evaluation.finished && form && (
            <button
              onClick={() => setScreen("form")}
              className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left active:bg-amber-100"
            >
              <p className="font-bold text-amber-900">
                ↻ Continuar rascunho: {form.title}
              </p>
              <p className="text-sm text-amber-800">
                Seção {Math.min(sectionIndex + 1, total)} de {total} — toque para retomar.
              </p>
            </button>
          )}

          <button
            onClick={() => setScreen("type")}
            className="h-16 rounded-2xl bg-blue-600 text-xl font-bold text-white shadow active:bg-blue-700"
          >
            + Nova avaliação
          </button>

          {evaluation && (
            <button onClick={discard} className="text-sm font-medium text-slate-500 underline underline-offset-2">
              Descartar rascunho atual
            </button>
          )}

          <p className="text-center text-xs text-slate-400">
            v0.1 — sem login, sem banco, sem PDF (planejado para próximas etapas)
          </p>
        </div>
      </Shell>
    );
  }

  // ---------- TYPE SELECT ----------
  if (screen === "type") {
    return (
      <Shell title="Tipo de imóvel" subtitle="O que você vai avaliar?" onBack={() => setScreen("home")}>
        <div className="flex flex-col gap-3 pt-2">
          {PROPERTY_TYPES.map((t) => {
            const disabled = !t.available;
            return (
              <button
                key={t.type}
                disabled={disabled}
                onClick={() => {
                  start(t.type);
                  goToSection(0);
                  setScreen("form");
                  window.scrollTo(0, 0);
                }}
                className={`flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-colors ${
                  disabled
                    ? "border-slate-200 bg-slate-100 opacity-60"
                    : "border-slate-200 bg-white active:border-blue-600 active:bg-blue-50"
                }`}
              >
                <span className="text-4xl">{t.icon}</span>
                <span className="flex-1">
                  <span className="block text-xl font-bold text-slate-900">{t.label}</span>
                  <span className="block text-sm text-slate-500">
                    {disabled ? t.availableNote : t.description}
                  </span>
                </span>
                {!disabled && <span className="text-2xl text-slate-300">›</span>}
                {disabled && (
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">
                    EM BREVE
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Shell>
    );
  }

  if (!evaluation || !form || !section) {
    return (
      <Shell title="Coleta Avaliação" subtitle="Nenhuma avaliação ativa">
        <button
          onClick={() => setScreen("type")}
          className="mt-6 h-14 w-full rounded-xl bg-blue-600 text-lg font-bold text-white"
        >
          Escolher tipo de imóvel
        </button>
      </Shell>
    );
  }

  // ---------- REVIEW ----------
  if (screen === "review") {
    return (
      <Shell
        title="Revisão da avaliação"
        subtitle={`${form.title} • ${total} seções`}
        onBack={() => {
          goToSection(total - 1);
          setScreen("form");
        }}
      >
        <div className="flex flex-col gap-3 pb-4">
          {form.sections.map((s, i) => {
            const answers = evaluation.data[s.id] ?? {};
            const filled = Object.values(answers).filter(
              (v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0) && v !== 0
            ).length;
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Seção {i + 1}
                    </p>
                    <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
                  </div>
                  <button
                    onClick={() => {
                      goToSection(i);
                      setScreen("form");
                      window.scrollTo(0, 0);
                    }}
                    className="h-11 rounded-xl border-2 border-slate-200 px-4 font-semibold text-blue-700"
                  >
                    Editar
                  </button>
                </div>
                <dl className="mt-2 divide-y divide-slate-100">
                  {s.fields
                    .filter((f) => f.type !== "subtitle")
                    .map((f) => {
                      const raw = answers[f.id] as string | number | string[] | undefined;
                      // Campos de detalhe ("..._det" / "..._outros") são exibidos
                      // junto ao campo principal — mas se estiverem preenchidos
                      // de forma isolada, mostre-os em vez de ocultar.
                      const isDetail = f.id.endsWith("_det") || f.id.endsWith("_outros");
                      if (isDetail && (raw === undefined || raw === "" || raw === 0)) return null;
                      // Detalhe complementar do campo principal ("Outros: ...",
                      // "estabilidade_det", etc.)
                      const detail =
                        (f.otherDetailId && answers[f.otherDetailId] && String(answers[f.otherDetailId])) ||
                        (answers[`${f.id}_det`] && String(answers[`${f.id}_det`])) ||
                        undefined;
                      if (!isDetail && detail) {
                        // evita linha duplicada quando o detalhe já foi anexado
                      }
                      const display =
                        raw === 0 ? "—" : formatAnswer(raw) + (detail && !isDetail ? ` — ${detail}` : "");
                      if (!isDetail && (raw === undefined || raw === "" || raw === 0) && !detail) {
                        return (
                          <div key={f.id} className="py-1">
                            <dt className="text-sm text-slate-400">{f.label}</dt>
                            <dd className="text-[16px] text-slate-300">—</dd>
                          </div>
                        );
                      }
                      return (
                        <div key={f.id} className="py-1.5">
                          <dt className="text-sm text-slate-500">{f.label}</dt>
                          <dd className="text-[16px] font-medium text-slate-900">{display}</dd>
                        </div>
                      );
                    })}
                </dl>
                {filled === 0 && (
                  <p className="mt-1 text-sm italic text-slate-400">Nada preenchido nesta seção.</p>
                )}
              </div>
            );
          })}
        </div>
        <BottomNav
          backLabel="Voltar"
          nextLabel="Finalizar avaliação ✓"
          onBack={() => {
            goToSection(total - 1);
            setScreen("form");
          }}
          onNext={() => {
            finish();
            setScreen("done");
            window.scrollTo(0, 0);
          }}
        />
      </Shell>
    );
  }

  // ---------- DONE ----------
  if (screen === "done") {
    return (
      <Shell title="Avaliação concluída" subtitle={form.title}>
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">
            ✓
          </div>
          <h2 className="text-2xl font-extrabold">Dados coletados!</h2>
          <p className="max-w-xs text-slate-500">
            O.S. {String(evaluation.data.identificacao?.["os"] ?? "—")} •{" "}
            {form.sections.length} seções percorridas. Nesta fase os dados ficam salvos
            localmente no aparelho.
          </p>
          <button
            onClick={() => {
              discard();
              setScreen("type");
            }}
            className="mt-4 h-14 w-full rounded-xl bg-blue-600 text-lg font-bold text-white"
          >
            + Nova avaliação
          </button>
          <button
            onClick={() => {
              discard();
              setScreen("home");
            }}
            className="text-sm font-medium text-slate-500 underline underline-offset-2"
          >
            Voltar ao início
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- FORM (wizard por seção) ----------
  const isLast = sectionIndex === total - 1;
  return (
    <Shell
      title={section.title}
      subtitle={`${form.title} • ${sectionIndex + 1} de ${total}`}
      onBack={
        sectionIndex === 0
          ? () => setScreen("type")
          : () => {
              goToSection(sectionIndex - 1);
              window.scrollTo(0, 0);
            }
      }
    >
      <div className="pt-3">
        <ProgressBar current={sectionIndex} total={total} />
        <p className="mt-1.5 text-sm text-slate-500">
          <span className="font-bold text-slate-700">{section.title}</span>
          {` — ${sectionIndex + 1} de ${total}`}
          {section.description ? ` • ${section.description}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-7 py-5">
        {section.fields.map((f) => (
          <FieldRenderer
            key={f.id}
            field={f}
            value={evaluation.data[section.id]?.[f.id]}
            otherDetailValue={
              f.otherDetailId ? evaluation.data[section.id]?.[f.otherDetailId] : undefined
            }
            onChange={(fieldId, v) => setAnswer(section.id, fieldId, v)}
          />
        ))}
      </div>

      <BottomNav
        onBack={() => {
          if (sectionIndex === 0) setScreen("type");
          else {
            goToSection(sectionIndex - 1);
            window.scrollTo(0, 0);
          }
        }}
        onNext={() => {
          if (isLast) {
            setScreen("review");
          } else {
            goToSection(sectionIndex + 1);
          }
          window.scrollTo(0, 0);
        }}
        nextLabel={isLast ? "Revisar →" : "Continuar →"}
      />
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
  onBack,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Voltar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl active:bg-slate-700"
            >
              ‹
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight">{title}</p>
            {subtitle && <p className="truncate text-sm text-slate-300">{subtitle}</p>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-8">{children}</main>
    </div>
  );
}

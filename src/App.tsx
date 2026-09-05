import { useEffect, useMemo, useState } from "react";
import {
  AppHeader,
  BottomNav,
  CompletionRing,
  ProgressHairline,
  SectionHeader,
  TypeCard,
} from "./components/chrome";
import { FieldRenderer } from "./components/fields";
import { PROPERTY_TYPES, getFormDefinition } from "./form-engine/registry";
import type { FormDefinition } from "./form-engine/types";
import { formatAnswer, useEvaluation } from "./state/evaluation";

type Screen = "home" | "form" | "review" | "done";
type V = string | number | string[] | undefined;

const isFilled = (v: V) =>
  v !== undefined &&
  v !== null &&
  (typeof v === "number" ? v !== 0 : typeof v === "string" ? v.trim() !== "" : v.length > 0);

function timeOf(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const { evaluation, start, discard, setAnswer, goToSection, finish } = useEvaluation();
  const [screen, setScreen] = useState<Screen>("home");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");

  const form: FormDefinition | null = useMemo(() => {
    if (!evaluation) return null;
    try {
      return getFormDefinition(evaluation.propertyType);
    } catch {
      return null;
    }
  }, [evaluation]);

  // Microfeedback de autosave: "Salvando…" → "Salvo • HH:MM"
  const updatedAt = evaluation?.updatedAt;
  useEffect(() => {
    if (!evaluation || screen === "home") return;
    setSaveState("saving");
    const t = setTimeout(() => setSaveState("saved"), 900);
    return () => clearTimeout(t);
  }, [updatedAt, evaluation, screen]);

  const sectionIndex = evaluation?.currentSectionIndex ?? 0;
  const section = form?.sections[sectionIndex];
  const total = form?.sections.length ?? 0;

  const completion = useMemo(() => {
    if (!form || !evaluation) return { filled: 0, total: 0 };
    let filled = 0;
    let count = 0;
    for (const s of form.sections) {
      for (const f of s.fields) {
        if (f.type === "subtitle") continue;
        count += 1;
        if (isFilled(evaluation.data[s.id]?.[f.id] as V)) filled += 1;
      }
    }
    return { filled, total: count };
  }, [form, evaluation]);

  const scrollTop = () => window.scrollTo(0, 0);

  // ================= HOME (produto + escolha do tipo) =================
  if (screen === "home") {
    return (
      <Shell>
        <AppHeader eyebrow="Vistoria técnica" title="Coleta Avaliação" />
        <main className="mx-auto max-w-xl px-4 pb-10">
          <section className="animate-rise pt-5">
            <div className="rounded-3xl bg-ink p-6 text-white">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Avaliação de imóveis em campo
              </p>
              <h2 className="mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-tight">
                Nova avaliação
              </h2>
              <p className="mt-1.5 max-w-[32ch] text-[14.5px] leading-snug text-slate-300">
                Registre as características do imóvel de forma rápida e organizada, direto do celular.
              </p>
              <div className="mt-4 flex gap-2 text-[12px] font-semibold">
                <span className="rounded-full bg-white/10 px-3 py-1.5">✓ Rascunho automático</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5">✓ Funciona no bolso</span>
              </div>
            </div>
          </section>

          {evaluation && !evaluation.finished && form && (
            <button
              onClick={() => {
                setScreen("form");
                scrollTop();
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-amber-300 bg-amber-50 p-4 text-left transition-all active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xl" aria-hidden>
                ↻
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold text-amber-900">
                  Continuar {form.title.toLowerCase()}
                </span>
                <span className="tnum block text-[13px] font-medium text-amber-700">
                  Etapa {Math.min(sectionIndex + 1, total)} de {total} — nada foi perdido
                </span>
              </span>
              <span className="text-xl font-bold text-amber-500" aria-hidden>›</span>
            </button>
          )}

          <section className="mt-6">
            <h3 className="text-[19px] font-extrabold tracking-tight">Qual imóvel você está avaliando?</h3>
            <p className="mt-0.5 text-[14px] text-slate-500">
              A ficha correta é carregada na ordem original do papel.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {PROPERTY_TYPES.map((t) => (
                <TypeCard
                  key={t.type}
                  icon={t.icon}
                  title={t.label}
                  description={t.available ? t.description : "Ficha em preparação — entra sem mudar o app."}
                  meta={t.available ? `${getFormDefinition(t.type).sections.length} etapas` : undefined}
                  disabled={!t.available}
                  onSelect={() => {
                    start(t.type);
                    goToSection(0);
                    setScreen("form");
                    scrollTop();
                  }}
                />
              ))}
            </div>
          </section>

          {evaluation && (
            <button
              onClick={discard}
              className="mt-4 min-h-[44px] w-full text-center text-[13px] font-semibold text-slate-400 underline underline-offset-2"
            >
              Descartar rascunho atual
            </button>
          )}
          <p className="mt-2 text-center text-[12px] text-slate-400">
            Os dados ficam salvos neste aparelho durante a visita.
          </p>
        </main>
      </Shell>
    );
  }

  if (!evaluation || !form || !section) {
    return (
      <Shell>
        <AppHeader eyebrow="Vistoria técnica" title="Coleta Avaliação" onBack={() => setScreen("home")} />
        <main className="mx-auto max-w-xl px-4 pb-10 pt-6">
          <button
            onClick={() => setScreen("home")}
            className="h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white"
          >
            Escolher tipo de imóvel
          </button>
        </main>
      </Shell>
    );
  }

  // ================= REVIEW =================
  if (screen === "review") {
    const ratio = completion.total ? completion.filled / completion.total : 0;
    return (
      <Shell>
        <AppHeader
          eyebrow={`${form.title} • revisão`}
          title="Revisão da avaliação"
          onBack={() => {
            goToSection(total - 1);
            setScreen("form");
            scrollTop();
          }}
          save={{ state: saveState, time: timeOf(evaluation.updatedAt) }}
        />
        <ProgressHairline ratio={1} />
        <main className="mx-auto max-w-xl px-4 pb-10">
          <section className="animate-rise mt-4 rounded-2xl border border-slate-200/80 bg-white p-5">
            <div className="flex items-center gap-4">
              <CompletionRing ratio={ratio} />
              <div className="min-w-0">
                <h2 className="text-[19px] font-extrabold tracking-tight">Confira antes de finalizar</h2>
                <p className="tnum mt-0.5 text-[13.5px] text-slate-500">
                  {completion.filled} de {completion.total} campos preenchidos
                </p>
              </div>
            </div>
            <p className="mt-3 text-[13.5px] leading-snug text-slate-500">
              Toque em <strong className="text-slate-700">Editar</strong> em qualquer seção para corrigir. Campos vazios não bloqueiam a conclusão.
            </p>
          </section>

          <div className="mt-3 flex flex-col gap-2.5">
            {form.sections.map((s, i) => {
              const answers = evaluation.data[s.id] ?? {};
              const rows = s.fields.filter((f) => {
                if (f.type === "subtitle") return false;
                // detalhe mostrado junto ao campo-pai
                if (/_det$/.test(f.id)) {
                  const base = f.id.replace(/_det$/, "");
                  if (s.fields.some((x) => x.id === base)) return false;
                }
                if (!isFilled(answers[f.id] as V)) return false;
                return true;
              });
              return (
                <article key={s.id} className="rounded-2xl border border-slate-200/80 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="tnum text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        {i + 1} · {s.title}
                      </p>
                      <p className="tnum text-[12px] font-semibold text-slate-400">
                        {rows.length} {rows.length === 1 ? "item" : "itens"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        goToSection(i);
                        setScreen("form");
                        scrollTop();
                      }}
                      className="h-11 shrink-0 rounded-xl border-[1.5px] border-slate-200 px-5 text-[15px] font-bold text-brand active:bg-blue-50"
                    >
                      Editar
                    </button>
                  </div>
                  {rows.length === 0 ? (
                    <p className="mt-2 text-[14px] italic text-slate-400">Nada preenchido nesta etapa.</p>
                  ) : (
                    <dl className="mt-1 divide-y divide-slate-100">
                      {rows.map((f) => {
                        const raw = answers[f.id] as V;
                        const det =
                          (f.otherDetailId && (answers[f.otherDetailId] as string)) ||
                          (answers[`${f.id}_det`] as string) ||
                          "";
                        return (
                          <div key={f.id} className="py-2">
                            <dt className="text-[13px] font-medium text-slate-500">{f.label}</dt>
                            <dd className="text-[15.5px] font-semibold leading-snug">
                              {formatAnswer(raw)}
                              {det.trim() ? <span className="font-medium text-slate-500"> — {det.trim()}</span> : null}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </article>
              );
            })}
          </div>

          <div className="mt-2">
            <BottomNav
              backLabel="Voltar"
              nextLabel="Finalizar avaliação"
              nextHint={`${form.title} • ${total} etapas`}
              onBack={() => {
                goToSection(total - 1);
                setScreen("form");
                scrollTop();
              }}
              onNext={() => {
                finish();
                setScreen("done");
                scrollTop();
              }}
            />
          </div>
        </main>
      </Shell>
    );
  }

  // ================= DONE =================
  if (screen === "done") {
    const os = evaluation.data.identificacao?.["os"];
    return (
      <Shell>
        <AppHeader eyebrow={form.title} title="Avaliação concluída" />
        <main className="mx-auto max-w-xl px-4 pb-10">
          <section className="animate-rise mt-6 rounded-3xl border border-slate-200/80 bg-white p-6 text-center">
            <span className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-green-100" aria-hidden>
              <svg viewBox="0 0 24 20" className="h-7 w-7 text-green-700" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M2 10.5l6.5 6.5L22 2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 className="mt-3 text-[22px] font-extrabold tracking-tight">Dados coletados</h2>
            <p className="mx-auto mt-1 max-w-[30ch] text-[14.5px] leading-snug text-slate-500">
              A vistoria foi registrada e está salva neste aparelho para as próximas etapas.
            </p>
            <div className="tnum mt-4 flex justify-center gap-2 text-[13px] font-bold">
              <span className="rounded-full bg-slate-100 px-3.5 py-1.5 text-slate-600">{form.title}</span>
              {String(os ?? "").trim() && (
                <span className="rounded-full bg-slate-100 px-3.5 py-1.5 text-slate-600">O.S. {String(os)}</span>
              )}
              <span className="rounded-full bg-slate-100 px-3.5 py-1.5 text-slate-600">{total} etapas</span>
            </div>
            <button
              onClick={() => {
                discard();
                setScreen("home");
                scrollTop();
              }}
              className="mt-5 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark"
            >
              + Nova avaliação
            </button>
          </section>
        </main>
      </Shell>
    );
  }

  // ================= FORM (wizard) =================
  const isLast = sectionIndex === total - 1;
  const nextSection = !isLast ? form.sections[sectionIndex + 1] : null;
  const sectionFields = section.fields.filter((f) => f.type !== "subtitle");
  const answeredCount = sectionFields.filter((f) => isFilled(evaluation.data[section.id]?.[f.id] as V)).length;

  return (
    <Shell>
      <AppHeader
        eyebrow={`${form.title} • vistoria`}
        title={section.title}
        onBack={() => {
          if (sectionIndex === 0) setScreen("home");
          else goToSection(sectionIndex - 1);
          scrollTop();
        }}
        save={{ state: saveState, time: timeOf(evaluation.updatedAt) }}
      />
      <ProgressHairline ratio={(sectionIndex + 1) / total} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <div key={section.id} className="animate-rise">
          <div className="pt-4">
            <SectionHeader
              step={sectionIndex + 1}
              total={total}
              title={section.title}
              description={section.description}
              answered={answeredCount}
              ofFields={sectionFields.length}
            />
          </div>
          <div className="flex flex-col gap-5 pt-5">
            {section.fields.map((f) => (
              <FieldRenderer
                key={f.id}
                field={f}
                value={evaluation.data[section.id]?.[f.id] as V}
                otherDetailValue={
                  f.otherDetailId ? (evaluation.data[section.id]?.[f.otherDetailId] as V) : undefined
                }
                onChange={(fieldId, v) => setAnswer(section.id, fieldId, v)}
              />
            ))}
          </div>
        </div>
        <div className="mt-6">
          <BottomNav
            onBack={() => {
              if (sectionIndex === 0) setScreen("home");
              else goToSection(sectionIndex - 1);
              scrollTop();
            }}
            onNext={() => {
              if (isLast) setScreen("review");
              else goToSection(sectionIndex + 1);
              scrollTop();
            }}
            nextLabel={isLast ? "Revisar avaliação" : "Continuar"}
            nextHint={nextSection ? `Próxima: ${nextSection.title}` : `${total} etapas • revisar tudo`}
          />
        </div>
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-app text-ink">{children}</div>;
}

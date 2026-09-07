/**
 * Ficha de vistoria aninhada à OS (`/os/:id/ficha`).
 * Edição em cópia local + autosave real (debounce + confirmação do backend).
 * Sem ficha: escolha do tipo (property_type definido ANTES da criação -
 * melhor UX: o avaliador já sabe o que vai vistoriar ao abrir a OS).
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AppHeader,
  BottomNav,
  CompletionRing,
  ProgressHairline,
  SectionHeader,
  TypeCard,
} from "../components/chrome";
import { FieldRenderer } from "../components/fields";
import { PROPERTY_TYPES, getFormDefinition } from "../form-engine/registry";
import type { FormDefinition } from "../form-engine/types";
import { DomainError } from "../domain/ids";
import { isOrderTerminal } from "../domain/serviceOrder";
import type { PropertyType } from "../form-engine/types";
import { formatAnswer } from "../state/evaluation";
import { useInspectionEditor, useStore } from "../state/store";
import { repoErrorMessage } from "../repositories/errors";

type View = "form" | "review" | "done";
type V = string | number | string[] | undefined;

const isFilled = (v: V) =>
  v !== undefined &&
  v !== null &&
  (typeof v === "number" ? v !== 0 : typeof v === "string" ? v.trim() !== "" : v.length > 0);

export default function InspectionScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const editor = useInspectionEditor(id);

  const [view, setView] = useState<View>("form");
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);

  const scrollTop = () => window.scrollTo(0, 0);
  const backToOrder = () => navigate(`/os/${id}`);

  const order = editor.order;
  const draft = editor.draft;

  const form: FormDefinition | null = useMemo(() => {
    if (!draft) return null;
    try {
      return getFormDefinition(draft.propertyType);
    } catch {
      return null;
    }
  }, [draft]);

  const completion = useMemo(() => {
    if (!form || !draft) return { filled: 0, total: 0 };
    let filled = 0;
    let count = 0;
    for (const s of form.sections) {
      for (const f of s.fields) {
        if (f.type === "subtitle") continue;
        count += 1;
        if (isFilled(draft.data[s.id]?.[f.id] as V)) filled += 1;
      }
    }
    return { filled, total: count };
  }, [form, draft]);

  // ---------- carregamento / erro ----------
  if (editor.phase === "loading") {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow="Ficha de vistoria" title="Carregando…" onBack={backToOrder} />
        <main className="mx-auto max-w-xl px-4 pb-10 pt-6">
          <div className="animate-pulse rounded-2xl border border-slate-200/80 bg-white p-5">
            <div className="h-5 w-2/3 rounded bg-slate-100" />
            <div className="mt-3 h-4 w-full rounded bg-slate-100" />
            <div className="mt-2 h-4 w-5/6 rounded bg-slate-100" />
            <div className="mt-2 h-4 w-4/6 rounded bg-slate-100" />
          </div>
          <p className="mt-3 text-center text-[13px] font-semibold text-slate-400">Carregando ficha…</p>
        </main>
      </div>
    );
  }

  if (editor.phase === "error" || !order) {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow="Ficha de vistoria" title="Não foi possível carregar" onBack={backToOrder} />
        <main className="mx-auto max-w-xl px-4 pb-10 pt-6">
          <p className="rounded-2xl border-[1.5px] border-red-200 bg-red-50 p-4 text-[14px] font-bold text-red-700">
            {editor.error ?? "OS não encontrada."}
          </p>
          <button
            type="button"
            onClick={() => void editor.reload()}
            className="mt-3 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white"
          >
            Tentar de novo
          </button>
        </main>
      </div>
    );
  }

  if (order.deletedAt !== null) {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow="Ficha de vistoria" title="OS excluída" onBack={() => navigate("/dashboard")} />
      </div>
    );
  }

  const readOnly = isOrderTerminal(order);

  // ---------- Sem ficha: escolher tipo = Criar ----------
  if (!draft) {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow={`OS ${order.number}`} title="Criar ficha de vistoria" onBack={backToOrder} />
        <main className="mx-auto max-w-xl px-4 pb-10">
          <section className="mt-6">
            <h3 className="text-[19px] font-extrabold tracking-tight">Qual imóvel foi vistoriado?</h3>
            <p className="mt-0.5 text-[14px] text-slate-500">
              A ficha correta é carregada na ordem original do papel. Uma OS tem no máximo uma ficha.
            </p>
            {error ? (
              <p className="mt-3 rounded-2xl border-[1.5px] border-red-200 bg-red-50 p-4 text-[14px] font-bold text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-2.5">
              {PROPERTY_TYPES.map((t) => (
                <TypeCard
                  key={t.type}
                  icon={t.icon}
                  title={t.label}
                  description={t.available ? t.description : "Ficha em preparação - entra sem mudar o app."}
                  meta={t.available ? `${getFormDefinition(t.type).sections.length} etapas` : undefined}
                  disabled={!t.available}
                  onSelect={() => {
                    setError("");
                    store
                      .startInspection(order.id, t.type as PropertyType)
                      .then(() => editor.reload())
                      .then(() => {
                        setView("form");
                        scrollTop();
                      })
                      .catch((e: unknown) => {
                        setError(e instanceof DomainError ? e.message : repoErrorMessage(e));
                      });
                  }}
                />
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow={`OS ${order.number}`} title="Ficha indisponível" onBack={backToOrder} />
      </div>
    );
  }

  const sectionIndex = draft.currentSectionIndex ?? 0;
  const section = form.sections[sectionIndex];
  const total = form.sections.length;

  if (!section) {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow={`OS ${order.number}`} title={form.title} onBack={backToOrder} />
      </div>
    );
  }

  const handleChange = (sectionId: string, fieldId: string, v: string | number | string[]) => {
    if (readOnly) return;
    editor.setAnswer(sectionId, fieldId, v);
  };

  const saveBanner =
    editor.saveState === "error" ? (
      <button
        type="button"
        onClick={() => void editor.flush().catch(() => undefined)}
        className="mt-3 w-full rounded-xl border-[1.5px] border-red-200 bg-red-50 p-3 text-center text-[13.5px] font-bold text-red-700"
      >
        ⚠ {editor.saveError ?? "Erro ao salvar."} Toque para tentar de novo.
      </button>
    ) : editor.offlineNote ? (
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-center text-[13.5px] font-bold text-amber-800">
        Rascunho local restaurado - será sincronizado ao salvar.
      </p>
    ) : null;

  // ================= REVIEW =================
  if (view === "review") {
    const ratio = completion.total ? completion.filled / completion.total : 0;
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader
          eyebrow={`OS ${order.number} · ${form.title} · revisão`}
          title="Revisão da ficha"
          onBack={() => {
            editor.goSection(total - 1);
            setView("form");
            scrollTop();
          }}
          save={{ state: editor.saveState, time: editor.savedAtLabel ?? undefined }}
        />
        <ProgressHairline ratio={1} />
        <main className="mx-auto max-w-xl px-4 pb-10">
          {saveBanner}
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
              const answers = draft.data[s.id] ?? {};
              const rows = s.fields.filter((f) => {
                if (f.type === "subtitle") return false;
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
                    {!readOnly ? (
                      <button
                        onClick={() => {
                          editor.goSection(i);
                          setView("form");
                          scrollTop();
                        }}
                        className="h-11 shrink-0 rounded-xl border-[1.5px] border-slate-200 px-5 text-[15px] font-bold text-brand active:bg-blue-50"
                      >
                        Editar
                      </button>
                    ) : null}
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
                              {det.trim() ? <span className="font-medium text-slate-500"> - {det.trim()}</span> : null}
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
              nextLabel={readOnly ? "Voltar à OS" : finishing ? "Finalizando…" : "Finalizar ficha"}
              nextHint={`OS ${order.number} · ${form.title}`}
              onBack={() => {
                editor.goSection(total - 1);
                setView("form");
                scrollTop();
              }}
              onNext={() => {
                if (readOnly) {
                  backToOrder();
                  return;
                }
                if (editor.saveState === "error") return;
                setFinishing(true);
                setError("");
                editor
                  .finish()
                  .then(() => {
                    setView("done");
                    scrollTop();
                  })
                  .catch((e: unknown) => {
                    setError(e instanceof DomainError ? e.message : repoErrorMessage(e));
                    scrollTop();
                  })
                  .finally(() => setFinishing(false));
              }}
            />
            {error ? (
              <p className="mt-2 rounded-xl border-[1.5px] border-red-200 bg-red-50 p-3 text-center text-[13.5px] font-bold text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  // ================= DONE =================
  if (view === "done") {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow={`OS ${order.number} · ${form.title}`} title="Ficha concluída" />
        <main className="mx-auto max-w-xl px-4 pb-10">
          <section className="animate-rise mt-6 rounded-3xl border border-slate-200/80 bg-white p-6 text-center">
            <span className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-green-100" aria-hidden>
              <svg viewBox="0 0 24 20" className="h-7 w-7 text-green-700" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M2 10.5l6.5 6.5L22 2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 className="mt-3 text-[22px] font-extrabold tracking-tight">Dados coletados</h2>
            <p className="mx-auto mt-1 max-w-[30ch] text-[14.5px] leading-snug text-slate-500">
              A ficha foi vinculada à OS {order.number} e salva{store.backend === "supabase" ? " na nuvem" : " neste aparelho"}.
            </p>
            <div className="tnum mt-4 flex justify-center gap-2 text-[13px] font-bold">
              <span className="rounded-full bg-slate-100 px-3.5 py-1.5 text-slate-600">OS {order.number}</span>
              <span className="rounded-full bg-slate-100 px-3.5 py-1.5 text-slate-600">{form.title}</span>
              <span className="rounded-full bg-slate-100 px-3.5 py-1.5 text-slate-600">{total} etapas</span>
            </div>
            <button
              onClick={backToOrder}
              className="mt-5 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark"
            >
              Voltar à OS {order.number}
            </button>
          </section>
        </main>
      </div>
    );
  }

  // ================= FORM (wizard) =================
  const isLast = sectionIndex === total - 1;
  const nextSection = !isLast ? form.sections[sectionIndex + 1] : null;
  const sectionFields = section.fields.filter((f) => f.type !== "subtitle");
  const answeredCount = sectionFields.filter((f) => isFilled(draft.data[section.id]?.[f.id] as V)).length;

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader
        eyebrow={`OS ${order.number} · ${form.title} · vistoria`}
        title={section.title}
        onBack={() => {
          if (sectionIndex === 0) backToOrder();
          else editor.goSection(sectionIndex - 1);
          scrollTop();
        }}
        save={{ state: editor.saveState, time: editor.savedAtLabel ?? undefined }}
      />
      <ProgressHairline ratio={(sectionIndex + 1) / total} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        {readOnly ? (
          <p className="mt-3 rounded-xl bg-slate-100 p-3 text-center text-[13.5px] font-bold text-slate-500">
            OS {order.status === "completed" ? "concluída" : "cancelada"} - ficha somente leitura.
          </p>
        ) : null}
        {saveBanner}
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
                value={draft.data[section.id]?.[f.id] as V}
                otherDetailValue={
                  f.otherDetailId ? (draft.data[section.id]?.[f.otherDetailId] as V) : undefined
                }
                onChange={(fieldId, v) => handleChange(section.id, fieldId, v)}
              />
            ))}
          </div>
        </div>
        <div className="mt-6">
          <BottomNav
            onBack={() => {
              if (sectionIndex === 0) backToOrder();
              else editor.goSection(sectionIndex - 1);
              scrollTop();
            }}
            onNext={() => {
              if (isLast) setView("review");
              else editor.goSection(sectionIndex + 1);
              scrollTop();
            }}
            backLabel={sectionIndex === 0 ? "OS" : "Voltar"}
            nextLabel={isLast ? "Revisar ficha" : "Continuar"}
            nextHint={nextSection ? `Próxima: ${nextSection.title}` : `${total} etapas • revisar tudo`}
          />
        </div>
      </main>
    </div>
  );
}

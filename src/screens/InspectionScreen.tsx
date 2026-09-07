/**
 * Ficha de vistoria aninhada à OS (`/os/:id/ficha`).
 * Edição em cópia local + autosave real (debounce + confirmação do backend).
 * Sem ficha: escolha do tipo (property_type definido ANTES da criação -
 * melhor UX: o avaliador já sabe o que vai vistoriar ao abrir a OS).
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AppShell,
  BottomNav,
  CompletionRing,
  ErrorBlock,
  LoadingBlock,
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
      <AppShell eyebrow="Ficha de vistoria" title="Carregando" active="ficha">
        <LoadingBlock rows={4} label="Carregando ficha…" />
      </AppShell>
    );
  }

  if (editor.phase === "error" || !order) {
    return (
      <AppShell eyebrow="Ficha de vistoria" title="Não foi possível carregar" active="ficha">
        <ErrorBlock
          message={editor.error ?? "OS não encontrada."}
          onRetry={() => void editor.reload()}
        />
      </AppShell>
    );
  }

  if (order.deletedAt !== null) {
    return (
      <AppShell eyebrow="Ficha de vistoria" title="OS excluída" active="ficha">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="app-btn app-btn--primary"
          style={{ width: "100%" }}
        >
          Voltar ao início
        </button>
      </AppShell>
    );
  }

  const readOnly = isOrderTerminal(order);

  // ---------- Sem ficha: escolher tipo = Criar ----------
  if (!draft) {
    return (
      <AppShell
        eyebrow={`OS ${order.number}`}
        title="Criar ficha de vistoria"
        description="A ficha correta é carregada na ordem original do papel. Uma OS tem no máximo uma ficha."
        active="ficha"
        actions={
          <button type="button" onClick={backToOrder} className="app-btn app-btn--secondary app-btn--sm">
            ‹ Voltar à OS
          </button>
        }
      >
        {error ? (
          <p className="app-alert app-alert--error" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PROPERTY_TYPES.map((t) => (
            <TypeCard
              key={t.type}
              icon={t.icon}
              title={t.label}
              description={t.available ? t.description : "Ficha em preparação."}
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
      </AppShell>
    );
  }

  if (!form) {
    return (
      <AppShell eyebrow={`OS ${order.number}`} title="Ficha indisponível" active="ficha">
        <button
          type="button"
          onClick={backToOrder}
          className="app-btn app-btn--secondary"
          style={{ width: "100%" }}
        >
          ‹ Voltar à OS
        </button>
      </AppShell>
    );
  }

  const sectionIndex = draft.currentSectionIndex ?? 0;
  const section = form.sections[sectionIndex];
  const total = form.sections.length;

  if (!section) {
    return (
      <AppShell eyebrow={`OS ${order.number}`} title={form.title} active="ficha">
        <button
          type="button"
          onClick={backToOrder}
          className="app-btn app-btn--secondary"
          style={{ width: "100%" }}
        >
          ‹ Voltar à OS
        </button>
      </AppShell>
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
        className="app-alert app-alert--error"
        style={{ width: "100%", marginTop: 12, cursor: "pointer", textAlign: "center" }}
      >
        ⚠ {editor.saveError ?? "Erro ao salvar."} Toque para tentar de novo.
      </button>
    ) : editor.offlineNote ? (
      <p className="app-alert app-alert--warn" style={{ marginTop: 12, textAlign: "center" }}>
        Rascunho local restaurado. Será sincronizado ao salvar.
      </p>
    ) : null;

  // ================= REVIEW =================
  if (view === "review") {
    const ratio = completion.total ? completion.filled / completion.total : 0;
    return (
      <AppShell
        eyebrow={`OS ${order.number} · ${form.title} · revisão`}
        title="Revisão da ficha"
        active="ficha"
        save={{ state: editor.saveState, time: editor.savedAtLabel ?? undefined }}
        actions={
          <button
            type="button"
            onClick={() => {
              editor.goSection(total - 1);
              setView("form");
              scrollTop();
            }}
            className="app-btn app-btn--secondary app-btn--sm"
          >
            ‹ Voltar às etapas
          </button>
        }
      >
        <ProgressHairline ratio={1} />
        <div style={{ height: 12 }} />
        {saveBanner}
        <section className="app-card" style={{ marginTop: saveBanner ? 12 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <CompletionRing ratio={ratio} />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>
                Confira antes de finalizar
              </h2>
              <p className="tnum" style={{ margin: "4px 0 0", fontSize: 13.5, color: "#5b6b82" }}>
                {completion.filled} de {completion.total} campos preenchidos
              </p>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "#5b6b82" }}>
            Toque em <strong style={{ color: "#0f1e33" }}>Editar</strong> em qualquer seção para corrigir. Campos vazios não bloqueiam a conclusão.
          </p>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
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
              <article key={s.id} className="app-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="tnum app-section-label" style={{ margin: 0 }}>
                      {i + 1} · {s.title}
                    </p>
                    <p className="tnum" style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: "#8a97ad" }}>
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
                      className="app-btn app-btn--secondary app-btn--sm"
                    >
                      Editar
                    </button>
                  ) : null}
                </div>
                {rows.length === 0 ? (
                  <p style={{ margin: "8px 0 0", fontSize: 14, fontStyle: "italic", color: "#8a97ad" }}>
                    Nada preenchido nesta etapa.
                  </p>
                ) : (
                  <dl style={{ margin: "4px 0 0" }}>
                    {rows.map((f) => {
                      const raw = answers[f.id] as V;
                      const det =
                        (f.otherDetailId && (answers[f.otherDetailId] as string)) ||
                        (answers[`${f.id}_det`] as string) ||
                        "";
                      return (
                        <div key={f.id} className="app-detail">
                          <dt className="app-detail-label" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13, fontWeight: 500, color: "#5b6b82" }}>{f.label}</dt>
                          <dd className="app-detail-value">
                            {formatAnswer(raw)}
                            {det.trim() ? <span style={{ fontWeight: 500, color: "#5b6b82" }}> ({det.trim()})</span> : null}
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

        <div style={{ marginTop: 8 }}>
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
            <p className="app-alert app-alert--error" role="alert" style={{ marginTop: 8, textAlign: "center" }}>
              {error}
            </p>
          ) : null}
        </div>
      </AppShell>
    );
  }

  // ================= DONE =================
  if (view === "done") {
    return (
      <AppShell eyebrow={`OS ${order.number} · ${form.title}`} title="Ficha concluída" active="ficha">
        <section className="app-card" style={{ textAlign: "center", padding: 28 }}>
          <span style={{ margin: "0 auto", display: "flex", width: 72, height: 72, alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "#e3f2e7" }} aria-hidden>
            <svg viewBox="0 0 24 20" style={{ width: 28, height: 28, color: "#15803d" }} fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M2 10.5l6.5 6.5L22 2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 style={{ margin: "12px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Dados coletados</h2>
          <p style={{ margin: "6px auto 0", maxWidth: "34ch", fontSize: 14.5, lineHeight: 1.55, color: "#5b6b82" }}>
            A ficha foi vinculada à OS {order.number} e salva{store.backend === "supabase" ? " na nuvem" : " neste aparelho"}.
          </p>
          <div className="tnum" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: 16, fontSize: 13, fontWeight: 700 }}>
            <span className="app-pill">OS {order.number}</span>
            <span className="app-pill">{form.title}</span>
            <span className="app-pill">{total} etapas</span>
          </div>
          <button
            onClick={backToOrder}
            className="app-btn app-btn--primary"
            style={{ width: "100%", marginTop: 20 }}
          >
            Voltar à OS {order.number}
          </button>
        </section>
      </AppShell>
    );
  }

  // ================= FORM (wizard) =================
  const isLast = sectionIndex === total - 1;
  const nextSection = !isLast ? form.sections[sectionIndex + 1] : null;
  const sectionFields = section.fields.filter((f) => f.type !== "subtitle");
  const answeredCount = sectionFields.filter((f) => isFilled(draft.data[section.id]?.[f.id] as V)).length;

  return (
    <AppShell
      eyebrow={`OS ${order.number} · ${form.title} · vistoria`}
      title={section.title}
      active="ficha"
      save={{ state: editor.saveState, time: editor.savedAtLabel ?? undefined }}
      actions={
        <button
          type="button"
          onClick={() => {
            if (sectionIndex === 0) backToOrder();
            else editor.goSection(sectionIndex - 1);
            scrollTop();
          }}
          className="app-btn app-btn--secondary app-btn--sm"
        >
          {sectionIndex === 0 ? "‹ OS" : "‹ Voltar"}
        </button>
      }
    >
      <ProgressHairline ratio={(sectionIndex + 1) / total} />
      <div style={{ height: 14 }} />
      {readOnly ? (
        <p className="app-alert app-alert--info" style={{ textAlign: "center" }}>
          OS {order.status === "completed" ? "concluída" : "cancelada"}. Ficha somente leitura.
        </p>
      ) : null}
      {saveBanner}
      <div key={section.id} className="animate-rise" style={{ marginTop: readOnly || saveBanner ? 12 : 0 }}>
        <SectionHeader
          step={sectionIndex + 1}
          total={total}
          title={section.title}
          description={section.description}
          answered={answeredCount}
          ofFields={sectionFields.length}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
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
      <div style={{ marginTop: 24 }}>
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
          nextHint={nextSection ? `Próxima: ${nextSection.title}` : `${total} etapas · revisar tudo`}
        />
      </div>
    </AppShell>
  );
}

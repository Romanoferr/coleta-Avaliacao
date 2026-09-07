/**
 * Visualizar OS: abas Dados | Ficha | Documentos.
 * A ficha nasce aqui (Criar) ou continua aqui (Abrir). Sem ficha órfã.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell, BottomNav, ErrorBlock, LoadingBlock, TypeCard } from "../components/chrome";
import { ConfirmSheet, DetailRow, EmptyState, StatusChip, formatDateBR } from "../components/os";
import { DOCUMENT_KIND_LABEL } from "../domain/document";
import type { DocumentKind } from "../domain/document";
import { DomainError } from "../domain/ids";
import type { ServiceOrderStatus } from "../domain/serviceOrder";
import { STATUS_LABEL, addressLine, canTransition, isOrderTerminal } from "../domain/serviceOrder";
import { PROPERTY_TYPES, getFormDefinition } from "../form-engine/registry";
import type { PropertyType } from "../form-engine/types";
import { OsField, osInputCls } from "../components/os";
import { useStore } from "../state/store";
import { repoErrorMessage } from "../repositories/errors";

type Tab = "dados" | "ficha" | "docs";

const REOPEN_AS: ServiceOrderStatus[] = ["received", "scheduled", "inspected", "drafting"];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const {
    getOrder,
    inspectionOf,
    docsByOrder,
    docsStatus,
    ensureDocuments,
    changeStatus,
    reopen,
    deleteOrder,
    startInspection,
    addDocument,
    deleteDocument,
  } = store;
  const order = id ? getOrder(id) : undefined;

  const [tab, setTab] = useState<Tab>("dados");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [docName, setDocName] = useState("");
  const [docKind, setDocKind] = useState<DocumentKind>("photo");
  const [docError, setDocError] = useState("");
  const [confirmDocId, setConfirmDocId] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "docs" && order && docsStatus[order.id] !== "ready") {
      void ensureDocuments(order.id);
    }
  }, [tab, order, docsStatus, ensureDocuments]);

  const inspection = useMemo(() => (order ? inspectionOf(order) : undefined), [order, inspectionOf]);

  if (!order || order.deletedAt !== null) {
    return (
      <AppShell eyebrow="Ordem de serviço" title="Não encontrada" active="os">
        <EmptyState
          title="OS não encontrada"
          hint="Ela pode ter sido excluída ou o link está incorreto."
          actionLabel="Voltar ao início"
          onAction={() => navigate("/dashboard")}
        />
      </AppShell>
    );
  }

  const terminal = isOrderTerminal(order);
  const formTitle = inspection ? (() => { try { return getFormDefinition(inspection.propertyType).title; } catch { return ""; } })() : "";

  const runAsync = (fn: () => Promise<void>) => {
    setActionError("");
    setBusy(true);
    fn()
      .catch((e: unknown) => {
        setActionError(e instanceof DomainError ? e.message : repoErrorMessage(e));
      })
      .finally(() => setBusy(false));
  };

  const nextStatuses = (["received", "scheduled", "inspected", "drafting", "completed", "cancelled"] as ServiceOrderStatus[]).filter(
    (s) => s !== order.status && canTransition(order.status, s)
  );

  const createFicha = (type: PropertyType) => {
    setActionError("");
    setBusy(true);
    startInspection(order.id, type)
      .then(() => navigate(`/os/${order.id}/ficha`))
      .catch((e: unknown) => {
        setActionError(e instanceof DomainError ? e.message : repoErrorMessage(e));
        setBusy(false);
      });
  };

  const docs = docsByOrder[order.id] ?? [];
  const docsState = docsStatus[order.id] ?? "idle";

  return (
    <AppShell
      eyebrow={`OS ${order.number}`}
      title={order.contractor}
      description={addressLine(order) || "Endereço a completar na edição da OS."}
      active="os"
      actions={
        !terminal ? (
          <button
            type="button"
            onClick={() => navigate(`/os/${order.id}/edit`)}
            className="app-btn app-btn--secondary app-btn--sm"
          >
            Editar dados
          </button>
        ) : undefined
      }
    >
      <section className="app-card" aria-label="Resumo da OS">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <p className="tnum" style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            OS {order.number}
          </p>
          <StatusChip status={order.status} />
        </div>
        <p className="tnum" style={{ margin: "8px 0 0", fontSize: 13.5, fontWeight: 600, color: "#5b6b82" }}>
          {order.inspectionDate ? (
            <>📅 {formatDateBR(order.inspectionDate)}{order.inspectionTime ? ` · ${order.inspectionTime}` : ""}</>
          ) : (
            "A agendar"
          )}
          {order.dueDate ? <> · concluir até {formatDateBR(order.dueDate)}</> : null}
        </p>
      </section>

      {actionError ? (
        <p className="app-alert app-alert--error" role="alert" style={{ marginTop: 12 }}>
          {actionError}
        </p>
      ) : null}

      <div className="app-tabs" role="tablist" aria-label="Seções da OS" style={{ marginTop: 12 }}>
        {(["dados", "ficha", "docs"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`app-tabbtn${tab === t ? " app-tabbtn--active" : ""}`}
          >
            {t === "dados" ? "Dados" : t === "ficha" ? `Ficha${inspection ? " ✓" : ""}` : "Documentos"}
          </button>
        ))}
      </div>

      {tab === "dados" ? (
        <section className="app-card" style={{ marginTop: 12 }}>
          <dl className="app-detail-grid" style={{ margin: 0 }}>
            <DetailRow label="Número">OS {order.number}</DetailRow>
            <DetailRow label="Contratante">{order.contractor}</DetailRow>
            <DetailRow label="Recebida em">{formatDateBR(order.receivedAt)}</DetailRow>
            <DetailRow label="Vistoria">
              {order.inspectionDate ? `${formatDateBR(order.inspectionDate)}${order.inspectionTime ? ` · ${order.inspectionTime}` : ""}` : "A agendar"}
            </DetailRow>
            <DetailRow label="Concluir até">{order.dueDate ? formatDateBR(order.dueDate) : "·"}</DetailRow>
            <DetailRow label="Endereço">{addressLine(order) || "·"}</DetailRow>
            <DetailRow label="Responsável">
              {order.contactName || "·"}
              {order.contactPhone ? <span style={{ display: "block", color: "#5b6b82" }}>{order.contactPhone}</span> : null}
            </DetailRow>
            <DetailRow label="Observações">{order.notes || "·"}</DetailRow>
          </dl>
          <DetailRow label="Histórico">
            <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: "#5b6b82" }}>
              {order.statusHistory.length} evento{order.statusHistory.length === 1 ? "" : "s"}
              {" · último: "}
              {(() => {
                const last = order.statusHistory[order.statusHistory.length - 1];
                return last ? `${STATUS_LABEL[last.to]}${last.note ? ` (${last.note})` : ""}` : "·";
              })()}
            </span>
          </DetailRow>
          {!terminal ? (
            <button
              type="button"
              onClick={() => navigate(`/os/${order.id}/edit`)}
              className="app-btn app-btn--secondary"
              style={{ width: "100%", marginTop: 12 }}
            >
              Editar dados da OS
            </button>
          ) : (
            <p className="app-alert app-alert--info" style={{ marginTop: 12, textAlign: "center" }}>
              OS {STATUS_LABEL[order.status].toLowerCase()}: somente leitura. Reabra para editar.
            </p>
          )}
          <div style={{ marginTop: 16 }}>
            <p className="app-section-label">Situação do serviço</p>
            {!terminal ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {nextStatuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={(s === "scheduled" && !order.inspectionDate) || busy}
                    onClick={() => runAsync(() => changeStatus(order.id, s))}
                    title={s === "scheduled" && !order.inspectionDate ? "Defina a data da vistoria antes de agendar." : undefined}
                    className="app-selectitem"
                    style={{ cursor: "pointer", width: "100%" }}
                  >
                    <span className="app-selectitem-main">
                      <span className="app-selectitem-num" style={{ fontSize: 14.5 }}>
                        Marcar como {STATUS_LABEL[s]}
                      </span>
                      {s === "scheduled" && !order.inspectionDate ? (
                        <span className="app-selectitem-sub">Defina a data da vistoria primeiro</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#5b6b82" }}>Reabrir como:</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginTop: 8 }}>
                  {REOPEN_AS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => runAsync(() => reopen(order.id, s))}
                      className="app-chip"
                      style={{ minHeight: 48 }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!terminal ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  marginTop: 12, width: "100%", background: "none", border: "none",
                  cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#dc2626",
                  textDecoration: "underline", textUnderlineOffset: 2, minHeight: 44,
                }}
              >
                Excluir OS
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "ficha" ? (
        <section style={{ marginTop: 12 }}>
          {!inspection ? (
            <div className="app-card">
              <h3 className="app-card-title">Criar ficha de vistoria</h3>
              <p className="app-card-sub">
                Uma OS tem no máximo uma ficha. Escolha o tipo de imóvel:
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                {PROPERTY_TYPES.map((t) => (
                  <TypeCard
                    key={t.type}
                    icon={t.icon}
                    title={t.label}
                    description={t.available ? t.description : "Ficha em preparação."}
                    meta={t.available ? `${getFormDefinition(t.type).sections.length} etapas` : undefined}
                    disabled={!t.available || terminal}
                    onSelect={() => createFicha(t.type)}
                  />
                ))}
              </div>
              {terminal ? (
                <p className="app-alert app-alert--info" style={{ marginTop: 10 }}>
                  OS {STATUS_LABEL[order.status].toLowerCase()}: reabra a OS para criar a ficha.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="app-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <p className="app-card-title">Ficha · {formTitle}</p>
                  <p className="tnum" style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 600, color: "#5b6b82" }}>
                    {inspection.status === "finished" ? "✓ Concluída" : "◐ Em preenchimento"}
                  </p>
                </div>
                <StatusChip status={order.status} />
              </div>
              <button
                type="button"
                onClick={() => navigate(`/os/${order.id}/ficha`)}
                className="app-btn app-btn--primary"
                style={{ width: "100%", marginTop: 14 }}
              >
                {terminal ? "Ver ficha" : inspection.status === "finished" ? "Revisar ficha" : "Abrir ficha"}
              </button>
              <p className="app-muted-center">
                {terminal ? "Somente leitura." : "O progresso é salvo automaticamente."}
              </p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "docs" ? (
        <section className="app-card" style={{ marginTop: 12 }}>
          <h3 className="app-card-title">Documentos</h3>
          <p className="app-card-sub">
            Registre nome e tipo de cada documento da OS. Fotos, matrícula e contrato ficam vinculados aqui.
          </p>
          {!terminal ? (
            <div style={{ marginTop: 12, background: "#f7f8fa", border: "1px solid var(--color-line)", borderRadius: 14, padding: 12 }}>
              <OsField label="Nome do documento">
                <input
                  className={osInputCls}
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="Ex.: Matrícula do imóvel"
                  autoComplete="off"
                />
              </OsField>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <select
                  aria-label="Tipo do documento"
                  value={docKind}
                  onChange={(e) => setDocKind(e.target.value as DocumentKind)}
                  className={osInputCls}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {(Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[]).map((k) => (
                    <option key={k} value={k}>
                      {DOCUMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDocError("");
                    if (!docName.trim()) {
                      setDocError("Informe o nome do documento.");
                      return;
                    }
                    setBusy(true);
                    addDocument(order.id, { name: docName, kind: docKind })
                      .then(() => setDocName(""))
                      .catch((e: unknown) => {
                        setDocError(e instanceof DomainError ? e.message : repoErrorMessage(e));
                      })
                      .finally(() => setBusy(false));
                  }}
                  className="app-btn app-btn--primary app-btn--sm"
                  style={{ flexShrink: 0, minHeight: 52 }}
                >
                  + Adicionar
                </button>
              </div>
              {docError ? <p className="app-field-error">{docError}</p> : null}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {docsState === "loading" && docs.length === 0 ? (
              <LoadingBlock rows={2} label="Carregando documentos…" />
            ) : docsState === "error" && docs.length === 0 ? (
              <ErrorBlock message="Não foi possível carregar os documentos." onRetry={() => void ensureDocuments(order.id)} />
            ) : docs.length === 0 ? (
              <p style={{ margin: 0, padding: "8px 0", textAlign: "center", fontSize: 14, fontStyle: "italic", color: "#8a97ad" }}>
                Nenhum documento registrado.
              </p>
            ) : (
              docs.map((d) => (
                <div key={d.id} className="app-route-step">
                  <span className="app-typecard-icon" style={{ width: 44, height: 44, fontSize: 20 }} aria-hidden>
                    📄
                  </span>
                  <span className="app-route-step-main">
                    <span className="app-route-step-title">{d.name}</span>
                    <span className="app-route-step-sub">
                      {DOCUMENT_KIND_LABEL[d.kind]} · arquivo pendente
                    </span>
                  </span>
                  {!terminal ? (
                    <button
                      type="button"
                      aria-label={`Remover ${d.name}`}
                      onClick={() => setConfirmDocId(d.id)}
                      style={{
                        display: "inline-flex", width: 40, height: 40, flexShrink: 0,
                        alignItems: "center", justifyContent: "center",
                        background: "none", border: "none", borderRadius: 10,
                        fontSize: 22, color: "#8a97ad", cursor: "pointer",
                      }}
                    >
                      <span aria-hidden>×</span>
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <BottomNav
          onBack={() => navigate("/dashboard")}
          onNext={() => {
            setTab("ficha");
            window.scrollTo(0, 0);
          }}
          backLabel="OSs"
          nextLabel={inspection ? "Abrir ficha" : "Criar ficha"}
          nextHint={inspection ? `${formTitle} · OS ${order.number}` : `OS ${order.number} · máx. 1 ficha`}
        />
      </div>
      {confirmDelete ? (
        <ConfirmSheet
          title={`Excluir OS ${order.number}?`}
          message="A OS, a ficha e os documentos saem da lista (exclusão lógica). Essa ação pode ser desfeita depois."
          confirmLabel="Excluir OS"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            runAsync(() => deleteOrder(order.id).then(() => navigate("/dashboard")));
          }}
        />
      ) : null}
      {confirmDocId ? (
        <ConfirmSheet
          title="Remover documento?"
          message="O registro sai da lista da OS."
          confirmLabel="Remover"
          onCancel={() => setConfirmDocId(null)}
          onConfirm={() => {
            const docId = confirmDocId;
            setConfirmDocId(null);
            if (docId) runAsync(() => deleteDocument(docId, order.id));
          }}
        />
      ) : null}
    </AppShell>
  );
}

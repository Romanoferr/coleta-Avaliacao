/**
 * Visualizar OS: abas Dados | Ficha | Documentos.
 * A ficha nasce aqui (Criar) ou continua aqui (Abrir). Sem ficha órfã.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppHeader, BottomNav, TypeCard } from "../components/chrome";
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
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow="Ordem de serviço" title="Não encontrada" onBack={() => navigate("/dashboard")} />
        <main className="mx-auto max-w-xl px-4 pb-10 pt-6">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white"
          >
            Voltar ao início
          </button>
        </main>
      </div>
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
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow={`OS ${order.number}`} title={order.contractor} onBack={() => navigate("/dashboard")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="animate-rise mt-4 rounded-2xl border border-slate-200/80 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="tnum text-[22px] font-extrabold tracking-tight">OS {order.number}</p>
            <StatusChip status={order.status} />
          </div>
          <p className="mt-0.5 text-[14px] font-semibold text-slate-600">{order.contractor}</p>
          {addressLine(order) ? <p className="mt-0.5 text-[13.5px] text-slate-500">{addressLine(order)}</p> : null}
          <p className="tnum mt-2 text-[13px] font-semibold text-slate-500">
            {order.inspectionDate ? (
              <>📅 {formatDateBR(order.inspectionDate)}{order.inspectionTime ? ` · ${order.inspectionTime}` : ""}</>
            ) : (
              "A agendar"
            )}
            {order.dueDate ? <> · concluir até {formatDateBR(order.dueDate)}</> : null}
          </p>
        </section>

        {actionError ? (
          <p className="mt-3 rounded-2xl border-[1.5px] border-red-200 bg-red-50 p-4 text-[14px] font-bold text-red-700">
            {actionError}
          </p>
        ) : null}

        <div className="mt-3 flex gap-1.5 rounded-2xl bg-slate-200/70 p-1.5" role="tablist" aria-label="Seções da OS">
          {(["dados", "ficha", "docs"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-[52px] flex-1 rounded-xl text-[15px] font-extrabold transition-all active:scale-[0.98] ${
                tab === t ? "bg-white text-ink shadow" : "text-slate-500"
              }`}
            >
              {t === "dados" ? "Dados" : t === "ficha" ? `Ficha${inspection ? " ✓" : ""}` : "Documentos"}
            </button>
          ))}
        </div>

        {tab === "dados" ? (
          <section className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-5">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Número">OS {order.number}</DetailRow>
              <DetailRow label="Contratante">{order.contractor}</DetailRow>
              <DetailRow label="Recebida em">{formatDateBR(order.receivedAt)}</DetailRow>
              <DetailRow label="Vistoria">
                {order.inspectionDate ? `${formatDateBR(order.inspectionDate)}${order.inspectionTime ? ` · ${order.inspectionTime}` : ""}` : "A agendar"}
              </DetailRow>
              <DetailRow label="Concluir até">{order.dueDate ? formatDateBR(order.dueDate) : "-"}</DetailRow>
              <DetailRow label="Endereço">{addressLine(order) || "-"}</DetailRow>
              <DetailRow label="Responsável">
                {order.contactName || "-"}
                {order.contactPhone ? <span className="block text-slate-500">{order.contactPhone}</span> : null}
              </DetailRow>
              <DetailRow label="Observações">{order.notes || "-"}</DetailRow>
              <DetailRow label="Histórico">
                <span className="tnum text-[13.5px] font-semibold text-slate-500">
                  {order.statusHistory.length} evento{order.statusHistory.length === 1 ? "" : "s"}
                  {" · último: "}
                  {(() => {
                    const last = order.statusHistory[order.statusHistory.length - 1];
                    return last ? `${STATUS_LABEL[last.to]}${last.note ? ` (${last.note})` : ""}` : "-";
                  })()}
                </span>
              </DetailRow>
            </dl>
            {!terminal ? (
              <button
                type="button"
                onClick={() => navigate(`/os/${order.id}/edit`)}
                className="mt-4 h-[56px] w-full rounded-2xl border-[1.5px] border-slate-200 text-[16px] font-bold text-slate-700 active:bg-slate-50"
              >
                Editar dados da OS
              </button>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-100 p-3 text-center text-[13.5px] font-bold text-slate-500">
                OS {STATUS_LABEL[order.status].toLowerCase()} - somente leitura. Reabra para editar.
              </p>
            )}
            <div className="mt-4">
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-slate-400">Situação do serviço</p>
              {!terminal ? (
                <div className="mt-2 flex flex-col gap-2">
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={(s === "scheduled" && !order.inspectionDate) || busy}
                      onClick={() => runAsync(() => changeStatus(order.id, s))}
                      title={s === "scheduled" && !order.inspectionDate ? "Defina a data da vistoria antes de agendar." : undefined}
                      className="min-h-[52px] rounded-xl border-[1.5px] border-slate-200 px-4 py-2.5 text-left text-[15px] font-bold text-slate-700 transition-all active:scale-[0.99] active:border-brand disabled:opacity-50"
                    >
                      Marcar como “{STATUS_LABEL[s]}”
                      {s === "scheduled" && !order.inspectionDate ? (
                        <span className="block text-[12.5px] font-semibold text-slate-400">defina a data da vistoria primeiro</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-[13.5px] font-semibold text-slate-500">Reabrir como:</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {REOPEN_AS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={busy}
                        onClick={() => runAsync(() => reopen(order.id, s))}
                        className="min-h-[52px] rounded-xl border-[1.5px] border-slate-200 px-3 py-2 text-[14px] font-bold text-slate-700 active:border-brand"
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
                  className="mt-3 min-h-[44px] w-full text-center text-[13px] font-semibold text-red-500 underline underline-offset-2"
                >
                  Excluir OS
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === "ficha" ? (
          <section className="mt-3">
            {!inspection ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <h3 className="text-[18px] font-extrabold tracking-tight">Criar ficha de vistoria</h3>
                <p className="mt-0.5 text-[14px] text-slate-500">
                  Uma OS tem no máximo uma ficha. Escolha o tipo de imóvel:
                </p>
                <div className="mt-3 flex flex-col gap-2.5">
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
                  <p className="mt-2 text-[13px] font-semibold text-slate-400">OS {STATUS_LABEL[order.status].toLowerCase()}: reabra a OS para criar a ficha.</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[18px] font-extrabold tracking-tight">Ficha · {formTitle}</p>
                    <p className="tnum mt-0.5 text-[13px] font-semibold text-slate-500">
                      {inspection.status === "finished" ? "✓ Concluída" : "◐ Em preenchimento"}
                    </p>
                  </div>
                  <StatusChip status={order.status} />
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/os/${order.id}/ficha`)}
                  className="mt-4 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark"
                >
                  {terminal ? "Ver ficha" : inspection.status === "finished" ? "Revisar ficha" : "Abrir ficha"}
                </button>
                <p className="mt-2 text-center text-[12.5px] text-slate-400">
                  {terminal ? "Somente leitura." : "O progresso é salvo automaticamente."}
                </p>
              </div>
            )}
          </section>
        ) : null}

        {tab === "docs" ? (
          <section className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-5">
            <h3 className="text-[18px] font-extrabold tracking-tight">Documentos</h3>
            <p className="mt-0.5 text-[13.5px] text-slate-500">
              Arquivos (fotos, matrícula…) entram aqui nas próximas etapas. Por enquanto, registre nome e tipo.
            </p>
            {!terminal ? (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <OsField label="Nome do documento">
                  <input
                    className={osInputCls}
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Ex.: Matrícula do imóvel"
                    autoComplete="off"
                  />
                </OsField>
                <div className="mt-3 flex gap-2">
                  <select
                    aria-label="Tipo do documento"
                    value={docKind}
                    onChange={(e) => setDocKind(e.target.value as DocumentKind)}
                    className={`${osInputCls} min-w-0 flex-1`}
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
                    className="h-[56px] shrink-0 rounded-xl bg-brand px-5 text-[15px] font-extrabold text-white active:bg-brand-dark disabled:opacity-60"
                  >
                    + Adicionar
                  </button>
                </div>
                {docError ? <p className="mt-1.5 text-[13px] font-semibold text-red-600">{docError}</p> : null}
              </div>
            ) : null}
            <div className="mt-3 flex flex-col gap-2">
              {docsState === "loading" && docs.length === 0 ? (
                <div className="animate-pulse rounded-xl border border-slate-200 p-3">
                  <div className="h-4 w-2/3 rounded bg-slate-100" />
                </div>
              ) : docsState === "error" && docs.length === 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-[13.5px] font-bold text-red-700">Não foi possível carregar os documentos.</p>
                  <button
                    type="button"
                    onClick={() => void ensureDocuments(order.id)}
                    className="mt-1 text-[13px] font-bold text-red-700 underline underline-offset-2"
                  >
                    Tentar de novo
                  </button>
                </div>
              ) : docs.length === 0 ? (
                <p className="py-2 text-center text-[14px] italic text-slate-400">Nenhum documento registrado.</p>
              ) : (
                docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg" aria-hidden>
                      📄
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{d.name}</p>
                      <p className="text-[12.5px] font-semibold text-slate-400">
                        {DOCUMENT_KIND_LABEL[d.kind]} · arquivo pendente
                      </p>
                    </div>
                    {!terminal ? (
                      <button
                        type="button"
                        aria-label={`Remover ${d.name}`}
                        onClick={() => setConfirmDocId(d.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px] text-slate-400 active:bg-red-50 active:text-red-600"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        <div className="mt-4">
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
      </main>
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
    </div>
  );
}

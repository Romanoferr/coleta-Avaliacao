/**
 * Nova OS / Editar OS. Mesma tela, dois modos.
 * Obrigatórios: number + contractor + receivedAt. Restante opcional.
 * Erros de domínio aparecem em linha no campo (nunca toast genérico).
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell, BottomNav } from "../components/chrome";
import { OsField, osInputCls } from "../components/os";
import { DomainError, todayLocalIso } from "../domain/ids";
import type { CreateOrderInput } from "../domain/serviceOrder";
import { addressFromForm, useStore } from "../state/store";
import { repoErrorMessage } from "../repositories/errors";

type StrMap = Record<string, string>;

const EMPTY: StrMap = {
  number: "",
  contractor: "",
  receivedAt: todayLocalIso(),
  inspectionDate: "",
  inspectionTime: "",
  dueDate: "",
  street: "",
  number_addr: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  postalCode: "",
  raw: "",
  contactName: "",
  contactPhone: "",
  notes: "",
};

export default function OrderForm({ mode }: { mode: "new" | "edit" }) {
  const { id } = useParams();
  const { getOrder, createOrder, updateOrder } = useStore();
  const navigate = useNavigate();
  const existing = mode === "edit" ? (id ? getOrder(id) : undefined) : undefined;

  const [v, setV] = useState<StrMap>(() => {
    if (!existing) return EMPTY;
    const a = existing.address;
    return {
      ...EMPTY,
      number: existing.number,
      contractor: existing.contractor,
      receivedAt: existing.receivedAt,
      inspectionDate: existing.inspectionDate ?? "",
      inspectionTime: existing.inspectionTime ?? "",
      dueDate: existing.dueDate ?? "",
      street: a.street ?? "",
      number_addr: a.number ?? "",
      complement: a.complement ?? "",
      district: a.district ?? "",
      city: a.city ?? "",
      state: a.state ?? "",
      postalCode: a.postalCode ?? "",
      raw: a.raw ?? "",
      contactName: existing.contactName ?? "",
      contactPhone: existing.contactPhone ?? "",
      notes: existing.notes ?? "",
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");
  const [saving, setSaving] = useState(false);

  if (mode === "edit" && !existing) {
    return (
      <AppShell eyebrow="Ordem de serviço" title="Não encontrada" active="os">
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

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  const toInput = (): CreateOrderInput => ({
    number: v.number,
    contractor: v.contractor,
    receivedAt: v.receivedAt,
    inspectionDate: v.inspectionDate || null,
    inspectionTime: v.inspectionTime || null,
    dueDate: v.dueDate || null,
    address: addressFromForm({
      street: v.street,
      number: v.number_addr,
      complement: v.complement,
      district: v.district,
      city: v.city,
      state: v.state,
      postalCode: v.postalCode,
      raw: v.raw,
    }),
    contactName: v.contactName || null,
    contactPhone: v.contactPhone || null,
    notes: v.notes || null,
  });

  const save = () => {
    if (saving) return;
    setErrors({});
    setGlobalError("");
    setSaving(true);
    const done = (fn: Promise<unknown>) =>
      fn
        .then((created) => {
          if (mode === "new") navigate(`/os/${(created as { id: string }).id}`, { replace: true });
          else if (existing) navigate(`/os/${existing.id}`);
        })
        .catch((e: unknown) => {
          if (e instanceof DomainError && e.fields) setErrors(e.fields);
          else if (e instanceof DomainError) setGlobalError(e.message);
          else setGlobalError(repoErrorMessage(e));
          window.scrollTo(0, 0);
        })
        .finally(() => setSaving(false));
    if (mode === "new") done(createOrder(toInput()));
    else if (existing) done(updateOrder(existing.id, toInput()).then(() => ({ id: existing.id })));
  };

  const backTo = mode === "new" ? "/dashboard" : `/os/${existing?.id ?? ""}`;

  return (
    <AppShell
      eyebrow="Ordem de serviço"
      title={mode === "new" ? "Nova OS" : `Editar OS ${existing?.number ?? ""}`}
      description={
        mode === "new"
          ? "Cadastre a ordem com os dados recebidos. A ficha de vistoria é criada dentro da OS."
          : "Atualize os dados da ordem. Alterações de data em OS agendada ficam registradas no histórico."
      }
      active={mode === "new" ? "new" : "os"}
      wide
    >
      {globalError ? (
        <p className="app-alert app-alert--error" role="alert" style={{ marginBottom: 12 }}>
          {globalError}
        </p>
      ) : null}
      <div className="app-formgrid">
        <div className="app-card">
          <p className="app-section-label">Identificação</p>
          <div className="app-fieldstack">
            <OsField label="Número da OS" required error={errors.number}>
              <input
                className={osInputCls}
                value={v.number}
                onChange={set("number")}
                placeholder="Ex.: 1234"
                autoComplete="off"
                inputMode="numeric"
              />
            </OsField>
            <OsField label="Contratante" required error={errors.contractor} hint="Quem contratou o serviço (banco, cliente…).">
              <input className={osInputCls} value={v.contractor} onChange={set("contractor")} placeholder="Ex.: Banco X" autoComplete="off" />
            </OsField>
            <OsField label="Data de recebimento" required error={errors.receivedAt}>
              <input type="date" className={`${osInputCls} tnum`} value={v.receivedAt} onChange={set("receivedAt")} />
            </OsField>
          </div>
        </div>

        <div className="app-card">
          <p className="app-section-label">Agenda</p>
          <div className="app-fieldstack">
            <OsField label="Data da vistoria" error={errors.inspectionDate} hint="Vazio = a agendar.">
              <input type="date" className={`${osInputCls} tnum`} value={v.inspectionDate} onChange={set("inspectionDate")} />
            </OsField>
            <div className="app-duo">
              <OsField label="Hora da vistoria" error={errors.inspectionTime}>
                <input type="time" className={`${osInputCls} tnum`} value={v.inspectionTime} onChange={set("inspectionTime")} />
              </OsField>
              <OsField label="Conclusão até" error={errors.dueDate}>
                <input type="date" className={`${osInputCls} tnum`} value={v.dueDate} onChange={set("dueDate")} />
              </OsField>
            </div>
          </div>
        </div>

        <div className="app-card">
          <p className="app-section-label">Local do imóvel</p>
          <div className="app-fieldstack">
            <div className="app-duo app-duo--street">
              <OsField label="Rua / Avenida">
                <input className={osInputCls} value={v.street} onChange={set("street")} placeholder="Ex.: Av. Paraná" autoComplete="off" />
              </OsField>
              <OsField label="Número">
                <input className={osInputCls} value={v.number_addr} onChange={set("number_addr")} placeholder="3141" autoComplete="off" inputMode="numeric" />
              </OsField>
            </div>
            <OsField label="Complemento">
              <input className={osInputCls} value={v.complement} onChange={set("complement")} placeholder="Apto, bloco…" autoComplete="off" />
            </OsField>
            <div className="app-duo">
              <OsField label="Bairro">
                <input className={osInputCls} value={v.district} onChange={set("district")} placeholder="Ex.: Centro" autoComplete="off" />
              </OsField>
              <OsField label="CEP">
                <input className={osInputCls} value={v.postalCode} onChange={set("postalCode")} placeholder="Ex.: 86020-000" autoComplete="off" inputMode="numeric" />
              </OsField>
            </div>
            <div className="app-duo app-duo--city">
              <OsField label="Cidade">
                <input className={osInputCls} value={v.city} onChange={set("city")} placeholder="Ex.: Londrina" autoComplete="off" />
              </OsField>
              <OsField label="UF">
                <input className={osInputCls} value={v.state} onChange={set("state")} placeholder="PR" autoComplete="off" maxLength={2} />
              </OsField>
            </div>
            <OsField label="Endereço como recebido" hint="Use quando não der para decompor acima.">
              <textarea className={osInputCls} rows={2} value={v.raw} onChange={set("raw")} placeholder="Texto corrido do endereço" />
            </OsField>
          </div>
        </div>

        <div className="app-card">
          <p className="app-section-label">Contato e notas</p>
          <div className="app-fieldstack">
            <OsField label="Responsável no local">
              <input className={osInputCls} value={v.contactName} onChange={set("contactName")} placeholder="Nome de quem recebe" autoComplete="off" />
            </OsField>
            <OsField label="Telefone / contato">
              <input className={osInputCls} value={v.contactPhone} onChange={set("contactPhone")} placeholder="(43) 99999-9999" autoComplete="off" inputMode="tel" />
            </OsField>
            <OsField label="Observações da OS" hint="Administrativas. Não confundir com a vistoria técnica.">
              <textarea className={osInputCls} rows={3} value={v.notes} onChange={set("notes")} placeholder="Anotações do serviço" />
            </OsField>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <BottomNav
          onBack={() => navigate(backTo)}
          onNext={save}
          backLabel="Cancelar"
          nextLabel={saving ? "Salvando…" : mode === "new" ? "Criar OS" : "Salvar alterações"}
          nextHint={mode === "new" ? "Depois: criar a ficha dentro da OS" : `OS ${existing?.number ?? ""}`}
        />
      </div>
    </AppShell>
  );
}

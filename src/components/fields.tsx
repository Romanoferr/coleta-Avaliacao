import type { FormField } from "../form-engine/types";

type Value = string | number | string[] | undefined;

interface Props {
  field: FormField;
  value: Value;
  otherDetailValue?: Value;
  onChange: (fieldId: string, value: string | number | string[]) => void;
}

const inputCls =
  "w-full min-h-[56px] rounded-xl border-2 border-slate-200 bg-white px-4 text-lg text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none";

function FieldLabel({ field }: { field: FormField }) {
  return (
    <div className="mb-2">
      <p className="text-[17px] font-semibold leading-snug text-slate-900">{field.label}</p>
      {field.hint && <p className="mt-0.5 text-sm text-slate-500">{field.hint}</p>}
    </div>
  );
}

function CounterInput({ field, value, onChange }: Props) {
  const num = typeof value === "number" ? value : Number(value ?? 0) || 0;
  const dec = () => onChange(field.id, Math.max(field.min ?? 0, num - 1));
  const inc = () => onChange(field.id, num + 1);
  return (
    <div>
      <FieldLabel field={field} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={dec}
          aria-label={`Diminuir ${field.label}`}
          className="h-14 w-14 shrink-0 rounded-xl border-2 border-slate-200 bg-white text-2xl font-bold text-slate-700 active:bg-slate-100"
        >
          −
        </button>
        <input
          className={`${inputCls} text-center font-semibold`}
          inputMode="numeric"
          pattern="[0-9]*"
          value={num === 0 ? "" : String(num)}
          placeholder="0"
          aria-label={field.label}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            onChange(field.id, v === "" ? 0 : Number(v));
          }}
        />
        <button
          type="button"
          onClick={inc}
          aria-label={`Aumentar ${field.label}`}
          className="h-14 w-14 shrink-0 rounded-xl bg-blue-600 text-2xl font-bold text-white active:bg-blue-700"
        >
          +
        </button>
      </div>
    </div>
  );
}

function RadioCards({ field, value, onChange }: Props) {
  return (
    <fieldset>
      <FieldLabel field={field} />
      <div className="flex flex-col gap-2.5">
        {field.options?.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(field.id, o.value)}
              className={`min-h-[56px] rounded-xl border-2 px-4 py-3 text-left text-[16px] font-medium transition-colors ${
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-900"
                  : "border-slate-200 bg-white text-slate-800 active:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-blue-600" : "border-slate-300"
                  }`}
                >
                  {selected && <span className="h-3 w-3 rounded-full bg-blue-600" />}
                </span>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CheckCards({ field, value, onChange }: Props) {
  const arr = Array.isArray(value) ? value : [];
  const toggle = (v: string) => {
    onChange(
      field.id,
      arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
    );
  };
  return (
    <fieldset>
      <FieldLabel field={field} />
      <div className="flex flex-col gap-2.5">
        {field.options?.map((o) => {
          const selected = arr.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(o.value)}
              className={`min-h-[56px] rounded-xl border-2 px-4 py-3 text-left text-[16px] font-medium transition-colors ${
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-900"
                  : "border-slate-200 bg-white text-slate-800 active:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                    selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent"
                  }`}
                >
                  <svg viewBox="0 0 12 10" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1 5l3.5 3.5L11 1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
      {arr.length > 0 && (
        <button
          type="button"
          onClick={() => onChange(field.id, [])}
          className="mt-2 text-sm font-medium text-slate-500 underline underline-offset-2"
        >
          Limpar seleção ({arr.length})
        </button>
      )}
    </fieldset>
  );
}

function YesNo({ field, value, onChange }: Props) {
  const btn = (v: string) => {
    const selected = value === v;
    return `flex h-14 flex-1 items-center justify-center rounded-xl border-2 text-lg font-semibold ${
      selected
        ? v === "Sim"
          ? "border-green-600 bg-green-50 text-green-800"
          : "border-red-500 bg-red-50 text-red-700"
        : "border-slate-200 bg-white text-slate-600"
    }`;
  };
  return (
    <div>
      <FieldLabel field={field} />
      <div className="flex gap-2.5" role="group" aria-label={field.label}>
        <button type="button" aria-pressed={value === "Sim"} className={btn("Sim")} onClick={() => onChange(field.id, "Sim")}>
          Sim
        </button>
        <button type="button" aria-pressed={value === "Não"} className={btn("Não")} onClick={() => onChange(field.id, "Não")}>
          Não
        </button>
      </div>
    </div>
  );
}

export function FieldRenderer(props: Props) {
  const { field, value, otherDetailValue, onChange } = props;

  if (field.type === "subtitle") {
    return <h4 className="pt-2 text-sm font-bold uppercase tracking-wide text-slate-500">{field.label}</h4>;
  }
  if (field.type === "counter") return <CounterInput {...props} />;
  if (field.type === "radio") return <RadioCards {...props} />;
  if (field.type === "checkbox") return <CheckCards {...props} />;
  if (field.type === "yesno") return <YesNo {...props} />;

  const showOther =
    field.allowOtherDetail &&
    field.otherDetailId &&
    (value === "Outros" || (Array.isArray(value) && value.includes("Outros")));

  return (
    <div>
      <label className="mb-2 block">
        <span className="text-[17px] font-semibold leading-snug text-slate-900">{field.label}</span>
        {field.hint && <span className="mt-0.5 block text-sm font-normal text-slate-500">{field.hint}</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea
          className={`${inputCls} py-3`}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      ) : field.type === "currency" ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-500">
            R$
          </span>
          <input
            className={`${inputCls} pl-12`}
            inputMode="decimal"
            placeholder={field.placeholder ?? "0,00"}
            value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        </div>
      ) : field.type === "date" ? (
        <input
          type="date"
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      ) : (
        <input
          className={inputCls}
          type={field.type === "number" ? "number" : "text"}
          inputMode={field.type === "number" ? "numeric" : field.type === "tel" ? "tel" : "text"}
          placeholder={field.placeholder}
          autoComplete="off"
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      )}
      {showOther && field.otherDetailId && (
        <input
          className={`${inputCls} mt-2`}
          placeholder={field.otherDetailLabel ?? "Qual?"}
          aria-label={field.otherDetailLabel ?? "Qual?"}
          value={typeof otherDetailValue === "string" ? otherDetailValue : ""}
          onChange={(e) => onChange(field.otherDetailId!, e.target.value)}
        />
      )}
    </div>
  );
}

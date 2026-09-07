/**
 * Campos reutilizáveis - linguagem única (docs/UX-FOCUS.md §4).
 * Alvos ≥48px, selecionado = borda + fundo + ícone (nunca só cor).
 */
import type { FormField } from "../form-engine/types";

type Value = string | number | string[] | undefined;

interface Props {
  field: FormField;
  value: Value;
  otherDetailValue?: Value;
  onChange: (fieldId: string, value: string | number | string[]) => void;
}

const inputCls =
  "w-full min-h-[56px] rounded-xl border-[1.5px] border-slate-300 bg-white px-4 text-[16px] text-ink placeholder:text-slate-400 transition-colors focus:border-brand focus:outline-none focus:ring-4 focus:ring-blue-600/15";

/**
 * Formata centavos (só dígitos) para moeda pt-BR: "1" → "0,01",
 * "123456" → "1.234,56". Idempotente sobre valores já formatados.
 */
export function formatBRL(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Label({ field }: { field: FormField }) {
  return (
    <div className="mb-2">
      <p className="text-[16px] font-bold leading-snug">
        {field.label}
        {field.required && (
          <span className="ml-1 text-brand" aria-hidden>
            *
          </span>
        )}
      </p>
      {field.hint && <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{field.hint}</p>}
    </div>
  );
}

/** Linha compacta: rótulo à esquerda, stepper à direita - economiza rolagem. */
function CounterRow({ field, value, onChange }: Props) {
  const num = typeof value === "number" ? value : Number(value ?? 0) || 0;
  const dec = () => onChange(field.id, Math.max(field.min ?? 0, num - 1));
  const inc = () => onChange(field.id, num + 1);
  const stepBtn =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[22px] font-extrabold transition-all focus-visible:outline-2 focus-visible:outline-brand active:scale-95";
  return (
    <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-slate-200 bg-white py-2 pl-4 pr-2">
      <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{field.label}</p>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={dec}
          aria-label={`Diminuir ${field.label}`}
          className={`${stepBtn} border-[1.5px] border-slate-200 text-slate-500 active:bg-slate-100`}
        >
          −
        </button>
        <span
          className="tnum w-11 text-center text-[19px] font-extrabold"
          aria-live="polite"
          aria-label={`${field.label}: ${num}`}
        >
          {num}
        </span>
        <button
          type="button"
          onClick={inc}
          aria-label={`Aumentar ${field.label}`}
          className={`${stepBtn} bg-brand text-white shadow-[0_1px_4px_rgba(29,78,216,0.4)] active:bg-brand-dark`}
        >
          +
        </button>
      </div>
    </div>
  );
}

const optionBtn = (selected: boolean) =>
  `flex min-h-[56px] w-full items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3 text-left text-[15.5px] font-semibold leading-snug transition-all focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.99] ${
    selected
      ? "border-brand bg-blue-50 text-blue-950 shadow-[0_1px_4px_rgba(29,78,216,0.15)]"
      : "border-slate-200 bg-white text-slate-700 active:bg-slate-50"
  }`;

function RadioCards({ field, value, onChange }: Props) {
  // Normaliza legado salvo como array (campos migrados de checkbox → radio).
  const single = Array.isArray(value) ? value[0] : value;
  return (
    <fieldset>
      <Label field={field} />
      <div className="flex flex-col gap-2">
        {field.options?.map((o) => {
          const selected = single === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(field.id, o.value)}
              className={optionBtn(selected)}
            >
              <span
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  selected ? "border-brand" : "border-slate-300"
                }`}
                aria-hidden
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
              </span>
              <span className="min-w-0">{o.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Grade 2 colunas quando TODOS os rótulos são curtos (economiza até 50% da
 * rolagem em listas como infraestrutura); senão lista 1 coluna legível.
 */
function CheckCards({ field, value, onChange }: Props) {
  const arr = Array.isArray(value) ? value : [];
  const compact =
    !!field.options &&
    field.options.length >= 4 &&
    field.options.every((o) => o.label.length <= 24);
  const toggle = (v: string) =>
    onChange(field.id, arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <fieldset>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[16px] font-bold leading-snug">
            {field.label}
            {field.required && (
              <span className="ml-1 text-brand" aria-hidden>
                *
              </span>
            )}
          </p>
          {field.hint && <p className="mt-0.5 text-[13px] text-slate-500">{field.hint}</p>}
        </div>
        {arr.length > 0 && (
          <span className="tnum shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-extrabold text-brand">
            {arr.length} ✓
          </span>
        )}
      </div>
      <div className={compact ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
        {field.options?.map((o) => {
          const selected = arr.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(o.value)}
              className={optionBtn(selected)}
            >
              <span
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors ${
                  selected ? "border-brand bg-brand text-white" : "border-slate-300 text-transparent"
                }`}
                aria-hidden
              >
                <svg viewBox="0 0 12 10" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M1 5l3.5 3.5L11 1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0">{o.label}</span>
            </button>
          );
        })}
      </div>
      {arr.length > 0 && (
        <button
          type="button"
          onClick={() => onChange(field.id, [])}
          className="mt-2 min-h-[44px] px-1 text-left text-[13px] font-semibold text-slate-400 underline underline-offset-2"
        >
          Limpar seleção
        </button>
      )}
    </fieldset>
  );
}

/**
 * Rosa dos ventos: 8 direções em grade 3×3, centro mostra a seleção atual.
 * Valor armazenado = option.value da direção (seleção única, como radio).
 */
interface CompassDir {
  abbrev: string;
  match: string[];
}

const COMPASS_DIRS: CompassDir[] = [
  { abbrev: "NO", match: ["noroeste", "no", "northwest", "nw"] },
  { abbrev: "N", match: ["norte", "n", "north"] },
  { abbrev: "NE", match: ["nordeste", "ne", "northeast"] },
  { abbrev: "O", match: ["oeste", "o", "west", "w"] },
  { abbrev: "L", match: ["leste", "l", "este", "e", "east"] },
  { abbrev: "SE", match: ["sudeste", "se", "southeast", "suldeste"] },
  { abbrev: "S", match: ["sul", "s", "south"] },
  { abbrev: "SO", match: ["sudoeste", "so", "southwest", "sw"] },
];

/** Ordem dos slots na grade: NO N NE / O ● L / SO S SE */
const COMPASS_SLOTS = [0, 1, 2, 3, -1, 4, 5, 6, 7] as const;

/** Resolve o value/label de uma opção para um índice em COMPASS_DIRS. */
export function resolveCompassDir(text: string): number {
  const norm = text.trim().toLowerCase();
  return COMPASS_DIRS.findIndex((d) => d.match.includes(norm));
}

function Compass({ field, value, onChange }: Props) {
  const single = Array.isArray(value) ? value[0] : value;
  const slotOf = new Map<number, number>();
  field.options?.forEach((o) => {
    const dir = resolveCompassDir(o.value) >= 0 ? resolveCompassDir(o.value) : resolveCompassDir(o.label);
    if (dir >= 0 && !slotOf.has(dir)) slotOf.set(dir, field.options!.indexOf(o));
  });
  const selectedDir = typeof single === "string" ? resolveCompassDir(single) : -1;
  const selectedOpt = selectedDir >= 0 && slotOf.has(selectedDir) ? field.options![slotOf.get(selectedDir)!] : undefined;

  return (
    <fieldset>
      <Label field={field} />
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={field.label}>
        {COMPASS_SLOTS.map((slot, i) => {
          if (slot === -1) {
            return (
              <div
                key="center"
                className="flex min-h-[56px] flex-col items-center justify-center rounded-2xl border-[1.5px] border-slate-200 bg-slate-50"
                aria-live="polite"
              >
                <span className="tnum text-[19px] font-extrabold text-brand">{selectedOpt ? COMPASS_DIRS[selectedDir].abbrev : "–"}</span>
                <span className="max-w-full truncate px-1 text-[10px] font-semibold text-slate-500">
                  {selectedOpt ? selectedOpt.label : "Toque numa direção"}
                </span>
              </div>
            );
          }
          const optIdx = slotOf.get(slot);
          if (optIdx === undefined) return <span key={i} />;
          const o = field.options![optIdx];
          const selected = single === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(field.id, o.value)}
              className={`flex min-h-[56px] flex-col items-center justify-center rounded-2xl border-[1.5px] px-1 py-1.5 transition-all focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.97] ${
                selected
                  ? "border-brand bg-blue-50 text-blue-950 shadow-[0_1px_4px_rgba(29,78,216,0.15)]"
                  : "border-slate-200 bg-white text-slate-700 active:bg-slate-50"
              }`}
            >
              <span className="tnum text-[17px] font-extrabold leading-none">{COMPASS_DIRS[slot].abbrev}</span>
              <span className="mt-0.5 max-w-full truncate text-[10px] font-semibold leading-tight">{o.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Campo livre complementar (Outros / Sim-com-detalhe). */
function DetailInput({
  fieldId,
  label,
  value,
  onChange,
}: {
  fieldId: string;
  label: string;
  value: Value;
  onChange: Props["onChange"];
}) {
  return (
    <input
      className={`${inputCls} mt-2`}
      placeholder={label}
      aria-label={label}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(fieldId, e.target.value)}
    />
  );
}

function YesNo({ field, value, otherDetailValue, onChange }: Props) {
  const seg = (v: "Sim" | "Não") => {
    const active = value === v;
    const color =
      v === "Sim"
        ? active
          ? "bg-green-700 text-white shadow-[0_1px_4px_rgba(21,128,61,0.4)]"
          : "text-slate-500"
        : active
          ? "bg-red-600 text-white shadow-[0_1px_4px_rgba(220,38,38,0.35)]"
          : "text-slate-500";
    return `h-[56px] flex-1 rounded-xl text-[16px] font-extrabold transition-all focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.98] ${color}`;
  };
  return (
    <div>
      <Label field={field} />
      <div className="flex gap-1.5 rounded-2xl bg-slate-200/70 p-1.5" role="group" aria-label={field.label}>
        <button type="button" aria-pressed={value === "Sim"} className={seg("Sim")} onClick={() => onChange(field.id, "Sim")}>
          Sim
        </button>
        <button type="button" aria-pressed={value === "Não"} className={seg("Não")} onClick={() => onChange(field.id, "Não")}>
          Não
        </button>
      </div>
      {value === "Sim" && field.otherDetailId && (
        <DetailInput
          fieldId={field.otherDetailId}
          label={field.otherDetailLabel ?? "Descreva"}
          value={otherDetailValue}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export function FieldRenderer(props: Props) {
  const { field, value, otherDetailValue, onChange } = props;

  if (field.type === "counter") return <CounterRow {...props} />;
  if (field.type === "radio") return <RadioCards {...props} />;
  if (field.type === "checkbox") return <CheckCards {...props} />;
  if (field.type === "yesno") return <YesNo {...props} />;
  if (field.type === "compass") return <Compass {...props} />;
  if (field.type === "subtitle") {
    return (
      <h4 className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {field.label}
      </h4>
    );
  }

  const needsOther =
    field.allowOtherDetail &&
    field.otherDetailId &&
    (value === "Outros" || (Array.isArray(value) && value.includes("Outros")));

  return (
    <div>
      <label className="mb-2 block" htmlFor={`f-${field.id}`}>
        <span className="text-[16px] font-bold leading-snug">
          {field.label}
          {field.required && (
            <span className="ml-1 text-brand" aria-hidden>
              *
            </span>
          )}
        </span>
        {field.hint && (
          <span className="mt-0.5 block text-[13px] font-normal leading-snug text-slate-500">{field.hint}</span>
        )}
      </label>
      {field.type === "textarea" ? (
        <textarea
          id={`f-${field.id}`}
          className={`${inputCls} py-3.5`}
          rows={field.rows ?? 3}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      ) : field.type === "currency" ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-extrabold text-slate-400">
            R$
          </span>
          <input
            id={`f-${field.id}`}
            className={`${inputCls} tnum pl-12`}
            inputMode="numeric"
            placeholder={field.placeholder ?? "0,00"}
            autoComplete="off"
            value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
            onChange={(e) => onChange(field.id, formatBRL(e.target.value))}
          />
        </div>
      ) : field.type === "number" ? (
        <input
          id={`f-${field.id}`}
          className={`${inputCls} tnum`}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={field.placeholder}
          autoComplete="off"
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          onChange={(e) => onChange(field.id, e.target.value.replace(/\D/g, ""))}
        />
      ) : field.type === "date" ? (
        <input
          id={`f-${field.id}`}
          type="date"
          className={`${inputCls} tnum`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      ) : (
        <input
          id={`f-${field.id}`}
          className={inputCls}
          inputMode={field.type === "tel" ? "tel" : "text"}
          placeholder={field.placeholder}
          autoComplete="off"
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      )}
      {needsOther && field.otherDetailId && (
        <DetailInput
          fieldId={field.otherDetailId}
          label={field.otherDetailLabel ?? "Qual?"}
          value={otherDetailValue}
          onChange={onChange}
        />
      )}
    </div>
  );
}

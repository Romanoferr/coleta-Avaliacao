/**
 * Peças compartilhadas do site institucional.
 * Sem dependências novas: revelação por IntersectionObserver + CSS.
 */
import { useEffect, useRef, type ReactNode } from "react";

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Revela o conteúdo ao entrar na viewport (respeita prefers-reduced-motion via CSS). */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "figure" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const setRef = (node: HTMLElement | null) => {
    ref.current = node;
  };
  return (
    <Tag
      ref={setRef as never}
      className={`site-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand">
      <span aria-hidden className="inline-block h-[2px] w-6 rounded-full bg-brand" />
      {children}
    </p>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  const centered = align === "center";
  return (
    <Reveal className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <div className={centered ? "flex justify-center" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <h2 className="mt-3 text-balance text-[28px] font-extrabold leading-[1.12] tracking-tight text-ink sm:text-[36px]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-3 text-pretty text-[15.5px] leading-relaxed text-slate-600">{lead}</p>
      ) : null}
    </Reveal>
  );
}

/** Marca da plataforma - mesma linguagem do produto (quadrado tinta + casa). */
export function SiteMark({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-xl bg-ink font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      ⌂
    </span>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <SiteMark size={compact ? 34 : 38} />
      <span className="leading-none">
        <span className="block text-[16px] font-extrabold tracking-tight text-ink">
          Coleta Avaliação
        </span>
        <span className="mt-0.5 block text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Vistorias · Avaliações · Rotas
        </span>
      </span>
    </span>
  );
}

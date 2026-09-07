/**
 * Sistema de navegação e primitivas da área logada.
 * Mesma identidade do site institucional (tinta, azul de marca, raios,
 * hierarquia tipográfica), adaptada para uso operacional diário.
 * Desktop: sidebar fixa. Mobile: barra superior + trilho de navegação.
 */
import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";

export type SaveState = "saved" | "saving" | "pending" | "error";

const SAVE_DOT: Record<SaveState, string> = {
  saved: "animate-save-ping bg-green-600",
  saving: "bg-amber-500",
  pending: "bg-amber-500",
  error: "bg-red-500",
};

const SAVE_TEXT: Record<SaveState, string> = {
  saved: "Salvo",
  saving: "Salvando…",
  pending: "Alterações pendentes",
  error: "Erro ao salvar",
};

export function SaveBadge({ state, time }: { state: SaveState; time?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600"
      role="status"
      aria-live="polite"
    >
      <span key={state + (time ?? "")} className={`h-2 w-2 rounded-full ${SAVE_DOT[state]}`} />
      {state === "saved" ? `Salvo${time ? ` · ${time}` : ""}` : SAVE_TEXT[state]}
    </span>
  );
}

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-ink font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size * 0.52 }}
      aria-hidden
    >
      ⌂
    </span>
  );
}

const NAV_ITEMS = [
  { to: "/dashboard", label: "Início", icon: "⌂", end: true },
  { to: "/rota", label: "Otimizar rota", icon: "◎", end: false },
  { to: "/os/new", label: "Nova OS", icon: "+", end: false },
  { to: "/assinatura", label: "Assinatura", icon: "R$", end: true },
];

function AccountBlock({ compact = false }: { compact?: boolean }) {
  const { user, displayName, signOut } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className={compact ? "app-account app-account--compact" : "app-account"}>
      <span className="app-avatar" aria-hidden>
        {initial}
      </span>
      <p className="app-account-name" title={user?.email ?? ""}>
        {displayName ?? user?.email ?? "Conta"}
      </p>
      <button
        type="button"
        onClick={() => {
          void signOut().then(() => navigate("/login", { replace: true }));
        }}
        className="app-account-exit"
        aria-label="Sair da conta"
      >
        Sair
      </button>
    </div>
  );
}

/**
 * Moldura de todas as telas logadas.
 * `active` indica a seção atual para destacar na navegação.
 */
export function AppShell({
  eyebrow,
  title,
  description,
  actions,
  active,
  save,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  active: "home" | "route" | "new" | "os" | "ficha" | "billing";
  save?: { state: SaveState; time?: string };
  children: ReactNode;
  wide?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isNavActive = (to: string) => {
    if (to === "/dashboard") return active === "home";
    if (to === "/rota") return active === "route";
    if (to === "/os/new") return active === "new";
    if (to === "/assinatura") return active === "billing";
    return false;
  };

  return (
    <div className="app-shell">
      {/* Sidebar desktop */}
      <aside className="app-sidebar" aria-label="Navegação principal">
        <div className="app-sidebar-brand">
          <BrandMark size={38} />
          <span className="app-sidebar-brand-text">
            <strong>Coleta Avaliação</strong>
            <span>Vistorias e avaliações</span>
          </span>
        </div>
        <nav className="app-sidebar-nav" aria-label="Seções">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={() => `app-nav-item${isNavActive(item.to) ? " app-nav-item--active" : ""}`}
              aria-current={isNavActive(item.to) ? "page" : undefined}
            >
              <span className="app-nav-icon" aria-hidden>
                {item.icon}
              </span>
              {item.label}
              {item.to === "/rota" ? <span className="app-nav-flag">Rota</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="app-sidebar-foot">
          <AccountBlock />
          <p className="app-sidebar-hint">Seus dados ficam na sua conta.</p>
        </div>
      </aside>

      <div className="app-main-col">
        {/* Barra mobile */}
        <header className="app-topbar">
          <div className="app-topbar-row">
            <BrandMark size={34} />
            <div className="app-topbar-titles">
              <p className="app-eyebrow">{eyebrow}</p>
              <h1 className="app-topbar-title">{title}</h1>
            </div>
            {save ? <SaveBadge state={save.state} time={save.time} /> : null}
            <button
              type="button"
              className="app-avatar-btn"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Fechar menu da conta" : "Abrir menu da conta"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <AccountAvatar />
            </button>
          </div>
          {menuOpen ? (
            <div className="app-topbar-menu">
              <AccountBlock compact />
            </div>
          ) : null}
          <nav className="app-tabrail" aria-label="Seções">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={() => `app-tab${isNavActive(item.to) ? " app-tab--active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* Conteúdo */}
        <main className={`app-content${wide ? " app-content--wide" : ""}`}>
          <div className="app-pagehead">
            <div className="app-pagehead-text">
              <p className="app-eyebrow app-eyebrow--desktop">{eyebrow}</p>
              <h1 className="app-pagehead-title">{title}</h1>
              {description ? <p className="app-pagehead-desc">{description}</p> : null}
              {save ? (
                <div className="app-pagehead-save">
                  <SaveBadge state={save.state} time={save.time} />
                </div>
              ) : null}
            </div>
            {actions ? <div className="app-pagehead-actions">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function AccountAvatar() {
  const { user } = useAuth();
  return (
    <span className="app-avatar" aria-hidden>
      {(user?.email ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Cabeçalho simples das telas públicas de acesso (login, cadastro, senha). */
export function AppHeader({
  eyebrow,
  title,
  onBack,
  save,
}: {
  eyebrow: string;
  title: string;
  onBack?: () => void;
  save?: { state: SaveState; time?: string };
}) {
  return (
    <header className="app-topbar" style={{ position: "static" }}>
      <div className="app-topbar-row" style={{ paddingBottom: 10 }}>
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="app-btn app-btn--secondary app-btn--sm"
            style={{ minHeight: 44, padding: "6px 14px" }}
          >
            ‹
          </button>
        ) : (
          <BrandMark size={34} />
        )}
        <div className="app-topbar-titles">
          <p className="app-eyebrow">{eyebrow}</p>
          <h1 className="app-topbar-title">{title}</h1>
        </div>
        {save && <SaveBadge state={save.state} time={save.time} />}
      </div>
    </header>
  );
}

export function ProgressHairline({ ratio }: { ratio: number }) {
  return (
    <div className="app-progress" aria-hidden>
      <div className="app-progress-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

export function SectionHeader({
  step,
  total,
  title,
  description,
  answered,
  ofFields,
}: {
  step: number;
  total: number;
  title: string;
  description?: string;
  answered?: number;
  ofFields?: number;
}) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="app-card app-sectionhead">
      <div className="app-sectionhead-top">
        <p className="app-eyebrow tnum">
          Etapa {step} de {total}
        </p>
        <p className="app-sectionhead-pct tnum">{pct}%</p>
      </div>
      <h2 className="app-sectionhead-title">{title}</h2>
      {description && <p className="app-sectionhead-desc">{description}</p>}
      <div className="app-meter" aria-hidden>
        <div className="app-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      {answered !== undefined && ofFields !== undefined && ofFields > 0 && (
        <p className="app-sectionhead-count tnum">
          {answered}/{ofFields} campos preenchidos
        </p>
      )}
    </div>
  );
}

export function BottomNav({
  onBack,
  onNext,
  backLabel = "Voltar",
  nextLabel,
  nextHint,
}: {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel: string;
  nextHint?: string;
}) {
  return (
    <div className="app-bottomnav">
      <div className="app-bottomnav-inner">
        {onBack && (
          <button type="button" onClick={onBack} className="app-btn app-btn--secondary app-bottomnav-back">
            ‹ {backLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="app-btn app-btn--primary app-bottomnav-next"
        >
          <span className="app-btn-label">{nextLabel}</span>
          {nextHint && <span className="app-btn-hint">{nextHint}</span>}
        </button>
      </div>
    </div>
  );
}

export function TypeCard({
  icon,
  title,
  description,
  meta,
  disabled,
  onSelect,
}: {
  icon: string;
  title: string;
  description: string;
  meta?: string;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-disabled={disabled}
      className={`app-typecard${disabled ? " app-typecard--disabled" : ""}`}
    >
      <span className="app-typecard-icon" aria-hidden>
        {icon}
      </span>
      <span className="app-typecard-text">
        <span className="app-typecard-title">
          {title}
          {disabled ? (
            <span className="app-pill app-pill--muted">Em breve</span>
          ) : (
            meta && <span className="app-pill app-pill--ok">{meta}</span>
          )}
        </span>
        <span className="app-typecard-desc">{description}</span>
      </span>
      {!disabled && (
        <span className="app-typecard-arrow" aria-hidden>
          ›
        </span>
      )}
    </button>
  );
}

export function CompletionRing({ ratio, size = 76 }: { ratio: number; size?: number }) {
  const pct = Math.round(ratio * 100);
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct}% concluído`}
    >
      <svg width={size} height={size} viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-[17px] font-extrabold text-ink tnum">{pct}%</span>
    </div>
  );
}

/** Esqueleto de carregamento padronizado. */
export function LoadingBlock({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label}>
      <div className="app-skeleton-list" aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="app-skeleton-row">
            <div className="app-skeleton-line app-skeleton-line--title" />
            <div className="app-skeleton-line" />
          </div>
        ))}
      </div>
      <p className="app-muted-center">{label}</p>
    </div>
  );
}

/** Erro com nova tentativa, mesmo padrão em todas as telas. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="app-error" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="app-btn app-btn--primary app-error-btn">
        Tentar de novo
      </button>
    </div>
  );
}

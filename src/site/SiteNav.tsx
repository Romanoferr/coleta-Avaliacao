/**
 * Navegação institucional. Usa rolagem por seção (o app usa hash-router,
 * então âncoras `#id` conflitariam com as rotas - por isso scroll via JS).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { Wordmark, scrollToSection } from "./ui";

const LINKS = [
  { id: "produto", label: "Produto" },
  { id: "rota", label: "Otimização de rotas" },
  { id: "como-funciona", label: "Como funciona" },
  { id: "para-quem", label: "Para quem é" },
  { id: "faq", label: "FAQ" },
];

export function SiteNav() {
  const navigate = useNavigate();
  const { status, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // Logado nao cai em tela de login: nav mostra acesso direto ao app e saida.
  const hasSession = status === "authenticated" || status === "local";

  const leave = () => {
    setOpen(false);
    void signOut().then(() => navigate("/", { replace: true }));
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    // espera o menu fechar no mobile para a rolagem acertar o alvo
    requestAnimationFrame(() => scrollToSection(id));
  };

  return (
    <header className={`site-nav${scrolled ? " site-nav--scrolled" : ""}`}>
      <a
        href="#conteudo"
        onClick={(e) => {
          e.preventDefault();
          scrollToSection("conteudo");
        }}
        className="site-skip"
      >
        Pular para o conteúdo
      </a>
      <div className="site-nav-inner">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Coleta Avaliação - voltar ao topo"
          className="site-brand-btn"
        >
          <Wordmark />
        </button>

        <nav aria-label="Navegação principal" className="site-nav-links">
          {LINKS.map((l) => (
            <button key={l.id} type="button" onClick={() => go(l.id)} className="site-nav-link">
              {l.label}
            </button>
          ))}
        </nav>

        <div className="site-nav-cta">
          {hasSession ? (
            <>
              <button type="button" onClick={leave} className="site-nav-login">
                Sair
              </button>
              <button type="button" onClick={() => navigate("/dashboard")} className="site-btn site-btn--primary site-btn--sm">
                Abrir aplicação
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => navigate("/login")} className="site-nav-login">
                Entrar
              </button>
              <button type="button" onClick={() => navigate("/cadastro")} className="site-btn site-btn--primary site-btn--sm">
                Começar agora
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          className="site-burger"
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden className={`site-burger-bar${open ? " site-burger-bar--x1" : ""}`} />
          <span aria-hidden className={`site-burger-bar${open ? " site-burger-bar--x2" : ""}`} />
          <span aria-hidden className={`site-burger-bar${open ? " site-burger-bar--x3" : ""}`} />
        </button>
      </div>

      {open ? (
        <nav id="menu-mobile" aria-label="Menu móvel" className="site-mobile">
          {LINKS.map((l) => (
            <button key={l.id} type="button" onClick={() => go(l.id)} className="site-mobile-link">
              {l.label}
            </button>
          ))}
          <div className="site-mobile-cta">
            {hasSession ? (
              <>
                <button type="button" onClick={() => { setOpen(false); navigate("/dashboard"); }} className="site-btn site-btn--primary">
                  Abrir aplicação
                </button>
                <button type="button" onClick={leave} className="site-btn site-btn--ghost">
                  Sair
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => navigate("/login")} className="site-btn site-btn--ghost">
                  Entrar
                </button>
                <button type="button" onClick={() => navigate("/cadastro")} className="site-btn site-btn--primary">
                  Começar agora
                </button>
              </>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

/**
 * Rodapé institucional - só links para rotas que existem.
 * Páginas jurídicas ainda não existem: exibidas como "em breve", sem link quebrado.
 */
import { useNavigate } from "react-router-dom";
import { Wordmark, scrollToSection } from "./ui";

export function SiteFooter() {
  const navigate = useNavigate();
  const go = (id: string) => scrollToSection(id);
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer-grid">
        <div>
          <Wordmark />
          <p className="site-footer-desc">
            Plataforma para organizar ordens de serviço, executar avaliações em campo e
            planejar rotas de vistorias e avaliações de imóveis.
          </p>
        </div>
        <nav aria-label="Produto">
          <p className="site-footer-title">Produto</p>
          <ul className="site-footer-list">
            <li>
              <button type="button" onClick={() => go("rota")}>
                Otimização de rotas
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("recursos")}>
                Recursos
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("como-funciona")}>
                Como funciona
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("para-quem")}>
                Para quem é
              </button>
            </li>
          </ul>
        </nav>
        <nav aria-label="Conta">
          <p className="site-footer-title">Conta</p>
          <ul className="site-footer-list">
            <li>
              <button type="button" onClick={() => navigate("/login")}>
                Entrar na plataforma
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate("/cadastro")}>
                Criar conta
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("faq")}>
                Perguntas frequentes
              </button>
            </li>
          </ul>
        </nav>
        <div>
          <p className="site-footer-title">Documentos</p>
          <ul className="site-footer-list">
            <li>
              <span className="site-footer-soon">
                Política de Privacidade <em>em breve</em>
              </span>
            </li>
            <li>
              <span className="site-footer-soon">
                Termos de Uso <em>em breve</em>
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div className="site-shell site-footer-base">
        <p>© {new Date().getFullYear()} Coleta Avaliação - Plataforma para vistorias e avaliações de imóveis.</p>
        <p className="site-footer-base-sub">Feita para quem vive o trabalho de campo.</p>
      </div>
    </footer>
  );
}

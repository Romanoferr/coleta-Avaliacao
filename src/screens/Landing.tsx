/**
 * Site institucional - Coleta Avaliação.
 * Copy em pt-BR, sem números inventados, só capacidades reais:
 * OS (número, contratante, datas, endereço, contato, status) · ficha digital
 * (apartamento, casa, terreno) · otimizador de rotas por data com origem,
 * retorno, destino opcional, seleção de OSs e abertura no Google Maps ·
 * documentos vinculados à OS · conta individual com dados isolados.
 */
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { SiteNav } from "../site/SiteNav";
import { SiteFooter } from "../site/SiteFooter";
import { DayTimeline, HeroRouteMap, OptimizerShowcase } from "../site/maps";
import { Eyebrow, Reveal, SectionTitle, scrollToSection } from "../site/ui";

const PAINS = [
  {
    t: "Várias OSs espalhadas",
    d: "Número, contratante, endereço, horário e status em lugares diferentes - e o dia ainda nem começou.",
  },
  {
    t: "Endereços para conferir um a um",
    d: "Abrir cada OS, copiar endereço, colar no mapa. Com cinco ou seis visitas, a manhã vira planilha.",
  },
  {
    t: "A sequência fica no feeling",
    d: "Qual visita vem depois de qual? Sem uma ordem pensada, o trajeto vira ida e volta desnecessária.",
  },
  {
    t: "Registro e documentos depois",
    d: "Anotações soltas durante a vistoria e, no fim do dia, remontar tudo para dar andamento ao trabalho.",
  },
];

const ROUTE_BENEFITS = [
  {
    t: "Menos deslocamento",
    d: "A sequência evita trajetos desnecessários entre uma avaliação e outra.",
  },
  {
    t: "Mais organização",
    d: "Você sabe exatamente qual visita vem depois - e o que cada OS pede.",
  },
  {
    t: "Mais previsibilidade",
    d: "Distância total e tempo estimado de deslocamento antes de sair.",
  },
  {
    t: "Mais produtividade",
    d: "Menos tempo montando o quebra-cabeça do dia, mais tempo vistoriando.",
  },
  {
    t: "Navegação integrada",
    d: "Com a ordem pronta, abra a sequência no Google Maps e siga a agenda.",
  },
];

const STEPS = [
  {
    n: "01",
    t: "Organize suas OSs",
    d: "Cadastre cada ordem de serviço com número, contratante, endereço, datas e contato. A agenda do dia fica pronta sozinha.",
  },
  {
    n: "02",
    t: "Monte sua rota",
    d: "Escolha a data, selecione as OSs do dia e defina o ponto inicial - com retorno à origem ou destino final próprio.",
  },
  {
    n: "03",
    t: "Otimize",
    d: "A plataforma localiza os endereços e calcula uma sequência eficiente de visitas, com distância e tempo estimados.",
  },
  {
    n: "04",
    t: "Vá para o campo",
    d: "Abra a ordem no Google Maps, execute cada vistoria com a ficha digital e acompanhe o status até a conclusão.",
  },
];

const FAQS = [
  {
    q: "O que é a plataforma?",
    a: "Uma plataforma para organizar ordens de serviço de vistoria e avaliação de imóveis, executar a coleta de informações em campo pela ficha digital e planejar a rota de visitas do dia.",
  },
  {
    q: "Para quem ela foi criada?",
    a: "Para vistoriadores, avaliadores de imóveis, arquitetos, engenheiros, corretores, imobiliárias, profissionais autônomos e empresas que realizam vistorias e avaliações em campo.",
  },
  {
    q: "Como funciona o otimizador de rotas?",
    a: "Você escolhe uma data e a plataforma reúne as OSs daquele dia com endereço. A partir do ponto inicial informado, o sistema localiza os endereços e calcula uma sequência eficiente de visitas, mostrando distância total e tempo estimado de deslocamento.",
  },
  {
    q: "Posso escolher onde minha rota começa?",
    a: "Sim. Você informa o ponto inicial - escritório, casa, base operacional ou qualquer endereço - e a rota é calculada a partir dele.",
  },
  {
    q: "Posso voltar ao ponto de partida?",
    a: "Sim. Há a opção de retorno ao ponto de partida: a rota monta o circuito completo, voltando para a origem ao final do dia.",
  },
  {
    q: "Posso fazer a rota terminar em outro lugar?",
    a: "Sim. Sem o retorno à origem, você pode informar um destino final diferente ou deixar a rota aberta, terminando na última OS visitada.",
  },
  {
    q: "Posso abrir a rota no Google Maps?",
    a: "Sim. Depois de otimizada, a rota pode ser aberta no Google Maps para navegação. Em dias com muitas paradas, o trajeto é dividido em trechos navegáveis, mantendo a ordem calculada.",
  },
  {
    q: "Posso visualizar as OSs do meu dia?",
    a: "Sim. O painel mostra as vistorias de hoje, as atrasadas, as que aguardam vistoria, as em elaboração e as concluídas, com busca por número, contratante ou endereço e filtros por status e datas.",
  },
  {
    q: "Posso realizar a avaliação digitalmente?",
    a: "Sim. Cada OS pode ter uma ficha digital (apartamento, casa ou terreno) preenchida pelo celular durante a visita, com salvamento automático e acompanhamento do progresso até a conclusão.",
  },
  {
    q: "A plataforma gera o RRT?",
    a: "Não. A plataforma não emite nem substitui o RRT. O que ela faz é manter organizadas as informações da atividade - OS, datas, endereço, ficha e documentos vinculados - para facilitar a preparação do seu RRT no canal oficial.",
  },
];

const AUDIENCES = [
  {
    t: "Vistoriadores",
    d: "Organize a agenda do dia e planeje melhor seus deslocamentos entre imóveis.",
  },
  {
    t: "Avaliadores de imóveis",
    d: "Centralize suas avaliações, consulte endereços e ordene as visitas do dia.",
  },
  {
    t: "Arquitetos e engenheiros",
    d: "Mantenha as atividades de campo organizadas, com ficha e documentos por OS.",
  },
  {
    t: "Profissionais autônomos",
    d: "Menos ferramentas desconectadas: OS, ficha, documentos e rota em um só lugar.",
  },
  {
    t: "Empresas e imobiliárias",
    d: "Uma visão organizada das operações de campo, OS por OS, dia após dia.",
  },
];

export default function Landing() {
  const { status } = useAuth();
  const navigate = useNavigate();
  // Landing e sempre publica: logado ou nao, qualquer um pode ler o site.
  // Quem tem conta usa os botoes para entrar no app, sem redirect forcado.
  const hasSession = status === "authenticated" || status === "local";

  if (status === "loading") {
    return (
      <div className="site-loading" role="status">
        <p>Carregando…</p>
      </div>
    );
  }

  return (
    <div className="site">
      <SiteNav />
      <main id="conteudo">
        {/* ============ HERO ============ */}
        <section id="produto" className="site-hero" aria-labelledby="hero-title">
          <div className="site-shell site-hero-grid">
            <div className="site-hero-copy">
              <Eyebrow>Plataforma para vistorias e avaliações de imóveis</Eyebrow>
              <h1 id="hero-title" className="site-h1">
                Planeje suas vistorias. Otimize seus deslocamentos.{" "}
                <span className="site-h1-accent">Trabalhe melhor.</span>
              </h1>
              <p className="site-lead">
                Centralize suas ordens de serviço, execute a avaliação direto no celular
                e encontre a melhor sequência de visitas para o dia - menos tempo no
                trânsito, mais organização em campo.
              </p>
              <div className="site-hero-cta">
                <button
                  type="button"
                  onClick={() => navigate(hasSession ? "/dashboard" : "/cadastro")}
                  className="site-btn site-btn--primary site-btn--lg"
                >
                  {hasSession ? "Abrir aplicação" : "Começar agora"}
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection("rota")}
                  className="site-btn site-btn--ghost site-btn--lg"
                >
                  Conhecer a plataforma
                </button>
              </div>
              <ul className="site-hero-points" aria-label="Resumo da plataforma">
                <li>
                  <strong>OSs centralizadas</strong>
                  <span>número, endereço, datas e status</span>
                </li>
                <li>
                  <strong>Ficha digital</strong>
                  <span>apartamento, casa e terreno</span>
                </li>
                <li>
                  <strong>Rota do dia</strong>
                  <span>sequência + Google Maps</span>
                </li>
              </ul>
            </div>
            <Reveal className="site-hero-visual">
              <HeroRouteMap />
              <div className="site-hero-os" aria-label="Exemplo de ordem da rota">
                <div className="site-hero-os-row">
                  <span className="site-os-num tnum">① OS 1024 · 08:30</span>
                  <span className="site-os-chip">Agendada</span>
                </div>
                <p className="site-hero-os-addr">Apartamento · Copacabana</p>
                <div className="site-hero-os-row">
                  <span className="site-os-num tnum">② OS 1031 · 10:10</span>
                  <span className="site-os-chip">Agendada</span>
                </div>
                <p className="site-hero-os-addr">Apartamento · Tijuca</p>
                <p className="site-hero-os-next tnum">→ depois ③ OS 1028 · ④ OS 1040 · ⑤ OS 1035</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ PROBLEMA ============ */}
        <section id="problema" className="site-section" aria-labelledby="problema-title">
          <div className="site-shell">
            <SectionTitle
              eyebrow="O problema"
              title="O trabalho começa antes de chegar ao primeiro imóvel."
              lead="A vistoria em si é só uma parte do dia. O resto - organizar OSs, conferir endereços, decidir a ordem das visitas, registrar tudo - consome horas que ninguém vê."
            />
            <div className="site-pain-grid">
              {PAINS.map((p, i) => (
                <Reveal as="div" key={p.t} delay={i * 60} className="site-pain-card">
                  <p className="site-pain-num tnum" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="site-pain-close">
              <p>
                <strong>O problema não é só realizar a vistoria.</strong> É organizar
                todo o trabalho ao redor dela - e é exatamente aí que a plataforma atua.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ OTIMIZADOR ============ */}
        <section id="rota" className="site-section site-section--ink" aria-labelledby="rota-title">
          <div className="site-shell">
            <Reveal className="site-ink-head">
              <p className="site-eyebrow-light">Otimização de rotas · o diferencial</p>
              <h2 id="rota-title">Sua rota de avaliações, otimizada automaticamente.</h2>
              <p>
                Você escolhe a data e a plataforma reúne as OSs daquele dia. A partir dos
                endereços, o sistema calcula uma sequência eficiente para as visitas -
                considerando ponto inicial, retorno à origem ou destino final próprio, e
                as OSs que você quer incluir.
              </p>
            </Reveal>
            <OptimizerShowcase />
            <div className="site-benefit-grid">
              {ROUTE_BENEFITS.map((b, i) => (
                <Reveal as="div" key={b.t} delay={i * 50} className="site-benefit-card">
                  <h3>{b.t}</h3>
                  <p>{b.d}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ COMO FUNCIONA ============ */}
        <section id="como-funciona" className="site-section" aria-labelledby="como-title">
          <div className="site-shell">
            <SectionTitle
              eyebrow="Como funciona"
              title="Do planejamento ao campo, em quatro passos."
              lead="Um fluxo pensado para a rotina real de quem visita vários imóveis por dia."
            />
            <ol className="site-steps">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.n} delay={i * 60} className="site-step">
                  <p className="site-step-num tnum" aria-hidden>
                    {s.n}
                  </p>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                  {i < STEPS.length - 1 ? <span className="site-step-link" aria-hidden /> : null}
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ============ RECURSOS ============ */}
        <section id="recursos" className="site-section site-section--tint" aria-labelledby="recursos-title">
          <div className="site-shell">
            <SectionTitle
              eyebrow="Recursos"
              title="Tudo o que você precisa para organizar seu trabalho de campo."
              lead="Cinco frentes, uma hierarquia clara: a rota organiza o dia, a OS organiza o serviço."
            />
            <div className="site-feat-list">
              <Reveal className="site-feat site-feat--hero">
                <div>
                  <p className="site-feat-tag">Destaque · 01</p>
                  <h3>Otimizador de rotas</h3>
                  <p>
                    Data, OSs selecionadas, ponto inicial e destino. Cálculo pela malha
                    viária com distância e tempo estimados - e abertura da sequência no
                    Google Maps para navegar.
                  </p>
                  <button type="button" onClick={() => scrollToSection("rota")} className="site-text-btn">
                    Ver como funciona →
                  </button>
                </div>
                <div className="site-feat-route-mini" aria-hidden>
                  <span className="tnum">① → ② → ③ → ④</span>
                  <span className="tnum">km · tempo · ordem</span>
                </div>
              </Reveal>
              {[
                {
                  n: "02",
                  t: "Gestão de ordens de serviço",
                  d: "Número, contratante, endereço, datas, contato e status - com busca, filtros e agenda do dia.",
                },
                {
                  n: "03",
                  t: "Avaliação digital",
                  d: "Ficha de apartamento, casa ou terreno preenchida no celular, com salvamento automático.",
                },
                {
                  n: "04",
                  t: "Visualização das OSs",
                  d: "Hoje, atrasadas, aguardando vistoria, em elaboração e concluídas - sempre à vista.",
                },
                {
                  n: "05",
                  t: "Auxílio para informações de RRT",
                  d: "Dados da atividade organizados por OS para facilitar a preparação do seu RRT.",
                },
              ].map((f) => (
                <Reveal key={f.n} className="site-feat">
                  <div>
                    <p className="site-feat-tag tnum">{f.n}</p>
                    <h3>{f.t}</h3>
                    <p>{f.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ AVALIAÇÃO DIGITAL ============ */}
        <section id="avaliacao" className="site-section" aria-labelledby="avaliacao-title">
          <div className="site-shell site-split">
            <Reveal>
              <Eyebrow>Avaliação digital</Eyebrow>
              <h2 id="avaliacao-title" className="site-h2">
                Leve a avaliação para o campo.
              </h2>
              <p className="site-body">
                Em vez de anotações espalhadas, o profissional preenche a ficha diretamente
                pela plataforma durante a vistoria - no celular, OS por OS. As informações
                ficam organizadas e vinculadas à ordem de serviço, prontas para consulta.
              </p>
              <ul className="site-checks">
                <li>Preenchimento digital durante a visita</li>
                <li>Fichas de apartamento, casa e terreno</li>
                <li>Salvamento automático com indicador de progresso</li>
                <li>Dados centralizados por ordem de serviço</li>
              </ul>
              <p className="site-note">
                Sem assinatura digital, geração automática de laudo ou recursos de IA -
                a plataforma faz bem o essencial: coletar e organizar.
              </p>
            </Reveal>
            <Reveal delay={120} className="site-phone-wrap">
              <div className="site-phone" role="img" aria-label="Celular com a ficha digital de avaliação em preenchimento">
                <div className="site-phone-notch" aria-hidden />
                <p className="site-phone-eyebrow">OS 1028 · Ficha</p>
                <p className="site-phone-title">Apartamento · 62% concluído</p>
                <div className="site-phone-bar" aria-hidden>
                  <span style={{ width: "62%" }} />
                </div>
                {[
                  ["Localização e entorno", "✓ preenchido"],
                  ["Características do imóvel", "✓ preenchido"],
                  ["Acabamentos", "em preenchimento"],
                  ["Fotos e documentos", "pendente"],
                ].map(([t, s]) => (
                  <div key={t} className="site-phone-row">
                    <span>{t}</span>
                    <span className="site-phone-status">{s}</span>
                  </div>
                ))}
                <p className="site-phone-save">
                  <span className="site-save-dot" aria-hidden /> Salvo automaticamente
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ GESTÃO DE OS ============ */}
        <section id="os" className="site-section site-section--tint" aria-labelledby="os-title">
          <div className="site-shell site-split site-split--rev">
            <Reveal>
              <Eyebrow>Gestão de ordens de serviço</Eyebrow>
              <h2 id="os-title" className="site-h2">
                Todas as suas ordens organizadas.
              </h2>
              <p className="site-body">
                Cada OS reúne número, contratante, endereço, datas, contato, observações
                e status - da recebida à concluída. Busca por número, contratante ou
                endereço, filtros por status e ordenação pela agenda.
              </p>
              <ul className="site-checks">
                <li>Acompanhe datas, horários e prazos</li>
                <li>Consulte endereços e contatos rapidamente</li>
                <li>Acompanhe o status de cada serviço</li>
                <li>Acesse a ficha e os documentos da OS</li>
              </ul>
            </Reveal>
            <Reveal delay={120} className="site-osboard" aria-label="Representação da lista de ordens de serviço">
              <div className="site-osboard-head">
                <p className="tnum">Trabalho de hoje · 3 vistorias</p>
              </div>
              {[
                ["OS 1024", "Apartamento · Copacabana", "08:30", "Agendada"],
                ["OS 1028", "Casa · Botafogo", "11:00", "Agendada"],
                ["OS 1031", "Apartamento · Tijuca", "14:30", "Recebida"],
              ].map(([os, desc, h, st]) => (
                <div key={os} className="site-osboard-row">
                  <span>
                    <strong className="tnum">{os}</strong>
                    <span>{desc}</span>
                  </span>
                  <span className="site-osboard-meta">
                    <span className="tnum">{h}</span>
                    <span className="site-os-chip">{st}</span>
                  </span>
                </div>
              ))}
              <p className="site-note">Representação da interface real da plataforma.</p>
            </Reveal>
          </div>
        </section>

        {/* ============ VISUALIZAÇÃO DO DIA ============ */}
        <section className="site-section site-section--compact" aria-labelledby="agenda-title">
          <div className="site-shell site-split">
            <Reveal className="site-daycard" aria-label="Exemplo da agenda do dia">
              <p className="site-daycard-title">Hoje</p>
              {[
                ["08:30", "OS 1024", "Apartamento · Copacabana"],
                ["11:00", "OS 1028", "Casa · Botafogo"],
                ["14:30", "OS 1031", "Apartamento · Tijuca"],
              ].map(([h, os, d]) => (
                <div key={os} className="site-daycard-row">
                  <span className="site-daycard-hour tnum">{h}</span>
                  <span>
                    <strong className="tnum">{os}</strong>
                    <span>{d}</span>
                  </span>
                </div>
              ))}
            </Reveal>
            <Reveal delay={100}>
              <Eyebrow>Visualização das OSs</Eyebrow>
              <h2 id="agenda-title" className="site-h2">
                O dia inteiro, de relance.
              </h2>
              <p className="site-body">
                A agenda mostra as OSs do dia com horário, tipo de imóvel e bairro - e
                cada endereço entra no cálculo da rota. Nada de alternar entre agenda,
                mensagens e mapas.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ UM DIA DE TRABALHO ============ */}
        <section id="dia" className="site-section" aria-labelledby="dia-title">
          <div className="site-shell">
            <SectionTitle
              eyebrow="Na prática"
              title="Um dia de trabalho com a plataforma."
              lead="Do planejamento da manhã aos dados organizados no fim do dia, cada etapa tem um lugar."
              align="center"
            />
            <DayTimeline />
          </div>
        </section>

        {/* ============ PARA QUEM ============ */}
        <section id="para-quem" className="site-section site-section--tint" aria-labelledby="pq-title">
          <div className="site-shell">
            <SectionTitle
              eyebrow="Para quem é"
              title="Feita para quem vive o trabalho de campo."
              align="center"
            />
            <div className="site-aud-grid">
              {AUDIENCES.map((a, i) => (
                <Reveal as="div" key={a.t} delay={i * 50} className="site-aud-card">
                  <h3>{a.t}</h3>
                  <p>{a.d}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ RRT ============ */}
        <section id="rrt" className="site-section" aria-labelledby="rrt-title">
          <div className="site-shell site-rrt">
            <Reveal>
              <Eyebrow>Documentação</Eyebrow>
              <h2 id="rrt-title" className="site-h2">
                Informações organizadas para facilitar a preparação do seu RRT.
              </h2>
              <p className="site-body">
                A plataforma centraliza os dados da atividade - OS, datas, endereço,
                ficha preenchida e documentos vinculados, como matrícula, contrato e
                fotos - para reduzir o retrabalho na hora de preparar a documentação.
                A emissão do RRT continua sendo feita por você, no canal oficial.
              </p>
            </Reveal>
            <Reveal delay={120} className="site-rrt-card" aria-label="Exemplo de informações reunidas por OS">
              <p className="site-rrt-os tnum">OS 1028 · Casa · Botafogo</p>
              <ul>
                <li>
                  <strong>Dados da OS</strong>
                  <span>número, contratante, datas, endereço, contato</span>
                </li>
                <li>
                  <strong>Ficha preenchida</strong>
                  <span>avaliação vinculada à OS</span>
                </li>
                <li>
                  <strong>Documentos</strong>
                  <span>fotos, matrícula, contrato, relatório</span>
                </li>
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ============ CONFIANÇA ============ */}
        <section className="site-section site-section--compact" aria-labelledby="conf-title">
          <div className="site-shell site-trust">
            <Reveal>
              <h2 id="conf-title" className="site-h2">
                Seus dados, na sua conta.
              </h2>
              <p className="site-body">
                O acesso é individual: cada profissional entra com seu login e visualiza
                apenas as suas próprias ordens de serviço, fichas e documentos. Quando a
                nuvem está ativada, as informações ficam vinculadas à sua conta e
                isoladas por usuário.
              </p>
            </Reveal>
            <Reveal delay={100} className="site-trust-points">
              <div>
                <strong>Conta individual</strong>
                <span>login próprio para cada profissional</span>
              </div>
              <div>
                <strong>Dados isolados</strong>
                <span>você acessa só o seu trabalho</span>
              </div>
              <div>
                <strong>Uso em campo</strong>
                <span>pensada para o celular na visita</span>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section id="faq" className="site-section site-section--tint" aria-labelledby="faq-title">
          <div className="site-shell site-faq-shell">
            <SectionTitle
              eyebrow="Perguntas frequentes"
              title="Dúvidas comuns sobre a plataforma."
              align="center"
            />
            <div className="site-faq">
              {FAQS.map((f) => (
                <details key={f.q} className="site-faq-item">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============ CTA FINAL ============ */}
        <section id="cta" className="site-section" aria-labelledby="cta-title">
          <div className="site-shell">
            <Reveal className="site-cta">
              <p className="site-eyebrow-light">Comece pelo próximo dia de campo</p>
              <h2 id="cta-title">Seu próximo dia de vistorias pode começar com uma rota melhor planejada.</h2>
              <p>
                Cadastre suas ordens de serviço, organize as avaliações e monte a rota
                do dia em minutos.
              </p>
              <div className="site-hero-cta site-cta-btns">
                <button
                  type="button"
                  onClick={() => navigate(hasSession ? "/dashboard" : "/cadastro")}
                  className="site-btn site-btn--primary site-btn--lg"
                >
                  {hasSession ? "Abrir aplicação" : "Começar agora"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(hasSession ? "/planos" : "/login")}
                  className="site-btn site-btn--outline-light site-btn--lg"
                >
                  {hasSession ? "Ver plano" : "Entrar na plataforma"}
                </button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

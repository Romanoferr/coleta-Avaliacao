/**
 * Mapas estilizados do site - SVG puro, sem biblioteca de mapas.
 * Motivo visual: grade de ruas + rota tracejada + paradas numeradas.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Reveal } from "./ui";

/** Fundo de quarteirões: ruas claras + alguns blocos. */
export function StreetGrid({ id }: { id: string }) {
  return (
    <g aria-hidden>
      <defs>
        <pattern id={`${id}-grid`} width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M36 0H0v36" fill="none" stroke="#e4e9f0" strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="640" height="420" fill="#f4f6f9" />
      <rect x="0" y="0" width="640" height="420" fill={`url(#${id}-grid)`} />
      {/* quarteirões */}
      <g fill="#e9edf3">
        <rect x="52" y="52" width="120" height="76" rx="6" />
        <rect x="212" y="52" width="88" height="76" rx="6" />
        <rect x="340" y="52" width="150" height="76" rx="6" />
        <rect x="52" y="168" width="88" height="110" rx="6" />
        <rect x="340" y="168" width="248" height="64" rx="6" />
        <rect x="52" y="318" width="150" height="60" rx="6" />
        <rect x="242" y="318" width="120" height="60" rx="6" />
        <rect x="402" y="272" width="186" height="106" rx="6" />
      </g>
      {/* vias principais */}
      <g stroke="#d7dee8" strokeWidth="5" strokeLinecap="round">
        <line x1="0" y1="148" x2="640" y2="148" />
        <line x1="0" y1="298" x2="640" y2="298" />
        <line x1="192" y1="0" x2="192" y2="420" />
        <line x1="322" y1="0" x2="322" y2="420" />
      </g>
      {/* parque / água - detalhe geográfico discreto */}
      <rect x="212" y="168" width="88" height="110" rx="10" fill="#dff0e3" />
      <ellipse cx="272" cy="368" rx="52" ry="18" fill="#d8e9f7" />
    </g>
  );
}

function StopPin({
  x,
  y,
  n,
  label,
  tone = "brand",
  small = false,
}: {
  x: number;
  y: number;
  n: string;
  label?: string;
  tone?: "brand" | "ink" | "green";
  small?: boolean;
}) {
  const fill = tone === "ink" ? "#0f1e33" : tone === "green" ? "#15803d" : "#1d4ed8";
  const r = small ? 13 : 16;
  return (
    <g>
      {tone === "brand" && (
        <circle cx={x} cy={y} r={r + 6} fill="#1d4ed8" opacity="0.12">
          <animate attributeName="r" values={`${r + 4};${r + 9};${r + 4}`} dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.16;0.06;0.16" dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={x} cy={y} r={r} fill={fill} stroke="#fff" strokeWidth="2.5" />
      <text
        x={x}
        y={y + (small ? 4.5 : 5.5)}
        textAnchor="middle"
        fontSize={small ? 11 : 13}
        fontWeight="800"
        fill="#fff"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {n}
      </text>
      {label ? (
        <text
          x={x}
          y={y + r + 14}
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="700"
          fill="#5b6b82"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Hero: mapa com rota ①→⑤ + card de métricas. */
export function HeroRouteMap() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const path =
    "M96 300 C140 250 150 220 190 200 S250 150 300 160 S360 120 410 130 S470 180 470 220 S520 260 540 300";
  const stops = [
    { x: 96, y: 300, n: "1", label: "OS 1024" },
    { x: 190, y: 200, n: "2", label: "OS 1031" },
    { x: 300, y: 160, n: "3", label: "OS 1028" },
    { x: 410, y: 130, n: "4", label: "OS 1040" },
    { x: 540, y: 300, n: "5", label: "OS 1035" },
  ];
  return (
    <figure
      className="site-map-card"
      role="img"
      aria-label="Mapa com rota otimizada passando por cinco vistorias numeradas"
    >
      <svg viewBox="0 0 640 420" className="h-auto w-full" aria-hidden>
        <StreetGrid id={`hero-${id}`} />
        <path
          d={path}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="10 8"
          className="site-route-draw"
        />
        {/* origem */}
        <StopPin x={56} y={342} n="⌂" tone="ink" small label="Escritório" />
        {stops.map((s) => (
          <StopPin key={s.n} {...s} />
        ))}
      </svg>
      <figcaption className="site-map-legend">
        <span className="site-map-metric">
          <strong>Rota otimizada</strong>
          <span>5 avaliações · 1 sequência</span>
        </span>
        <span className="site-map-metric tnum">
          <strong>42,8 km</strong>
          <span>exemplo ilustrativo</span>
        </span>
        <span className="site-map-metric tnum">
          <strong>1h 18min</strong>
          <span>deslocamento estimado</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** Seção principal do otimizador: sequência origem → OSs → destino. */
const BIG_STOPS = [
  { os: "OS 1024", addr: "Rua Voluntários, 420 · Botafogo", time: "08:30" },
  { os: "OS 1031", addr: "Av. Atlântica, 1610 · Copacabana", time: "10:10" },
  { os: "OS 1028", addr: "Rua Conde de Bonfim, 232 · Tijuca", time: "11:40" },
  { os: "OS 1040", addr: "Rua das Laranjeiras, 88 · Laranjeiras", time: "14:00" },
  { os: "OS 1029", addr: "Rua São Clemente, 190 · Botafogo", time: "15:30" },
  { os: "OS 1035", addr: "Rua Humaitá, 275 · Humaitá", time: "16:50" },
];

export function OptimizerShowcase() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div className="site-showcase">
      <Reveal className="site-showcase-list">
        <p className="site-date-chip tnum">07 SET · 6 avaliações</p>
        <div className="site-endpoint">
          <span className="site-endpoint-dot site-endpoint-dot--ink" aria-hidden>
            ⌂
          </span>
          <span>
            <span className="site-endpoint-kicker">Origem</span>
            <span className="site-endpoint-name">Escritório</span>
          </span>
        </div>
        <ol className="site-stop-list">
          {BIG_STOPS.map((s, i) => (
            <li key={s.os} className="site-stop">
              <span className="site-stop-rail" aria-hidden>
                <span className="site-stop-num tnum">{i + 1}</span>
                {i < BIG_STOPS.length - 1 ? <span className="site-stop-line" /> : null}
              </span>
              <span className="site-stop-body">
                <span className="site-stop-os tnum">
                  {s.os} <span className="site-stop-time tnum">{s.time}</span>
                </span>
                <span className="site-stop-addr">{s.addr}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="site-endpoint">
          <span className="site-endpoint-dot site-endpoint-dot--green" aria-hidden>
            ⚑
          </span>
          <span>
            <span className="site-endpoint-kicker">Destino</span>
            <span className="site-endpoint-name">Escritório · retorno ao ponto de partida</span>
          </span>
        </div>
      </Reveal>
      <Reveal delay={120} className="site-showcase-map">
        <figure
          className="site-map-card"
          role="img"
          aria-label="Mapa ampliado com a sequência otimizada de seis visitas"
        >
          <svg viewBox="0 0 640 460" className="h-auto w-full" aria-hidden>
            <g transform="translate(0,20)">
              <StreetGrid id={`big-${id}`} />
            </g>
            <path
              d="M90 330 C150 300 170 250 230 235 S300 190 340 200 S420 150 460 170 S540 220 545 300 S470 380 340 375 S150 380 90 330"
              fill="none"
              stroke="#1d4ed8"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="10 8"
              className="site-route-draw site-route-draw--slow"
            />
            <StopPin x={90} y={350} n="⌂" tone="ink" small />
            <StopPin x={230} y={255} n="1" />
            <StopPin x={340} y={220} n="2" />
            <StopPin x={460} y={190} n="3" />
            <StopPin x={545} y={320} n="4" />
            <StopPin x={470} y={400} n="5" />
            <StopPin x={340} y={395} n="6" />
          </svg>
          <figcaption className="site-map-legend site-map-legend--grid">
            <span className="site-map-metric tnum">
              <strong>38,4 km</strong>
              <span>distância da rota</span>
            </span>
            <span className="site-map-metric tnum">
              <strong>1h 05min</strong>
              <span>tempo de deslocamento</span>
            </span>
            <span className="site-map-metric">
              <strong>Via malha viária</strong>
              <span>cálculo pela rota real</span>
            </span>
            <span className="site-map-metric">
              <strong>Google Maps</strong>
              <span>abre a sequência p/ navegar</span>
            </span>
          </figcaption>
        </figure>
        <p className="site-note">
          Valores ilustrativos para apresentação. Na plataforma, distância e tempo são calculados
          a partir dos seus endereços reais.
        </p>
      </Reveal>
    </div>
  );
}

/** Linha do tempo "um dia de trabalho" com marcador que avança no scroll. */
const DAY = [
  { h: "07:30", t: "Planeja o dia", d: "Abre a agenda e confere as OSs programadas." },
  { h: "08:00", t: "Visualiza as OSs", d: "Endereços, horários e status em um só lugar." },
  { h: "08:15", t: "Gera a rota otimizada", d: "Origem, paradas e destino em uma sequência eficiente." },
  { h: "09:00", t: "Primeira vistoria", d: "Ficha digital aberta no celular, sem papel." },
  { h: "11:00", t: "Segunda avaliação", d: "Segue a ordem sugerida, sem recalcular nada." },
  { h: "14:00", t: "Novas visitas", d: "A tarde segue o plano, com horários à vista." },
  { h: "17:00", t: "Dados organizados", d: "Fichas e documentos vinculados a cada OS." },
];

export function DayTimeline() {
  const ref = useRef<HTMLOListElement | null>(null);
  const [ratio, setRatio] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const p = 1 - (r.bottom - vh * 0.35) / (r.height + vh * 0.3);
      setRatio(Math.min(1, Math.max(0, p)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <ol ref={ref} className="site-timeline" style={{ ["--fill" as string]: `${Math.round(ratio * 100)}%` }}>
      {DAY.map((s, i) => (
        <Reveal as="li" key={s.h} delay={Math.min(i * 40, 160)} className="site-timeline-item">
          <span className="site-timeline-dot tnum" aria-hidden>
            {i + 1}
          </span>
          <span className="site-timeline-card">
            <span className="site-timeline-hour tnum">{s.h}</span>
            <span className="site-timeline-title">{s.t}</span>
            <span className="site-timeline-desc">{s.d}</span>
          </span>
        </Reveal>
      ))}
    </ol>
  );
}

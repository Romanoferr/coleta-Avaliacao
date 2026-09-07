/**
 * Landing page — porta de entrada. Estrutura simples e profissional;
 * refinamento para conversão fica para etapa futura.
 */
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";

export default function Landing() {
  const { status } = useAuth();
  const navigate = useNavigate();

  if (status === "loading") {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <main className="mx-auto max-w-xl px-4 pb-10 pt-16 text-center">
          <p className="text-[14px] font-semibold text-slate-400">Carregando…</p>
        </main>
      </div>
    );
  }
  if (status === "authenticated" || status === "local") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-dvh bg-app text-ink">
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="animate-rise pt-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-2xl font-extrabold text-white" aria-hidden>
            ⌂
          </span>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Vistoria técnica de imóveis
          </p>
          <h1 className="mt-2 text-[32px] font-extrabold leading-[1.1] tracking-tight">
            Ordens de serviço e fichas de vistoria em campo
          </h1>
          <p className="mx-auto mt-3 max-w-[36ch] text-[15px] leading-snug text-slate-500">
            Receba a OS, organize a agenda, preencha a ficha no celular durante
            a visita e acompanhe cada serviço até a conclusão.
          </p>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mt-6 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => navigate("/cadastro")}
            className="mt-2 h-[56px] w-full rounded-2xl border-[1.5px] border-slate-300 bg-white text-[16px] font-extrabold text-slate-700 active:bg-slate-50"
          >
            Criar conta
          </button>
        </section>

        <section className="mt-6 grid gap-2.5" aria-label="Recursos">
          {[
            ["📋", "Ordens de serviço", "Número, prazos, endereço e responsável em um só lugar."],
            ["🏠", "Ficha no celular", "Apartamento e terreno na ordem da ficha de papel."],
            ["📅", "Agenda do dia", "Vistorias de hoje, atrasadas e aguardando, sem planilha."],
          ].map(([icon, title, desc]) => (
            <div key={title} className="flex items-center gap-4 rounded-2xl border-[1.5px] border-slate-200 bg-white p-4">
              <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[24px]" aria-hidden>
                {icon}
              </span>
              <span>
                <span className="block text-[16px] font-extrabold tracking-tight">{title}</span>
                <span className="block text-[13.5px] leading-snug text-slate-500">{desc}</span>
              </span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

/**
 * Login - e-mail + senha (Supabase Auth). Cadastro e recuperação
 * têm rotas próprias (/cadastro, /recuperar-senha).
 */
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { OsField, osInputCls } from "../components/os";
import { loginErrorMessage, useAuth } from "../state/auth";

export default function Login() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "authenticated" || status === "local") {
    return <Navigate to="/dashboard" replace />;
  }

  const submit = () => {
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setError("");
    setBusy(true);
    signIn(email, password)
      .then(() => navigate("/dashboard", { replace: true }))
      .catch((e: unknown) => {
        setError(loginErrorMessage(e));
        setBusy(false);
      });
  };

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Acesso" title="Entrar" onBack={() => navigate("/")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="animate-rise mt-6 rounded-3xl bg-ink p-6 text-white">
          <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">Bem-vindo de volta</h2>
          <p className="mt-1 text-[14px] leading-snug text-slate-300">
            Entre para ver suas ordens de serviço.
          </p>
        </section>

        <form
          className="mt-3 flex flex-col gap-5 rounded-2xl border border-slate-200/80 bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {status === "loading" ? (
            <p className="text-center text-[13.5px] font-semibold text-slate-400">Verificando sessão…</p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl border-[1.5px] border-red-200 bg-red-50 p-3 text-[14px] font-bold text-red-700">
              {error}
            </p>
          ) : null}
          <OsField label="E-mail">
            <input
              type="email"
              className={osInputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="email"
              inputMode="email"
            />
          </OsField>
          <OsField label="Senha">
            <input
              type="password"
              className={osInputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </OsField>
          <button
            type="submit"
            disabled={busy}
            className="h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <Link
            to="/recuperar-senha"
            className="text-center text-[14px] font-extrabold text-brand underline underline-offset-2"
          >
            Esqueci minha senha
          </Link>
        </form>
        <p className="mt-3 text-center text-[13.5px] text-slate-500">
          Não tem conta?{" "}
          <Link to="/cadastro" className="font-extrabold text-brand underline underline-offset-2">
            Criar conta
          </Link>
        </p>
      </main>
    </div>
  );
}

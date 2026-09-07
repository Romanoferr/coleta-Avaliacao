/**
 * Cadastro — Supabase Auth signUp. Senha tratada só pelo Supabase
 * (nunca gravada em tabela própria, storage ou logs). Nome vai para
 * user_metadata. Identificador do usuário é sempre o UUID do Auth.
 */
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { OsField, osInputCls } from "../components/os";
import { authErrorMessage, useAuth } from "../state/auth";
import { validateSignup } from "../state/authValidation";

export default function Signup() {
  const { status, signUp, resendConfirmation } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (status === "authenticated" || status === "local") {
    return <Navigate to="/dashboard" replace />;
  }

  const submit = () => {
    if (busy) return;
    const v = validateSignup({ name, email, password, confirm });
    setFieldErrors(v);
    if (Object.keys(v).length > 0) return;
    setError("");
    setBusy(true);
    signUp({ name: name.trim(), email, password })
      .then(({ needsConfirmation }) => {
        if (needsConfirmation) {
          setCreatedEmail(email.trim());
        } else {
          navigate("/dashboard", { replace: true });
        }
      })
      .catch((e: unknown) => {
        setError(authErrorMessage(e));
        setBusy(false);
      });
  };

  if (createdEmail) {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <AppHeader eyebrow="Cadastro" title="Confirme seu e-mail" onBack={() => navigate("/")} />
        <main className="mx-auto max-w-xl px-4 pb-10">
          <section className="animate-rise mt-6 rounded-3xl bg-ink p-6 text-white">
            <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">Conta criada!</h2>
            <p className="mt-1 text-[14px] leading-snug text-slate-300">
              Enviamos um link de confirmação para:
            </p>
            <p className="mt-1 break-all text-[15px] font-extrabold text-white">{createdEmail}</p>
            <p className="mt-1 text-[14px] leading-snug text-slate-300">Confirme seu e-mail para continuar.</p>
          </section>
          <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-5">
            {resent ? (
              <p role="status" className="text-[14px] font-bold text-green-700">
                E-mail reenviado. Verifique sua caixa de entrada.
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  resendConfirmation(createdEmail)
                    .then(() => setResent(true))
                    .catch((e: unknown) => setError(authErrorMessage(e)))
                    .finally(() => setBusy(false));
                }}
                className="h-[56px] w-full rounded-2xl border-[1.5px] border-slate-200 text-[16px] font-extrabold text-slate-700 active:bg-slate-50 disabled:opacity-60"
              >
                Enviar e-mail novamente
              </button>
            )}
            {error ? (
              <p role="alert" className="mt-3 rounded-xl border-[1.5px] border-red-200 bg-red-50 p-3 text-[14px] font-bold text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="mt-2 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white active:bg-brand-dark"
            >
              Ir para o login
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Cadastro" title="Criar conta" onBack={() => navigate("/")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="animate-rise mt-6 rounded-3xl bg-ink p-6 text-white">
          <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">Comece a vistoriar</h2>
          <p className="mt-1 text-[14px] leading-snug text-slate-300">
            Crie sua conta para gerenciar suas ordens de serviço.
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
          <OsField label="Nome" error={fieldErrors.name}>
            <input
              type="text"
              className={osInputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
            />
          </OsField>
          <OsField label="E-mail" error={fieldErrors.email}>
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
          <OsField label="Senha" hint="Mínimo de 6 caracteres." error={fieldErrors.password}>
            <input
              type="password"
              className={osInputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </OsField>
          <OsField label="Confirmar senha" error={fieldErrors.confirm}>
            <input
              type="password"
              className={osInputCls}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </OsField>
          <button
            type="submit"
            disabled={busy}
            className="h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Criando…" : "Criar conta"}
          </button>
        </form>
        <p className="mt-3 text-center text-[13.5px] text-slate-500">
          Já tem conta?{" "}
          <Link to="/login" className="font-extrabold text-brand underline underline-offset-2">
            Entrar
          </Link>
        </p>
      </main>
    </div>
  );
}

/**
 * "Esqueci minha senha" - envia link de recuperação via Supabase Auth
 * (resetPasswordForEmail). Sem tokens próprios, sem tabela própria.
 * Mensagem neutra no sucesso para não enumerar usuários.
 */
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { OsField, osInputCls } from "../components/os";
import { authErrorMessage, useAuth } from "../state/auth";
import { isValidEmail } from "../state/authValidation";

export default function ForgotPassword() {
  const { status, sendPasswordReset } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (status === "authenticated" || status === "local") {
    return <Navigate to="/dashboard" replace />;
  }

  const submit = () => {
    if (busy) return;
    if (!isValidEmail(email)) {
      setFieldError("Informe um e-mail válido.");
      return;
    }
    setFieldError("");
    setError("");
    setBusy(true);
    sendPasswordReset(email)
      .then(() => setSent(true))
      .catch((e: unknown) => setError(authErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Acesso" title="Recuperar senha" onBack={() => navigate("/login")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        <section className="animate-rise mt-6 rounded-3xl bg-ink p-6 text-white">
          <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">Esqueci minha senha</h2>
          <p className="mt-1 text-[14px] leading-snug text-slate-300">
            Informe seu e-mail para receber o link de recuperação.
          </p>
        </section>

        {sent ? (
          <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-5">
            <p role="status" className="text-[15px] font-extrabold">
              Verifique seu e-mail
            </p>
            <p className="mt-1 text-[14px] leading-snug text-slate-500">
              Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="mt-4 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white active:bg-brand-dark"
            >
              Voltar ao login
            </button>
          </div>
        ) : (
          <form
            className="mt-3 flex flex-col gap-5 rounded-2xl border border-slate-200/80 bg-white p-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {error ? (
              <p role="alert" className="rounded-xl border-[1.5px] border-red-200 bg-red-50 p-3 text-[14px] font-bold text-red-700">
                {error}
              </p>
            ) : null}
            <OsField label="E-mail" error={fieldError}>
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
            <button
              type="submit"
              disabled={busy}
              className="h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white shadow-[0_2px_8px_rgba(29,78,216,0.35)] active:bg-brand-dark disabled:opacity-60"
            >
              {busy ? "Enviando…" : "Enviar link de recuperação"}
            </button>
          </form>
        )}
        <p className="mt-3 text-center text-[13.5px] text-slate-500">
          Lembrou a senha?{" "}
          <Link to="/login" className="font-extrabold text-brand underline underline-offset-2">
            Entrar
          </Link>
        </p>
      </main>
    </div>
  );
}

/**
 * Redefinição de senha (/reset-password) - rota pública, acessível durante
 * o fluxo de recuperação mesmo sem sessão normal.
 *
 * Compatível com HashRouter: o Supabase (PKCE) anexa `?code=...` antes ou
 * depois do `#/reset-password`; aqui o code é extraído do href completo e
 * trocado por sessão via exchangeCodeForSession antes do updateUser.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/chrome";
import { OsField, osInputCls } from "../components/os";
import { getSupabase } from "../infrastructure/supabase/client";
import { authErrorMessage, useAuth } from "../state/auth";
import { extractRecoveryCodeFromHref, validatePasswordReset } from "../state/authValidation";

type Phase = "checking" | "ready" | "done" | "invalid";

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function establish() {
      const client = getSupabase();
      if (!client) {
        if (!cancelled) setPhase("invalid");
        return;
      }
      try {
        // Sessão de recuperação já estabelecida pelo SDK (detectSessionInUrl).
        const { data } = await client.auth.getSession();
        if (data.session) {
          if (!cancelled) setPhase("ready");
          return;
        }
        // HashRouter: code pode estar no search ou no fragment.
        const code = extractRecoveryCodeFromHref(window.location.href);
        if (!code) {
          if (!cancelled) setPhase("invalid");
          return;
        }
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (!cancelled) setPhase("ready");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    }
    void establish();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = () => {
    if (busy || phase !== "ready") return;
    const v = validatePasswordReset(password, confirm);
    setFieldErrors(v);
    if (Object.keys(v).length > 0) return;
    setError("");
    setBusy(true);
    updatePassword(password)
      .then(() => setPhase("done"))
      .catch((e: unknown) => {
        setError(authErrorMessage(e));
        setBusy(false);
      });
  };

  return (
    <div className="min-h-dvh bg-app text-ink">
      <AppHeader eyebrow="Acesso" title="Nova senha" onBack={() => navigate("/login")} />
      <main className="mx-auto max-w-xl px-4 pb-10">
        {phase === "checking" ? (
          <p className="mt-10 text-center text-[14px] font-semibold text-slate-400">
            Verificando link de recuperação…
          </p>
        ) : phase === "done" ? (
          <div className="animate-rise mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 text-center">
            <p className="text-[18px] font-extrabold tracking-tight">Senha alterada com sucesso.</p>
            <p className="mt-1 text-[14px] text-slate-500">Use a nova senha para entrar.</p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="mt-4 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white active:bg-brand-dark"
            >
              Entrar novamente
            </button>
          </div>
        ) : phase === "invalid" ? (
          <div className="animate-rise mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 text-center">
            <p className="text-[18px] font-extrabold tracking-tight">Link inválido ou expirado</p>
            <p className="mt-1 text-[14px] leading-snug text-slate-500">
              Peça um novo link de recuperação na tela de login.
            </p>
            <button
              type="button"
              onClick={() => navigate("/recuperar-senha", { replace: true })}
              className="mt-4 h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white active:bg-brand-dark"
            >
              Pedir novo link
            </button>
          </div>
        ) : (
          <form
            className="mt-6 flex flex-col gap-5 rounded-2xl border border-slate-200/80 bg-white p-5"
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
            <OsField label="Nova senha" hint="Mínimo de 6 caracteres." error={fieldErrors.password}>
              <input
                type="password"
                className={osInputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </OsField>
            <OsField label="Confirmar nova senha" error={fieldErrors.confirm}>
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
              className="h-[60px] w-full rounded-2xl bg-brand text-[17px] font-extrabold text-white active:bg-brand-dark disabled:opacity-60"
            >
              {busy ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

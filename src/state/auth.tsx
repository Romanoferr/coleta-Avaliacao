/**
 * Autenticação (Supabase Auth, e-mail + senha).
 * Sessão persistida/restaurada pelo próprio SDK — o app nunca armazena
 * senha ou tokens manualmente.
 *
 * Fluxos: signUp (nome vai para user_metadata, nunca para tabela própria),
 * signIn, signOut, resetPasswordForEmail, updateUser (redefinição) e
 * resend de confirmação. owner_id continua derivado de auth.getUser()/
 * auth.uid() nos repositories — o frontend nunca escolhe o dono.
 *
 * Sem Supabase configurado, status = "local" e as rotas não exigem login
 * (modo single-user offline, comportamento anterior preservado).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getAppUrl, getSupabase, isSupabaseConfigured } from "../infrastructure/supabase/client";
import { authErrorMessage, passwordResetRedirectTo, signupEmailRedirectTo } from "./authValidation";

export type AuthStatus = "loading" | "local" | "authenticated" | "unauthenticated";

interface Auth {
  status: AuthStatus;
  user: User | null;
  /** Nome de exibição (user_metadata, sem tabela própria). */
  displayName: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string }) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  /** true quando a sessão atual veio de um link de recuperação. */
  recoveryMode: boolean;
}

const Ctx = createContext<Auth | null>(null);

function nameFromUser(user: User | null): string | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = meta.display_name ?? meta.name ?? meta.full_name;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setStatus("local");
      return;
    }
    let mounted = true;
    // Restaura a sessão persistida antes do primeiro render de rota
    // (evita redirect prematuro para /login no refresh).
    client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setStatus(data.session ? "authenticated" : "unauthenticated");
    });
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setStatus(session ? "authenticated" : "unauthenticated");
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      else if (event === "SIGNED_OUT") setRecoveryMode(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = getSupabase();
    if (!client) throw new Error("Supabase não configurado.");
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    setRecoveryMode(false);
    // onAuthStateChange atualiza status/user; sem await extra aqui.
  }, []);

  const signUp = useCallback(async (input: { name: string; email: string; password: string }) => {
    const client = getSupabase();
    if (!client) throw new Error("Supabase não configurado.");
    const email = input.email.trim();
    const { data, error } = await client.auth.signUp({
      email,
      password: input.password,
      options: {
        data: { display_name: input.name.trim() },
        emailRedirectTo: signupEmailRedirectTo(getAppUrl()),
      },
    });
    if (error) throw error;
    // Com confirmação de e-mail habilitada, session é null até o usuário confirmar.
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    setRecoveryMode(false);
    // store.tsx limpa OSs/drafts do principal anterior na troca de usuário.
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const client = getSupabase();
    if (!client) throw new Error("Supabase não configurado.");
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirectTo(getAppUrl()),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const client = getSupabase();
    if (!client) throw new Error("Supabase não configurado.");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false);
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const client = getSupabase();
    if (!client) throw new Error("Supabase não configurado.");
    const { error } = await client.auth.resend({ type: "signup", email: email.trim() });
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      displayName: nameFromUser(user),
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      resendConfirmation,
      recoveryMode,
    }),
    [status, user, signIn, signUp, signOut, sendPasswordReset, updatePassword, resendConfirmation, recoveryMode]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(Ctx);
  if (!auth) throw new Error("useAuth fora do AuthProvider");
  return auth;
}

/** Mensagem amigável (pt-BR) para erros de login. Nunca vaza detalhe interno. */
export function loginErrorMessage(e: unknown): string {
  return authErrorMessage(e);
}

export { authErrorMessage };
export function isSupabaseAuthConfigured(): boolean {
  return isSupabaseConfigured();
}

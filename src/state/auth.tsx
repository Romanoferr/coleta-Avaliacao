/**
 * Autenticação (Supabase Auth, e-mail + senha).
 * Sessão persistida/restaurada pelo próprio SDK — o app nunca armazena
 * senha ou tokens manualmente.
 *
 * Sem Supabase configurado, status = "local" e as rotas não exigem login
 * (modo single-user offline, comportamento anterior preservado).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "../infrastructure/supabase/client";

export type AuthStatus = "loading" | "local" | "authenticated" | "unauthenticated";

interface Auth {
  status: AuthStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setStatus("local");
      return;
    }
    let mounted = true;
    client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setStatus(data.session ? "authenticated" : "unauthenticated");
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session ? "authenticated" : "unauthenticated");
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
    // onAuthStateChange atualiza status/user; sem await extra aqui.
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabase();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(Ctx);
  if (!auth) throw new Error("useAuth fora do AuthProvider");
  return auth;
}

/** Mensagem amigável (pt-BR) para erros de login. Nunca vaza detalhe interno. */
export function loginErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha inválidos.";
  if (/email not confirmed/i.test(msg)) return "E-mail ainda não confirmado. Fale com o responsável pelo projeto.";
  if (/failed to fetch|network|load failed/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet.";
  if (/too many requests|rate limit/i.test(msg)) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  return "Não foi possível entrar. Tente de novo.";
}

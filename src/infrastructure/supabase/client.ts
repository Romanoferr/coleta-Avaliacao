/**
 * ÚNICA instância do client Supabase no projeto.
 * Nenhum outro módulo chama `createClient` - importar daqui.
 * Sem env configurado, o app roda em modo local (ver state/store).
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

let cached: SupabaseClient<Database> | null = null;

/** Retorna o client, ou null quando o Supabase não foi configurado. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (!cached) {
    cached = createClient<Database>(url as string, anonKey as string, {
      // Sessão persistida pelo mecanismo padrão do Supabase (localStorage
      // gerenciado pelo próprio SDK - o app nunca toca em tokens).
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return cached;
}

/** Base pública da aplicação para redirects do Auth (configurável, sem hardcode). */
export function getAppUrl(): string {
  const fromEnv = (import.meta.env.VITE_APP_URL as string | undefined)?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}
/**
 * Exige backend configurado. Telas chamam repositories (que já tratam),
 * nunca isto diretamente - exportado só para diagnóstico/teste.
 */
export function requireSupabase(): SupabaseClient<Database> {
  const client = getSupabase();
  if (!client) {
    throw new Error(
      "Supabase não configurado. Crie .env.local a partir de .env.example (ver docs/SUPABASE.md)."
    );
  }
  return client;
}

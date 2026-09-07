/**
 * Validação de formulários de autenticação (pura, sem Supabase — testável).
 * Regras: e-mail formato simples, senha mínima 6 (padrão Supabase),
 * nome mínimo 2 caracteres. Mensagens já em pt-BR amigável.
 */

export const MIN_PASSWORD_LENGTH = 6;

export function isValidEmail(email: string): boolean {
  const v = email.trim();
  if (!v || v.length > 254 || v.includes(" ")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export interface SignupValidation {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export function validateSignup(input: {
  name: string;
  email: string;
  password: string;
  confirm: string;
}): SignupValidation {
  const errors: SignupValidation = {};
  if (input.name.trim().length < 2) errors.name = "Informe seu nome.";
  if (!isValidEmail(input.email)) errors.email = "Informe um e-mail válido.";
  if (!input.password) errors.password = "Informe uma senha.";
  else if (input.password.length < MIN_PASSWORD_LENGTH)
    errors.password = `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (input.confirm !== input.password) errors.confirm = "As senhas não coincidem.";
  return errors;
}

export function validatePasswordReset(password: string, confirm: string): { password?: string; confirm?: string } {
  const errors: { password?: string; confirm?: string } = {};
  if (!password) errors.password = "Informe a nova senha.";
  else if (password.length < MIN_PASSWORD_LENGTH)
    errors.password = `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (confirm !== password) errors.confirm = "As senhas não coincidem.";
  return errors;
}

/**
 * Mapeia erros do Supabase Auth para mensagens amigáveis pt-BR.
 * Nunca vaza detalhe interno; evita enumeração de usuários
 * (signup com e-mail existente retorna mensagem neutra).
 */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha inválidos.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (/user already registered|already been registered|already exists/i.test(msg))
    return "Se este e-mail já estiver cadastrado, você receberá instruções. Tente entrar ou recuperar a senha.";
  if (/invalid email|email address.*invalid|\"email\".*valid/i.test(msg)) return "Informe um e-mail válido.";
  if (/password.*weak|weak password|password should|password must|same password/i.test(msg))
    return `A senha não atende aos requisitos mínimos (ao menos ${MIN_PASSWORD_LENGTH} caracteres).`;
  if (/expired|token.*invalid|invalid.*token|otp/i.test(msg))
    return "Este link expirou ou já foi usado. Peça um novo link de recuperação.";
  if (/failed to fetch|network|load failed|fetch failed/i.test(msg))
    return "Sem conexão com o servidor. Verifique a internet.";
  if (/too many requests|rate limit|over.*limit|email rate/i.test(msg))
    return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (/session.*expired|session missing|no session|not authenticated|jwt/i.test(msg))
    return "Sessão expirada. Entre de novo.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

/**
 * Extrai `code` de recuperação do href completo (funciona com HashRouter:
 * Supabase PKCE anexa ?code=... antes ou depois do `#/rota`).
 */
export function extractRecoveryCodeFromHref(href: string): string | null {
  const m = /[?&#]code=([^&#]+)/.exec(href);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Monta a URL de redirect da recuperação (configurável via env, sem hardcode). */
export function passwordResetRedirectTo(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/#/reset-password`;
}

/** Monta a URL de redirect da confirmação de cadastro. */
export function signupEmailRedirectTo(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/#/login`;
}

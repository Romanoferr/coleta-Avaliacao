import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  extractRecoveryCodeFromHref,
  isValidEmail,
  passwordResetRedirectTo,
  signupEmailRedirectTo,
  validatePasswordReset,
  validateSignup,
} from "./authValidation";

describe("validateSignup", () => {
  it("aceita cadastro válido", () => {
    expect(
      validateSignup({ name: "Ana", email: "ana@empresa.com", password: "secreta1", confirm: "secreta1" })
    ).toEqual({});
  });

  it("rejeita e-mail inválido", () => {
    const e = validateSignup({ name: "Ana", email: "ana@", password: "secreta1", confirm: "secreta1" });
    expect(e.email).toBe("Informe um e-mail válido.");
  });

  it("rejeita senha curta", () => {
    const e = validateSignup({ name: "Ana", email: "ana@empresa.com", password: "123", confirm: "123" });
    expect(e.password).toMatch(/ao menos 6/);
  });

  it("rejeita senhas diferentes", () => {
    const e = validateSignup({ name: "Ana", email: "ana@empresa.com", password: "secreta1", confirm: "outra22" });
    expect(e.confirm).toBe("As senhas não coincidem.");
  });

  it("rejeita nome vazio", () => {
    const e = validateSignup({ name: " ", email: "ana@empresa.com", password: "secreta1", confirm: "secreta1" });
    expect(e.name).toBe("Informe seu nome.");
  });
});

describe("validatePasswordReset", () => {
  it("aceita nova senha válida", () => {
    expect(validatePasswordReset("nova123", "nova123")).toEqual({});
  });

  it("rejeita confirmação diferente e senha curta", () => {
    expect(validatePasswordReset("123", "123").password).toMatch(/ao menos 6/);
    expect(validatePasswordReset("nova123", "outra123").confirm).toBe("As senhas não coincidem.");
  });
});

describe("isValidEmail", () => {
  it("valida formatos comuns e rejeita inválidos", () => {
    expect(isValidEmail("voce@empresa.com")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("sem-arroba")).toBe(false);
    expect(isValidEmail("com espaco@x.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("mapeia login inválido sem vazar detalhe", () => {
    expect(authErrorMessage(new Error("Invalid login credentials"))).toBe("E-mail ou senha inválidos.");
  });

  it("orienta confirmação de e-mail", () => {
    expect(authErrorMessage(new Error("Email not confirmed"))).toMatch(/Confirme seu e-mail/);
  });

  it("neutraliza e-mail já cadastrado (anti-enumeração)", () => {
    const m = authErrorMessage(new Error("User already registered"));
    expect(m).toMatch(/recuperar a senha/);
    expect(m).not.toMatch(/existe/i);
  });

  it("mapeia rede, rate limit e link expirado", () => {
    expect(authErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Sem conexão/);
    expect(authErrorMessage(new Error("Too many requests"))).toMatch(/Muitas tentativas/);
    expect(authErrorMessage(new Error("Token has expired or is invalid"))).toMatch(/expirou/);
  });

  it("cai no genérico sem expor stack", () => {
    const m = authErrorMessage(new Error("algum detalhe interno secreto 123"));
    expect(m).toBe("Não foi possível concluir a operação. Tente novamente.");
    expect(m).not.toContain("secreto");
  });
});

describe("recovery code + redirects", () => {
  it("extrai code do search e do fragment (HashRouter)", () => {
    expect(extractRecoveryCodeFromHref("http://localhost:5173/?code=abc123#/reset-password")).toBe("abc123");
    expect(extractRecoveryCodeFromHref("http://localhost:5173/#/reset-password?code=xyz789")).toBe("xyz789");
    expect(extractRecoveryCodeFromHref("http://localhost:5173/#/reset-password#access_token=t")).toBeNull();
  });

  it("monta redirects sob a base configurada", () => {
    expect(passwordResetRedirectTo("https://app.com/")).toBe("https://app.com/#/reset-password");
    expect(signupEmailRedirectTo("https://app.com")).toBe("https://app.com/#/login");
  });
});

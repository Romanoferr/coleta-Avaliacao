import { describe, expect, it } from "vitest";
import { formatBRL, resolveCompassDir } from "./fields";

describe("formatBRL", () => {
  it("retorna vazio para entrada sem dígitos", () => {
    expect(formatBRL("")).toBe("");
    expect(formatBRL("abc")).toBe("");
  });

  it("trata dígitos como centavos", () => {
    expect(formatBRL("1")).toBe("0,01");
    expect(formatBRL("50")).toBe("0,50");
    expect(formatBRL("123456")).toBe("1.234,56");
  });

  it("é idempotente sobre valores já formatados", () => {
    expect(formatBRL("1.234,56")).toBe("1.234,56");
    expect(formatBRL("R$ 10,50")).toBe("10,50");
  });

  it("normaliza número legado para o formato pt-BR", () => {
    expect(formatBRL(String(1234.56))).toBe("1.234,56");
  });

  it("limita a 12 dígitos contra overflow", () => {
    expect(formatBRL("12345678901234567890")).toBe("1.234.567.890,12");
  });
});

describe("resolveCompassDir", () => {
  it("resolve os 8 pontos cardeais em pt-BR", () => {
    expect(resolveCompassDir("Norte")).toBe(1);
    expect(resolveCompassDir("nordeste")).toBe(2);
    expect(resolveCompassDir("Leste")).toBe(4);
    expect(resolveCompassDir("Sudeste")).toBe(5);
    expect(resolveCompassDir("Sul")).toBe(6);
    expect(resolveCompassDir("Sudoeste")).toBe(7);
    expect(resolveCompassDir("Oeste")).toBe(3);
    expect(resolveCompassDir("Noroeste")).toBe(0);
  });

  it("tolera a grafia 'Suldeste'", () => {
    expect(resolveCompassDir("Suldeste")).toBe(5);
  });

  it("retorna -1 para texto desconhecido", () => {
    expect(resolveCompassDir("xyz")).toBe(-1);
  });
});

import { describe, expect, it } from "vitest";
import { getFormDefinition, isTypeAvailable } from "../form-engine/registry";

const section = (id: string) => getFormDefinition("house").sections.find((s) => s.id === id)!;
const field = (sectionId: string, fieldId: string) =>
  section(sectionId).fields.find((f) => f.id === fieldId)!;

describe("house form", () => {
  it("está registrada e disponível", () => {
    expect(isTypeAvailable("house")).toBe(true);
    const form = getFormDefinition("house");
    expect(form.title).toBe("Casa");
    expect(form.sections).toHaveLength(13);
  });

  it("ordena as seções na sequência da ficha física", () => {
    const ids = getFormDefinition("house").sections.map((s) => s.id);
    expect(ids).toEqual([
      "identificacao",
      "regiao-infra",
      "regiao-polos",
      "informante",
      "unidade-divisao",
      "garagem-idade",
      "unidade-posicao",
      "unidade-cobertura-equip",
      "esquadrias",
      "unidade-padrao",
      "terreno",
      "checklist",
      "condominio",
    ]);
  });

  it("usa seleção única onde a ficha exige uma opção", () => {
    expect(field("unidade-posicao", "posicao").type).toBe("radio");
    expect(field("unidade-posicao", "implantacao").type).toBe("radio");
    expect(field("terreno", "uso_unidade").type).toBe("radio");
    expect(field("checklist", "esgoto").type).toBe("radio");
    expect(field("esquadrias", "esquadrias_fachada").type).toBe("radio");
  });

  it("área não averbada e condicionais usam Sim/Não com detalhe", () => {
    const area = field("checklist", "area_nao_averbada");
    expect(area.type).toBe("yesno");
    expect(area.otherDetailId).toBe("area_nao_averbada_det");
    expect(field("identificacao", "numeracao_predial").otherDetailId).toBe("numeracao_predial_num");
    expect(field("checklist", "janelas_perp").otherDetailId).toBe("janelas_perp_det");
  });

  it("valor usa máscara de moeda e é obrigatório", () => {
    const valor = field("informante", "valor");
    expect(valor.type).toBe("currency");
    expect(valor.required).toBe(true);
  });
});

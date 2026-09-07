/** Erros de infraestrutura (rede/banco/concorrência). Regra de negócio usa DomainError. */
export type RepoErrorCode =
  | "NOT_FOUND"
  | "DUPLICATE_ORDER_NUMBER"
  | "DUPLICATE_INSPECTION"
  | "CONFLICT"
  | "NETWORK"
  | "UNAUTHORIZED"
  | "UNKNOWN";

export class RepoError extends Error {
  code: RepoErrorCode;
  cause?: unknown;
  constructor(code: RepoErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "RepoError";
    this.code = code;
    this.cause = cause;
  }
}

/** Mensagem amigável para exibir na UI (pt-BR). */
export function repoErrorMessage(e: unknown): string {
  if (e instanceof RepoError) {
    switch (e.code) {
      case "NETWORK":
        return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
      case "CONFLICT":
        return "Os dados mudaram em outro lugar. Recarregue para ver a versão atual.";
      case "NOT_FOUND":
        return "Registro não encontrado. Ele pode ter sido excluído.";
      case "DUPLICATE_ORDER_NUMBER":
        return "Já existe uma OS com este número.";
      case "DUPLICATE_INSPECTION":
        return "Esta OS já possui ficha. Abra a ficha existente.";
      case "UNAUTHORIZED":
        return "Acesso negado pelo banco (RLS). Fale com o responsável pelo projeto.";
      default:
        return "Falha ao salvar. Tente de novo.";
    }
  }
  return "Falha inesperada. Tente de novo.";
}

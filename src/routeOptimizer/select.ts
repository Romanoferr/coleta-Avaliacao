/**
 * Seleção de OS por data — função pura sobre a lista JÁ isolada por usuário.
 * Isolamento: a tela alimenta esta função apenas com `useStore().orders`,
 * que já vem filtrado por RLS (auth.uid() = owner_id) + limpeza de memória
 * na troca de usuário. Esta camada nunca busca por id arbitrário.
 */
import { hasUsableAddress } from "../domain/serviceOrder";
import type { ServiceOrder } from "../domain/serviceOrder";

export function ordersForDate(orders: ServiceOrder[], dateIso: string): ServiceOrder[] {
  return orders
    .filter((o) => o.deletedAt === null && o.inspectionDate === dateIso && hasUsableAddress(o))
    .sort((a, b) => {
      const ta = a.inspectionTime ?? "";
      const tb = b.inspectionTime ?? "";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.number.localeCompare(b.number, "pt-BR");
    });
}

/** OS da data sem endereço válido (para o alerta "não pôde entrar na rota"). */
export function ordersWithoutAddress(orders: ServiceOrder[], dateIso: string): ServiceOrder[] {
  return orders.filter(
    (o) => o.deletedAt === null && o.inspectionDate === dateIso && !hasUsableAddress(o)
  );
}

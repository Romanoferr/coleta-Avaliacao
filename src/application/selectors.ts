/** Seletores puros sobre a coleção de OS (lista, busca, contadores). */
import type { ServiceOrder, ServiceOrderStatus } from "../domain/serviceOrder";
import { inspectionDateTime, isOrderOverdue } from "../domain/serviceOrder";
import { todayLocalIso } from "../domain/ids";
import { formatAddress } from "../domain/address";

export type StatusFilter = "all" | ServiceOrderStatus;
export type QuickFilter = "none" | "today" | "overdue" | "awaiting";
export type OrderSort = "agenda" | "recent";

export interface DashboardCounts {
  today: number;
  overdue: number;
  awaiting: number;
  drafting: number;
  completed: number;
  total: number;
}

export function liveOrders(orders: ServiceOrder[]): ServiceOrder[] {
  return orders.filter((o) => o.deletedAt === null);
}

export function dashboardCounts(orders: ServiceOrder[], today = todayLocalIso()): DashboardCounts {
  const live = liveOrders(orders);
  return {
    today: live.filter(
      (o) => o.inspectionDate === today && o.status !== "completed" && o.status !== "cancelled"
    ).length,
    overdue: live.filter((o) => isOrderOverdue(o, today)).length,
    awaiting: live.filter(
      (o) => o.status === "scheduled" && o.inspectionId === null && o.deletedAt === null
    ).length,
    drafting: live.filter((o) => o.status === "drafting").length,
    completed: live.filter((o) => o.status === "completed").length,
    total: live.length,
  };
}

function matchesSearch(order: ServiceOrder, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${order.number} ${order.contractor} ${formatAddress(order.address)}`.toLowerCase();
  return needle.split(/\s+/).every((part) => hay.includes(part));
}

export function filterOrders(
  orders: ServiceOrder[],
  opts: { search: string; status: StatusFilter; quick: QuickFilter; today?: string }
): ServiceOrder[] {
  const today = opts.today ?? todayLocalIso();
  return liveOrders(orders).filter((o) => {
    if (!matchesSearch(o, opts.search)) return false;
    if (opts.status !== "all" && o.status !== opts.status) return false;
    if (opts.quick === "today" && !(o.inspectionDate === today && o.status !== "completed" && o.status !== "cancelled"))
      return false;
    if (opts.quick === "overdue" && !isOrderOverdue(o, today)) return false;
    if (opts.quick === "awaiting" && !(o.status === "scheduled" && o.inspectionId === null)) return false;
    return true;
  });
}

export function sortOrders(orders: ServiceOrder[], sort: OrderSort): ServiceOrder[] {
  const arr = [...orders];
  if (sort === "recent") return arr.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return arr.sort((a, b) => {
    const da = inspectionDateTime(a);
    const db = inspectionDateTime(b);
    if (da === null && db === null) return a.updatedAt < b.updatedAt ? 1 : -1;
    if (da === null) return 1;
    if (db === null) return -1;
    if (da !== db) return da < db ? -1 : 1;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
}

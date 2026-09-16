/** Llamadas a la API del checklist de presupuesto. */

import { pedir } from "./client";
import type {
  ChecklistDelMes,
  ItemPresupuesto,
  NuevoItemPresupuesto,
} from "./types";

export function fetchBudgetItems(includeArchived = false): Promise<{ data: ItemPresupuesto[] }> {
  return pedir("/budgets/items", { parametros: { includeArchived: String(includeArchived) } });
}

export function createBudgetItem(input: NuevoItemPresupuesto): Promise<{ data: ItemPresupuesto }> {
  return pedir("/budgets/items", { metodo: "POST", cuerpo: input });
}

/** Cambiar cuánto se espera mover desde ahora, nunca cómo se vio un mes pasado. */
export function updateBudgetItemTarget(id: string, amount: string): Promise<{ data: ItemPresupuesto }> {
  return pedir(`/budgets/items/${id}/target`, { metodo: "PATCH", cuerpo: { amount } });
}

export function updateBudgetItemLabel(id: string, label: string | null): Promise<{ data: ItemPresupuesto }> {
  return pedir(`/budgets/items/${id}/label`, { metodo: "PATCH", cuerpo: { label } });
}

/** Archivar, no borrar: el ítem deja de pedirse pero su historia no se toca. */
export function archiveBudgetItem(id: string): Promise<{ data: ItemPresupuesto }> {
  return pedir(`/budgets/items/${id}/archive`, { metodo: "POST" });
}

export function unarchiveBudgetItem(id: string): Promise<{ data: ItemPresupuesto }> {
  return pedir(`/budgets/items/${id}/unarchive`, { metodo: "POST" });
}

export function fetchBudgetChecklist(input: {
  month: string;
  currency: string;
}): Promise<{ data: ChecklistDelMes }> {
  return pedir("/budgets/checklist", { parametros: input });
}

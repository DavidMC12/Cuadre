/** Llamadas a la API de categorías. */

import { pedir } from "./client";
import type { Categoria, NuevaCategoria } from "./types";

export function fetchCategories(includeArchived = false): Promise<{ data: Categoria[] }> {
  return pedir("/categories", { parametros: { includeArchived: String(includeArchived) } });
}

export function createCategory(input: NuevaCategoria): Promise<{ data: Categoria }> {
  return pedir("/categories", { metodo: "POST", cuerpo: input });
}

/** Solo renombra: el tipo (gasto/ingreso) de una categoría nunca cambia. */
export function renameCategory(id: string, name: string): Promise<{ data: Categoria }> {
  return pedir(`/categories/${id}`, { metodo: "PATCH", cuerpo: { name } });
}

/** Archivar, no borrar: los movimientos viejos siguen apuntando a ella. */
export function archiveCategory(id: string): Promise<{ data: Categoria }> {
  return pedir(`/categories/${id}/archive`, { metodo: "POST" });
}

export function unarchiveCategory(id: string): Promise<{ data: Categoria }> {
  return pedir(`/categories/${id}/unarchive`, { metodo: "POST" });
}

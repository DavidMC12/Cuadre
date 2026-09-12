/** Llamadas a la API de movimientos. */

import { descargar, pedir } from "./client";
import type {
  FiltrosMovimientos,
  Movimiento,
  NuevoMovimiento,
  PaginaMovimientos,
} from "./types";

export function fetchTransactions(filtros: FiltrosMovimientos = {}): Promise<PaginaMovimientos> {
  return pedir("/transactions", { parametros: { ...filtros } });
}

export function createTransaction(input: NuevoMovimiento): Promise<{ data: Movimiento }> {
  return pedir("/transactions", { metodo: "POST", cuerpo: input });
}

/**
 * Anular, no borrar. Devuelve el movimiento de anulación que se creó; el
 * original sigue existiendo y queda marcado como anulado.
 */
export function reverseTransaction(id: string): Promise<{ data: Movimiento }> {
  return pedir(`/transactions/${id}/reversal`, { metodo: "POST" });
}

/**
 * La categoría es lo único que se puede corregir de un movimiento ya
 * registrado: el monto, la fecha y la cuenta quedan intocables.
 * `categoryId: null` lo deja sin categoría.
 */
export function updateTransactionCategory(
  id: string,
  categoryId: string | null
): Promise<{ data: Movimiento }> {
  return pedir(`/transactions/${id}/category`, { metodo: "PATCH", cuerpo: { categoryId } });
}

/** Todo el historial en un archivo, para abrirlo en Excel o guardarlo aparte. */
export function exportTransactions(): Promise<{ contenido: Blob; nombre: string }> {
  return descargar("/transactions/export", "cuadre-movimientos.csv");
}

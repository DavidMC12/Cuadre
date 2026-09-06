/** Llamadas a la API de movimientos. */

import { pedir } from "./client";
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

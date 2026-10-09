/** Llamadas a la API de movimientos. */

import { descargar, pedir } from "./client";
import type {
  FiltrosMovimientos,
  Movimiento,
  NuevaTransferencia,
  NuevoMovimiento,
  NuevoPagoDividido,
  PaginaMovimientos,
  PagoDividido,
  Transferencia,
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

/**
 * A qué item del presupuesto cuenta un movimiento: asignarlo, cambiarlo o
 * dejarlo "sin asignar" (`null`). Sirve para un movimiento con categoria y
 * para las dos patas de una transferencia a tarjeta; el servidor rechaza
 * todo lo demás (saldo inicial, ajuste).
 */
export function updateTransactionBudgetItem(
  id: string,
  budgetItemId: string | null
): Promise<{ data: Movimiento }> {
  return pedir(`/transactions/${id}/budget-item`, {
    metodo: "PATCH",
    cuerpo: { budgetItemId },
  });
}

/** Todo el historial en un archivo, para abrirlo en Excel o guardarlo aparte. */
export function exportTransactions(): Promise<{ contenido: Blob; nombre: string }> {
  return descargar("/transactions/export", "cuadre-movimientos.csv");
}

/**
 * Pasar plata entre dos cuentas propias. El servidor escribe las dos patas
 * (lo que sale, lo que entra) juntas o ninguna.
 */
export function createTransfer(input: NuevaTransferencia): Promise<{ data: Transferencia }> {
  return pedir("/transfers", { metodo: "POST", cuerpo: input });
}

/**
 * Una compra pagada con dos cuentas: se registra UNA vez y el servidor escribe
 * las dos partes (un gasto por cuenta) juntas o ninguna.
 */
export function createSplitPayment(input: NuevoPagoDividido): Promise<{ data: PagoDividido }> {
  return pedir("/split-payments", { metodo: "POST", cuerpo: input });
}

/**
 * Anular una compra pagada con dos cuentas: las dos partes juntas. Una parte
 * sola no se anula (el servidor la rechaza): quedaría la compra a medias.
 */
export function reverseSplitPayment(paymentGroupId: string): Promise<{ data: PagoDividido }> {
  return pedir(`/split-payments/${paymentGroupId}/reversal`, { metodo: "POST" });
}

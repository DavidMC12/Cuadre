/** Llamadas a la API de cuentas. */

import { pedir } from "./client";
import type { CambiosDeCuenta, Cuenta, Movimiento, NuevaCuenta } from "./types";

export function fetchAccounts(includeArchived = false): Promise<{ data: Cuenta[] }> {
  return pedir("/accounts", { parametros: { includeArchived: String(includeArchived) } });
}

export function fetchAccount(id: string): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}`);
}

export function createAccount(input: NuevaCuenta): Promise<{ data: Cuenta }> {
  return pedir("/accounts", { metodo: "POST", cuerpo: input });
}

/**
 * Editar nombre, cupo y cuenta vinculada — nunca el saldo, el tipo ni la
 * moneda. `null` en creditLimit/linkedAccountId borra el valor.
 */
export function updateAccount(id: string, cambios: CambiosDeCuenta): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}`, { metodo: "PATCH", cuerpo: cambios });
}

/** Archivar, no borrar: la cuenta tiene historia y la historia no se toca. */
export function archiveAccount(id: string): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}/archive`, { metodo: "POST" });
}

export function unarchiveAccount(id: string): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}/unarchive`, { metodo: "POST" });
}

/** Marcar o desmarcar una cuenta como de ahorro. Es reversible con un toque. */
export function updateAccountSavings(id: string, isSavings: boolean): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}/savings`, { metodo: "PATCH", cuerpo: { isSavings } });
}

/**
 * Registrar el movimiento de ajuste que deja el saldo de la cuenta donde el
 * banco dice. `balance` es el SALDO DESEADO, con signo — una tarjeta con
 * deuda 350000 es "-350000" —, y la diferencia la pone el servidor: responde
 * 201 con el Movimiento kind "adjustment" ya escrito en el libro. Un ajuste
 * no se anula ni se recategoriza; si quedó mal, se hace otro.
 */
export function adjustAccountBalance(id: string, balance: string): Promise<{ data: Movimiento }> {
  return pedir(`/accounts/${id}/adjust-balance`, { metodo: "POST", cuerpo: { balance } });
}

/** Llamadas a la API de cuentas. */

import { pedir } from "./client";
import type { Cuenta, NuevaCuenta } from "./types";

export function fetchAccounts(includeArchived = false): Promise<{ data: Cuenta[] }> {
  return pedir("/accounts", { parametros: { includeArchived: String(includeArchived) } });
}

export function fetchAccount(id: string): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}`);
}

export function createAccount(input: NuevaCuenta): Promise<{ data: Cuenta }> {
  return pedir("/accounts", { metodo: "POST", cuerpo: input });
}

/** Archivar, no borrar: la cuenta tiene historia y la historia no se toca. */
export function archiveAccount(id: string): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}/archive`, { metodo: "POST" });
}

export function unarchiveAccount(id: string): Promise<{ data: Cuenta }> {
  return pedir(`/accounts/${id}/unarchive`, { metodo: "POST" });
}

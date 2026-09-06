/**
 * Funciones que la interfaz llama para hablar con "la API de cuentas".
 *
 * Hoy responden con datos falsos (`mock-db`). El día que exista la API real,
 * el cambio es mecánico: cada función pasa a hacer un `fetch` a la ruta que
 * ya está comentada arriba de ella, y se borra el `import` a `mock-db`.
 */

import { retrasoDeRed } from "./client";
import * as db from "./mock-db";
import type { Cuenta, NuevaCuenta } from "./types";

// GET /api/v1/accounts?includeArchived=true|false
export async function fetchAccounts(includeArchived = false): Promise<{ data: Cuenta[] }> {
  await retrasoDeRed();
  return { data: db.listarCuentas(includeArchived) };
}

// GET /api/v1/accounts/:id
export async function fetchAccount(id: string): Promise<{ data: Cuenta }> {
  await retrasoDeRed();
  return { data: db.obtenerCuenta(id) };
}

// POST /api/v1/accounts
export async function createAccount(input: NuevaCuenta): Promise<{ data: Cuenta }> {
  await retrasoDeRed();
  return { data: db.crearCuenta(input) };
}

// POST /api/v1/accounts/:id/archive
export async function archiveAccount(id: string): Promise<{ data: Cuenta }> {
  await retrasoDeRed();
  return { data: db.archivarCuenta(id) };
}

// POST /api/v1/accounts/:id/unarchive
export async function unarchiveAccount(id: string): Promise<{ data: Cuenta }> {
  await retrasoDeRed();
  return { data: db.desarchivarCuenta(id) };
}

/**
 * Funciones que la interfaz llama para hablar con "la API de movimientos".
 * Mismo trato que `accounts.ts`: hoy es `mock-db`, mañana un `fetch` real.
 */

import { retrasoDeRed } from "./client";
import * as db from "./mock-db";
import type { FiltrosMovimientos, Movimiento, NuevoMovimiento, PaginaMovimientos } from "./types";

// GET /api/v1/transactions?accountId=&from=&to=&limit=&cursor=
export async function fetchTransactions(filtros: FiltrosMovimientos = {}): Promise<PaginaMovimientos> {
  await retrasoDeRed();
  return db.listarMovimientos(filtros);
}

// POST /api/v1/transactions
export async function createTransaction(input: NuevoMovimiento): Promise<{ data: Movimiento }> {
  await retrasoDeRed();
  return { data: db.crearMovimiento(input) };
}

// POST /api/v1/transactions/:id/reversal
export async function reverseTransaction(id: string): Promise<{ data: Movimiento }> {
  await retrasoDeRed();
  return { data: db.anularMovimiento(id) };
}

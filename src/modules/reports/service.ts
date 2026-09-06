/**
 * Reglas de negocio de los reportes. No sabe nada de HTTP.
 *
 * Las sumas las hace Postgres, que es donde vive el detalle. Lo que se hace
 * aquí es la aritmética que queda después —el neto— y siempre con
 * `shared/money.ts`, o sea con enteros grandes: si el neto se calculara con
 * números de coma flotante, un tablero con muchos movimientos terminaría
 * mostrando un peso que no existe.
 */
import { add, negate } from '../../shared/money.js';
import * as repositorio from './repository.js';
import type { PorCategoria, ResumenDelMes, Tendencia } from './schemas.js';

export async function monedasDisponibles(usuarioId: string): Promise<{ data: string[] }> {
  return { data: await repositorio.monedasConCuentas(usuarioId) };
}

export interface Resumen {
  month: string;
  currency: string;
  income: string;
  expense: string;
  net: string;
}

export async function resumenDelMes(
  usuarioId: string,
  filtros: ResumenDelMes,
): Promise<{ data: Resumen }> {
  const totales = await repositorio.totalesDelMes(usuarioId, filtros.month, filtros.currency);

  return {
    data: {
      month: filtros.month,
      currency: filtros.currency,
      income: totales.income,
      expense: totales.expense,
      // El gasto viene en positivo, así que el neto es una resta.
      net: add(totales.income, negate(totales.expense)),
    },
  };
}

export async function totalesPorCategoria(
  usuarioId: string,
  filtros: PorCategoria,
): Promise<{ data: repositorio.TotalDeCategoria[] }> {
  return {
    data: await repositorio.totalesPorCategoria(
      usuarioId,
      filtros.month,
      filtros.currency,
      filtros.kind,
    ),
  };
}

export async function tendencia(
  usuarioId: string,
  filtros: Tendencia,
): Promise<{ data: repositorio.TotalDeUnMes[] }> {
  return { data: await repositorio.tendencia(usuarioId, filtros.months, filtros.currency) };
}

/** Llamadas a la API de reportes (dashboard). */

import { pedir } from "./client";
import type { AhorroMes, CategoriaTotal, ResumenMes, TendenciaMes, TipoCategoria } from "./types";

/** Las monedas en las que el usuario tiene cuentas. */
export function fetchCurrencies(): Promise<{ data: string[] }> {
  return pedir("/reports/currencies");
}

export function fetchSummary(input: { month: string; currency: string }): Promise<{
  data: ResumenMes;
}> {
  return pedir("/reports/summary", { parametros: input });
}

export function fetchByCategory(input: {
  month: string;
  currency: string;
  kind: TipoCategoria;
}): Promise<{ data: CategoriaTotal[] }> {
  return pedir("/reports/by-category", { parametros: input });
}

export function fetchTrend(input: { months?: number; currency: string }): Promise<{
  data: TendenciaMes[];
}> {
  return pedir("/reports/trend", { parametros: input });
}

/** Cuánto entró menos cuánto salió de las cuentas de ahorro, mes a mes. */
export function fetchSavingsTrend(input: { months?: number; currency: string }): Promise<{
  data: AhorroMes[];
}> {
  return pedir("/reports/savings-trend", { parametros: input });
}

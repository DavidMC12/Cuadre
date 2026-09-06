/** Llamadas a la API de reportes (dashboard). */

import { pedir } from "./client";
import type { CategoriaTotal, ResumenMes, TendenciaMes, TipoCategoria } from "./types";

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

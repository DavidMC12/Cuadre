import type { Cuenta } from "./api/types";

/**
 * Agrupa cuentas por moneda, conservando el orden en el que llegan.
 *
 * `useCuentas()` ya trae las cuentas ordenadas por nombre desde el backend,
 * así que no se reordena nada aquí: cada grupo hereda ese mismo orden
 * alfabético sin tener que repetirlo.
 */
export function agruparCuentasPorMoneda(cuentas: readonly Cuenta[]): Map<string, Cuenta[]> {
  const grupos = new Map<string, Cuenta[]>();
  for (const cuenta of cuentas) {
    const lista = grupos.get(cuenta.currency);
    if (lista) {
      lista.push(cuenta);
    } else {
      grupos.set(cuenta.currency, [cuenta]);
    }
  }
  return grupos;
}

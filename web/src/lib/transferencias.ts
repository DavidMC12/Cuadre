import type { Cuenta } from "@/lib/api/types";

/**
 * A qué cuentas se les puede pasar plata desde una cuenta dada: otra cuenta, y
 * de la misma moneda. Nunca se suman montos de monedas distintas, así que
 * ofrecer un destino de otra moneda sería ofrecer algo que va a fallar.
 */
export function cuentasDeDestino(cuentas: Cuenta[], cuentaOrigenId: string): Cuenta[] {
  const monedaOrigen = cuentas.find((cuenta) => cuenta.id === cuentaOrigenId)?.currency;
  return cuentas.filter(
    (cuenta) => cuenta.id !== cuentaOrigenId && cuenta.currency === monedaOrigen
  );
}

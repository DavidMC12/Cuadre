/** Llamadas a la API de registros de ahorro. */

import { pedir } from "./client";
import type { NuevoRegistroAhorro, RegistroDeAhorro } from "./types";

/**
 * Los últimos registros de una cuenta de ahorro, del más reciente al más
 * viejo. Solo valen para leer: un registro no se edita ni se borra; la
 * corrección es anotar otro de signo contrario.
 */
export function fetchSavingsEntries(input: {
  accountId: string;
  limit?: number;
}): Promise<{ data: RegistroDeAhorro[] }> {
  return pedir("/savings-entries", {
    parametros: { accountId: input.accountId, limit: input.limit },
  });
}

/**
 * Anotar ahorro explicito en una cuenta de ahorro activa: apartar
 * (`amount` positivo) o retirar (negativo), sin mover plata de ninguna
 * cuenta. El servidor responde 201 con el registro ya escrito; si la
 * cuenta no es de ahorro activa, el rechazo ya viene en un mensaje llano
 * que la pantalla muestra tal cual.
 */
export function createSavingsEntry(input: NuevoRegistroAhorro): Promise<{
  data: RegistroDeAhorro;
}> {
  return pedir("/savings-entries", { metodo: "POST", cuerpo: input });
}

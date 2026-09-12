/**
 * Llamadas a la API de administración de Cuadre.
 *
 * La lista de usuarios NO está aquí: la sirve Neon Auth, que es quien sabe
 * quién puede entrar. Cuadre solo guarda el rastro de a quién se suplantó.
 */

import { pedir } from "./client";
import type { Suplantacion } from "./types";

export function registerImpersonation(input: {
  targetAuthSubject: string;
  targetEmail: string;
}): Promise<{ data: Suplantacion }> {
  return pedir("/admin/impersonations", { metodo: "POST", cuerpo: input });
}

export function fetchImpersonations(limit = 50): Promise<{ data: Suplantacion[] }> {
  return pedir("/admin/impersonations", { parametros: { limit } });
}

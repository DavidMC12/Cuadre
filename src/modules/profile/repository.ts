/**
 * SQL del perfil. Nada más.
 *
 * `usuarioId` es siempre el primer parámetro: aquí no existe una consulta capaz
 * de leer ni de escribir la fila de otra persona.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import type { StartPage } from '../../db/schema/users.js';
import type { Perfil } from './schemas.js';

const CAMPOS = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  createdAt: users.createdAt,
  defaultCurrency: users.defaultCurrency,
  startPage: users.startPage,
};

interface FilaDePerfil {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  defaultCurrency: string | null;
  startPage: StartPage;
}

/** `char(3)` rellena con espacios hasta completar el ancho; hay que quitarlos. */
function aPerfil(fila: FilaDePerfil): Perfil {
  return {
    id: fila.id,
    email: fila.email,
    displayName: fila.displayName,
    createdAt: fila.createdAt.toISOString(),
    defaultCurrency: fila.defaultCurrency?.trim() ?? null,
    startPage: fila.startPage,
  };
}

// -----------------------------------------------------------------------------

export async function obtener(usuarioId: string): Promise<Perfil | null> {
  const [fila] = await db.select(CAMPOS).from(users).where(eq(users.id, usuarioId)).limit(1);

  return fila ? aPerfil(fila) : null;
}

export interface CambiosDePerfil {
  displayName?: string | undefined;
  defaultCurrency?: string | null | undefined;
  startPage?: StartPage | undefined;
}

/**
 * Devuelve el perfil ya actualizado, o null si esa persona no existe.
 *
 * Drizzle omite del SET las claves que llegan como `undefined`, así que este
 * mismo objeto sirve para cambiar un campo, dos o los tres. Un `null` en
 * `defaultCurrency` sí se escribe: es la forma de borrar la preferencia.
 */
export async function actualizar(
  usuarioId: string,
  cambios: CambiosDePerfil,
): Promise<Perfil | null> {
  const [fila] = await db
    .update(users)
    .set(cambios)
    .where(eq(users.id, usuarioId))
    .returning(CAMPOS);

  return fila ? aPerfil(fila) : null;
}

/**
 * SQL del registro de suplantaciones. Solo inserta y consulta: una fila de
 * auditoría que se pueda editar no sirve como auditoría.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { adminImpersonations } from '../../db/schema/index.js';
import type { Suplantacion } from './schemas.js';

const CAMPOS = {
  id: adminImpersonations.id,
  targetAuthSubject: adminImpersonations.targetAuthSubject,
  targetEmail: adminImpersonations.targetEmail,
  startedAt: adminImpersonations.startedAt,
};

function aSuplantacion(fila: {
  id: string;
  targetAuthSubject: string;
  targetEmail: string;
  startedAt: Date;
}): Suplantacion {
  return {
    id: fila.id,
    targetAuthSubject: fila.targetAuthSubject,
    targetEmail: fila.targetEmail,
    startedAt: fila.startedAt.toISOString(),
  };
}

// -----------------------------------------------------------------------------

export async function registrar(
  adminUsuarioId: string,
  datos: { targetAuthSubject: string; targetEmail: string },
): Promise<Suplantacion> {
  const [fila] = await db
    .insert(adminImpersonations)
    .values({
      adminUserId: adminUsuarioId,
      targetAuthSubject: datos.targetAuthSubject,
      targetEmail: datos.targetEmail.toLowerCase(),
    })
    .returning(CAMPOS);

  if (!fila) throw new Error('No se pudo dejar constancia de la suplantacion.');
  return aSuplantacion(fila);
}

/** El historial de un administrador, del más reciente al más viejo. */
export async function listarDe(adminUsuarioId: string, limite: number): Promise<Suplantacion[]> {
  const filas = await db
    .select(CAMPOS)
    .from(adminImpersonations)
    .where(eq(adminImpersonations.adminUserId, adminUsuarioId))
    .orderBy(desc(adminImpersonations.startedAt))
    .limit(limite);

  return filas.map(aSuplantacion);
}

/**
 * SQL del catálogo de categorías. Nada más: ni reglas de negocio ni HTTP.
 *
 * `usuarioId` es siempre el primer parámetro y nunca es implícito. No hay aquí
 * una consulta que pueda leer o escribir el catálogo de otra persona.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Ejecutor } from '../../db/client.js';
import { db } from '../../db/client.js';
import { categories } from '../../db/schema/index.js';
import type { Categoria, TipoDeCategoria } from './schemas.js';

const CAMPOS = {
  id: categories.id,
  name: categories.name,
  kind: categories.kind,
  archivedAt: categories.archivedAt,
};

interface FilaDeCategoria {
  id: string;
  name: string;
  kind: string;
  archivedAt: Date | null;
}

function aCategoria(fila: FilaDeCategoria): Categoria {
  return {
    id: fila.id,
    name: fila.name,
    kind: fila.kind as TipoDeCategoria,
    archivedAt: fila.archivedAt?.toISOString() ?? null,
  };
}

// -----------------------------------------------------------------------------

export async function listar(usuarioId: string, incluirArchivadas: boolean): Promise<Categoria[]> {
  const condiciones = [eq(categories.userId, usuarioId)];
  if (!incluirArchivadas) condiciones.push(isNull(categories.archivedAt));

  const filas = await db
    .select(CAMPOS)
    .from(categories)
    .where(and(...condiciones))
    .orderBy(asc(categories.name));

  return filas.map(aCategoria);
}

export async function obtener(
  ejecutor: Ejecutor,
  usuarioId: string,
  categoriaId: string,
): Promise<Categoria | null> {
  const [fila] = await ejecutor
    .select(CAMPOS)
    .from(categories)
    .where(and(eq(categories.userId, usuarioId), eq(categories.id, categoriaId)))
    .limit(1);

  return fila ? aCategoria(fila) : null;
}

export async function crear(
  ejecutor: Ejecutor,
  usuarioId: string,
  datos: { nombre: string; tipo: TipoDeCategoria },
): Promise<Categoria> {
  const [fila] = await ejecutor
    .insert(categories)
    .values({ userId: usuarioId, name: datos.nombre, kind: datos.tipo })
    .returning(CAMPOS);

  if (!fila) throw new Error('No se pudo crear la categoría.');
  return aCategoria(fila);
}

/**
 * Lo único que se corrige de una categoría es el nombre. El tipo no se toca:
 * esa regla la aplica el servicio, que es quien sabe cómo explicarla.
 * Devuelve null si la categoría no existe o no es de esta persona.
 */
export async function renombrar(
  usuarioId: string,
  categoriaId: string,
  nombre: string,
): Promise<Categoria | null> {
  const [fila] = await db
    .update(categories)
    .set({ name: nombre })
    .where(and(eq(categories.userId, usuarioId), eq(categories.id, categoriaId)))
    .returning(CAMPOS);

  return fila ? aCategoria(fila) : null;
}

/**
 * Archivar, no borrar: hay movimientos viejos apuntando a esta categoría y el
 * histórico tiene que seguir leyéndose. Devuelve false si la categoría no
 * existe, no es de esta persona, o ya estaba archivada.
 */
export async function archivar(usuarioId: string, categoriaId: string): Promise<boolean> {
  const filas = await db
    .update(categories)
    .set({ archivedAt: sql`now()` })
    .where(
      and(
        eq(categories.userId, usuarioId),
        eq(categories.id, categoriaId),
        isNull(categories.archivedAt),
      ),
    )
    .returning({ id: categories.id });

  return filas.length > 0;
}

export async function desarchivar(usuarioId: string, categoriaId: string): Promise<boolean> {
  const filas = await db
    .update(categories)
    .set({ archivedAt: null })
    .where(and(eq(categories.userId, usuarioId), eq(categories.id, categoriaId)))
    .returning({ id: categories.id });

  return filas.length > 0;
}

/**
 * Inserta el catálogo inicial de un usuario nuevo.
 *
 * `onConflictDoNothing` la vuelve idempotente: si ya existe una categoría
 * activa con ese nombre y ese tipo —porque el usuario ya la tenía, o porque dos
 * peticiones simultáneas la primera vez entraron juntas— simplemente no se
 * inserta, y no falla nada.
 */
export async function sembrar(
  ejecutor: Ejecutor,
  usuarioId: string,
  categoriasPorDefecto: readonly { nombre: string; tipo: TipoDeCategoria }[],
): Promise<number> {
  if (categoriasPorDefecto.length === 0) return 0;

  const filas = await ejecutor
    .insert(categories)
    .values(
      categoriasPorDefecto.map((categoria) => ({
        userId: usuarioId,
        name: categoria.nombre,
        kind: categoria.tipo,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: categories.id });

  return filas.length;
}

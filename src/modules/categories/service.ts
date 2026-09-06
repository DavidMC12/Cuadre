/**
 * Reglas de negocio del catálogo de categorías. No sabe nada de HTTP.
 *
 * La base ya impide lo imposible (dos categorías activas con el mismo nombre y
 * el mismo tipo, un nombre en blanco). Lo que se hace aquí es distinto: decidir
 * lo que la base no puede decidir, y explicarlo con palabras que una persona
 * entienda antes de que Postgres suelte el nombre de una restricción.
 */
import type { Ejecutor } from '../../db/client.js';
import { db } from '../../db/client.js';
import { conflicto, noEncontrado, reglaViolada } from '../../http/errores.js';
import * as repositorio from './repository.js';
import type { Categoria, CrearCategoria, RenombrarCategoria, TipoDeCategoria } from './schemas.js';

/**
 * El catálogo con el que arranca un usuario nuevo.
 *
 * Existe porque abrir la app por primera vez y encontrar una lista vacía obliga
 * a inventarse quince categorías antes de poder registrar el primer gasto. Son
 * las de siempre, y quien no las quiera las archiva.
 *
 * "Otros" está en las dos listas a propósito: el nombre solo tiene que ser
 * único dentro de su tipo.
 */
const CATALOGO_INICIAL: readonly { nombre: string; tipo: TipoDeCategoria }[] = [
  { nombre: 'Mercado', tipo: 'expense' },
  { nombre: 'Restaurantes', tipo: 'expense' },
  { nombre: 'Transporte', tipo: 'expense' },
  { nombre: 'Vivienda', tipo: 'expense' },
  { nombre: 'Servicios', tipo: 'expense' },
  { nombre: 'Salud', tipo: 'expense' },
  { nombre: 'Educación', tipo: 'expense' },
  { nombre: 'Ocio', tipo: 'expense' },
  { nombre: 'Ropa', tipo: 'expense' },
  { nombre: 'Otros', tipo: 'expense' },
  { nombre: 'Sueldo', tipo: 'income' },
  { nombre: 'Ventas', tipo: 'income' },
  { nombre: 'Regalos', tipo: 'income' },
  { nombre: 'Otros', tipo: 'income' },
];

// -----------------------------------------------------------------------------

export async function listarCategorias(
  usuarioId: string,
  incluirArchivadas: boolean,
): Promise<{ data: Categoria[] }> {
  return { data: await repositorio.listar(usuarioId, incluirArchivadas) };
}

export async function obtenerCategoria(usuarioId: string, categoriaId: string): Promise<Categoria> {
  const categoria = await repositorio.obtener(db, usuarioId, categoriaId);
  if (!categoria) throw noEncontrado('Esa categoría no existe.');
  return categoria;
}

export async function crearCategoria(usuarioId: string, datos: CrearCategoria): Promise<Categoria> {
  return repositorio.crear(db, usuarioId, { nombre: datos.name, tipo: datos.kind });
}

/**
 * Solo se renombra.
 *
 * El tipo no se cambia nunca: una categoría de gasto con movimientos colgando
 * que de pronto se vuelve de ingreso deja la historia incoherente —los mismos
 * movimientos de siempre pasarían a contar al otro lado del reporte—. Para eso
 * está crear una categoría nueva y mover lo que haga falta.
 */
export async function renombrarCategoria(
  usuarioId: string,
  categoriaId: string,
  datos: RenombrarCategoria,
): Promise<Categoria> {
  const actual = await repositorio.obtener(db, usuarioId, categoriaId);
  if (!actual) throw noEncontrado('Esa categoría no existe.');

  if (datos.kind && datos.kind !== actual.kind) {
    throw reglaViolada(
      'El tipo de una categoría no se cambia, porque los movimientos que ya cuelgan de ella pasarían al otro lado del reporte. Crea una categoría nueva con el tipo que necesitas.',
    );
  }

  const renombrada = await repositorio.renombrar(usuarioId, categoriaId, datos.name);
  if (!renombrada) throw noEncontrado('Esa categoría no existe.');
  return renombrada;
}

/**
 * Archivar es esconder, no borrar. La categoría deja de aparecer al clasificar
 * un movimiento, pero los movimientos viejos siguen apuntando a ella y los
 * reportes del pasado se siguen leyendo igual.
 */
export async function archivarCategoria(
  usuarioId: string,
  categoriaId: string,
): Promise<Categoria> {
  const seArchivo = await repositorio.archivar(usuarioId, categoriaId);

  if (!seArchivo) {
    const categoria = await repositorio.obtener(db, usuarioId, categoriaId);
    if (!categoria) throw noEncontrado('Esa categoría no existe.');
    throw conflicto('Esa categoría ya está archivada.');
  }

  return obtenerCategoria(usuarioId, categoriaId);
}

export async function desarchivarCategoria(
  usuarioId: string,
  categoriaId: string,
): Promise<Categoria> {
  const existe = await repositorio.desarchivar(usuarioId, categoriaId);
  if (!existe) throw noEncontrado('Esa categoría no existe.');
  return obtenerCategoria(usuarioId, categoriaId);
}

/**
 * Siembra el catálogo inicial de un usuario recién creado.
 *
 * Recibe el ejecutor para poder entrar en la misma transacción que creó al
 * usuario: o nace con sus categorías, o no nace. Es idempotente, así que
 * llamarla de más no rompe nada ni duplica nada.
 *
 * Hoy la llama `src/http/usuario-actual.ts`; en la Fase 1c la llamará la
 * autenticación de verdad, en el mismo punto donde se dé de alta al usuario.
 */
export async function sembrarCategoriasPorDefecto(
  ejecutor: Ejecutor,
  usuarioId: string,
): Promise<number> {
  return repositorio.sembrar(ejecutor, usuarioId, CATALOGO_INICIAL);
}

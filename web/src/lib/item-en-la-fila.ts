import type { ItemPresupuesto, Movimiento } from "@/lib/api/types";
import { SIN_ASIGNAR } from "@/lib/labels";
import { movimientosSinAsignar } from "@/lib/sin-asignar";

/**
 * A qué cuenta un movimiento del libro, resuelto para la LÍNEA de la fila
 * (no para el detalle): la categoría es su grupo y el ítem del presupuesto es
 * la línea. La categoría y el ítem se unen con el mismo formato que ya usa el
 * desplegable "¿En qué fue?" del formulario ("Deudas - Deuda TC Nu"), para que
 * la fila y el desplegable no digan dos cosas distintas.
 *
 * Este módulo es puro y vive aparte para que las tres filas (movimiento,
 * compra dividida y transferencia) compartan UNA sola regla en vez de copiarla
 * tres veces. Los nombres salen del catálogo de `usePresupuestoItems(true)`,
 * resuelto una vez a nivel de la lista (`resolverCatalogoDeItems`).
 */

/**
 * Un ítem de categoría con la fecha en que se archivó (null = sigue activo).
 * Se guarda por (categoría, moneda) para responder si una categoría "tenía
 * ítems" en el mes de un movimiento — la misma pregunta que resuelve
 * `objetivosDelMes` en el servidor para el cajón "Sin asignar" del panel.
 */
interface ItemsDeUnaCategoria {
  readonly archivados: readonly (string | null)[];
}

/**
 * El catálogo de ítems ya resuelto: el nombre de cada uno y, por categoría y
 * moneda, cuándo se archivaron sus ítems. Se arma UNA vez con
 * `resolverCatalogoDeItems` y se pasa a las filas; ninguna fila consulta ni
 * resuelve nada por su cuenta.
 */
export interface CatalogoDeItems {
  readonly nombrePorItem: ReadonlyMap<string, string>;
  readonly itemsPorCategoria: ReadonlyMap<string, ItemsDeUnaCategoria>;
}

/** Clave interna de (categoría, moneda). */
function claveDeLaCategoria(categoryId: string, currency: string): string {
  return `${categoryId}\u0000${currency}`;
}

/**
 * Resuelve el catálogo a partir de los ítems que devuelve
 * `usePresupuestoItems(true)`. `undefined` significa "todavía cargando o la
 * consulta falló": devuelve `null` y la fila queda exactamente como hoy (solo
 * la categoría). Nunca se marca "Sin asignar" sin haber recibido el catálogo.
 *
 * El nombre de un ítem es el mismo que usa `detalle-movimiento.tsx`:
 * `label ?? categoryName ?? accountName`.
 */
export function resolverCatalogoDeItems(
  items: readonly ItemPresupuesto[] | undefined
): CatalogoDeItems | null {
  if (!items) return null;

  const nombrePorItem = new Map<string, string>();
  const itemsPorCategoria = new Map<string, ItemsDeUnaCategoria>();

  for (const item of items) {
    const nombre = item.label ?? item.categoryName ?? item.accountName;
    if (nombre) nombrePorItem.set(item.id, nombre);

    // Solo un ítem de categoría recibe movimientos (una meta de ahorro no
    // tiene categoría). Su fecha de archivo dice si existía en un mes dado.
    if (item.kind === "category" && item.categoryId !== null) {
      const clave = claveDeLaCategoria(item.categoryId, item.currency);
      const previos = itemsPorCategoria.get(clave);
      if (previos) {
        (previos.archivados as (string | null)[]).push(item.archivedAt);
      } else {
        itemsPorCategoria.set(clave, { archivados: [item.archivedAt] });
      }
    }
  }

  return { nombrePorItem, itemsPorCategoria };
}

/** "YYYY-MM" de un instante, cortado en hora de Bogotá (igual que los rangos
 *  del mes del tablero): un movimiento de fin de mes no cae en el mes siguiente. */
const FORMATO_ANIO_MES = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
});

function mesEnBogota(iso: string): string {
  const partes = FORMATO_ANIO_MES.formatToParts(new Date(iso));
  const anio = partes.find((parte) => parte.type === "year")?.value ?? "";
  const mes = partes.find((parte) => parte.type === "month")?.value ?? "";
  return `${anio}-${mes}`;
}

/**
 * ¿La categoría tenía ítems a los que este movimiento pudo asignarse? La misma
 * condición de `objetivosDelMes` en el servidor: un ítem cuenta si sigue activo
 * o si se archivó ese mes o después. Así un movimiento de un mes pasado no
 * pierde su "Sin asignar" solo porque hoy archivaron el ítem.
 */
function laCategoriaTieneItems(
  catalogo: CatalogoDeItems,
  categoryId: string,
  currency: string,
  occurredAt: string
): boolean {
  const items = catalogo.itemsPorCategoria.get(claveDeLaCategoria(categoryId, currency));
  if (!items) return false;
  const mes = mesEnBogota(occurredAt);
  return items.archivados.some(
    (archivadoEn) => archivadoEn === null || mesEnBogota(archivadoEn) >= mes
  );
}

/** Compara nombres ignorando mayúsculas y espacios, como pide la fila. */
function normalizar(texto: string): string {
  return texto.toLocaleLowerCase("es").replace(/\s+/g, "");
}

/** Lo que la fila ya muestra hoy: solo la categoría (o nada si no la tiene). */
function comoHoy(categoria: string | undefined): string[] {
  return categoria ? [categoria] : [];
}

/**
 * Los segmentos que la fila antepone a su cuenta y su hora en la línea de
 * detalle:
 *
 * - Con ítem asignado: `["Deudas - Deuda TC Nu"]` (una sola vez si el nombre
 *   del ítem es el de la categoría). Sin categoría, solo el nombre del ítem.
 * - Sin ítem pero su categoría tenía ítems a los que pudo asignarse ese mes:
 *   `["Deudas", "Sin asignar"]` — la misma pregunta que resuelve el cajón
 *   "Sin asignar" del panel, con la regla de `movimientosSinAsignar`.
 * - Nada que agregar: `["Deudas"]`, o `[]` sin categoría (como hoy).
 *
 * Con `catalogo` en `null` (cargando o falló) o un ítem que el catálogo no
 * conoce, devuelve lo de hoy: nunca se inventa un nombre ni se marca
 * "Sin asignar" a ciegas.
 */
export function segmentosDeItemEnLaFila({
  movimiento,
  categoria,
  catalogo,
}: {
  movimiento: Movimiento;
  /** El nombre de la categoría del movimiento; `undefined` si no tiene. */
  categoria: string | undefined;
  catalogo: CatalogoDeItems | null;
}): string[] {
  if (!catalogo) return comoHoy(categoria);

  if (movimiento.budgetItemId) {
    const nombre = catalogo.nombrePorItem.get(movimiento.budgetItemId);
    if (!nombre) return comoHoy(categoria);
    if (!categoria) return [nombre];
    // Si el ítem se llama como su categoría (sin importar mayúsculas ni
    // espacios), se muestra una sola vez, con el nombre de la categoría.
    if (normalizar(nombre) === normalizar(categoria)) return [categoria];
    return [`${categoria} - ${nombre}`];
  }

  const categoryId = movimiento.categoryId;
  if (
    categoryId !== null &&
    categoria !== undefined &&
    laCategoriaTieneItems(catalogo, categoryId, movimiento.currency, movimiento.occurredAt) &&
    // La MISMA regla del cajón "Sin asignar": gasto/ingreso normal, sin ítem,
    // y que nadie anuló (ni es la anulación de otro).
    movimientosSinAsignar([movimiento], {
      categoryId,
      moneda: movimiento.currency,
    }).length > 0
  ) {
    return [categoria, SIN_ASIGNAR];
  }

  return comoHoy(categoria);
}

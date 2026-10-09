import type { ItemDelChecklist, TipoCategoria } from "@/lib/api/types";
import { textoDeOpcion } from "@/lib/item-presupuesto";

/**
 * Un solo desplegable responde "¿en qué fue?" (o "¿de dónde viene?" en un
 * ingreso): de él salen la categoría Y el item del presupuesto de una vez,
 * agrupados por categoría como en las apps grandes de finanzas. Este módulo
 * construye la lista de opciones y descifra la elección: el Select no acepta
 * value vacío y sus opciones necesitan valores propios, así que aquí viven los
 * prefijos y su lectura, como funciones puras con pruebas.
 */

/** El valor del desplegable que marca "ninguna categoría y ningún item". */
export const SIN_CATEGORIA_EN_QUE_FUE = "__sin_categoria__";

/** Un item concreto del checklist: value = "item:<id>". */
export const PREFIJO_ITEM = "item:";
/** Solo una categoría con items ese mes: value = "otro:<id>". */
export const PREFIJO_OTRO = "otro:";
/** Solo una categoría sin items ese mes (aparece en "Otras categorías"):
 * value = "cat:<id>". */
export const PREFIJO_CATEGORIA = "cat:";

export interface OpcionEnQueFue {
  /** El value del SelectItem (con su prefijo). */
  value: string;
  /** El texto del renglón del menú. */
  texto: string;
}

export interface GrupoEnQueFue {
  /** El encabezado del grupo; null en el renglón "Sin categoría", que no
   * merece un grupo entero para estar solo. */
  etiqueta: string | null;
  opciones: OpcionEnQueFue[];
}

export interface CategoriaDesplegable {
  id: string;
  name: string;
  kind: TipoCategoria;
  archivedAt: string | null;
}

/** Se termina de leer una elección: qué value del Select significa. */
export interface EleccionLeida {
  tipo: "item" | "otro" | "categoria";
  id: string;
}

/** Traduce un value del desplegable a su elección; null es "Sin categoría". */
export function leerEleccion(valor: string): EleccionLeida | null {
  if (valor.startsWith(PREFIJO_ITEM)) {
    return { tipo: "item", id: valor.slice(PREFIJO_ITEM.length) };
  }
  if (valor.startsWith(PREFIJO_OTRO)) {
    return { tipo: "otro", id: valor.slice(PREFIJO_OTRO.length) };
  }
  if (valor.startsWith(PREFIJO_CATEGORIA)) {
    return { tipo: "categoria", id: valor.slice(PREFIJO_CATEGORIA.length) };
  }
  return null;
}

/**
 * Los grupos del desplegable de un movimiento (gasto o ingreso):
 *
 * 1. "Sin categoría" (el valor por defecto).
 * 2. Un grupo por cada categoría del tipo pedido que tenga items este mes,
 *    con un renglón por item — nombre y lo que falta, o el logro — y un
 *    "Otro de <categoría>" al final, que elige solo la categoría.
 * 3. Un grupo "Otras categorías" con las del tipo que no tienen items ese
 *    mes (o todas, si aún no hay presupuesto): elegir una fija solo la
 *    categoría.
 *
 * Las categorías archivadas y los items de ahorro (kind "savings") nunca
 * aparecen. El orden: grupos por nombre de categoría, items en el orden del
 * checklist.
 */
export function opcionesDeEnQueFue({
  categorias,
  items,
  tipo,
}: {
  categorias: readonly CategoriaDesplegable[];
  items: readonly ItemDelChecklist[];
  tipo: TipoCategoria;
}): GrupoEnQueFue[] {
  const activas = categorias
    .filter((categoria) => !categoria.archivedAt && categoria.kind === tipo)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const itemsValidos = items.filter(
    (renglon): renglon is ItemDelChecklist & { categoryId: string } =>
      renglon.categoryId !== null &&
      renglon.categoryKind === tipo &&
      renglon.kind !== "savings" &&
      activas.some((categoria) => categoria.id === renglon.categoryId)
  );

  // El orden de las categorías con items lo manda el nombre, no el orden del
  // checklist; los items de cada grupo sí salen en el orden del checklist.
  const porCategoria = new Map<string, ItemDelChecklist[]>();
  for (const renglon of itemsValidos) {
    const itemsDeLaCategoria = porCategoria.get(renglon.categoryId) ?? [];
    itemsDeLaCategoria.push(renglon);
    porCategoria.set(renglon.categoryId, itemsDeLaCategoria);
  }

  const grupos: GrupoEnQueFue[] = [
    { etiqueta: null, opciones: [{ value: SIN_CATEGORIA_EN_QUE_FUE, texto: "Sin categoría" }] },
  ];

  const categoriasConItems = activas.filter((categoria) => porCategoria.has(categoria.id));
  for (const categoria of categoriasConItems) {
    grupos.push({
      etiqueta: categoria.name,
      opciones: [
        ...(porCategoria.get(categoria.id) ?? []).map((renglon) => ({
          value: `${PREFIJO_ITEM}${renglon.id}`,
          texto: textoDeOpcion(renglon),
        })),
        {
          value: `${PREFIJO_OTRO}${categoria.id}`,
          texto: `Otro de ${categoria.name}`,
        },
      ],
    });
  }

  const sinItems = activas.filter((categoria) => !porCategoria.has(categoria.id));
  if (sinItems.length > 0) {
    grupos.push({
      etiqueta: "Otras categorías",
      opciones: sinItems.map((categoria) => ({
        value: `${PREFIJO_CATEGORIA}${categoria.id}`,
        texto: categoria.name,
      })),
    });
  }

  return grupos;
}

/**
 * Lo que muestra el campo del desplegable CERRADO (el popup vive en un portal
 * que no está montado, así que el texto no se resuelve solo):
 *
 * - Item elegido: "<Categoría> - <nombre del item>", sin el "faltan".
 * - Solo la categoría de un grupo con items: "<Categoría> (sin item)" — es el
 *   "Otro de ..." cerrado.
 * - Categoría sin items: su nombre.
 * - Nada: "Sin categoría".
 *
 * Los `items` tienen que venir ya filtrados por el tipo del movimiento (los
 * mismos que el desplegable ofrece, sin ahorro): esta función no conoce el
 * tipo y no cruza `categoryKind` al decidir si la categoría "tiene items".
 */
export function textoCerradoDeEnQueFue({
  categoriaId,
  itemId,
  items,
  categorias,
}: {
  categoriaId: string | null | undefined;
  itemId: string | null | undefined;
  items: readonly ItemDelChecklist[];
  categorias: readonly { id: string; name: string }[];
}): string {
  const conItem = itemId ? items.find((renglon) => renglon.id === itemId) : undefined;
  if (conItem) {
    const categoria =
      conItem.categoryName ?? categorias.find((c) => c.id === conItem.categoryId)?.name;
    return categoria ? `${categoria} - ${conItem.label}` : conItem.label;
  }

  if (categoriaId) {
    const nombre = categorias.find((c) => c.id === categoriaId)?.name;
    if (!nombre) return "Sin categoría";
    const conItems = items.some(
      (renglon) => renglon.categoryId === categoriaId && renglon.kind !== "savings"
    );
    return conItems ? `${nombre} (sin item)` : nombre;
  }

  return "Sin categoría";
}

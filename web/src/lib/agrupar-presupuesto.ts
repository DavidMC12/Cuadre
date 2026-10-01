import type { ItemDelChecklist, ItemPresupuesto } from "./api/types";
import { SIN_CATEGORIA } from "./labels";

/** La clave del grupo de las metas de ahorro: no son una categoría. */
export const CLAVE_AHORRO = "ahorro";

/** La clave del grupo de respaldo para un ítem cuya categoría no llegó. */
export const CLAVE_SIN_CATEGORIA = "sin-categoria";

/** Un grupo de renglones del checklist, ya listo para pintar. */
export interface GrupoPresupuesto {
  /** El id de la categoría, o una de las claves propias (`CLAVE_AHORRO`, `CLAVE_SIN_CATEGORIA`). */
  clave: string;
  /** Lo que se muestra en el encabezado del grupo; nunca queda vacío. */
  titulo: string;
  /** La categoría de la que hereda el color; `null` cuando no hay ninguna (Ahorro). */
  categoryId: string | null;
  items: ItemDelChecklist[];
}

/**
 * Agrupa los renglones del checklist por su categoría.
 *
 * Reglas:
 * - Un ítem de ahorro (`kind === "savings"`) no tiene categoría: ahorrar no es
 *   una categoría de gasto. Van juntos en un grupo propio, "Ahorro".
 * - Los grupos de categoría se ordenan del que más ítems tiene al que menos;
 *   a igual cantidad, alfabéticamente por nombre (desempate estable).
 * - "Ahorro" va siempre al final, donde tenga más sentido: es el otro *tipo*
 *   de meta del panel —apartar plata, no topar un gasto— y el resto de la app
 *   ya lo trata como una sección aparte.
 *
 * El color no se decide aquí: el componente lo resuelve con el mismo mapa de
 * colores de las gráficas, a partir de `categoryId`.
 */
export function agruparPresupuesto(
  items: readonly ItemDelChecklist[],
  itemPorId: ReadonlyMap<string, ItemPresupuesto>
): GrupoPresupuesto[] {
  const porClave = new Map<string, GrupoPresupuesto>();

  for (const renglon of items) {
    const item = itemPorId.get(renglon.id);
    const esAhorro = renglon.kind === "savings";
    const categoryId = esAhorro ? null : (item?.categoryId ?? null);

    const clave = esAhorro ? CLAVE_AHORRO : (categoryId ?? CLAVE_SIN_CATEGORIA);
    const titulo = esAhorro
      ? "Ahorro"
      : (categoryId ? item?.categoryName : null) || SIN_CATEGORIA;

    let grupo = porClave.get(clave);
    if (!grupo) {
      grupo = { clave, titulo, categoryId, items: [] };
      porClave.set(clave, grupo);
    }
    grupo.items.push(renglon);
  }

  const ahorro = porClave.get(CLAVE_AHORRO);
  const deCategoria = [...porClave.values()].filter((grupo) => grupo.clave !== CLAVE_AHORRO);
  deCategoria.sort(
    (a, b) =>
      b.items.length - a.items.length || a.titulo.localeCompare(b.titulo, "es")
  );

  // Ahorro cierra la lista, sin importar cuántos ítems tenga.
  if (ahorro) deCategoria.push(ahorro);

  return deCategoria;
}

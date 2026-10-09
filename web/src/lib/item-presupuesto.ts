import type { ItemDelChecklist } from "@/lib/api/types";
import { aUnidadesMinimas, esCero, restar, textoMonto } from "@/lib/money";

/**
 * El valor del selector que marca "no cuenta para ningún ítem". Igual que su
 * hermano "sin categoría": el Select no acepta cadenas vacías como valor, así
 * que el "ninguno" necesita un valor centinela.
 */
export const SIN_ITEM = "__sin_item__";

/**
 * La opción del selector de ítem, con lo que falta por pagar o recibir:
 * "Deuda TC Nu — faltan $102.500" (aritmética exacta, nada en número), o "—
 * pagado" (o "— recibido" en un ingreso) cuando el objetivo ya se cumplió o
 * se pasó. Con objetivo nulo o en cero este mes no presentemos lo que no
 * aplica: solo el nombre.
 */
export function textoDeOpcion(renglon: ItemDelChecklist): string {
  if (renglon.target === null || esCero(renglon.target)) return renglon.label;
  const alcanzado = aUnidadesMinimas(renglon.progress);
  const objetivo = aUnidadesMinimas(renglon.target);
  if (alcanzado >= objetivo) {
    return renglon.categoryKind === "income"
      ? `${renglon.label} — recibido`
      : `${renglon.label} — pagado`;
  }
  return `${renglon.label} — faltan ${textoMonto(
    restar(renglon.target, renglon.progress),
    renglon.currency
  )}`;
}

/** Los ítems de pago de una categoría, listos para pintarse como grupo. */
export interface GrupoDePago {
  categoryId: string;
  categoryName: string;
  items: ItemDelChecklist[];
}

/**
 * Agrupa los ítems de gasto por categoría (alfabético), para que a la hora de
 * elegir una deuda frente a otra se lean juntas. Con un solo grupo no hay
 * rótulo: el grupo entero se muestra plano. Los ítems sin categoría (o de
 * otro tipo) no entran: nunca son opciones de pago.
 */
export function agruparItemsDePago(
  items: readonly ItemDelChecklist[]
): GrupoDePago[] {
  const porCategoria = new Map<string, GrupoDePago>();
  for (const renglon of items) {
    if (renglon.categoryId === null || renglon.categoryKind !== "expense") continue;
    let grupo = porCategoria.get(renglon.categoryId);
    if (!grupo) {
      grupo = {
        categoryId: renglon.categoryId,
        categoryName: renglon.categoryName ?? "Categoría",
        items: [],
      };
      porCategoria.set(renglon.categoryId, grupo);
    }
    grupo.items.push(renglon);
  }
  return [...porCategoria.values()].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName, "es")
  );
}

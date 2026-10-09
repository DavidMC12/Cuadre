import type { ItemDelChecklist, Movimiento } from "@/lib/api/types";

/**
 * De todos los movimientos de una categoría, los que de verdad están "sin
 * asignar": gastos o ingresos normales, que no cuentan para ningún ítem y que
 * nadie anuló (ni son ellos la anulación de otro). La transferencia, el saldo
 * inicial y el ajuste no se asignan a un ítem, y un movimiento de otra moneda
 * no pertenece a este panel.
 *
 * El filtro se hace aquí y no en la consulta porque la API no expone
 * "budgetItemId nulo": se pide la categoría y el mes, y el cliente separa lo
 * que quedó sin repartir. Más recientes primero, como el libro.
 */
export function movimientosSinAsignar(
  movimientos: readonly Movimiento[],
  { categoryId, moneda }: { categoryId: string; moneda: string }
): Movimiento[] {
  return movimientos
    .filter(
      (movimiento) =>
        movimiento.categoryId === categoryId &&
        movimiento.currency === moneda &&
        movimiento.kind === "standard" &&
        movimiento.budgetItemId === null &&
        movimiento.reversesTransactionId === null &&
        movimiento.reversedByTransactionId === null
    )
    .sort((a, b) =>
      a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0
    );
}

/**
 * Los ítems a los que puede contar un movimiento de una categoría: los de su
 * categoría y tipo 'category' (una meta de ahorro no tiene categoría y no
 * recibe movimientos). En el mismo orden en que vienen del checklist.
 */
export function itemsDeLaCategoria(
  renglones: readonly ItemDelChecklist[],
  categoryId: string
): ItemDelChecklist[] {
  return renglones.filter(
    (renglon) => renglon.kind === "category" && renglon.categoryId === categoryId
  );
}

/**
 * "10 sept" — el día y el mes de un movimiento, cortos, en hora de Bogotá
 * (igual que los rangos del mes), para que la lista del cajón no se vaya de
 * ancho a 320px. Se arma por partes para no arrastrar el "de" ("10 de sept").
 */
export function fechaCorta(iso: string): string {
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  const dia = partes.find((parte) => parte.type === "day")?.value ?? "";
  const mes = partes.find((parte) => parte.type === "month")?.value ?? "";
  return `${dia} ${mes}`.trim();
}

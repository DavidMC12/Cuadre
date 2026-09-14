import type { Movimiento } from "./api/types";
import { etiquetaFecha } from "./fecha";

export interface GrupoDeMovimientos {
  etiqueta: string;
  items: Movimiento[];
}

/**
 * Agrupa movimientos por su etiqueta de fecha ("Hoy", "Ayer", "3 de marzo"),
 * dejando el saldo inicial siempre al final.
 *
 * El saldo inicial se fecha el día en que se creó la cuenta, no el día al que
 * en verdad corresponde: si se registran movimientos de antes de esa fecha
 * (por ejemplo, para completar el historial del mes), quedaría fechado
 * después de ellos y aparecería en medio de la lista. Se ordena siempre al
 * final, como el primer renglón del libro que es — es una decisión visual,
 * el dato real (`occurredAt`) no se toca.
 *
 * Se agrupa con un mapa, no comparando solo contra el último grupo armado:
 * mover el saldo inicial al final puede alejarlo del grupo de su propio día,
 * y si ese día ya apareció antes en la lista, tiene que sumarse ahí en vez de
 * abrir un grupo nuevo con la misma fecha por segunda vez (dos grupos con la
 * misma etiqueta serían además dos `key` de React iguales).
 */
export function agruparMovimientosPorDia(movimientos: readonly Movimiento[]): GrupoDeMovimientos[] {
  const ordenados = [...movimientos].sort((a, b) => {
    if (a.kind === "opening" && b.kind !== "opening") return 1;
    if (b.kind === "opening" && a.kind !== "opening") return -1;
    return 0;
  });

  const porEtiqueta = new Map<string, Movimiento[]>();
  for (const movimiento of ordenados) {
    const etiqueta = etiquetaFecha(movimiento.occurredAt);
    const grupo = porEtiqueta.get(etiqueta);
    if (grupo) {
      grupo.push(movimiento);
    } else {
      porEtiqueta.set(etiqueta, [movimiento]);
    }
  }
  return Array.from(porEtiqueta, ([etiqueta, items]) => ({ etiqueta, items }));
}

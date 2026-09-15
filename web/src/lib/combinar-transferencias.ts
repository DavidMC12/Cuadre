import type { Movimiento } from "./api/types";

/** Las dos patas de una transferencia, ya unidas en una sola fila. */
export interface ParDeTransferencia {
  tipo: "transferencia";
  transferGroupId: string;
  /** La pata negativa: la cuenta de la que salió la plata. */
  salida: Movimiento;
  /** La pata positiva: la cuenta a la que entró. */
  entrada: Movimiento;
}

export type ItemDeLista = Movimiento | ParDeTransferencia;

export function esTransferencia(item: ItemDeLista): item is ParDeTransferencia {
  return "tipo" in item && item.tipo === "transferencia";
}

/**
 * Une las dos patas de una transferencia (lo que sale de una cuenta propia y
 * lo que entra a otra) en una sola fila neutra. Sin esto, mover plata entre
 * dos cuentas propias se vería como dos renglones separados — uno con signo
 * "−" y otro con "+" —, que es justo la lectura que una transferencia no
 * merece: no es un gasto ni un ingreso.
 *
 * Si de una transferencia solo llega una pata —la lista está filtrada a una
 * sola cuenta, o la paginación cortó justo entre las dos—, esa pata se deja
 * como un movimiento normal en vez de desaparecer: mejor mostrar de más que
 * esconder un movimiento real.
 */
export function combinarTransferencias(movimientos: readonly Movimiento[]): ItemDeLista[] {
  const patasPorGrupo = new Map<string, Movimiento[]>();
  for (const movimiento of movimientos) {
    if (movimiento.kind !== "transfer" || !movimiento.transferGroupId) continue;
    const patas = patasPorGrupo.get(movimiento.transferGroupId);
    if (patas) {
      patas.push(movimiento);
    } else {
      patasPorGrupo.set(movimiento.transferGroupId, [movimiento]);
    }
  }

  const yaEmitido = new Set<string>();
  const resultado: ItemDeLista[] = [];

  for (const movimiento of movimientos) {
    if (movimiento.kind !== "transfer" || !movimiento.transferGroupId) {
      resultado.push(movimiento);
      continue;
    }

    if (yaEmitido.has(movimiento.transferGroupId)) continue;

    const patas = patasPorGrupo.get(movimiento.transferGroupId)!;
    if (patas.length !== 2) {
      // No llegaron las dos patas juntas: se deja tal cual llegó, como un
      // movimiento normal, en vez de mostrar una fila a medias.
      resultado.push(movimiento);
      continue;
    }

    yaEmitido.add(movimiento.transferGroupId);
    const [primera, segunda] = patas as [Movimiento, Movimiento];
    const esNegativa = primera.amount.trim().startsWith("-");
    const salida = esNegativa ? primera : segunda;
    const entrada = esNegativa ? segunda : primera;

    resultado.push({
      tipo: "transferencia",
      transferGroupId: movimiento.transferGroupId,
      salida,
      entrada,
    });
  }

  return resultado;
}

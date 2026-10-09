import type { Movimiento } from "./api/types";
import type { ItemDeLista } from "./combinar-transferencias";
import { negar, sumarMontos } from "./money";

/**
 * Una compra pagada con dos cuentas: las dos partes (un gasto por cuenta) que
 * comparten `paymentGroupId`, unidas en una sola fila.
 */
export interface CompraDividida {
  tipo: "compra-dividida";
  paymentGroupId: string;
  /** Las dos partes, la marca "1 de 2" primero. */
  partes: [Movimiento, Movimiento];
}

export type ItemDeListaConCompras = ItemDeLista | CompraDividida;

export function esCompraDividida(item: ItemDeListaConCompras): item is CompraDividida {
  return "tipo" in item && item.tipo === "compra-dividida";
}

/** Texto de la compra cuando quien la registró no le puso descripción. */
export const COMPRA_SIN_DESCRIPCION = "Compra pagada con dos cuentas";

/** La marca que el servidor le agrega a la descripción de cada parte. */
const MARCA_DE_PARTE = /\s*\(\d de 2\)$/;
const PARTE_SIN_DESCRIPCION = /^(Anulación de: )?Pago \d de 2$/;

/**
 * Lo que dice la fila de una compra: la descripción original, sin la marca
 * "(1 de 2)" que el servidor agrega a cada parte. Si quien registró no escribió
 * nada, queda "Compra pagada con dos cuentas" (y la anulación, "Anulación de:
 * …").
 */
export function descripcionDeLaCompra(partes: readonly Movimiento[]): string {
  const texto = partes[0]?.description?.trim() ?? "";
  const anulacion = texto.startsWith("Anulación de: ");

  if (!texto || PARTE_SIN_DESCRIPCION.test(texto)) {
    return anulacion ? `Anulación de: ${COMPRA_SIN_DESCRIPCION}` : COMPRA_SIN_DESCRIPCION;
  }

  return texto.replace(MARCA_DE_PARTE, "").trim() || COMPRA_SIN_DESCRIPCION;
}

/**
 * La descripción BASE de una compra, sin la marca "(1 de 2)" que el servidor
 * agrega a cada parte y sin el relleno "Pago 1 de 2" (que el servidor pone
 * cuando no hubo descripción). Es lo que precarga el formulario al corregir:
 * lo que la persona escribió, tal cual, para que el servidor le vuelva a
 * agregar la marca al guardar. A diferencia de `descripcionDeLaCompra`, aquí
 * "sin descripción" es texto vacío, no "Compra pagada con dos cuentas".
 */
export function descripcionBaseDeLaCompra(partes: readonly Movimiento[]): string {
  const texto = partes[0]?.description?.trim() ?? "";
  if (!texto || PARTE_SIN_DESCRIPCION.test(texto)) return "";
  return texto.replace(MARCA_DE_PARTE, "").trim();
}

/**
 * Reconstruye una compra pagada con dos cuentas a partir de las anulaciones
 * que devuelve el servidor al anularla: cada anulación es su original con el
 * monto negado y el prefijo "Anulación de: ". Sirve para precargar la
 * corrección aunque la lista filtrada haya traído UNA sola parte.
 *
 * Devuelve `null` si no llegan exactamente dos anulaciones: sin las dos partes
 * no hay compra dividida que corregir.
 */
export function compraDesdeSusAnulaciones(
  paymentGroupId: string,
  anulaciones: readonly Movimiento[]
): CompraDividida | null {
  const partes = anulaciones
    .filter((anulacion) => anulacion.reversesTransactionId !== null)
    .map((anulacion) => ({
      ...anulacion,
      id: anulacion.reversesTransactionId!,
      amount: negar(anulacion.amount),
      description: anulacion.description?.replace(/^Anulación de: /, "") ?? null,
      paymentGroupId,
      reversesTransactionId: null,
      reversedByTransactionId: anulacion.id,
    }));

  if (partes.length !== 2) return null;

  const [a, b] = partes as [Movimiento, Movimiento];
  const ordenadas: [Movimiento, Movimiento] =
    (a.description ?? "") <= (b.description ?? "") ? [a, b] : [b, a];

  return { tipo: "compra-dividida", paymentGroupId, partes: ordenadas };
}

/** El total de la compra: la suma exacta de sus dos partes (con el signo de cada una). */
export function totalDeLaCompra(partes: readonly Movimiento[]): string {
  return sumarMontos(partes.map((parte) => parte.amount));
}

/** Una compra está anulada cuando cualquiera de sus partes ya tiene anulación (siempre van juntas). */
export function compraAnulada(compra: CompraDividida): boolean {
  return compra.partes.some((parte) => parte.reversedByTransactionId !== null);
}

/** La fila de la anulación de una compra: sus partes anulan a las originales. */
export function esAnulacionDeCompra(compra: CompraDividida): boolean {
  return compra.partes.some((parte) => parte.reversesTransactionId !== null);
}

/**
 * Une las dos partes de una compra pagada con dos cuentas en una sola fila, en
 * el lugar de la primera que aparezca. Sin esto, una compra se vería como dos
 * gastos sueltos y parecería que se gastó dos veces.
 *
 * Si de una compra solo llega UNA parte —la lista está filtrada a una cuenta,
 * o la paginación cortó entre las dos—, esa parte se deja como un movimiento
 * normal: mejor mostrar de más que esconder un movimiento real.
 */
export function combinarPagosDivididos(items: readonly ItemDeLista[]): ItemDeListaConCompras[] {
  const partesPorGrupo = new Map<string, Movimiento[]>();
  for (const item of items) {
    if ("tipo" in item || item.kind !== "standard" || !item.paymentGroupId) continue;
    const partes = partesPorGrupo.get(item.paymentGroupId);
    if (partes) {
      partes.push(item);
    } else {
      partesPorGrupo.set(item.paymentGroupId, [item]);
    }
  }

  const yaEmitido = new Set<string>();
  const resultado: ItemDeListaConCompras[] = [];

  for (const item of items) {
    if ("tipo" in item || item.kind !== "standard" || !item.paymentGroupId) {
      resultado.push(item);
      continue;
    }

    const grupo = item.paymentGroupId;
    if (yaEmitido.has(grupo)) continue;

    const partes = partesPorGrupo.get(grupo)!;
    if (partes.length !== 2) {
      resultado.push(item);
      continue;
    }

    yaEmitido.add(grupo);
    const [a, b] = partes as [Movimiento, Movimiento];
    // La marca "1 de 2" va primero: así la fila siempre lista las cuentas en el
    // orden en que quien registró las eligió.
    const ordenadas: [Movimiento, Movimiento] =
      (a.description ?? "") <= (b.description ?? "") ? [a, b] : [b, a];

    resultado.push({ tipo: "compra-dividida", paymentGroupId: grupo, partes: ordenadas });
  }

  return resultado;
}

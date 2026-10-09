import type { Cuenta } from "./api/types";
import {
  aUnidadesMinimas,
  decimalesDe,
  esCero,
  normalizarMontoIngresado,
  restar,
  sumarMontos,
  textoEditable,
  textoMonto,
} from "./money";

/**
 * La cuenta de dinero de "Pagar con dos cuentas": cómo se reparte el total de
 * una compra entre dos cuentas. Todo con enteros exactos (`bigint` vía
 * `lib/money.ts`): jamás un `number` en una cifra de dinero.
 */

const ESCALA = 10000n;

/** "200000.0000" desde las unidades mínimas (diezmilésimas) de `aUnidadesMinimas`. */
function textoDeUnidades(unidades: bigint): string {
  const entero = unidades / ESCALA;
  const decimales = (unidades % ESCALA).toString().padStart(4, "0");
  return `${entero}.${decimales}`;
}

/**
 * El reparto inicial: la MITAD cada una. Si el total no se parte justo en la
 * unidad de la moneda (un peso en COP, un centavo en USD), la primera cuenta se
 * lleva el sobrante, así las dos partes siempre suman EXACTAMENTE el total.
 */
export function repartirALaMitad(total: string, moneda: string): [string, string] {
  const unidad = 10n ** BigInt(4 - decimalesDe(moneda));
  const totalUnidades = aUnidadesMinimas(total);
  const segunda = (totalUnidades / unidad / 2n) * unidad;
  const primera = totalUnidades - segunda;
  return [textoDeUnidades(primera), textoDeUnidades(segunda)];
}

/** El texto de un campo de monto para el reparto inicial: lo que un CampoMonto sabe leer. */
export function repartoInicial(total: string, moneda: string): [string, string] {
  const [primera, segunda] = repartirALaMitad(total, moneda);
  return [textoEditable(primera, moneda), textoEditable(segunda, moneda)];
}

/**
 * Cuando la persona edita una de las dos partes, la otra se completa para que
 * sumen el total. Devuelve el texto de la OTRA parte, o `null` si no se puede
 * calcular (lo escrito no es un monto, es cero o ya se pasa del total): ahí se
 * deja como está y la línea de estado explica qué pasa.
 */
export function completarLaOtraParte(
  total: string,
  textoEditado: string,
  moneda: string
): string | null {
  const lectura = normalizarMontoIngresado(textoEditado, moneda);
  if ("error" in lectura) return null;

  const resto = restar(total, lectura.monto);
  if (resto.startsWith("-") || esCero(resto)) return null;

  return textoEditable(resto, moneda);
}

export interface RepartoDelPago {
  /** Los montos ya leídos y válidos para mandar al servidor; `null` si aún no. */
  montos: [string, string] | null;
  /**
   * Lo que falta (positivo) o sobra (negativo) respecto al total, en texto
   * exacto; `null` si aún no se pueden leer los dos montos.
   */
  diferencia: string | null;
  /** Las dos partes son montos válidos, positivos y suman EXACTO el total. */
  cuadra: boolean;
  /** Lo que hay que decirle a la persona; `null` cuando todo cuadra. */
  motivo: string | null;
}

/**
 * Lee el reparto que la persona dejó escrito y dice si ya se puede registrar.
 * `total` es el monto grande del formulario, ya leído (positivo), o `null` si
 * todavía no hay uno válido.
 */
export function leerReparto(
  total: string | null,
  texto1: string,
  texto2: string,
  moneda: string
): RepartoDelPago {
  const sinLeer = (motivo: string): RepartoDelPago => ({
    montos: null,
    diferencia: null,
    cuadra: false,
    motivo,
  });

  if (total === null || esCero(total)) {
    return sinLeer("Escribe primero el monto de la compra.");
  }

  const lecturas = [texto1, texto2].map((texto) => {
    if (!texto.trim()) return { vacio: true as const };
    return normalizarMontoIngresado(texto, moneda);
  });
  if (lecturas.some((lectura) => "vacio" in lectura)) {
    return sinLeer("Escribe cuánto va en cada cuenta.");
  }
  for (const lectura of lecturas) {
    if ("error" in lectura) return sinLeer(lectura.error);
  }

  const [m1, m2] = lecturas.map((lectura) => (lectura as { monto: string }).monto) as [string, string];
  if (esCero(m1) || esCero(m2)) {
    return sinLeer("Cada cuenta debe llevar más de cero.");
  }

  const diferencia = restar(total, sumarMontos([m1, m2]));
  if (esCero(diferencia)) {
    return { montos: [m1, m2], diferencia: "0.0000", cuadra: true, motivo: null };
  }

  const faltan = !diferencia.startsWith("-");
  const motivo = faltan
    ? `Faltan ${textoMonto(diferencia, moneda)} por repartir.`
    : `Te pasaste por ${textoMonto(diferencia.slice(1), moneda)}.`;
  return { montos: [m1, m2], diferencia, cuadra: false, motivo };
}

/**
 * Las cuentas que se pueden elegir en una de las dos partes: activas, de la
 * misma moneda y distintas de la que ya eligió la otra parte (una compra no se
 * reparte entre una cuenta y ella misma).
 */
export function cuentasParaLaParte(
  cuentas: readonly Cuenta[],
  moneda: string | undefined,
  cuentaDeLaOtraParte: string | null
): Cuenta[] {
  return cuentas.filter(
    (cuenta) =>
      cuenta.archivedAt === null &&
      (moneda === undefined || cuenta.currency === moneda) &&
      cuenta.id !== cuentaDeLaOtraParte
  );
}

/**
 * ¿La cuenta elegida para una parte sigue sirviendo? Existe, no está archivada
 * y es de la moneda de la compra. La lista de cuentas se refresca sola: una
 * cuenta elegida puede archivarse DESPUÉS de elegirla, y entonces deja de ser
 * una opción válida. Tratarla como no elegida evita mandar al servidor una
 * cuenta fantasma (que rechazaría con 422).
 */
export function esCuentaValidaParaLaParte(
  cuentas: readonly Cuenta[],
  moneda: string | undefined,
  cuentaId: string
): boolean {
  return cuentas.some(
    (cuenta) =>
      cuenta.id === cuentaId &&
      cuenta.archivedAt === null &&
      (moneda === undefined || cuenta.currency === moneda)
  );
}

/**
 * Las dos cuentas del reparto siguen siendo válidas: las dos existen, están
 * activas, son distintas entre sí y de la moneda de la compra. Es la misma
 * condición que habilita "Registrar": sin esto, una cuenta archivada después
 * de elegirla dejaría enviar y el servidor lo rechazaría.
 */
export function cuentasDelRepartoValidas(
  cuentas: readonly Cuenta[],
  moneda: string,
  cuenta1Id: string,
  cuenta2Id: string
): boolean {
  return (
    cuenta1Id !== "" &&
    cuenta2Id !== "" &&
    cuenta1Id !== cuenta2Id &&
    esCuentaValidaParaLaParte(cuentas, moneda, cuenta1Id) &&
    esCuentaValidaParaLaParte(cuentas, moneda, cuenta2Id)
  );
}

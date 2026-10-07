/**
 * Lógica pura de la pantalla AJUSTAR SALDO / AJUSTAR DEUDA.
 *
 * "Editar la deuda" no existe: el saldo (y la deuda de una tarjeta) no se
 * guarda — se calcula sumando los movimientos del libro. Ajustar es registrar
 * un movimiento kind "adjustment" por la diferencia entre lo que la app dice
 * hoy y lo que el banco dice hoy.
 *
 * Aquí vive lo que la pantalla dice en palabras, con la misma aritmética
 * exacta de enteros del resto de la app (`money.ts`): nada pasa por un
 * flotante, porque esta cifra es dinero de verdad.
 */
import type { Cuenta } from "./api/types";
import {
  esCero,
  MENOS,
  negar,
  normalizarMontoConSigno,
  normalizarMontoIngresado,
  restar,
  textoMonto,
} from "./money";
import type { MontoLeido } from "./money";

/** Lo que queda de la lectura: listo para pedir al servidor. */
export interface LecturaDeAjuste {
  /** El saldo deseado en el formato de la API, ya con signo. */
  balance: string;
  /** La diferencia con signo que sumará (o restará) el ajuste. */
  diferencia: string;
  /** El saldo escrito ya es el que la app dice: el servidor rechazaría. */
  coincide: boolean;
  /** La vista previa completa, en palabras. */
  vistaPrevia: string;
}

/**
 * La deuda de una tarjeta se escribe en positivo — "¿cuánto debes?" es un
 * número que la persona dice sin pensar el signo — y la pantalla lo convierte
 * a saldo: deuda 350000 es balance "-350000". Cero significa sin deuda.
 */
function leerDeudaEscrita(texto: string, moneda: string): MontoLeido {
  if (texto.startsWith("-")) {
    return { error: "Escribe la deuda sin signo." };
  }
  return normalizarMontoIngresado(texto, moneda);
}

/** Deuda escrita → saldo deseado de la tarjeta. El cero va limpio, sin "-0". */
function balanceDeDeuda(deuda: string): string {
  return esCero(deuda) ? "0" : negar(deuda);
}

/**
 * "007" → "7", "-007" → "-7", "0" → "0": el texto viaja al servidor y se
 * muestra en la vista previa tal cual, así que no le deja ceros de adorno
 * ("−$007" se leería como setecientos). Cosa de texto: la aritmética ya era
 * exacta; esto solo limpia la cifra que se ve y la que se manda.
 */
function sinCerosALaIzquierda(monto: string): string {
  const negativo = monto.startsWith("-");
  const sinSigno = negativo ? monto.slice(1) : monto;
  const limpio = sinSigno.replace(/^0+(?=\d)/, "");
  return `${negativo ? "-" : ""}${limpio || "0"}`;
}

/**
 * Lo que la pantalla recuerda del saldo actual antes del ajuste.
 *
 * En una tarjeta el signo del saldo es deuda ("−$350.000" es un número que
 * además hay que poder leer sin traducir), así que se dice en palabras: que
 * debes, que queda a tu favor, que no debes nada. En las demás cuentas el
 * saldo es el saldo, con su signo si está en sobregiro.
 */
function dichoDelSaldo(
  cuenta: Pick<Cuenta, "type" | "balance" | "currency">
): string {
  const { balance, currency, type } = cuenta;
  if (type !== "card") {
    return `Hoy la app dice ${textoMonto(balance, currency)}.`;
  }
  if (esCero(balance)) return "Hoy la app dice que no debes nada.";
  if (balance.startsWith("-")) {
    return `Hoy la app dice que debes ${textoMonto(negar(balance), currency)}.`;
  }
  return `Hoy la app dice que queda ${textoMonto(balance, currency)} a tu favor.`;
}

/** "+$50.000" o "−$50.000": el signo del ajuste se dice, no se tiñe. */
function textoDiferencia(diferencia: string, moneda: string): string {
  if (diferencia.startsWith("-")) {
    return `${MENOS}${textoMonto(negar(diferencia), moneda)}`;
  }
  return `+${textoMonto(diferencia, moneda)}`;
}

/**
 * La frase de coincidencia cuando no habría ningún ajuste que registrar
 * (diferencia cero): el botón principal se apaga, no viaja a que el servidor
 * responda "Esa cuenta ya tiene ese saldo."
 */
export const TEXTO_YA_COINCIDE = "Ya coincide.";

/**
 * Lee lo que la persona escribió en el campo del diálogo y arma, con enteros
 * exactos, el ajuste que se registraría.
 *
 * - campo vacío: `null` — todavía no hay nada que calcular, no es error.
 * - texto inválido (letras, decimales imposibles, signo donde no va): un
 *   error en español para mostrar debajo del campo.
 * - válido: `balance` (el saldo deseado), `diferencia`, `coincide` y la vista
 *   previa.
 *
 * En una tarjeta el campo es la DEUDA en positivo y el balance sale negado
 * (cero = sin deuda); en las demás cuentas el campo es el saldo, aceptando
 * cero y negativo (sobregiro).
 */
export function leerAjuste(
  texto: string,
  cuenta: Pick<Cuenta, "type" | "balance" | "currency">
): LecturaDeAjuste | { error: string } | null {
  const limpio = texto.trim();
  if (limpio === "") return null;

  const escrita =
    cuenta.type === "card"
      ? leerDeudaEscrita(limpio, cuenta.currency)
      : normalizarMontoConSigno(limpio, cuenta.currency);
  if ("error" in escrita) return escrita;

  const balance =
    cuenta.type === "card"
      ? balanceDeDeuda(sinCerosALaIzquierda(escrita.monto))
      : sinCerosALaIzquierda(escrita.monto);
  const diferencia = restar(balance, cuenta.balance);
  const coincide = esCero(diferencia);

  const vistaPrevia = coincide
    ? TEXTO_YA_COINCIDE
    : `${dichoDelSaldo(cuenta)} Se registrará un ajuste de ${textoDiferencia(
        diferencia,
        cuenta.currency
      )} para que coincida.`;

  return { balance, diferencia, coincide, vistaPrevia };
}

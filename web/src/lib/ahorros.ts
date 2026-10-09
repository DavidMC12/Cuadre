/**
 * Palabras y signos de los registros de ahorro.
 *
 * Un registro de ahorro no es un movimiento: es una anotación de que se
 * apartó (o se retiró) plata para ahorro. Aquí vive lo que las pantallas
 * repiten: el verbo según el signo, la cifra que se muestra (sin doble
 * línea) y la vista previa en palabras del formulario. Nunca convierte a
 * number; todo pasa por la aritmética de textos de money.ts.
 */

import type { RegistroDeAhorro } from "@/lib/api/types";
import {
  aUnidadesMinimas,
  esCero,
  negar,
  normalizarMontoIngresado,
  textoMonto,
} from "@/lib/money";

/** Lo que el toggle del formulario elige: apartar (positivo) o retirar (negativo). */
export type TipoRegistroAhorro = "aparte" | "retire";

/**
 * "Apartaste" con positivo, "Retiraste" con negativo. Un cero no es ni lo
 * uno ni lo otro: un registro nunca lo es (el servidor lo rechaza), y si un
 * dato torcido llegara con cero, `null` deja que la pantalla decida no
 * pintar un verbo sobre nada.
 */
export function verboDeRegistro(monto: string): "Apartaste" | "Retiraste" | null {
  if (esCero(monto)) return null;
  return monto.startsWith("-") ? "Retiraste" : "Apartaste";
}

/**
 * "Apartaste $500.000" / "Retiraste $500.000": una línea de la lista de
 * registros. El retiro se muestra SIN el menos — el verbo ya dice que se
 * retiró; repetirlo con el signo lo leería dos veces. Con cero (que de
 * verdad no debería ocurrir) devuelve null: la lista no inventa filas.
 */
export function textoDeRegistro(registro: RegistroDeAhorro): string | null {
  const verbo = verboDeRegistro(registro.amount);
  if (verbo === null) return null;
  const cifra =
    verbo === "Retiraste" ? textoMonto(negar(registro.amount), registro.currency) : textoMonto(registro.amount, registro.currency);
  return `${verbo} ${cifra}`;
}

/**
 * El monto que se le manda al servidor con su signo ya decidido. La
 * interfaz nunca deja que la persona teclee un menos: el toggle Aparte/Retire
 * es quien lo pone, exacto e igual en toda la app.
 */
export function montoConSigno(tipo: TipoRegistroAhorro, montoPositivo: string): string {
  return tipo === "retire" ? `-${montoPositivo}` : montoPositivo;
}

/**
 * La vista previa del formulario, en palabras: "Vas a anotar que apartaste
 * $X para ahorro." Decir antes de guardar lo que el registro va a decir
 * después: si la frase no es la que la persona quería, corregir es gratis.
 */
export function textoDeVistaPrevia(
  tipo: TipoRegistroAhorro,
  monto: string,
  moneda: string
): string {
  const verbo = tipo === "retire" ? "retiraste" : "apartaste";
  return `Vas a anotar que ${verbo} ${textoMonto(monto, moneda)} para ahorro.`;
}

/** "Apartaste $500.000" o "Retiro de $500.000" para el toast de guardado. */
export function textoDeExito(registro: RegistroDeAhorro, nombreDeCuenta: string): string {
  const texto = textoDeRegistro(registro);
  if (texto === null) return "Ahorro registrado.";
  return `${texto} en ${nombreDeCuenta}.`;
}

/**
 * Lo que una cifra escrita falla para anotarse — o `null` si sirve.
 *
 * Vacío NO es un error: es "todavía no escribieron nada", y regañar al abrir
 * el formulario explicaría algo que no pasó. El resto de las fallas son las
 * de siempre, y viven aquí (una sola vez) para que el texto de ojos y la
 * decisión de guardar no puedan divergir: lo mal escrito se lee como lo lee
 * money.ts, y el cero no se aparta.
 */
export function errorDeMontoDeAhorro(texto: string, moneda: string): string | null {
  if (texto.trim() === "") return null;
  const lectura = normalizarMontoIngresado(texto, moneda);
  if ("error" in lectura) return lectura.error;
  if (aUnidadesMinimas(lectura.monto) <= 0n) return "El monto tiene que ser mayor que cero.";
  return null;
}

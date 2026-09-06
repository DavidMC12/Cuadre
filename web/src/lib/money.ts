/**
 * Formateo de montos para mostrarlos en pantalla.
 *
 * Regla del proyecto: los montos SIEMPRE llegan como texto (ej. "-1250.7500")
 * y nunca deben pasar por `parseFloat` ni `Number`, porque eso puede
 * corromper el valor exacto del dinero. Por eso este archivo solo corta el
 * texto en sus partes (signo, entero, decimales); nunca hace una cuenta.
 */

export interface MontoFormateado {
  negativo: boolean;
  /** Parte entera, ya con separador de miles. */
  entero: string;
  /** Siempre 2 dígitos. Se recorta el resto: no se redondea. */
  decimales: string;
}

export function formatearMonto(monto: string): MontoFormateado {
  const texto = monto.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = texto.replace(/^[-+]/, "");
  const [parteEntera = "0", parteDecimal = ""] = sinSigno.split(".");
  const decimales = (parteDecimal + "00").slice(0, 2);
  const entero = (parteEntera || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return { negativo, entero, decimales };
}

const SIMBOLOS_MONEDA: Record<string, string> = {
  COP: "$",
  USD: "US$",
};

export function simboloMoneda(moneda: string): string {
  return SIMBOLOS_MONEDA[moneda] ?? `${moneda} `;
}

const PATRON_MONTO_POSITIVO = /^\d+([.,]\d{1,4})?$/;
const PATRON_MONTO_CON_SIGNO = /^-?\d+([.,]\d{1,4})?$/;

/**
 * Valida lo que la persona escribió en un campo de monto (sin signo, tal
 * como se le pide en los formularios) y lo normaliza a punto decimal.
 * Devuelve `null` si el texto no tiene forma de número.
 */
export function normalizarMontoIngresado(texto: string): string | null {
  if (!PATRON_MONTO_POSITIVO.test(texto.trim())) return null;
  return texto.trim().replace(",", ".");
}

/**
 * Igual que `normalizarMontoIngresado`, pero acepta un signo negativo al
 * frente. Para campos donde la persona sí puede escribir el menos, como el
 * saldo inicial de una cuenta (ej. una tarjeta que ya arranca en deuda).
 */
export function normalizarMontoConSigno(texto: string): string | null {
  if (!PATRON_MONTO_CON_SIGNO.test(texto.trim())) return null;
  return texto.trim().replace(",", ".");
}

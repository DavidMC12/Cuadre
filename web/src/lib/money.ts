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
  /** Cadena vacía cuando la moneda no usa decimales y no hay nada que mostrar. */
  decimales: string;
}

/**
 * Cuántos decimales se muestran de cada moneda.
 *
 * El peso colombiano tiene centavos en el papel, pero nadie los usa: un ",00"
 * en cada línea es ruido. Los montos siguen guardándose con cuatro decimales;
 * esto es solo cómo se ven.
 */
const DECIMALES_POR_MONEDA: Record<string, number> = {
  COP: 0,
  CLP: 0,
  JPY: 0,
  KRW: 0,
  PYG: 0,
  VND: 0,
  ISK: 0,
};

const DECIMALES_POR_DEFECTO = 2;

export function decimalesDe(moneda: string): number {
  return DECIMALES_POR_MONEDA[moneda.toUpperCase()] ?? DECIMALES_POR_DEFECTO;
}

/**
 * "2500000" -> "2.500.000".
 *
 * A mano y no con una expresion regular: la version con regex ya se rompio
 * una vez al pasar por un script, y un separador de miles perdido hace que
 * dos millones y medio se lean como veinticinco millones.
 */
function agruparMiles(digitos: string): string {
  let salida = "";
  for (let i = 0; i < digitos.length; i += 1) {
    if (i > 0 && (digitos.length - i) % 3 === 0) salida += ".";
    salida += digitos[i];
  }
  return salida;
}

export function formatearMonto(monto: string, moneda: string): MontoFormateado {
  const texto = monto.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = texto.replace(/^[-+]/, "");
  const [parteEntera = "0", parteDecimal = ""] = sinSigno.split(".");
  const entero = agruparMiles(parteEntera || "0");

  const deseados = decimalesDe(moneda);

  // En monedas sin centavos igual se muestran si el monto trae algo distinto de
  // cero: es preferible que se vea raro a esconder plata.
  const decimales =
    deseados === 0
      ? parteDecimal.replace(/0+$/, "")
      : (parteDecimal + "0".repeat(deseados)).slice(0, deseados);

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

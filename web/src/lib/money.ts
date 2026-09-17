/**
 * Formateo de montos para mostrarlos en pantalla.
 *
 * Regla del proyecto: los montos SIEMPRE llegan como texto (ej. "-1250.7500")
 * y nunca deben pasar por `parseFloat` ni `Number`, porque eso puede
 * corromper el valor exacto del dinero. Por eso este archivo solo corta el
 * texto en sus partes (signo, entero, decimales); nunca hace una cuenta.
 */

/**
 * Menos matemático (U+2212), no un guion: un guion es un signo de puntuación
 * que se presta a leerse como un rango o un guion de palabra; este se lee sin
 * dudar como "negativo".
 */
export const MENOS = "−";

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
export function agruparMiles(digitos: string): string {
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

/**
 * "$820.000" — un monto como texto plano, sin JSX ni colores. Para
 * etiquetas y tooltips de las gráficas, donde no se puede usar `<Monto>`.
 */
/**
 * Si el monto es cero, sea cual sea cómo esté escrito ("0", "0.0000",
 * "-0.0000"). Un cero no es ni un ingreso ni un gasto: no debería teñirse de
 * ninguno de los dos colores.
 */
export function esCero(monto: string): boolean {
  return /^-?0+(\.0+)?$/.test(monto.trim());
}

export function textoMonto(monto: string, moneda: string): string {
  const { negativo, entero, decimales } = formatearMonto(monto, moneda);
  return `${negativo ? MENOS : ""}${simboloMoneda(moneda)}${entero}${decimales ? `,${decimales}` : ""}`;
}

const ESCALA_DECIMAL = 10000n;

/**
 * "1234.5" -> 12345000n. Nunca pasa por `parseFloat`: cuenta enteros.
 *
 * Exportada para las comparaciones y proporciones de dinero que se hacen en
 * las pantallas (el checklist la usa para el ancho de su barra): que exista
 * una sola forma de partir un monto en enteros exactos, y no una por
 * componente.
 */
export function aUnidadesMinimas(monto: string): bigint {
  const texto = monto.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = texto.replace(/^[-+]/, "");
  const [parteEntera = "0", parteDecimal = ""] = sinSigno.split(".");
  const decimalCompleto = (parteDecimal + "0000").slice(0, 4);
  const valor = BigInt(parteEntera || "0") * ESCALA_DECIMAL + BigInt(decimalCompleto || "0");
  return negativo ? -valor : valor;
}

/**
 * Suma exacta de montos de la misma moneda, sin coma flotante: el total de
 * "cuánto tienes" sale de sumar los saldos de tus cuentas, y ese es dinero de
 * verdad, no una cuenta aproximada.
 */
export function sumarMontos(montos: readonly string[]): string {
  const total = montos.reduce((acumulado, monto) => acumulado + aUnidadesMinimas(monto), 0n);
  const negativo = total < 0n;
  const absoluto = negativo ? -total : total;
  const entero = absoluto / ESCALA_DECIMAL;
  const decimales = (absoluto % ESCALA_DECIMAL).toString().padStart(4, "0");
  return `${negativo ? "-" : ""}${entero}.${decimales}`;
}

/** El monto opuesto, solo volteando el signo del texto: nunca una cuenta. */
export function negar(monto: string): string {
  const texto = monto.trim();
  return texto.startsWith("-") ? texto.slice(1) : `-${texto}`;
}

/** Resta exacta de la misma moneda: `a - b`, con enteros grandes. */
export function restar(a: string, b: string): string {
  return sumarMontos([a, negar(b)]);
}

/**
 * "100000.0000" -> "100.000" o "12.3400" -> "12.34": lo que un CampoMonto
 * sabe leer de vuelta, para prellenar un campo de monto editable con un valor
 * que ya vive en el servidor.
 */
export function textoEditable(monto: string, moneda: string): string {
  const { negativo, entero, decimales } = formatearMonto(monto, moneda);
  return `${negativo ? "-" : ""}${entero}${decimales ? `,${decimales}` : ""}`;
}

/**
 * Lo que sale de leer un monto escrito a mano: o el monto listo para mandarlo
 * a la API ("25000", "1500.50"), o una frase que le dice a la persona qué
 * corregir.
 */
export type MontoLeido = { monto: string } | { error: string };

export const SOLO_DIGITOS = /^\d+$/;

/**
 * "1.500.000" o "1,500,000": un primer grupo de uno a tres dígitos que no
 * empieza en cero, y detrás grupos de exactamente tres, siempre con el mismo
 * separador. Un separador de miles nunca va seguido de menos de tres dígitos,
 * y eso es lo que permite distinguirlo de uno decimal.
 */
export const MILES_CON_PUNTO = /^[1-9]\d{0,2}(\.\d{3})+$/;
export const MILES_CON_COMA = /^[1-9]\d{0,2}(,\d{3})+$/;

/** Solo las monedas que las pantallas ofrecen; el resto se nombra en genérico. */
const MONEDA_EN_PLURAL: Record<string, string> = {
  COP: "pesos",
  USD: "dólares",
};

/** "Los pesos no llevan…" o, si la moneda no tiene nombre aquí, "Esta moneda no lleva…". */
function sobreLaMoneda(moneda: string, enPlural: string, enSingular: string): string {
  const nombre = MONEDA_EN_PLURAL[moneda.toUpperCase()];
  return nombre ? `Los ${nombre} ${enPlural}` : `Esta moneda ${enSingular}`;
}

/**
 * Lee un monto escrito sin signo, con las costumbres de Colombia.
 *
 * Cómo se lee un punto o una coma depende de la moneda, igual que cuántos
 * decimales se muestran:
 *
 * - **Sin decimales (pesos):** punto y coma son separadores de miles. "25.000"
 *   y "25000" son lo mismo, y cualquier intento de poner decimales se rechaza:
 *   leer "25.000" como veinticinco pesos guardaría mil veces menos plata de la
 *   que la persona quiso escribir.
 * - **Con decimales (dólares):** quien escribe sigue siendo colombiano, así
 *   que el punto es de miles y la coma es decimal: "1.500,50". Una sola
 *   excepción: si no hay coma y hay un único punto seguido de uno o dos
 *   dígitos ("1500.50"), ese punto solo puede ser decimal —uno de miles
 *   llevaría tres dígitos detrás— y se acepta, porque hay teclados numéricos
 *   de celular que no traen la coma.
 *
 * Solo corta y pega texto, nunca convierte a número.
 */
function leerSinSigno(texto: string, moneda: string): MontoLeido {
  const decimales = decimalesDe(moneda);
  const ejemplo = decimales === 0 ? "25.000" : "1.500,50";

  if (texto === "") return { error: "Escribe el monto." };
  if (/[^\d.,]/.test(texto) || !/\d/.test(texto)) {
    return { error: `Escribe solo números, por ejemplo ${ejemplo}.` };
  }

  if (decimales === 0) {
    if (SOLO_DIGITOS.test(texto)) return { monto: texto };
    if (MILES_CON_PUNTO.test(texto) || MILES_CON_COMA.test(texto)) {
      return { monto: texto.replace(/[.,]/g, "") };
    }
    return {
      error: `${sobreLaMoneda(moneda, "no llevan decimales", "no lleva decimales")}: escribe el monto completo, por ejemplo 25.000.`,
    };
  }

  const malEscrito: MontoLeido = {
    error: `Usa punto para los miles y coma para los centavos, por ejemplo ${ejemplo}.`,
  };
  const [parteEntera = "", parteDecimal, ...sobrantes] = texto.split(",");
  if (sobrantes.length > 0) return malEscrito;

  const enteroValido = SOLO_DIGITOS.test(parteEntera) || MILES_CON_PUNTO.test(parteEntera);

  if (parteDecimal !== undefined) {
    if (!enteroValido || !SOLO_DIGITOS.test(parteDecimal)) return malEscrito;
    if (parteDecimal.length > decimales) {
      const cuantos = `máximo ${decimales} ${decimales === 1 ? "decimal" : "decimales"}`;
      return {
        error: `${sobreLaMoneda(moneda, `llevan ${cuantos}`, `lleva ${cuantos}`)}, por ejemplo ${ejemplo}.`,
      };
    }
    return { monto: `${parteEntera.replace(/\./g, "")}.${parteDecimal}` };
  }

  if (enteroValido) return { monto: parteEntera.replace(/\./g, "") };

  const [antesDelPunto = "", despuesDelPunto = "", ...otrosPuntos] = texto.split(".");
  if (
    otrosPuntos.length === 0 &&
    SOLO_DIGITOS.test(antesDelPunto) &&
    SOLO_DIGITOS.test(despuesDelPunto) &&
    despuesDelPunto.length <= decimales
  ) {
    return { monto: texto };
  }
  return malEscrito;
}

/**
 * Lee lo que la persona escribió en un campo de monto sin signo, como el de
 * registrar un movimiento (ahí el signo lo pone el tipo: gasto o ingreso).
 */
export function normalizarMontoIngresado(texto: string, moneda: string): MontoLeido {
  const limpio = texto.trim();
  if (limpio.startsWith("-")) {
    return { error: "Escribe el monto sin signo; si es un gasto, elige Gasto." };
  }
  return leerSinSigno(limpio, moneda);
}

/**
 * Igual que `normalizarMontoIngresado`, pero acepta un signo negativo al
 * frente. Para campos donde la persona sí puede escribir el menos, como el
 * saldo inicial de una cuenta (ej. una tarjeta que ya arranca en deuda).
 */
export function normalizarMontoConSigno(texto: string, moneda: string): MontoLeido {
  const limpio = texto.trim();
  const negativo = limpio.startsWith("-");
  const lectura = leerSinSigno(negativo ? limpio.slice(1) : limpio, moneda);
  if ("error" in lectura) return lectura;
  return { monto: negativo ? `-${lectura.monto}` : lectura.monto };
}

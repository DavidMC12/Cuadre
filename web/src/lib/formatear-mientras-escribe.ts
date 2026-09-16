import {
  agruparMiles,
  decimalesDe,
  MENOS,
  MILES_CON_COMA,
  MILES_CON_PUNTO,
  SOLO_DIGITOS,
} from "./money";

/**
 * Reformatea lo que la persona va escribiendo en un campo de monto, para que
 * el separador de miles (y el decimal, si la moneda usa) aparezcan al vuelo
 * — así un cero de más se nota de inmediato en vez de esconderse en una fila
 * de dígitos sin puntuar.
 *
 * Dos reglas gobiernan todo este archivo, y la segunda importa tanto como la
 * primera:
 *
 * 1. Lo que esto produce sigue siendo exactamente lo que
 *    `normalizarMontoIngresado`/`normalizarMontoConSigno` (`money.ts`) ya
 *    saben leer, así que la validación y el envío a la API no cambian nada.
 * 2. **Nunca se adivina un monto distinto al que la persona escribió.** Si
 *    el texto trae una combinación de separadores que no se puede leer con
 *    certeza (por ejemplo "1500,50" en una moneda sin decimales, o
 *    "1,500.50" pegado con formato inglés), esta función NO reformatea: deja
 *    el texto tal cual, para que el validador de siempre lo detenga con su
 *    mensaje real. La alternativa —limpiar hasta que algo "se vea bien"— es
 *    peor: convierte un error visible en un monto equivocado por un factor
 *    de 100 o 1000, silencioso, y un movimiento ya registrado no se edita.
 */
export function formatearMientrasEscribe(
  textoCrudo: string,
  moneda: string,
  opciones: { permiteSigno?: boolean } = {}
): string {
  const permiteSigno = opciones.permiteSigno ?? false;
  const sinEspacios = textoCrudo.trim();

  // Acepta tanto "-" como el signo menos que la propia app usa para mostrar
  // negativos ("−", U+2212): copiar un saldo negativo de otra pantalla de
  // Cuadre y pegarlo aquí debe conservar el signo, no perderlo en silencio.
  const tieneSigno = sinEspacios.startsWith("-") || sinEspacios.startsWith(MENOS);
  const sinSigno = tieneSigno ? sinEspacios.slice(1) : sinEspacios;
  const prefijo = permiteSigno && tieneSigno ? "-" : "";

  const decimales = decimalesDe(moneda);
  return (
    prefijo +
    (decimales === 0 ? formatearSinDecimales(sinSigno) : formatearConDecimales(sinSigno, decimales))
  );
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function quitarCerosALaIzquierda(digitos: string): string {
  return digitos.replace(/^0+(?=\d)/, "");
}

function formatearSinDecimales(sinSigno: string): string {
  // Las letras, espacios sueltos, etc. no son ambiguos: nadie quiso decir
  // nada con ellos, así que se descartan sin más. Lo que sí importa
  // conservar tal cual es un separador (punto o coma) que no forma un
  // agrupamiento de miles válido y completo.
  const relevante = sinSigno.replace(/[^\d.,]/g, "");
  if (relevante === "") return "";

  if (SOLO_DIGITOS.test(relevante)) {
    return agruparMiles(quitarCerosALaIzquierda(relevante));
  }
  if (MILES_CON_PUNTO.test(relevante) || MILES_CON_COMA.test(relevante)) {
    return agruparMiles(relevante.replace(/[.,]/g, ""));
  }

  // "1500,50", "25.00", etc.: esta moneda no lleva decimales, y esto no es
  // un agrupamiento de miles reconocible. No se adivina — se deja tal cual
  // para que el mensaje de "los pesos no llevan decimales" salga de verdad.
  return relevante;
}

function formatearConDecimales(sinSigno: string, decimales: number): string {
  const relevante = sinSigno.replace(/[^\d.,]/g, "");
  if (relevante === "") return "";

  const tieneComa = relevante.includes(",");
  const tienePunto = relevante.includes(".");

  if (!tieneComa && !tienePunto) {
    return agruparMiles(quitarCerosALaIzquierda(relevante));
  }

  if (tieneComa && tienePunto) {
    // Los dos separadores a la vez no tienen una lectura segura: "1,500.50"
    // podría ser formato inglés, o un dígito de más sobre "1.500,50". Se
    // deja tal cual para que el validador de siempre decida.
    return relevante;
  }

  if (tieneComa) {
    return formatearConSeparadorDecimal(relevante, ",", decimales);
  }

  // Solo hay puntos. Sin coma, un ÚNICO punto seguido de como mucho
  // `decimales` dígitos solo puede ser decimal —igual que ya tolera
  // `normalizarMontoIngresado` al validar, pensado para teclados numéricos
  // de celular sin coma—. Cualquier otra forma (más de un punto, o uno
  // seguido de más dígitos de los que la moneda admite) es un agrupamiento
  // de miles o, si no calza ni con eso, algo que no se puede adivinar.
  const partes = relevante.split(".");
  const esUnicoPuntoDecimal =
    partes.length === 2 && partes[1]!.length > 0 && partes[1]!.length <= decimales;
  if (esUnicoPuntoDecimal) {
    return formatearConSeparadorDecimal(relevante, ".", decimales);
  }
  if (MILES_CON_PUNTO.test(relevante)) {
    return agruparMiles(relevante.replace(/\./g, ""));
  }
  return relevante;
}

function formatearConSeparadorDecimal(
  relevante: string,
  separador: "," | ".",
  decimales: number
): string {
  const posicion = relevante.lastIndexOf(separador);
  // Cualquier separador anterior al último fue un descuido de tecleo: sus
  // dígitos SÍ se conservan y se suman al entero (perder un dígito que la
  // persona de verdad escribió sería peor que agruparlo donde no tocaba).
  const parteEntera = quitarCerosALaIzquierda(soloDigitos(relevante.slice(0, posicion)));
  const parteDecimal = soloDigitos(relevante.slice(posicion + 1)).slice(0, decimales);
  const enteroMostrado = parteEntera === "" ? "0" : agruparMiles(parteEntera);
  return `${enteroMostrado},${parteDecimal}`;
}

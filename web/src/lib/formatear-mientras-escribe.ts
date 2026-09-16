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
 * Esta función por sí sola NO decide si algo es tecleo o texto ajeno — eso
 * ya lo decidió quien la llama, y se lo dice por `opciones.pegado`. Quien de
 * verdad clasifica es `clasificarEdicionDeMonto`
 * (`clasificar-edicion-de-monto.ts`), comparando el texto contra lo último
 * que este módulo produjo; `inputType` del navegador no basta (un IME de
 * celular, un gestor de contraseñas o un Deshacer pueden no reportarlo, o no
 * encajar en "pegado" ni en "tecla"). Aquí solo hay dos formas de leer un
 * texto una vez decidido qué es:
 *
 * - **`pegado` ausente o `false`**: se asume que el texto es "lo que este
 *   módulo ya había formateado, más una tecla", así que es seguro deshacer
 *   los separadores y reagrupar desde cero — es justamente lo que hace
 *   posible escribir un monto de cualquier largo. Llamarla así con un texto
 *   que en realidad vino de afuera es el error que hace que un pegado se
 *   "arregle" solo en la siguiente tecla, convirtiéndolo en un monto
 *   plausible pero distinto.
 * - **`pegado: true`**: el texto puede traer una convención de separadores
 *   distinta a la de la app ("1,500.50" en inglés) o decimales en una moneda
 *   que no los usa. Ahí NO se adivina: si la combinación de separadores no
 *   se puede leer con certeza, el texto se deja tal cual, para que
 *   `normalizarMontoIngresado`/`normalizarMontoConSigno` (`money.ts`) den su
 *   error real en vez de que aquí se muestre un monto distinto y plausible.
 */
export function formatearMientrasEscribe(
  textoCrudo: string,
  moneda: string,
  opciones: { permiteSigno?: boolean; pegado?: boolean } = {}
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
  const cuerpo = opciones.pegado
    ? formatearTextoPegado(sinSigno, decimales)
    : formatearTextoEscrito(sinSigno, decimales);

  return prefijo + cuerpo;
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function quitarCerosALaIzquierda(digitos: string): string {
  return digitos.replace(/^0+(?=\d)/, "");
}

// -----------------------------------------------------------------------------
// Tecleando: siempre seguro reagrupar desde cero, porque el texto de entrada
// es siempre una versión de lo que este mismo formateador ya produjo.

function formatearTextoEscrito(sinSigno: string, decimales: number): string {
  if (decimales === 0) {
    const digitos = quitarCerosALaIzquierda(soloDigitos(sinSigno));
    return digitos === "" ? "" : agruparMiles(digitos);
  }

  // Un punto tecleado como decimal ya llega convertido en coma —lo hace
  // `clasificarEdicionDeMonto` al detectar la tecla, no depende de un evento
  // de teclado— así que si de todos modos aparece uno aquí se descarta sin
  // más, igual que cualquier otro carácter suelto.
  const filtrado = sinSigno.replace(/[^\d,]/g, "");
  const posicionDeLaComa = filtrado.lastIndexOf(",");

  if (posicionDeLaComa === -1) {
    const digitos = quitarCerosALaIzquierda(filtrado);
    return digitos === "" ? "" : agruparMiles(digitos);
  }

  // Cualquier coma anterior a la última fue un descuido de tecleo: sus
  // dígitos SÍ se conservan y se suman al entero (perder un dígito que la
  // persona de verdad escribió sería peor que agruparlo donde no tocaba).
  const parteEntera = quitarCerosALaIzquierda(soloDigitos(filtrado.slice(0, posicionDeLaComa)));
  const parteDecimal = soloDigitos(filtrado.slice(posicionDeLaComa + 1)).slice(0, decimales);
  const enteroMostrado = parteEntera === "" ? "0" : agruparMiles(parteEntera);
  return `${enteroMostrado},${parteDecimal}`;
}

// -----------------------------------------------------------------------------
// Pegando: el texto viene de afuera, así que puede traer una convención de
// separadores que no es la de la app. Nunca se adivina: o se puede leer con
// certeza, o se deja tal cual para que el validador de siempre dé su error.

function formatearTextoPegado(sinSigno: string, decimales: number): string {
  if (decimales === 0) return formatearPegadoSinDecimales(sinSigno);
  return formatearPegadoConDecimales(sinSigno, decimales);
}

function formatearPegadoSinDecimales(sinSigno: string): string {
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

function formatearPegadoConDecimales(sinSigno: string, decimales: number): string {
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
  // `normalizarMontoIngresado` al validar, pensado para pegar un monto
  // copiado de un sitio con teclado numérico sin coma—. Cualquier otra forma
  // (más de un punto, o uno seguido de más dígitos de los que la moneda
  // admite) es un agrupamiento de miles o, si no calza ni con eso, algo que
  // no se puede adivinar.
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
  const parteEntera = quitarCerosALaIzquierda(soloDigitos(relevante.slice(0, posicion)));
  const parteDecimal = soloDigitos(relevante.slice(posicion + 1)).slice(0, decimales);
  const enteroMostrado = parteEntera === "" ? "0" : agruparMiles(parteEntera);
  return `${enteroMostrado},${parteDecimal}`;
}

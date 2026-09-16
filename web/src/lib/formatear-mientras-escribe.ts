import { agruparMiles, decimalesDe } from "./money";

/**
 * Reformatea lo que la persona va escribiendo en un campo de monto, para que
 * el separador de miles (y el decimal, si la moneda usa) aparezcan al vuelo
 * — así un cero de más se nota de inmediato en vez de esconderse en una fila
 * de dígitos sin puntuar.
 *
 * Solo cambia cómo se VE mientras se escribe: el resultado sigue siendo
 * exactamente lo que `normalizarMontoIngresado`/`normalizarMontoConSigno` ya
 * saben leer (ver `money.ts`), así que la validación y el envío a la API no
 * cambian en nada.
 *
 * El separador decimal, mientras se escribe, es siempre la coma — igual que
 * ya enseña el mensaje de error de `money.ts` ("usa punto para los miles y
 * coma para los centavos"). Un punto que la persona escriba se descarta (no
 * se interpreta como decimal): intentar adivinar cuál de los dos separadores
 * es cuál mientras la persona todavía está escribiendo abre más casos raros
 * de los que resuelve, y la coma ya es la convención que la app enseña en
 * todos los mensajes de error.
 */
export function formatearMientrasEscribe(
  textoCrudo: string,
  moneda: string,
  opciones: { permiteSigno?: boolean } = {}
): string {
  const permiteSigno = opciones.permiteSigno ?? false;

  const sinEspacios = textoCrudo.trim();
  const negativo = permiteSigno && sinEspacios.startsWith("-");
  const prefijo = negativo ? "-" : "";
  const decimales = decimalesDe(moneda);

  if (decimales === 0) {
    const digitos = quitarCerosALaIzquierda(soloDigitos(sinEspacios));
    return digitos === "" ? prefijo : prefijo + agruparMiles(digitos);
  }

  const filtrado = sinEspacios.replace(/[^\d,]/g, "");
  const posicionDeLaComa = filtrado.lastIndexOf(",");

  if (posicionDeLaComa === -1) {
    const digitos = quitarCerosALaIzquierda(filtrado);
    return digitos === "" ? prefijo : prefijo + agruparMiles(digitos);
  }

  // Cualquier coma anterior a la última fue un descuido de tecleo: se
  // descarta junto con los dígitos que agrupaba, en vez de sumarlos al
  // entero, porque no hay forma de saber qué quiso decir la persona.
  const parteEntera = quitarCerosALaIzquierda(soloDigitos(filtrado.slice(0, posicionDeLaComa)));
  const parteDecimal = soloDigitos(filtrado.slice(posicionDeLaComa + 1)).slice(0, decimales);

  const enteroMostrado = parteEntera === "" ? "0" : agruparMiles(parteEntera);
  return `${prefijo}${enteroMostrado},${parteDecimal}`;
}

function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

function quitarCerosALaIzquierda(digitos: string): string {
  return digitos.replace(/^0+(?=\d)/, "");
}

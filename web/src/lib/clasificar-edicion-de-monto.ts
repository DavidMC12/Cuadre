import { diferenciaDeTexto } from "./diferencia-de-texto";
import { formatearMientrasEscribe } from "./formatear-mientras-escribe";
import { decimalesDe } from "./money";

export interface ResultadoDeEdicion {
  /** El nuevo valor del campo, listo para pasarle a `onChange`. */
  texto: string;
  /** Si `texto` es algo que este módulo ya normalizó — seguro seguir tecleando encima — o ajeno. */
  confiable: boolean;
}

/**
 * Decide cómo tratar un cambio en un campo de monto: como una tecla más
 * sobre un texto que este mismo módulo ya había normalizado (seguro
 * reagrupar todo desde cero), o como algo que llegó de afuera —pegado,
 * autocompletado, un IME que reemplaza varios caracteres a la vez— que por
 * lo tanto no se puede adivinar.
 *
 * La pista NO es de dónde vino el evento: `inputType` no es confiable (un
 * IME de celular, un gestor de contraseñas o un Deshacer pueden no
 * reportarlo, o reportar algo que no encaja en ninguna de las dos
 * categorías esperadas). La pista es CUÁNTO CAMBIÓ el texto: si lo anterior
 * ya era confiable y lo nuevo agrega como mucho un carácter, es una tecla.
 * Cualquier otra cosa —incluido seguir editando un texto que todavía no se
 * pudo resolver— se trata con cuidado hasta que vuelva a ser una forma
 * reconocible.
 *
 * A propósito NO decide dónde va el cursor: `CampoMonto` lo manda siempre
 * al final después de cualquier cambio. Una versión anterior intentaba
 * recolocarlo contando dígitos, y eso fue justo la causa de un error de
 * dinero real (escribir ".99" como primera tecla en dólares registraba
 * 9.90): el formateador puede insertar un carácter que la persona nunca
 * escribió (un "0" delante de la coma), y contar dígitos no tiene forma de
 * saber que ese carácter es nuevo. Perder la posición exacta del cursor al
 * editar en medio de un monto ya escrito es una molestia; equivocarse el
 * monto no lo es.
 */
export function clasificarEdicionDeMonto(
  anterior: string,
  crudo: string,
  moneda: string,
  opciones: { permiteSigno?: boolean; confiablePrevio: boolean }
): ResultadoDeEdicion {
  const permiteSigno = opciones.permiteSigno ?? false;
  const { prefijoComun, insertado } = diferenciaDeTexto(anterior, crudo);

  if (!opciones.confiablePrevio || insertado > 1) {
    // Ajeno, o varios caracteres a la vez: nunca se adivina. Si el resultado
    // termina siendo una forma que este mismo módulo reconocería como suya
    // (por ejemplo, un pegado que sí se pudo leer con certeza), queda
    // confiable para la siguiente tecla; si no, sigue tratándose con cuidado
    // hasta que la persona lo corrija lo suficiente.
    const texto = formatearMientrasEscribe(crudo, moneda, { permiteSigno, pegado: true });
    const confiable = formatearMientrasEscribe(texto, moneda, { permiteSigno }) === texto;
    return { texto, confiable };
  }

  let paraFormatear = crudo;

  if (insertado === 1) {
    const caracter = crudo[prefijoComun]!;
    const decimales = decimalesDe(moneda);

    if ((caracter === "." || caracter === ",") && decimales > 0) {
      if (anterior.includes(",")) {
        // Un segundo separador decimal es un toque de más, no una intención
        // de correr los decimales: se ignora, sin reciclar sus dígitos.
        return { texto: anterior, confiable: true };
      }
      // Un punto tecleado —numérico de celular sin coma, o un IME que no
      // dispara un evento de tecla fiable— es el separador decimal.
      if (caracter === ".") {
        paraFormatear = `${crudo.slice(0, prefijoComun)},${crudo.slice(prefijoComun + 1)}`;
      }
    }
  }

  return {
    texto: formatearMientrasEscribe(paraFormatear, moneda, { permiteSigno }),
    confiable: true,
  };
}

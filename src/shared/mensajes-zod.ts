/**
 * Mensajes de validación en español, escritos para que los lea una persona.
 *
 * Zod trae su propia traducción, pero suelta frases como "Inválido UUID" o
 * "Inválido fecha y hora ISO". Aquí se reescriben los casos que de verdad
 * aparecen en los formularios; lo que no esté cubierto cae en la traducción
 * de Zod, que aunque suene rara al menos está en español.
 *
 * Cuando un esquema trae su propio mensaje —como los montos y las monedas—
 * ese gana y nada de esto se ejecuta.
 */
import { z } from 'zod';

const FORMATOS: Record<string, string> = {
  uuid: 'no es un identificador válido',
  guid: 'no es un identificador válido',
  datetime: 'no es una fecha válida',
  date: 'no es una fecha válida',
  email: 'no es un correo válido',
  url: 'no es una dirección web válida',
};

const COSAS: Record<string, string> = {
  string: 'texto',
  number: 'un número',
  array: 'una lista',
  object: 'un objeto',
};

export function configurarMensajesEnEspanol(): void {
  z.config({
    ...z.locales.es(),

    customError: (incidencia) => {
      const detalle = incidencia as Record<string, unknown>;

      switch (incidencia.code) {
        case 'invalid_type':
          return incidencia.input === undefined
            ? 'hace falta'
            : `se esperaba ${COSAS[String(detalle['expected'])] ?? String(detalle['expected'])}`;

        case 'invalid_format': {
          const formato = String(detalle['format']);
          return FORMATOS[formato] ?? undefined;
        }

        case 'too_small': {
          const minimo = Number(detalle['minimum']);
          if (detalle['origin'] === 'string') {
            return minimo <= 1 ? 'no puede quedar vacío' : `necesita al menos ${minimo} caracteres`;
          }
          return `no puede ser menor que ${minimo}`;
        }

        case 'too_big': {
          const maximo = Number(detalle['maximum']);
          return detalle['origin'] === 'string'
            ? `no puede pasar de ${maximo} caracteres`
            : `no puede ser mayor que ${maximo}`;
        }

        case 'invalid_value': {
          const valores = detalle['values'];
          return Array.isArray(valores)
            ? `no es una opción válida. Las opciones son: ${valores.join(', ')}`
            : 'no es una opción válida';
        }

        case 'unrecognized_keys':
          return 'hay campos que no se esperaban';

        default:
          return undefined;
      }
    },
  });
}

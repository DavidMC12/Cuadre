/**
 * Piezas de validación que comparten todos los módulos.
 *
 * Viven aquí y no dentro de un módulo porque un monto es un monto en cuentas,
 * en movimientos y en presupuestos. Si cada módulo escribiera su propia
 * expresión regular, tarde o temprano una se quedaría atrás.
 */
import { z } from 'zod';

/** Hasta 15 dígitos enteros y 4 decimales: lo que cabe en NUMERIC(19,4). */
const FORMA_DE_MONTO = /^-?\d{1,15}(\.\d{1,4})?$/;

/** Un monto con signo, distinto de cero. Siempre texto, nunca número. */
export const MontoSchema = z
  .string()
  .regex(FORMA_DE_MONTO, 'debe ser un monto como "1250" o "-1250.75", con máximo 4 decimales')
  .refine((valor) => !/^-?0(\.0{1,4})?$/.test(valor), { message: 'no puede ser cero' });

/** Igual, pero acepta cero. Sirve para el saldo inicial de una cuenta. */
export const MontoConCeroSchema = z
  .string()
  .regex(FORMA_DE_MONTO, 'debe ser un monto como "1250" o "-1250.75", con máximo 4 decimales');

/** true si el monto es cero, escrito como sea: "0", "0.00", "00", "000.0000". */
export const esCero = (monto: string): boolean => /^-?0+(\.0{1,4})?$/.test(monto);

/** Un monto positivo. La dirección la da otra cosa, no el signo. */
export const MontoPositivoSchema = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,4})?$/, 'debe ser un monto positivo, como "300" o "300.50"')
  // `esCero` y no un regex propio: "00" y "000.0000" también son cero.
  .refine((valor) => !esCero(valor), { message: 'no puede ser cero' });

/**
 * Un monto que puede ser cero pero nunca negativo. Para un tope de presupuesto
 * de UN mes: cero significa "este mes no aplica" (no pagaré agua este mes).
 */
export const MontoNoNegativoSchema = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,4})?$/, 'debe ser un monto como "300", "300.50" o "0"');

export const MonedaSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'debe ser un código de tres letras en mayúsculas, como COP o USD');

/**
 * Un mes calendario, como "2026-09". El mismo para todo módulo que reciba
 * uno: reportes y presupuesto lo usan igual, y en el repository acaba
 * convertido en fecha de Postgres.
 *
 * La regex en un solo lugar evita lo que ya pasó: una copia sin rango dejaba
 * pasar "0000-01", que una consulta de verdad moría en Postgres (su tipo de
 * fecha no tiene año cero) con un 500.
 *
 * IMPORTANTE sobre el rango (año 2000-2100, mes 01-12): lo impone ESTE
 * schema — Zod en el borde de cada ruta —, no una migración ni una
 * restricción de la base. Si algún día la base lo impusiera, aquí seguiría
 * valiendo para responder 400 (la convención del proyecto: 400
 * VALIDATION_ERROR para validación del borde, 422 solo RULE_VIOLATION del
 * service) antes de tocar Postgres.
 */
export const MesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'debe ser un mes como "2026-09"')
  .refine((mes) => {
    const anio = Number(mes.slice(0, 4));
    return anio >= 2000 && anio <= 2100;
  }, 'El año del mes debe estar entre 2000 y 2100.');

/**
 * Acepta una fecha suelta ("2026-01-31") o un instante completo con zona.
 * Lleva mensaje propio porque, al ser una unión, Zod diría solo "Entrada
 * inválida" y eso no le dice nada a nadie.
 */
export const FechaSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()], {
  error: 'no es una fecha válida. Usa "2026-01-31" o "2026-01-31T14:30:00Z"',
});

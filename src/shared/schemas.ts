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

/** Un monto positivo. La dirección la da otra cosa, no el signo. */
export const MontoPositivoSchema = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,4})?$/, 'debe ser un monto positivo, como "300" o "300.50"')
  .refine((valor) => !/^0(\.0{1,4})?$/.test(valor), { message: 'no puede ser cero' });

export const MonedaSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'debe ser un código de tres letras en mayúsculas, como COP o USD');

/**
 * Acepta una fecha suelta ("2026-01-31") o un instante completo con zona.
 * Lleva mensaje propio porque, al ser una unión, Zod diría solo "Entrada
 * inválida" y eso no le dice nada a nadie.
 */
export const FechaSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()], {
  error: 'no es una fecha válida. Usa "2026-01-31" o "2026-01-31T14:30:00Z"',
});

/** true si el monto es cero, escrito como sea. */
export const esCero = (monto: string): boolean => /^-?0(\.0{1,4})?$/.test(monto);

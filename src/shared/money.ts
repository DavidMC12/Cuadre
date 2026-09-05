/**
 * Aritmetica de dinero exacta.
 *
 * Los montos viven en la base como NUMERIC(19,4) y Drizzle los entrega como
 * texto ("-1250.0000"). Aqui NUNCA se convierten a numero de coma flotante:
 * en coma flotante 0.1 + 0.2 no da 0.3, y en una app de plata eso es
 * inaceptable. Se convierten a enteros grandes (BigInt) en diezmilesimas, se
 * opera con enteros, y se vuelve a texto.
 */

/** Decimales que guarda la base: NUMERIC(19,4). */
export const MONEY_SCALE = 4;

const SCALE_FACTOR = 10n ** BigInt(MONEY_SCALE);

/** NUMERIC(19,4) admite 19 digitos en total, o sea 15 enteros y 4 decimales. */
const MAX_MINOR_UNITS = 10n ** 19n - 1n;

const MONEY_PATTERN = /^-?\d+(\.\d{1,4})?$/;

/** Un monto tal como se guarda y se lee de la base: texto, no numero. */
export type MoneyText = string;

/** Pasa "12.34" a 123400n (diezmilesimas). */
export function toMinorUnits(value: MoneyText): bigint {
  const trimmed = value.trim();

  if (!MONEY_PATTERN.test(trimmed)) {
    throw new RangeError(
      `Monto invalido: "${value}". Se espera algo como "1250" o "-1250.75", con maximo ${MONEY_SCALE} decimales.`,
    );
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  const minor = BigInt(whole) * SCALE_FACTOR + BigInt(fraction.padEnd(MONEY_SCALE, '0'));

  if (minor > MAX_MINOR_UNITS) {
    throw new RangeError(`Monto fuera de rango: "${value}" no cabe en NUMERIC(19,4).`);
  }

  return negative ? -minor : minor;
}

/** Pasa 123400n a "12.3400", el formato que entiende la base. */
export function fromMinorUnits(minor: bigint): MoneyText {
  if (minor > MAX_MINOR_UNITS || minor < -MAX_MINOR_UNITS) {
    throw new RangeError('Monto fuera de rango: no cabe en NUMERIC(19,4).');
  }

  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / SCALE_FACTOR;
  const fraction = (absolute % SCALE_FACTOR).toString().padStart(MONEY_SCALE, '0');

  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Suma exacta. Es la misma cuenta que hace la vista account_balances. */
export function sum(values: readonly MoneyText[]): MoneyText {
  let total = 0n;
  for (const value of values) total += toMinorUnits(value);
  return fromMinorUnits(total);
}

export function add(a: MoneyText, b: MoneyText): MoneyText {
  return fromMinorUnits(toMinorUnits(a) + toMinorUnits(b));
}

/** El monto opuesto. Es lo que lleva una anulacion. */
export function negate(value: MoneyText): MoneyText {
  return fromMinorUnits(-toMinorUnits(value));
}

/** Compara dos montos sin importar como esten escritos: "5" y "5.0000" son iguales. */
export function equals(a: MoneyText, b: MoneyText): boolean {
  return toMinorUnits(a) === toMinorUnits(b);
}

export function isZero(value: MoneyText): boolean {
  return toMinorUnits(value) === 0n;
}

export function isNegative(value: MoneyText): boolean {
  return toMinorUnits(value) < 0n;
}

/** -1 si a < b, 0 si son iguales, 1 si a > b. */
export function compare(a: MoneyText, b: MoneyText): -1 | 0 | 1 {
  const left = toMinorUnits(a);
  const right = toMinorUnits(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

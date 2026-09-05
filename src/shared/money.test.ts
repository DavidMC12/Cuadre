import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  equals,
  fromMinorUnits,
  isNegative,
  isZero,
  negate,
  sum,
  toMinorUnits,
} from './money.js';

describe('conversion de montos', () => {
  it('lee montos con y sin decimales', () => {
    expect(toMinorUnits('0')).toBe(0n);
    expect(toMinorUnits('1')).toBe(10_000n);
    expect(toMinorUnits('12.34')).toBe(123_400n);
    expect(toMinorUnits('12.3456')).toBe(123_456n);
    expect(toMinorUnits('-1250.75')).toBe(-12_507_500n);
  });

  it('escribe siempre con cuatro decimales, como la base', () => {
    expect(fromMinorUnits(0n)).toBe('0.0000');
    expect(fromMinorUnits(123_400n)).toBe('12.3400');
    expect(fromMinorUnits(-12_507_500n)).toBe('-1250.7500');
  });

  it('va y vuelve sin perder nada', () => {
    for (const value of ['0.0001', '-0.0001', '999999999999999.9999', '3210.5678']) {
      expect(fromMinorUnits(toMinorUnits(value))).toBe(
        value.includes('.') ? value.padEnd(value.indexOf('.') + 5, '0') : value,
      );
    }
  });

  it('rechaza lo que no es un monto', () => {
    for (const basura of ['', ' ', 'abc', '1,50', '1.23456', '1e3', '--1', '.5', 'NaN']) {
      expect(() => toMinorUnits(basura)).toThrow(RangeError);
    }
  });

  it('rechaza montos que no caben en NUMERIC(19,4)', () => {
    expect(() => toMinorUnits('1000000000000000')).toThrow(/fuera de rango/);
  });
});

describe('aritmetica exacta', () => {
  it('no arrastra el error de la coma flotante', () => {
    // En coma flotante esto daria 0.30000000000000004.
    expect(add('0.1', '0.2')).toBe('0.3000');
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('suma centavos mil veces sin desviarse', () => {
    const centavos = Array.from({ length: 1000 }, () => '0.01');
    expect(sum(centavos)).toBe('10.0000');
  });

  it('una lista vacia suma cero', () => {
    expect(sum([])).toBe('0.0000');
  });

  it('un monto y su opuesto se cancelan', () => {
    expect(sum(['1250.75', negate('1250.75')])).toBe('0.0000');
    expect(negate('-40')).toBe('40.0000');
    expect(negate('0')).toBe('0.0000');
  });

  it('maneja cifras grandes sin redondear', () => {
    expect(sum(['999999999999999.9998', '0.0001'])).toBe('999999999999999.9999');
  });
});

describe('comparaciones', () => {
  it('ignora como este escrito el monto', () => {
    expect(equals('5', '5.0000')).toBe(true);
    expect(equals('5', '5.0001')).toBe(false);
    expect(equals('-0', '0')).toBe(true);
  });

  it('reconoce el cero y los negativos', () => {
    expect(isZero('0.0000')).toBe(true);
    expect(isZero('-0')).toBe(true);
    expect(isZero('0.0001')).toBe(false);
    expect(isNegative('-0.0001')).toBe(true);
    expect(isNegative('0')).toBe(false);
  });

  it('ordena montos', () => {
    expect(compare('1', '2')).toBe(-1);
    expect(compare('2', '1')).toBe(1);
    expect(compare('2.00', '2')).toBe(0);
    expect(compare('-5', '-10')).toBe(1);
  });
});

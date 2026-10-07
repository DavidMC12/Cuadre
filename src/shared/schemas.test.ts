/** El cero escrito de cualquier forma: lo decide un solo lugar. */
import { describe, expect, it } from 'vitest';
import { esCero, MontoNoNegativoSchema, MontoPositivoSchema } from './schemas.js';

describe('esCero', () => {
  it('reconoce el cero escrito de cualquier manera', () => {
    for (const cero of ['0', '00', '000', '0.0', '0.0000', '00.00', '000.0000', '-0']) {
      expect(esCero(cero), cero).toBe(true);
    }
  });

  it('no confunde un monto con un cero', () => {
    for (const monto of ['1', '10', '0.0001', '00.01', '100', '0.5', '-1']) {
      expect(esCero(monto), monto).toBe(false);
    }
  });
});

describe('MontoPositivoSchema', () => {
  it('rechaza el cero aunque traiga ceros de más', () => {
    for (const cero of ['0', '0.0000', '00', '000.0000', '00.00']) {
      expect(MontoPositivoSchema.safeParse(cero).success, cero).toBe(false);
    }
  });

  it('acepta montos positivos', () => {
    for (const monto of ['1', '300.50', '0.0001', '00.01']) {
      expect(MontoPositivoSchema.safeParse(monto).success, monto).toBe(true);
    }
  });
});

describe('MontoNoNegativoSchema', () => {
  it('acepta el cero y los positivos, nunca un negativo ni basura', () => {
    for (const monto of ['0', '00', '0.0000', '300', '300.50']) {
      expect(MontoNoNegativoSchema.safeParse(monto).success, monto).toBe(true);
    }
    for (const monto of ['-1', '-0', 'abc', '', '1.00001']) {
      expect(MontoNoNegativoSchema.safeParse(monto).success, monto).toBe(false);
    }
  });
});

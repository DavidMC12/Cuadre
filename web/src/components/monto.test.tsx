// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { Monto } from './monto';

afterEach(cleanup);

describe('Monto: signo y color', () => {
  it('con signo "ambos" un positivo es verde y con "+"; un negativo, tinta neutra', () => {
    render(<Monto valor="150000" moneda="COP" signo="ambos" />);
    const positivo = screen.getByText(/150\.000/);
    expect(positivo.textContent).toContain('+');
    expect(positivo.className).toContain('emerald');

    cleanup();
    render(<Monto valor="-150000" moneda="COP" signo="ambos" />);
    const negativo = screen.getByText(/150\.000/);
    expect(negativo.className).not.toContain('emerald');
  });

  it('con signo "neutro" un positivo no lleva "+" ni verde; un negativo sí lleva el menos', () => {
    // El previsto de un presupuesto no es una ganancia: cifra neutra.
    render(<Monto valor="150000" moneda="COP" signo="neutro" />);
    const positivo = screen.getByText(/150\.000/);
    expect(positivo.textContent).not.toContain('+');
    expect(positivo.className).not.toContain('emerald');

    cleanup();
    render(<Monto valor="-150000" moneda="COP" signo="neutro" />);
    const negativo = screen.getByText(/150\.000/);
    expect(negativo.textContent).toContain('−');
    expect(negativo.className).not.toContain('emerald');
  });

  it('un cero no se tiñe ni lleva signo, sea cual sea el modo', () => {
    render(<Monto valor="0" moneda="COP" signo="ambos" />);
    const cero = screen.getByText(/\$0/);
    expect(cero.className).not.toContain('emerald');
    expect(cero.textContent).not.toContain('+');
  });
});

/**
 * Pruebas de render del cuadrito "cuánto me sobra este mes": con las
 * consultas como mocks, los estados que importan son los del dinero —
 * positivo, negativo con palabras, sin presupuesto, fallo y carga.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { CuantoMeSobra } from '@/components/dashboard/cuanto-me-sobra';
import type { ItemDelChecklist, ResumenMes } from '@/lib/api/types';

const useChecklistDelMes = vi.fn();
const useResumenMes = vi.fn();

vi.mock('@/hooks/use-presupuesto', () => ({
  useChecklistDelMes: (...a: unknown[]) => useChecklistDelMes(...a),
}));
vi.mock('@/hooks/use-reportes', () => ({
  useResumenMes: (...a: unknown[]) => useResumenMes(...a),
}));

function ajustar(checklist: Record<string, unknown> = {}, resumen: Record<string, unknown> = {}) {
  const base = {
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
  useChecklistDelMes.mockImplementation(() => ({ ...base, ...checklist }));
  useResumenMes.mockImplementation(() => ({ ...base, ...resumen }));
}

const renglonDe = (
  categoryKind: 'income' | 'expense' | null,
  target: string | null,
): Pick<ItemDelChecklist, 'kind' | 'categoryKind' | 'target'> => ({
  kind: categoryKind === null ? 'savings' : 'category',
  categoryKind,
  target,
});

const resumenDe = (income: string, expense: string): ResumenMes => ({
  month: '2026-10',
  currency: 'COP',
  income,
  expense,
  net: '0',
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Un `Monto` (símbolo + dígitos en spans) cuyo texto completo es `texto`. */
function montoConTexto(texto: string): HTMLElement | null {
  return (
    screen.queryAllByText((_, el) => el?.className?.includes?.('font-mono') ?? false).find(
      (el) => el.textContent === texto,
    ) ?? null
  );
}

describe('CuantoMeSobra', () => {
  it('muestra el previsto como cifra principal y el real hasta hoy debajo', () => {
    ajustar(
      {
        data: {
          month: '2026-10',
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('1000000', '500000') },
    );

    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);

    // El previsto ($1.000.000) manda; el real ($500.000) va debajo; el sentido
    // en palabras.
    expect(montoConTexto('+$1.000.000')).toBeTruthy();
    expect(screen.getByText('Hasta hoy:')).toBeTruthy();
    expect(montoConTexto('+$500.000')).toBeTruthy();
    expect(screen.getByText(/Te sobran/)).toBeTruthy();
  });

  it('cuando el previsto es negativo lo dice con palabras: te faltan, no te sobran', () => {
    ajustar(
      {
        data: {
          month: '2026-10',
          currency: 'COP',
          items: [renglonDe('income', '1000000'), renglonDe('expense', '2500000')],
        },
      },
      { data: resumenDe('1000000', '2500000') },
    );

    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);

    // "Te faltan" con la cifra del faltante, no un "Te sobran" enmascarado.
    expect(screen.getByText(/Te faltan/)).toBeTruthy();
    expect(screen.queryByText(/Te sobran/)).toBeNull();
    expect(montoConTexto('−$1.500.000')).toBeTruthy();
  });

  it('sin presupuesto de ingresos o de gastos: invita a presupuestarlo con enlace, no enseña un cero', () => {
    ajustar(
      { data: { month: '2026-10', currency: 'COP', items: [] } },
      { data: resumenDe('0', '0') },
    );

    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);

    const enlace = screen.getByRole('link', { name: 'Presupuestar' });
    expect(enlace.getAttribute('href')).toBe('/presupuesto');
    expect(screen.queryByText('$0')).toBeNull();
  });

  it('falta solo el lado de gastos: invita a presupuestarlo, no resta contra cero', () => {
    ajustar(
      { data: { month: '2026-10', currency: 'COP', items: [renglonDe('income', '3000000')] } },
      { data: resumenDe('1000000', '0') },
    );

    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);

    expect(screen.getByRole('link', { name: 'Presupuestar' })).toBeTruthy();
    expect(screen.queryByText(/Te sobran/)).toBeNull();
  });

  it('falta solo el lado de ingresos: también invita, con su copia', () => {
    ajustar(
      { data: { month: '2026-10', currency: 'COP', items: [renglonDe('expense', '2000000')] } },
      { data: resumenDe('0', '500000') },
    );

    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);

    expect(screen.getByRole('link', { name: 'Presupuestar' })).toBeTruthy();
    expect(screen.getByText(/ingresos que esperas recibir/)).toBeTruthy();
  });

  it('la variante suelta no mete una tarjeta dentro de otra', () => {
    ajustar(
      {
        data: {
          month: '2026-10',
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('1000000', '500000') },
    );

    const { container } = render(<CuantoMeSobra mes="2026-10" moneda="COP" variante="suelta" />);

    expect(container.querySelector("[data-slot='card']")).toBeNull();
    expect(screen.queryByText('Cuánto me sobra este mes')).toBeNull();
    expect(screen.getByText(/Te sobran/)).toBeTruthy();
  });

  it('un fallo de consulta usa el patrón FalloConsulta y cede el anuncio si otros fallos conviven', () => {
    ajustar({ isError: true, error: new Error('tan dormido') }, { data: resumenDe('0', '0') });

    render(<CuantoMeSobra mes="2026-10" moneda="COP" compartePantalla />);
    expect(screen.getByRole('group')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar presupuesto' })).toBeTruthy();

    cleanup();
    ajustar({ isError: true, error: new Error('tan dormido') }, { data: resumenDe('0', '0') });
    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('mientras carga, esqueleto y nada que enseñe ceros', () => {
    ajustar({ isLoading: true }, { isLoading: true });

    const { container } = render(<CuantoMeSobra mes="2026-10" moneda="COP" />);
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });
});

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

    expect(screen.getByText(/Te sobran/)).toBeTruthy();
    expect(screen.getByText('Hasta hoy:')).toBeTruthy();
  });

  it('cuando el previsto es negativo lo dice con palabras: te faltan, no te sobran', () => {
    ajustar(
      { data: { month: '2026-10', currency: 'COP', items: [renglonDe('expense', '2500000')] } },
      { data: resumenDe('0', '2500000') },
    );

    // Solo quedan gastos previstos: hayGastos, no hayIngresos → vacío... para
    // probar negativo de verdad hacen falta los dos lados.
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
    expect(screen.getByText(/Te faltan/)).toBeTruthy();
  });

  it('sin presupuesto de ingresos o de gastos: invita a presupuestarlo con enlace, no enseña un cero', () => {
    ajustar(
      { data: { month: '2026-10', currency: 'COP', items: [] } },
      { data: resumenDe('0', '0') },
    );

    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);

    const enlace = screen.getByRole('link', { name: 'Presupuestar' });
    expect(enlace.getAttribute('href')).toBe('/presupuesto');
  });

  it('falta solo un lado: también invita, con la copia para presupuestarlo', () => {
    ajustar(
      { data: { month: '2026-10', currency: 'COP', items: [renglonDe('income', '3000000')] } },
      { data: resumenDe('1000000', '0') },
    );

    render(<CuantoMeSobra mes="2026-10" moneda="COP" />);
    expect(screen.getByRole('link', { name: 'Presupuestar' })).toBeTruthy();
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

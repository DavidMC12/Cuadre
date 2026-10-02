/**
 * Pruebas de render del cuadrito "cuánto me sobra este mes": con las
 * consultas como mocks, los estados que importan son los del dinero —
 * positivo, negativo con palabras, falta un lado, vacío, fallo, pausa y
 * carga. El mes mirado decide el texto del real ("Hasta hoy" en el actual,
 * "En el mes" en uno pasado, nada en uno futuro).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { CuantoMeSobra } from '@/components/dashboard/cuanto-me-sobra';
import { mesActual, sumarMeses, etiquetaMes } from '@/lib/fecha';
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
    isPaused: false,
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
  month: mesActual(),
  currency: 'COP',
  income,
  expense,
  net: '0',
});

/** Un `Monto` (símbolo + dígitos en spans) cuyo texto completo es `texto`. */
function montoConTexto(texto: string): HTMLElement | null {
  return (
    screen.queryAllByText((_, el) => el?.className?.includes?.('font-mono') ?? false).find(
      (el) => el.textContent === texto,
    ) ?? null
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CuantoMeSobra', () => {
  it('muestra el previsto como cifra principal y el real del mes debajo, sin verde ni "+"', () => {
    ajustar(
      {
        data: {
          month: mesActual(),
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('1000000', '500000') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    // El previsto va neutro, sin el "+" de una ganancia ni el verde.
    expect(montoConTexto('$1.000.000')).toBeTruthy();
    expect(montoConTexto('+$1.000.000')).toBeNull();
    const previsto = montoConTexto('$1.000.000')!;
    expect(previsto.className).not.toContain('emerald');
    expect(screen.getByText('Hasta hoy:')).toBeTruthy();
    expect(montoConTexto('$500.000')).toBeTruthy();
    expect(screen.getByText(/Te sobran según lo previsto/)).toBeTruthy();
  });

  it('el texto del real cambia con el mes: actual, pasado y futuro', () => {
    const actual = mesActual();
    const pasado = sumarMeses(actual, -2);
    const futuro = sumarMeses(actual, 2);

    // Actual: "Hasta hoy".
    ajustar(
      {
        data: {
          month: actual,
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('1000000', '500000') },
    );
    render(<CuantoMeSobra mes={actual} moneda="COP" />);
    expect(screen.getByText('Hasta hoy:')).toBeTruthy();
    cleanup();

    // Pasado: "En el mes".
    ajustar(
      {
        data: {
          month: pasado,
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('1000000', '500000') },
    );
    render(<CuantoMeSobra mes={pasado} moneda="COP" />);
    expect(screen.getByText('En el mes:')).toBeTruthy();
    cleanup();

    // Futuro: no se muestra el real (no ha pasado nada todavía).
    ajustar(
      {
        data: {
          month: futuro,
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('0', '0') },
    );
    render(<CuantoMeSobra mes={futuro} moneda="COP" />);
    expect(screen.queryByText('Hasta hoy:')).toBeNull();
    expect(screen.queryByText('En el mes:')).toBeNull();
    expect(screen.queryByText('Hasta ahora:')).toBeNull();
    // El previsto sí: es una promesa, no un hecho.
    expect(montoConTexto('$1.000.000')).toBeTruthy();
  });

  it('cuando el previsto es negativo lo dice con palabras: te faltan, no te sobran', () => {
    ajustar(
      {
        data: {
          month: mesActual(),
          currency: 'COP',
          items: [renglonDe('income', '1000000'), renglonDe('expense', '2500000')],
        },
      },
      { data: resumenDe('1000000', '2500000') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    expect(screen.getByText(/Te faltan según lo previsto/)).toBeTruthy();
    expect(screen.queryByText(/Te sobran/)).toBeNull();
    // El negativo sí lleva su menos (signo solo cuando resta).
    expect(montoConTexto('−$1.500.000')).toBeTruthy();
  });

  it('con el previsto en cero no dice ni que sobra ni que falta', () => {
    ajustar(
      {
        data: {
          month: mesActual(),
          currency: 'COP',
          items: [renglonDe('income', '2000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('2000000', '2000000') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    expect(screen.getByText(/Ni te sobra ni te falta según lo previsto/)).toBeTruthy();
    expect(screen.queryByText(/Te sobran/)).toBeNull();
    expect(screen.queryByText(/Te faltan/)).toBeNull();
  });

  it('sin presupuesto pero con movimientos: muestra el real del mes, no lo esconde', () => {
    ajustar(
      { data: { month: mesActual(), currency: 'COP', items: [] } },
      { data: resumenDe('1000000', '500000') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    // Hay movimientos: el real se ve y se invita a presupuestar.
    expect(screen.getByText('Hasta hoy:')).toBeTruthy();
    expect(montoConTexto('$500.000')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Presupuestar' })).toBeTruthy();
    // No se inventa un previsto.
    expect(screen.queryByText(/según lo previsto/)).toBeNull();
  });

  it('movimientos que se compensan (red cero) no son un mes vacío: muestra el real', () => {
    // Sin presupuesto, pero entró tanto como salió: la red es cero y el mes
    // no está vacío.
    ajustar(
      { data: { month: mesActual(), currency: 'COP', items: [] } },
      { data: resumenDe('500000', '500000') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    expect(screen.getByText('Hasta hoy:')).toBeTruthy();
    expect(montoConTexto('$0')).toBeTruthy();
  });

  it('de un solo lado y sin movimientos: no es el vacío total si hay un presupuesto', () => {
    // Solo ingresos presupuestados, sin movimientos: el vacío genérico
    // mentiría — sí hay un presupuesto, falta el otro lado.
    ajustar(
      { data: { month: mesActual(), currency: 'COP', items: [renglonDe('income', '3000000')] } },
      { data: resumenDe('0', '0') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    expect(screen.queryByText(/Aún no hay presupuesto/)).toBeNull();
    expect(screen.getByText(/Presupuesta los gastos que esperas tener/)).toBeTruthy();
  });

  it('totalmente vacío (sin presupuesto ni movimientos): estado vacío, sin cifras', () => {
    ajustar(
      { data: { month: mesActual(), currency: 'COP', items: [] } },
      { data: resumenDe('0', '0') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    const enlace = screen.getByRole('link', { name: 'Presupuestar' });
    expect(enlace.getAttribute('href')).toBe('/presupuesto');
    expect(screen.queryByText('$0')).toBeNull();
    expect(screen.queryByText('Hasta hoy:')).toBeNull();
  });

  it('si falla una consulta y la otra carga, gana el fallo (el esqueleto no lo tapa)', () => {
    ajustar(
      { isError: true, error: new Error('boom') },
      { isLoading: true },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    // El resumen sigue cargando, pero el presupuesto falló: se dice.
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar presupuesto' })).toBeTruthy();
  });

  it('una consulta pausada sin red no deja el cuerpo en blanco', () => {
    ajustar({ isPaused: true }, { isLoading: true });

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    expect(screen.getByText(/Sin conexión/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('una consulta pausada con datos ya en mano sigue mostrando las cifras', () => {
    ajustar(
      {
        isPaused: true,
        data: {
          month: mesActual(),
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { isPaused: true, data: resumenDe('1000000', '500000') },
    );

    render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);

    // El dato viejo no es falso: se muestra, no se cambia por "sin conexión".
    expect(screen.queryByText(/Sin conexión/)).toBeNull();
    expect(montoConTexto('$1.000.000')).toBeTruthy();
  });

  it('la variante suelta no mete una tarjeta dentro de otra', () => {
    ajustar(
      {
        data: {
          month: mesActual(),
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('1000000', '500000') },
    );

    const { container } = render(
      <CuantoMeSobra mes={mesActual()} moneda="COP" variante="suelta" />,
    );

    expect(container.querySelector("[data-slot='card']")).toBeNull();
    expect(screen.queryByText('Cuánto me sobra este mes')).toBeNull();
    expect(screen.getByText(/Te sobran según lo previsto/)).toBeTruthy();
  });

  it('avisa a la pantalla cuando el presupuesto no se pudo leer', () => {
    const avisar = vi.fn();
    ajustar({ isError: true, error: new Error('tan dormido') }, { data: resumenDe('0', '0') });

    render(
      <CuantoMeSobra mes={mesActual()} moneda="COP" onFalloPresupuesto={avisar} />,
    );

    expect(avisar).toHaveBeenCalledWith(true);
  });

  it('un fallo de consulta usa el patrón FalloConsulta y cede el anuncio si otros fallos conviven', () => {
    ajustar({ isError: true, error: new Error('tan dormido') }, { data: resumenDe('0', '0') });

    render(
      <CuantoMeSobra mes={mesActual()} moneda="COP" compartePantalla anunciaPresupuesto={false} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('group')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar presupuesto' })).toBeTruthy();
  });

  it('el mes futuro se anuncia igual: el previsto es una promesa', () => {
    const futuro = sumarMeses(mesActual(), 3);
    ajustar(
      {
        data: {
          month: futuro,
          currency: 'COP',
          items: [renglonDe('income', '3000000'), renglonDe('expense', '2000000')],
        },
      },
      { data: resumenDe('0', '0') },
    );

    render(<CuantoMeSobra mes={futuro} moneda="COP" />);

    expect(screen.getByText(new RegExp(`según lo previsto en ${etiquetaMes(futuro)}`))).toBeTruthy();
  });

  it('mientras carga, esqueleto y nada que enseñe ceros', () => {
    ajustar({ isLoading: true }, { isLoading: true });

    const { container } = render(<CuantoMeSobra mes={mesActual()} moneda="COP" />);
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });
});

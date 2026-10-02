/**
 * Pruebas del formulario de presupuesto, con Testing Library y las consultas
 * como mocks: lo que aquí importa es el componente, no la red.
 *
 * En particular esta batería existe por un error real: un derivado (`seleccionada`)
 * que leía `cuentaId` antes de que el `useState` correspondiente lo declarara
 * crasheaba por zona muerta en el primer render — y era invisible para quien
 * probaba con cuentas vacías porque otros archivos mockean el formulario
 * entero. Montarlo con una cuenta de ahorro disponible es la prueba que lo
 * habría atrapado.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { FormularioItemPresupuesto } from './formulario-item-presupuesto';

vi.mock('@/hooks/use-presupuesto', () => ({
  useCrearItemPresupuesto: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useFijarMontoDelMes: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useEditarEtiquetaItem: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useArchivarItemPresupuesto: vi.fn(() => ({ isPending: false })),
  useDesarchivarItemPresupuesto: vi.fn(() => ({ isPending: false })),
}));

vi.mock('@/hooks/use-perfil', () => ({
  useSoloMirar: () => false,
}));

vi.mock('@/hooks/use-categorias', () => ({
  useCategorias: () => ({
    data: [
      { id: 'cat-1', name: 'Mercado', kind: 'expense', archivedAt: null },
      { id: 'cat-2', name: 'Salario', kind: 'income', archivedAt: null },
    ],
  }),
}));

vi.mock('@/hooks/use-cuentas', () => ({
  useCuentas: () => ({
    data: [{ id: 'cta-1', name: 'Vacaciones', currency: 'COP', isSavings: true, archivedAt: null }],
  }),
}));

describe('FormularioItemPresupuesto', () => {
  afterEach(cleanup);

  const monedaCOP = 'COP';

  it('se monta sin explotar con una cuenta de ahorro en la lista', async () => {
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );

    // Al abrir el cajón se ve el cuerpo del formulario: si algún valor se
    // lee antes de estar declarado, este render tira y la prueba cae aquí.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByLabelText('Monto')).toBeTruthy();
  });

  it('reinicia el monto cuando cambia el mes o la referencia con el cajón montado', () => {
    const item = {
      id: 'item-1',
      kind: 'category' as const,
      currency: monedaCOP,
      categoryId: 'cat-1',
      categoryName: 'Mercado',
      accountId: null,
      accountName: null,
      label: null,
      currentAmount: '30000.0000',
      archivedAt: null,
      categoryKind: 'expense' as const,
    };

    const vista = render(
      <FormularioItemPresupuesto
        item={item}
        moneda={monedaCOP}
        mes="2026-09"
        montoDelMes="30000.0000"
      >
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Monto')).toHaveValue('30.000');

    // El dueño se mueve a otro mes y ese mes ya tiene su propio monto: si el
    // campo sigue con "30.000", un Guardar sin tocar fijaría el monto de
    // septiembre en ese mes — el error que este archivo existe por.
    vista.rerender(
      <FormularioItemPresupuesto
        item={item}
        moneda={monedaCOP}
        mes="2026-10"
        montoDelMes="45000.0000"
      >
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    expect(screen.getByLabelText('Monto')).toHaveValue('45.000');

    // Y si en ese mes el ítem aún no existía (monto nulo), el campo queda
    // vacío en vez de arrastrar la cifra del mes anterior.
    vista.rerender(
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-11" montoDelMes={null}>
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    expect(screen.getByLabelText('Monto')).toHaveValue('');
  });

  it('el campo de monto dice recibir en categoría de ingreso y gastar en la de gasto', () => {
    const base = {
      id: 'item-1',
      kind: 'category' as const,
      currency: monedaCOP,
      accountId: null,
      accountName: null,
      label: null,
      currentAmount: '3000.0000',
      archivedAt: null,
    };

    const vista = render(
      <FormularioItemPresupuesto
        item={{
          ...base,
          kind: 'category',
          categoryId: 'cat-1',
          categoryName: 'Mercado',
          categoryKind: 'expense',
        }}
        moneda={monedaCOP}
      >
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByText('Cuánto esperas gastar.')).toBeTruthy();
    cleanup();

    // Otro render limpio con un ítem de ingresos: el mismo formulario dice
    // recibir. Cambiar el ítem con el cajón montado no es un flujo real de la
    // persona, así que no hay rerender que sostener.
    render(
      <FormularioItemPresupuesto
        item={{
          ...base,
          kind: 'category',
          categoryId: 'cat-2',
          categoryName: 'Salario',
          categoryKind: 'income',
        }}
        moneda={monedaCOP}
      >
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByText('Cuánto esperas recibir.')).toBeTruthy();
  });
});

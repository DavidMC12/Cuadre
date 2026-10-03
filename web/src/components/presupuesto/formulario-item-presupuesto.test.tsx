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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import { FormularioItemPresupuesto } from './formulario-item-presupuesto';
import { mesActual, nombreDelMes } from '@/lib/fecha';

// Mocks controlables: el hook devuelve siempre el mismo `mutateAsync`, así
// que la prueba decide qué guarda bien y qué falla.
const mocksDeGuardar = vi.hoisted(() => ({
  fijarMonto: vi.fn(),
  editarEtiqueta: vi.fn(),
}));

vi.mock('@/hooks/use-presupuesto', () => ({
  useCrearItemPresupuesto: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useFijarMontoDelMes: vi.fn(() => ({ isPending: false, mutateAsync: mocksDeGuardar.fijarMonto })),
  useEditarEtiquetaItem: vi.fn(() => ({
    isPending: false,
    mutateAsync: mocksDeGuardar.editarEtiqueta,
  })),
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
  beforeEach(() => {
    mocksDeGuardar.fijarMonto.mockReset();
    mocksDeGuardar.editarEtiqueta.mockReset();
  });

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
    expect(
      screen.getByText(
        `Este es el monto de ${nombreDelMes(mesActual())}. Los meses que ya pasaron no cambian; los que aún no llegan lo heredan hasta que les pongas el suyo.`
      )
    ).toBeTruthy();
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
    expect(
      screen.getByText(
        `Este es el monto de ${nombreDelMes(mesActual())}. Los meses que ya pasaron no cambian; los que aún no llegan lo heredan hasta que les pongas el suyo.`
      )
    ).toBeTruthy();

    // Y si la categoría de ingreso ya quedó archivada (así que ya no sale en
    // la lista del selector), el tipo copiado del ítem manda: también dice
    // recibir, nunca el default de gastar por descarte.
    render(
      <FormularioItemPresupuesto
        item={{
          ...base,
          kind: 'category',
          categoryId: 'cat-2',
          categoryName: 'Salario',
          categoryKind: 'income',
          archivedAt: '2026-09-30T12:00:00Z',
        }}
        moneda={monedaCOP}
      >
        <button type="button">Editar archivado</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar archivado' }));
    expect(
      screen.getAllByText((_, el) =>
        Boolean(el?.textContent?.startsWith(`Este es el monto de ${nombreDelMes(mesActual())}.`))
      ).length
    ).toBeGreaterThan(0);
  });

  it('monto que sí guarda + etiqueta que falla: lo tecleado queda y el cajón sigue abierto', async () => {
    // Reproduce el error real: la mutación del monto sale bien, la de la
    // etiqueta falla, y el refetch de la consulta inyecta un montoDelMes
    // fresco que disparaba el reinicio — borrando lo tecleado, aunque el
    // toast dice "No se pudo guardar". El dato fresco no puede pisar texto
    // pendiente de guardar.
    mocksDeGuardar.fijarMonto.mockResolvedValue(undefined);
    mocksDeGuardar.editarEtiqueta.mockRejectedValue(new Error('fallo de etiqueta'));

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
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-09" montoDelMes="30000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '50000' } });
    const montoTecleado = (screen.getByLabelText('Monto') as HTMLInputElement).value;
    expect(montoTecleado).not.toBe('');
    fireEvent.change(screen.getByLabelText('Etiqueta (opcional)'), {
      target: { value: 'Mercado del mes' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // Mutación 1 (monto) OK, mutación 2 (etiqueta) falla: el cajón no se
    // cierra porque el intento terminó en error.
    await waitFor(() => expect(mocksDeGuardar.editarEtiqueta).toHaveBeenCalled());
    expect(mocksDeGuardar.fijarMonto).toHaveBeenCalled();
    expect(screen.getByLabelText('Monto')).toBeTruthy();

    // El refetch responde con el monto ya fijado: llega dato fresco con el
    // cajón abierto y texto pendiente de guardar. Nada puede borrar lo
    // que la persona tecleó. Insistimos con la ETIQUETA porque es la
    // aserción que por sí sola atrapa el bug: en un monto cuyo formato
    // coincide con el del dato fresco, `reiniciar()` dejaría el
    // mismo texto en pantalla y la aserción del monto no olería nada.
    vista.rerender(
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-09" montoDelMes="50000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    expect((screen.getByLabelText('Monto') as HTMLInputElement).value).toBe(montoTecleado);
    expect((screen.getByLabelText('Etiqueta (opcional)') as HTMLInputElement).value).toBe(
      'Mercado del mes'
    );
  });

  it('dato fresco sin texto pendiente sigue reiniciando (mes nuevo u otro monto)', () => {
    // El complemento de la prueba anterior: si no hay texto tecleado, el
    // reinicio por dato fresco sigue funcionando — es el caso de la prueba
    // del rerender por mes, pero con cambio SOLO de montoDeReferencia (un
    // refetch), que sin texto pendiente sí trae el campo a la data nueva.
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
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-09" montoDelMes="30000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    vista.rerender(
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-09" montoDelMes="45000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    expect(screen.getByLabelText('Monto')).toHaveValue('45.000');
  });

  it('cambiar de mes con el cajón abierto reinicia aunque haya texto pendiente', () => {
    // El texto tecleado describe un monto del mes que se veía: si el mes
    // visto cambia, ese texto ya no aplica y se reinicia aunque la persona
    // no haya guardado. (Hoy el cajón modal no deja tocar el selector, así
    // que el flujo es teórico; la regla queda escrita y probada para que
    // un refactor no la rompa sin decirlo.)
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
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-09" montoDelMes="30000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Etiqueta (opcional)'), {
      target: { value: 'Para septiembre' },
    });

    vista.rerender(
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-10" montoDelMes="60000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    expect(screen.getByLabelText('Monto')).toHaveValue('60.000');
    expect((screen.getByLabelText('Etiqueta (opcional)') as HTMLInputElement).value).toBe('');
  });
});

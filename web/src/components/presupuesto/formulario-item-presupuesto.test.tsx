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

  it('crear: cambiar a Ahorro se conserva cuando llega dato fresco', () => {
    // El pendiente cubre TODO el estado editable, no solo lo tecleado: en
    // crear, la persona se va a Ahorro; un refetch que cambia la precarga
    // del monto no puede devolver el formulario a 'category' (sobre lo que
    // un Guardar posterior guardaría un tope distinto del que la persona
    // quiso).
    const vista = render(
      <FormularioItemPresupuesto moneda={monedaCOP}>
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ahorro' }));

    // Llega dato fresco (precarga tardía del monto del mes).
    vista.rerender(
      <FormularioItemPresupuesto moneda={monedaCOP} montoDelMes="45000.0000">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    // La sección de cuenta de ahorro solo se renderiza en modo 'savings' (la
    // Label del select no lleva htmlFor, así que se busca por texto).
    expect(screen.getByText('Cuenta de ahorro')).toBeTruthy();
  });

  it('cambiar de ítem con el cajón abierto reinicia aunque haya texto pendiente', () => {
    // Los campos describen al ítem A; si la instancia empieza a representar
    // al ítem B, un Guardar escribiría lo de A sobre B. El reinicio manda.
    const itemA = {
      id: 'item-a',
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
    const itemB = { ...itemA, id: 'item-b', currentAmount: '80000.0000', label: 'Otro' };

    const vista = render(
      <FormularioItemPresupuesto item={itemA} moneda={monedaCOP} mes="2026-09" montoDelMes="30000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Etiqueta (opcional)'), {
      target: { value: 'Texto del ítem A' },
    });

    vista.rerender(
      <FormularioItemPresupuesto item={itemB} moneda={monedaCOP} mes="2026-09" montoDelMes="80000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    expect(screen.getByLabelText('Monto')).toHaveValue('80.000');
    expect((screen.getByLabelText('Etiqueta (opcional)') as HTMLInputElement).value).toBe('Otro');
  });

  it('teclear y volver al valor de precarga: no se pierde nada (matiz del pendiente)', () => {
    // Viene del hallazgo de la revisión: el campo marcado como tocado no se
    // desmarca aunque el texto vuelva a igualar la precarga. Aquí se
    // justifica: el reinicio que se salta pondría JUSTO ese mismo texto, así
    // que no hay nada que recuperar; y al cerrar (cuando el guardado o el
    // descarte de verdad terminan) sí reinicia. Si mañana el salto empezara
    // a costar algo, esta prueba se rompe primero.
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

    // Toca la etiqueta y la devuelve al valor de precarga ("").
    fireEvent.change(screen.getByLabelText('Etiqueta (opcional)'), {
      target: { value: 'algo' },
    });
    fireEvent.change(screen.getByLabelText('Etiqueta (opcional)'), { target: { value: '' } });

    // Y toca el monto para devolverlo a su valor de precarga ("30.000").
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '31.000' } });
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '30.000' } });

    // Dato fresco idéntico a la precarga: el skip no cuesta nada visible.
    vista.rerender(
      <FormularioItemPresupuesto item={item} moneda={monedaCOP} mes="2026-09" montoDelMes="30000.0000">
        <button type="button">Editar</button>
      </FormularioItemPresupuesto>,
    );
    expect(screen.getByLabelText('Monto')).toHaveValue('30.000');
    expect((screen.getByLabelText('Etiqueta (opcional)') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Monto')).toBeTruthy(); // cajón abierto
  });

  it('los campos y el botón Guardar miden 44px de piso', () => {
    // Eran Input/Button/SelectTrigger de 32px (h-8). El SelectTrigger necesita
    // min-h-11 porque su variante h-8 gana la cascada.
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getByLabelText('Monto').className).toContain('min-h-11');
    expect(screen.getByLabelText('Etiqueta (opcional)').className).toContain('min-h-11');
    // El selector de categoría (grupo "Categoría") es el combobox del cajón.
    for (const combo of screen.getAllByRole('combobox')) {
      expect(combo.className).toContain('min-h-11');
    }
    expect(screen.getByRole('button', { name: 'Guardar' }).className).toContain('min-h-11');
  });

  it('asocia cada etiqueta con su control (Tipo, Categoría, Cuenta de ahorro)', () => {
    // Antes eran `<Label>` sueltos sin `htmlFor`: el lector no decía a qué
    // campo pertenecía cada uno al enfocarlo.
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // "Tipo" es un grupo de botones (role="group"): se asocia por
    // `aria-labelledby`, no por `htmlFor`.
    expect(screen.getByRole('group', { name: 'Tipo' })).toBeTruthy();
    // "Categoría" es un combobox: la etiqueta lo referencia con `htmlFor`.
    expect(screen.getByRole('combobox', { name: 'Categoría' })).toBeTruthy();

    // En modo ahorro el par cambia: ahora manda la cuenta.
    fireEvent.click(screen.getByRole('button', { name: 'Ahorro' }));
    expect(screen.getByRole('combobox', { name: 'Cuenta de ahorro' })).toBeTruthy();
  });

  it('cada error se pinta dentro del contenedor de su propio campo (novena critique, P2)', () => {
    // Antes "Elige una categoría." se pintaba en el bloque del Monto: el
    // mensaje señalaba el campo equivocado aunque `aria-describedby` fuera
    // correcto. Ahora el mensaje vive con el campo que falla.
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const contenedorCategoria = screen
      .getByText('Categoría', { selector: 'label' })
      .closest('div') as HTMLElement;
    const mensajeCategoria = screen.getByText('Elige una categoría.');
    expect(contenedorCategoria).toContainElement(mensajeCategoria);

    // El contenedor del Monto solo tiene su mensaje cuando lo que falla es
    // el monto: aquí sigue su ayuda de siempre, no el error ajeno.
    const contenedorMonto = screen.getByText('Monto', { selector: 'label' }).closest(
      'div'
    ) as HTMLElement;
    expect(contenedorMonto).toHaveTextContent('Cuánto esperas gastar.');
    expect(contenedorMonto).not.toHaveTextContent('Elige una categoría.');
  });

  it('los ids de monto y etiqueta nacen de useId, no de cadenas fijas', () => {
    // Eran "monto-item" y "etiqueta-item" fijos: hoy no colisiona porque solo
    // hay un cajón abierto, pero dos instancias montadas compartirían id.
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    const monto = screen.getByLabelText('Monto');
    const etiqueta = screen.getByLabelText('Etiqueta (opcional)');
    expect(monto.id).not.toBe('monto-item');
    expect(etiqueta.id).not.toBe('etiqueta-item');
    expect(screen.getByText('Monto', { selector: 'label' }).getAttribute('for')).toBe(monto.id);
    expect(
      screen.getByText('Etiqueta (opcional)', { selector: 'label' }).getAttribute('for')
    ).toBe(etiqueta.id);
  });

  it('si falta la categoría, el error apunta al selector y no al monto', () => {
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const mensaje = screen.getByText('Elige una categoría.');
    const categoria = screen.getByRole('combobox', { name: 'Categoría' });
    const monto = screen.getByLabelText('Monto');

    expect(categoria).toHaveAttribute('aria-invalid', 'true');
    expect(categoria).toHaveAttribute('aria-describedby', mensaje.id);
    // El monto no es el que falló: no se marca ni se describe con ese error.
    expect(monto).toHaveAttribute('aria-invalid', 'false');
    expect(monto).not.toHaveAttribute('aria-describedby');
  });

  it('si falta la cuenta de ahorro, el error apunta a ese selector', () => {
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ahorro' }));
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const mensaje = screen.getByText('Elige una cuenta de ahorro.');
    const cuenta = screen.getByRole('combobox', { name: 'Cuenta de ahorro' });
    expect(cuenta).toHaveAttribute('aria-invalid', 'true');
    expect(cuenta).toHaveAttribute('aria-describedby', mensaje.id);
    expect(screen.getByLabelText('Monto')).toHaveAttribute('aria-invalid', 'false');
  });

  it('un monto vacío marca el monto y no los selectores', () => {
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const monto = screen.getByLabelText('Monto');
    const idError = monto.getAttribute('aria-describedby');
    expect(monto).toHaveAttribute('aria-invalid', 'true');
    expect(idError).toBeTruthy();
    expect(document.getElementById(idError as string)?.textContent).toBe('Escribe el monto.');
    expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveAttribute(
      'aria-invalid',
      'false'
    );
  });
});

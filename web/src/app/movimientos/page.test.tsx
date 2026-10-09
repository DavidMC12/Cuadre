// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaMovimientos from "./page";
import * as useMovimientosModule from "@/hooks/use-movimientos";
import * as useCuentasModule from "@/hooks/use-cuentas";
import * as useCategoriasModule from "@/hooks/use-categorias";
import type { Cuenta, Movimiento } from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => searchParams.url,
}));

const { anularMutate, anularPagoMutate } = vi.hoisted(() => ({
  anularMutate: vi.fn(),
  anularPagoMutate: vi.fn(),
}));
const { searchParams, CATEGORIA_FILTRO } = vi.hoisted(() => ({
  searchParams: { url: new URLSearchParams() },
  // El filtro de la URL exige un UUID válido; una invención lo descarta.
  CATEGORIA_FILTRO: "11111111-1111-4111-8111-111111111111",
}));

vi.mock("@/hooks/use-movimientos", () => ({
  useMovimientos: vi.fn(),
  useAnularMovimiento: () => ({ isPending: false, mutate: anularMutate }),
  useAnularPagoDividido: () => ({ isPending: false, mutate: anularPagoMutate }),
}));

vi.mock("@/hooks/use-cuentas", () => ({ useCuentas: vi.fn() }));
vi.mock("@/hooks/use-categorias", () => ({ useCategorias: vi.fn() }));

vi.mock("@/components/dashboard/selector-mes", () => ({ SelectorMes: () => null }));
vi.mock("@/components/movimientos/formulario-movimiento", () => ({
  // La prueba del flujo de corrección necesita ver con qué abre el formulario
  // —valores y cabecera—; las demás solo usan los `children` del estado vacío.
  FormularioMovimiento: ({
    children,
    cuentas,
    valoresIniciales,
    pagoDivididoInicial,
    tituloCabecera,
    descripcionCabecera,
  }: {
    children?: React.ReactNode;
    cuentas?: Cuenta[];
    valoresIniciales?: Record<string, unknown>;
    pagoDivididoInicial?: Record<string, unknown>;
    tituloCabecera?: string;
    descripcionCabecera?: string;
  }) => (
    <div>
      {valoresIniciales ? (
        <pre data-testid="valores-iniciales">{JSON.stringify(valoresIniciales)}</pre>
      ) : null}
      {valoresIniciales ? (
        <pre data-testid="cabecera-correccion">
          {JSON.stringify({ tituloCabecera, descripcionCabecera })}
        </pre>
      ) : null}
      {/* Con qué cuentas abre la corrección: es lo que decide si el selector
          conserva la cuenta original o cae a otra. */}
      {valoresIniciales ? (
        <pre data-testid="cuentas-correccion">
          {JSON.stringify((cuentas ?? []).map((cuenta) => cuenta.id))}
        </pre>
      ) : null}
      {/* El reparto con el que abre una compra dividida al corregirse. */}
      {pagoDivididoInicial ? (
        <pre data-testid="pago-dividido-inicial">{JSON.stringify(pagoDivididoInicial)}</pre>
      ) : null}
      {children}
    </div>
  ),
}));
vi.mock("@/components/movimientos/movimiento-item", () => ({
  MovimientoItem: ({
    movimiento,
    onSolicitarAnular,
  }: {
    movimiento: Movimiento;
    onSolicitarAnular: (movimiento: Movimiento) => void;
  }) => (
    <li>
      <span>movimiento</span>
      <button type="button" onClick={() => onSolicitarAnular(movimiento)}>
        anular-fila
      </button>
    </li>
  ),
}));
vi.mock("@/components/movimientos/transferencia-item", () => ({
  TransferenciaItem: () => <li>transferencia</li>,
}));
vi.mock("@/components/movimientos/compra-dividida-item", () => ({
  CompraDivididaItem: ({
    compra,
    onSolicitarAnular,
  }: {
    compra: { partes: [Movimiento, Movimiento] };
    onSolicitarAnular: (parte: Movimiento) => void;
  }) => (
    <li>
      <span>compra-dividida</span>
      <button type="button" onClick={() => onSolicitarAnular(compra.partes[0])}>
        anular-compra
      </button>
    </li>
  ),
}));
vi.mock("@/components/movimientos/confirmar-anulacion", () => ({
  ConfirmarAnulacion: ({
    movimiento,
    partesDeLaCompra,
    onConfirmar,
  }: {
    movimiento: Movimiento | null;
    partesDeLaCompra?: readonly Movimiento[];
    onConfirmar: () => void;
  }) =>
    movimiento ? (
      <>
        <span data-testid="partes-de-la-compra">{partesDeLaCompra?.length ?? "ninguna"}</span>
        <button type="button" onClick={onConfirmar}>
          confirmar-anulacion
        </button>
      </>
    ) : null,
}));

interface Stub {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  isPaused?: boolean;
  error?: unknown;
  isFetching?: boolean;
  refetch?: () => void;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

function ajustar(stub: Stub = {}, cuentas: Cuenta[] = []) {
  vi.mocked(useMovimientosModule.useMovimientos).mockImplementation(
    () =>
      ({
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
        ...stub,
      }) as never
  );
  vi.mocked(useCuentasModule.useCuentas).mockImplementation(
    () => ({ isLoading: false, refetch: vi.fn(), data: cuentas }) as never
  );
  vi.mocked(useCategoriasModule.useCategorias).mockImplementation(
    () => ({ isLoading: false, refetch: vi.fn(), data: [] }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ajustar({ data: [] });
});

afterEach(cleanup);

describe("Movimientos: un fallo de red no es un mes en blanco", () => {
  it("si la consulta falla, muestra el error y Reintentar — no un estado vacío que mienta", () => {
    const recargar = vi.fn();
    ajustar({ data: undefined, isError: true, error: new Error("boom"), refetch: recargar });

    render(<PaginaMovimientos />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar tus movimientos. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    // El historial se quedaba mudo y se leía como "no se movió nada este mes".
    expect(screen.queryByText("Todavía no hay movimientos")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin movimientos en /)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("si un refetch o un 'Cargar más' fracasa con el historial ya en pantalla, el error no borra los datos", () => {
    const comprobante: Movimiento = {
      id: "m-1",
      accountId: "a-1",
      categoryId: null,
      kind: "standard",
      amount: "-12500",
      currency: "COP",
      occurredAt: "2026-09-10T12:00:00Z",
      description: null,
      transferGroupId: null,
      budgetItemId: null,
      paymentGroupId: null,
      reversesTransactionId: null,
      reversedByTransactionId: null,
    };
    ajustar({
      data: [comprobante],
      isError: true,
      error: new Error("boom"),
    });

    render(<PaginaMovimientos />);

    // El renglón que ya tenía el libro sigue en su sitio.
    expect(screen.getByText("movimiento")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("de verdad sin movimientos muestra el estado vacío de siempre, sin Reintentar", () => {
    render(<PaginaMovimientos />);

    expect(screen.getByText("Todavía no hay movimientos")).toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("mientras carga muestra esqueletos", () => {
    ajustar({ data: undefined, isLoading: true });

    render(<PaginaMovimientos />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("una consulta pausada sin red no se disfraza de mes en blanco", () => {
    ajustar({ data: undefined, isPaused: true });

    render(<PaginaMovimientos />);

    // Falla si la pantalla vuelve a mostrar "Todavía no hay movimientos" o
    // "Sin movimientos en ..." con la consulta pausada.
    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar tus movimientos. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay movimientos")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin movimientos en /)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("al confirmar la anulación abre el formulario precargado con el movimiento anulado", () => {
    const comprobante: Movimiento = {
      id: "m-9",
      accountId: "a-7",
      categoryId: "c-3",
      kind: "standard",
      amount: "-12500.0000",
      currency: "COP",
      occurredAt: "2026-09-10T12:00:00Z",
      description: "Mercado",
      transferGroupId: null,
      budgetItemId: null,
      paymentGroupId: null,
      reversesTransactionId: null,
      reversedByTransactionId: null,
    };
    // La mutación no pega contra un servidor: aquí se simula el éxito para ver
    // lo que pasa DESPUÉS de anular.
    anularMutate.mockImplementation(
      (_id: string, opciones: { onSuccess?: () => void }) => opciones.onSuccess?.()
    );
    ajustar({ data: [comprobante] });

    render(<PaginaMovimientos />);

    fireEvent.click(screen.getByRole("button", { name: "anular-fila" }));
    fireEvent.click(screen.getByRole("button", { name: "confirmar-anulacion" }));

    expect(anularMutate).toHaveBeenCalledWith("m-9", expect.anything());

    // Corregir es ajustar lo que estaba mal, no volver a escribir todo: el
    // formulario abre con los mismos datos del movimiento anulado.
    const valores = JSON.parse(screen.getByTestId("valores-iniciales").textContent ?? "{}");
    expect(valores).toEqual({
      monto: "12.500",
      cuentaId: "a-7",
      categoriaId: "c-3",
      itemDelPresupuesto: null,
      fecha: "2026-09-10",
      descripcion: "Mercado",
      tipo: "gasto",
    });

    // Y con la cabecera de corrección: es la que le dice a la vista en qué
    // paso está (el formulario la muestra visible, no solo de oído).
    const cabecera = JSON.parse(
      screen.getByTestId("cabecera-correccion").textContent ?? "{}"
    );
    expect(cabecera).toEqual({
      tituloCabecera: "Corregir movimiento",
      descripcionCabecera: "Registra el movimiento correcto: el original ya quedó anulado.",
    });
  });

  describe("una compra pagada con dos cuentas", () => {
    function parte(id: string, cuenta: string, descripcion: string): Movimiento {
      return {
        id,
        accountId: cuenta,
        categoryId: "c-3",
        budgetItemId: null,
        paymentGroupId: "g-1",
        kind: "standard",
        amount: "-100000.0000",
        currency: "COP",
        occurredAt: "2026-09-10T12:00:00Z",
        description: descripcion,
        transferGroupId: null,
        reversesTransactionId: null,
        reversedByTransactionId: null,
      };
    }

    /** Una anulación como la que responde el servidor al anular la compra:
     * monto negado, prefijo "Anulación de: " y a quién anula. */
    function anulacion(
      id: string,
      anula: string,
      cuenta: string,
      descripcion: string
    ): Movimiento {
      return {
        id,
        accountId: cuenta,
        categoryId: "c-3",
        budgetItemId: null,
        paymentGroupId: "g-anul",
        kind: "standard",
        amount: "100000.0000",
        currency: "COP",
        occurredAt: "2026-09-10T12:00:00Z",
        description: descripcion,
        transferGroupId: null,
        reversesTransactionId: anula,
        reversedByTransactionId: null,
      };
    }

    function responderAnulacion() {
      anularPagoMutate.mockImplementation(
        (_grupo: string, opciones: { onSuccess?: (r: unknown) => void }) =>
          opciones.onSuccess?.({
            data: {
              paymentGroupId: "g-anul",
              legs: [
                anulacion("r1", "p1", "a-1", "Anulación de: Mercado (1 de 2)"),
                anulacion("r2", "p2", "a-2", "Anulación de: Mercado (2 de 2)"),
              ],
            },
          })
      );
    }

    it("las dos partes salen en UNA sola fila, no en dos gastos sueltos", () => {
      ajustar({ data: [parte("p1", "a-1", "Mercado (1 de 2)"), parte("p2", "a-2", "Mercado (2 de 2)")] });

      render(<PaginaMovimientos />);

      expect(screen.getAllByText("compra-dividida")).toHaveLength(1);
      expect(screen.queryByText("movimiento")).not.toBeInTheDocument();
    });

    it("anularla manda anular la compra COMPLETA (el grupo), nunca una parte, y abre 'corregir' ya en dos cuentas", () => {
      responderAnulacion();
      ajustar({ data: [parte("p1", "a-1", "Mercado (1 de 2)"), parte("p2", "a-2", "Mercado (2 de 2)")] });

      render(<PaginaMovimientos />);
      fireEvent.click(screen.getByRole("button", { name: "anular-compra" }));
      fireEvent.click(screen.getByRole("button", { name: "confirmar-anulacion" }));

      expect(anularPagoMutate).toHaveBeenCalledWith("g-1", expect.anything());
      expect(anularMutate).not.toHaveBeenCalled();

      // Corregir una compra es anularla y volver a registrarla bien: el
      // formulario abre con el total, la categoría, la fecha y la descripción
      // base SIN la marca "(1 de 2)"/"(2 de 2)".
      const valores = JSON.parse(screen.getByTestId("valores-iniciales").textContent ?? "{}");
      expect(valores).toEqual({
        monto: "200.000",
        cuentaId: "a-1",
        categoriaId: "c-3",
        itemDelPresupuesto: null,
        fecha: "2026-09-10",
        descripcion: "Mercado",
        tipo: "gasto",
      });

      // Y ya repartido entre las dos cuentas, con lo que tenía cada una.
      const reparto = JSON.parse(
        screen.getByTestId("pago-dividido-inicial").textContent ?? "{}"
      );
      expect(reparto).toEqual({
        cuenta1Id: "a-1",
        cuenta2Id: "a-2",
        texto1: "100.000",
        texto2: "100.000",
      });

      const cabecera = JSON.parse(
        screen.getByTestId("cabecera-correccion").textContent ?? "{}"
      );
      expect(cabecera.tituloCabecera).toBe("Corregir compra");
      expect(cabecera.descripcionCabecera).not.toContain("movimiento");
    });

    it("el diálogo recibe las dos partes cuando la lista las trae, y una sola cuando solo llega una", () => {
      ajustar({ data: [parte("p1", "a-1", "Mercado (1 de 2)"), parte("p2", "a-2", "Mercado (2 de 2)")] });
      const completa = render(<PaginaMovimientos />);
      fireEvent.click(screen.getByRole("button", { name: "anular-compra" }));
      expect(screen.getByTestId("partes-de-la-compra")).toHaveTextContent("2");
      completa.unmount();

      ajustar({ data: [parte("p1", "a-1", "Mercado (1 de 2)")] });
      render(<PaginaMovimientos />);
      fireEvent.click(screen.getByRole("button", { name: "anular-fila" }));
      expect(screen.getByTestId("partes-de-la-compra")).toHaveTextContent("1");
    });

    it("una parte suelta (filtro por cuenta) también anula la compra completa", () => {
      anularPagoMutate.mockImplementation(
        (_grupo: string, opciones: { onSuccess?: () => void }) => opciones.onSuccess?.()
      );
      // Solo llega una de las dos partes: se muestra como movimiento normal.
      ajustar({ data: [parte("p1", "a-1", "Mercado (1 de 2)")] });

      render(<PaginaMovimientos />);
      fireEvent.click(screen.getByRole("button", { name: "anular-fila" }));
      fireEvent.click(screen.getByRole("button", { name: "confirmar-anulacion" }));

      expect(anularPagoMutate).toHaveBeenCalledWith("g-1", expect.anything());
      expect(anularMutate).not.toHaveBeenCalled();
    });
  });

  const cuentaActiva: Cuenta = {
    id: "a-activa",
    name: "Efectivo",
    type: "cash",
    currency: "COP",
    balance: "0",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
      isSavings: false,
    saved: "0.0000",
    creditLimit: null,
    linkedAccountId: null,
  };

  const cuentaArchivada: Cuenta = {
    ...cuentaActiva,
    id: "a-vieja",
    name: "Cuenta vieja",
    archivedAt: "2026-01-01T00:00:00Z",
  };

  function comprobanteEnCuenta(accountId: string): Movimiento {
    return {
      id: "m-arch",
      accountId,
      categoryId: null,
      kind: "standard",
      amount: "-12500.0000",
      currency: "COP",
      occurredAt: "2026-09-10T12:00:00Z",
      description: null,
      transferGroupId: null,
      budgetItemId: null,
      paymentGroupId: null,
      reversesTransactionId: null,
      reversedByTransactionId: null,
    };
  }

  it("al corregir en una cuenta archivada, el formulario recibe esa cuenta (no cae a otra)", () => {
    anularMutate.mockImplementation(
      (_id: string, opciones: { onSuccess?: () => void }) => opciones.onSuccess?.()
    );
    // `useCuentas(true)` trae activas y archivadas juntas; la pantalla debe
    // inyectar la original archivada en la lista de la corrección.
    ajustar({ data: [comprobanteEnCuenta("a-vieja")] }, [cuentaActiva, cuentaArchivada]);

    render(<PaginaMovimientos />);

    // La pantalla tiene que pedir las archivadas: si vuelve a `useCuentas()`
    // (solo activas), la cuenta original nunca llega al formulario.
    expect(useCuentasModule.useCuentas).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "anular-fila" }));
    fireEvent.click(screen.getByRole("button", { name: "confirmar-anulacion" }));

    const cuentasDelFormulario = JSON.parse(
      screen.getByTestId("cuentas-correccion").textContent ?? "[]"
    );
    expect(cuentasDelFormulario).toContain("a-vieja");
  });

  it("al corregir en una cuenta activa, no se cuelan las archivadas en el selector", () => {
    anularMutate.mockImplementation(
      (_id: string, opciones: { onSuccess?: () => void }) => opciones.onSuccess?.()
    );
    ajustar({ data: [comprobanteEnCuenta("a-activa")] }, [cuentaActiva, cuentaArchivada]);

    render(<PaginaMovimientos />);
    fireEvent.click(screen.getByRole("button", { name: "anular-fila" }));
    fireEvent.click(screen.getByRole("button", { name: "confirmar-anulacion" }));

    const cuentasDelFormulario = JSON.parse(
      screen.getByTestId("cuentas-correccion").textContent ?? "[]"
    );
    expect(cuentasDelFormulario).toContain("a-activa");
    expect(cuentasDelFormulario).not.toContain("a-vieja");
  });
});

describe("Movimientos: piso de toque de 44px", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // El searchParam es el mismo objeto hoisted para todo el archivo: sin
    // esta línea, el filtro activo de una prueba se cuela en la otra.
    searchParams.url = new URLSearchParams();
    ajustar({ data: [] });
  });
  afterEach(cleanup);

  it('el botón "Quitar filtro" del estado vacío lleva el piso de toque', () => {
    // Séptima critique: era size="sm" (28px) dentro del EmptyState. El
    // estado vacío con filtro necesita la categoría activa existente.
    searchParams.url = new URLSearchParams(`categoria=${CATEGORIA_FILTRO}`);
    vi.mocked(useCategoriasModule.useCategorias).mockReturnValue({
      isLoading: false,
      refetch: vi.fn(),
      data: [{ id: CATEGORIA_FILTRO, name: "Mercado", kind: "expense", archivedAt: null }],
    } as never);
    render(<PaginaMovimientos />);

    expect(screen.getByRole("button", { name: "Quitar filtro" }).className).toContain(
      "min-h-11"
    );
  });

  it('el botón "Registrar movimiento" del pie lleva el piso de toque', () => {
    // Con cuentas el mes vacío muestra el cajón con su botón Registrar.
    const [cuenta] = [
      {
        id: "cta-1",
        name: "Bancolombia",
        type: "bank",
        currency: "COP",
        balance: "1000000",
        movementCount: 0,
        lastMovementAt: null,
        archivedAt: null,
          isSavings: false,
        saved: "0.0000",
        creditLimit: null,
        linkedAccountId: null,
      } as unknown as Cuenta,
    ];
    ajustar({ data: [] }, [cuenta]);
    render(<PaginaMovimientos />);

    const registrar = screen.getByRole("button", { name: /Registrar movimiento/ });
    expect(registrar.className).toContain("min-h-11");
    expect(registrar.className).toContain("mt-1");
  });

  it("los selectores de filtro de cuenta y categoría llevan el piso de toque", () => {
    ajustar({ data: [] }, [
      {
        id: "cta-1",
        name: "Bancolombia",
        type: "bank",
        currency: "COP",
        balance: "1000000",
        movementCount: 0,
        lastMovementAt: null,
        archivedAt: null,
          isSavings: false,
        saved: "0.0000",
        creditLimit: null,
        linkedAccountId: null,
      } as unknown as Cuenta,
    ]);
    vi.mocked(useCategoriasModule.useCategorias).mockReturnValue({
      isLoading: false,
      refetch: vi.fn(),
      data: [{ id: "c-1", name: "Mercado", kind: "expense", archivedAt: null }],
    } as never);
    render(<PaginaMovimientos />);

    // La variante data-[size=default]:h-8 del SelectTrigger gana la cascada:
    // una altura que compita no sirve; min-h-11 va por otra propiedad.
    expect(screen.getByRole("combobox", { name: "Filtrar por cuenta" }).className).toContain(
      "min-h-11"
    );
    expect(
      screen.getByRole("combobox", { name: "Filtrar por categoría" }).className
    ).toContain("min-h-11");
  });

  it('el botón "Cargar más" lleva el piso de toque', () => {
    // El botón solo aparece con el historial ya en pantalla.
    const comprobante: Movimiento = {
      id: "m-1",
      accountId: "a-1",
      categoryId: null,
      kind: "standard",
      amount: "-12500",
      currency: "COP",
      occurredAt: "2026-09-10T12:00:00Z",
      description: null,
      transferGroupId: null,
      budgetItemId: null,
      paymentGroupId: null,
      reversesTransactionId: null,
      reversedByTransactionId: null,
    };
    ajustar({ data: [comprobante], hasNextPage: true, isFetchingNextPage: false });
    render(<PaginaMovimientos />);

    expect(screen.getByRole("button", { name: "Cargar más" }).className).toContain(
      "min-h-11"
    );
  });
});

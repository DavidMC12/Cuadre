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

const { anularMutate } = vi.hoisted(() => ({ anularMutate: vi.fn() }));
const { searchParams, CATEGORIA_FILTRO } = vi.hoisted(() => ({
  searchParams: { url: new URLSearchParams() },
  // El filtro de la URL exige un UUID válido; una invención lo descarta.
  CATEGORIA_FILTRO: "11111111-1111-4111-8111-111111111111",
}));

vi.mock("@/hooks/use-movimientos", () => ({
  useMovimientos: vi.fn(),
  useAnularMovimiento: () => ({ isPending: false, mutate: anularMutate }),
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
    tituloCabecera,
    descripcionCabecera,
  }: {
    children?: React.ReactNode;
    cuentas?: Cuenta[];
    valoresIniciales?: Record<string, unknown>;
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
vi.mock("@/components/movimientos/confirmar-anulacion", () => ({
  ConfirmarAnulacion: ({
    movimiento,
    onConfirmar,
  }: {
    movimiento: Movimiento | null;
    onConfirmar: () => void;
  }) =>
    movimiento ? (
      <button type="button" onClick={onConfirmar}>
        confirmar-anulacion
      </button>
    ) : null,
}));

interface Stub {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
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
        "No pudimos cargar tus movimientos. Puede ser que el servidor esté dormido."
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
});

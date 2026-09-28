// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaMovimientos from "./page";
import * as useMovimientosModule from "@/hooks/use-movimientos";
import * as useCuentasModule from "@/hooks/use-cuentas";
import * as useCategoriasModule from "@/hooks/use-categorias";
import type { Movimiento } from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-movimientos", () => ({
  useMovimientos: vi.fn(),
  useAnularMovimiento: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-cuentas", () => ({ useCuentas: vi.fn() }));
vi.mock("@/hooks/use-categorias", () => ({ useCategorias: vi.fn() }));

vi.mock("@/components/dashboard/selector-mes", () => ({ SelectorMes: () => null }));
vi.mock("@/components/movimientos/formulario-movimiento", () => ({
  FormularioMovimiento: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/movimientos/movimiento-item", () => ({
  MovimientoItem: () => <li>movimiento</li>,
}));
vi.mock("@/components/movimientos/transferencia-item", () => ({
  TransferenciaItem: () => <li>transferencia</li>,
}));
vi.mock("@/components/movimientos/confirmar-anulacion", () => ({
  ConfirmarAnulacion: () => null,
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

function ajustar(stub: Stub = {}) {
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
    () => ({ isLoading: false, refetch: vi.fn(), data: [] }) as never
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
});

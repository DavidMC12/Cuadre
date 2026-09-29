// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaCuentas from "./page";
import * as useCuentasModule from "@/hooks/use-cuentas";
import type { Cuenta } from "@/lib/api/types";

vi.mock("@/hooks/use-cuentas", () => ({ useCuentas: vi.fn() }));

// Los cajones y las tarjetas no son lo que se prueba aquí: importa que un
// fallo de consulta no se disfrace de "no tienes cuentas".
vi.mock("@/components/cuentas/formulario-cuenta", () => ({
  FormularioCuenta: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/cuentas/cuenta-card", () => ({
  CuentaCard: ({ cuenta }: { cuenta: Cuenta }) => <div>{cuenta.name}</div>,
}));

interface Stub {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  isFetching?: boolean;
  refetch?: () => void;
}

function ajustar(stub: Stub = {}) {
  vi.mocked(useCuentasModule.useCuentas).mockImplementation(
    () =>
      ({
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        ...stub,
      }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ajustar({});
});

afterEach(cleanup);

const bancolombia: Cuenta = {
  id: "a-1",
  name: "Bancolombia",
  type: "bank",
  currency: "COP",
  balance: "1234567",
  isSavings: false,
  archivedAt: null,
} as Cuenta;

describe("Cuentas: un fallo de red no es 'todavía no tienes cuentas'", () => {
  it("si la consulta falla, muestra error y Reintentar en vez de dejar el cuerpo en blanco", () => {
    const recargar = vi.fn();
    ajustar({ data: undefined, isError: true, error: new Error("boom"), refetch: recargar });

    render(<PaginaCuentas />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("No pudimos cargar tus cuentas. Puede ser que el servidor esté dormido.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar cuentas" })).toBeInTheDocument();
    // Antes, el fallo dejaba solo el h1 y el botón "Nueva": nada que explicara.
    expect(screen.queryByText("Todavía no tienes cuentas")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar cuentas" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("de verdad sin cuentas muestra el vacío de siempre, sin Reintentar", () => {
    ajustar({ data: [] });

    render(<PaginaCuentas />);

    expect(screen.getByText("Todavía no tienes cuentas")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("con cuentas cargadas muestra las tarjetas, sin error", () => {
    ajustar({ data: [bancolombia] });

    render(<PaginaCuentas />);

    expect(screen.getByText("Bancolombia")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

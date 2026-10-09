// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaCuentas from "./page";
import * as useCuentasModule from "@/hooks/use-cuentas";
import type { Cuenta } from "@/lib/api/types";

vi.mock("@/hooks/use-cuentas", () => ({
  useCuentas: vi.fn(),
  useDesarchivarCuenta: vi.fn(),
}));

const perfil = vi.hoisted(() => ({ soloMirar: false }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => perfil.soloMirar }));

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
  isPaused?: boolean;
  error?: unknown;
  isFetching?: boolean;
  refetch?: () => void;
}

function ajustar(stub: Stub = {}, archivadas?: Stub) {
  vi.mocked(useCuentasModule.useCuentas).mockImplementation(
    ((includeArchived?: boolean) => {
      const fuente = includeArchived && archivadas ? archivadas : stub;
      return {
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        ...fuente,
      } as never;
    }) as never
  );
}

const desarchivar = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  perfil.soloMirar = false;
  vi.mocked(useCuentasModule.useDesarchivarCuenta).mockReturnValue({
    mutate: desarchivar,
    isPending: false,
  } as never);
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
  saved: "0.0000",
  archivedAt: null,
} as Cuenta;

const visaVieja: Cuenta = {
  id: "a-2",
  name: "Visa vieja",
  type: "card",
  currency: "USD",
  balance: "-500000",
  isSavings: false,
  saved: "0.0000",
  archivedAt: "2026-01-01T00:00:00.000Z",
} as Cuenta;

describe("Cuentas: un fallo de red no es 'todavía no tienes cuentas'", () => {
  it("si la consulta falla, muestra error y Reintentar en vez de dejar el cuerpo en blanco", () => {
    const recargar = vi.fn();
    ajustar({ data: undefined, isError: true, error: new Error("boom"), refetch: recargar });

    render(<PaginaCuentas />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("No pudimos cargar tus cuentas. Revisa tu conexión y vuelve a intentarlo.")
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

  it("con cuentas ya cargadas, un refetch fallido no las borra", () => {
    ajustar({ data: [bancolombia], isError: true, error: new Error("boom") });

    render(<PaginaCuentas />);

    // La promesa de la política: el error solo reemplaza cuando no hay datos.
    expect(screen.getByText("Bancolombia")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("una consulta pausada sin red no se disfraza de 'todavía no tienes cuentas'", () => {
    ajustar({ data: undefined, isPaused: true });

    render(<PaginaCuentas />);

    // Esta prueba se cae si la pantalla vuelve a mostrar el vacío cuando la
    // consulta está en pausa: el sentido de la política única.
    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar tus cuentas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Todavía no tienes cuentas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar cuentas" })).toBeInTheDocument();
  });

  it("una consulta pausada con datos viejos en mano sigue mostrando las cuentas", () => {
    ajustar({ data: [bancolombia], isPaused: true });

    render(<PaginaCuentas />);

    expect(screen.getByText("Bancolombia")).toBeInTheDocument();
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });
});

describe("Cuentas: las archivadas viven al final, plegadas y sin saldos", () => {
  it("con archivadas aparece 'Archivadas (n)' y al abrirla se ve nombre, tipo y moneda", () => {
    ajustar({ data: [bancolombia] }, { data: [bancolombia, visaVieja] });

    render(<PaginaCuentas />);

    const boton = screen.getByRole("button", { name: /Archivadas \(1\)/ });
    // Plegada por defecto: la lista de todos los días manda.
    expect(screen.queryByText("Visa vieja")).not.toBeInTheDocument();

    fireEvent.click(boton);

    expect(screen.getByText("Visa vieja")).toBeInTheDocument();
    expect(screen.getByText("Tarjeta · USD")).toBeInTheDocument();
  });

  it("sin archivadas no aparece la sección", () => {
    ajustar({ data: [bancolombia] }, { data: [bancolombia] });

    render(<PaginaCuentas />);

    expect(screen.queryByText(/Archivadas/)).not.toBeInTheDocument();
  });

  it("'Desarchivar' llama al servidor con el id de la cuenta", () => {
    ajustar({ data: [bancolombia] }, { data: [bancolombia, visaVieja] });

    render(<PaginaCuentas />);
    fireEvent.click(screen.getByRole("button", { name: /Archivadas \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Desarchivar" }));

    expect(desarchivar).toHaveBeenCalledTimes(1);
    expect(desarchivar.mock.calls[0][0]).toBe("a-2");
  });

  it("en modo solo-mirar, 'Desarchivar' queda deshabilitado", () => {
    perfil.soloMirar = true;
    ajustar({ data: [bancolombia] }, { data: [bancolombia, visaVieja] });

    render(<PaginaCuentas />);
    fireEvent.click(screen.getByRole("button", { name: /Archivadas \(1\)/ }));

    expect(screen.getByRole("button", { name: "Desarchivar" })).toBeDisabled();
  });

  it("si falla la consulta de archivadas, se dice y se ofrece reintentar", () => {
    ajustar(
      { data: [bancolombia] },
      { data: undefined, isError: true, error: new Error("boom") }
    );

    render(<PaginaCuentas />);

    expect(
      screen.getByText(
        "No pudimos cargar tus cuentas archivadas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar archivadas" })).toBeInTheDocument();
  });

  it("una consulta de archivadas pausada sin red dice 'Sin conexión'", () => {
    ajustar({ data: [bancolombia] }, { data: undefined, isPaused: true });

    render(<PaginaCuentas />);

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar tus cuentas archivadas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
  });
});

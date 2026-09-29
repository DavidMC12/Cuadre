// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaAjustes from "./page";
import * as usePerfilModule from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";

vi.mock("@/hooks/use-perfil", () => ({
  usePerfil: vi.fn(),
  useSoloMirar: () => false,
  useIrAPantallaDeInicio: () => undefined,
}));

vi.mock("@/components/ajustes/boton-exportar", () => ({ BotonExportar: () => null }));
vi.mock("@/components/ajustes/editar-nombre", () => ({
  EditarNombre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ajustes/opcion-guardada", () => ({ OpcionGuardada: () => null }));
vi.mock("@/components/ajustes/selector-tema", () => ({ SelectorTema: () => null }));
vi.mock("@/components/auth/boton-salir", () => ({ BotonSalir: () => null }));

afterEach(cleanup);

function ajustarPerfil(stub: Record<string, unknown> = {}) {
  vi.mocked(usePerfilModule.usePerfil).mockImplementation(
    () =>
      ({
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        ...stub,
      }) as never
  );
}

describe("Ajustes: mismo bloque de fallo que el resto de la app", () => {
  it("si la consulta del perfil falla, muestra FalloConsulta con mensaje y Reintentar", () => {
    const recargar = vi.fn();
    ajustarPerfil({
      isError: true,
      error: new Error("boom"),
      refetch: recargar,
    });

    render(<PaginaAjustes />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar tus ajustes. Puede ser que el servidor esté dormido."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("sin conexión usa el mensaje del cliente HTTP, no el genérico", () => {
    ajustarPerfil({
      isError: true,
      error: new ApiError({
        code: "SIN_CONEXION",
        message: "No se pudo conectar con el servidor. Revisa que esté encendido.",
      }),
    });

    render(<PaginaAjustes />);

    expect(
      screen.getByText(
        "No se pudo conectar con el servidor. Revisa que esté encendido."
      )
    ).toBeInTheDocument();
  });

  it("una sesión vencida usa el mensaje en español del servidor", () => {
    ajustarPerfil({
      isError: true,
      error: new ApiError({ code: "UNAUTHORIZED", message: "Tu sesión expiró." }),
    });

    render(<PaginaAjustes />);
    expect(screen.getByText("Tu sesión expiró.")).toBeInTheDocument();
  });

  it("con el perfil cargado no aparece ningún bloque de fallo", () => {
    ajustarPerfil({
      data: {
        displayName: "Sam",
        email: "sam@cuadre.co",
        createdAt: "2026-08-01",
        startPage: "resumen",
        isAdmin: false,
      },
    });

    render(<PaginaAjustes />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
    // La pantalla de siempre sigue en pie.
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("un refetch fallido con datos viejos no reemplaza la pantalla por el fallo", () => {
    ajustarPerfil({
      isError: true,
      error: new Error("boom"),
      data: {
        displayName: "Sam",
        email: "sam@cuadre.co",
        createdAt: "2026-08-01",
        startPage: "resumen",
        isAdmin: false,
      },
    });

    render(<PaginaAjustes />);

    // La política del resto de la app: el error no borra lo que ya está en
    // pantalla; con datos en la memoria, esos son los que se muestran.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });
});

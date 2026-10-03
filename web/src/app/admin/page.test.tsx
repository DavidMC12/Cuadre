// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaAdmin from "./page";
import * as useAdminModule from "@/hooks/use-admin";
import * as usePerfilModule from "@/hooks/use-perfil";
import type { UsuarioDelSistema } from "@/hooks/use-admin";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/use-perfil", () => ({
  usePerfil: vi.fn(),
}));

vi.mock("@/hooks/use-admin", () => ({
  useUsuariosDelSistema: vi.fn(),
  useRegistroDeSuplantaciones: vi.fn(),
  useSuplantar: vi.fn(),
}));

afterEach(cleanup);

const perfilAdmin = {
  displayName: "Soporte",
  email: "soporte@cuadre.co",
  isAdmin: true,
};

function ajustarPerfil(stub: Record<string, unknown> = {}) {
  vi.mocked(usePerfilModule.usePerfil).mockImplementation(
    () =>
      ({
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        data: perfilAdmin,
        ...stub,
      }) as never
  );
}

function ajustarPersonas(stub: Record<string, unknown> = {}) {
  vi.mocked(useAdminModule.useUsuariosDelSistema).mockImplementation(
    () =>
      ({
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        data: [] as UsuarioDelSistema[],
        ...stub,
      }) as never
  );
  vi.mocked(useAdminModule.useRegistroDeSuplantaciones).mockImplementation(
    () => ({ data: [] }) as never
  );
  vi.mocked(useAdminModule.useSuplantar).mockImplementation(
    () => ({ mutate: vi.fn(), isPending: false }) as never
  );
}

describe("Admin: la lista de personas se cae con el mismo vocabulario del resto", () => {
  it("si la consulta falla, muestra FalloConsulta con mensaje y Reintentar — no un texto mudo", () => {
    const recargar = vi.fn();
    ajustarPerfil();
    ajustarPersonas({
      data: undefined,
      isError: true,
      error: new Error("boom"),
      refetch: recargar,
    });

    render(<PaginaAdmin />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar la lista de personas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    // Un error de red no es lo mismo que "no hay nadie registrado".
    expect(screen.queryByText("No hay nadie registrado")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("con datos viejos en la memoria, un refetch fallido no borra el listado", () => {
    ajustarPerfil();
    ajustarPersonas({
      isError: true,
      error: new Error("boom"),
      data: [
        {
          id: "u-1",
          email: "sam@cuadre.co",
          name: "Sam",
          role: "user",
          banned: false,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });

    render(<PaginaAdmin />);

    // La política del resto de la app: el error no borra lo que ya está en
    // pantalla; con datos en la memoria, esos son los que se muestran.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Personas (1)")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("una consulta pausada sin red no se disfraza de 'no hay nadie registrado'", () => {
    ajustarPerfil();
    ajustarPersonas({ data: undefined, isPaused: true });

    render(<PaginaAdmin />);

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar la lista de personas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("No hay nadie registrado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

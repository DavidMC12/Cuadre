// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { toast } from "sonner";

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

    fireEvent.click(screen.getByRole("button", { name: "Reintentar personas" }));
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
    expect(screen.getByRole("button", { name: "Reintentar personas" })).toBeInTheDocument();
  });

  it("sin red mientras busca el perfil, dice 'tu perfil' en vez de dejar el esqueleto eterno", () => {
    ajustarPerfil({ isPending: true, isPaused: true, data: undefined });
    ajustarPersonas({ data: undefined });

    render(<PaginaAdmin />);

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar tu perfil. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });
});

describe("Admin: el registro de suplantaciones no se cae en silencio (novena critique, P2)", () => {
  function ajustarRegistro(stub: Record<string, unknown>) {
    vi.mocked(useAdminModule.useRegistroDeSuplantaciones).mockImplementation(
      () =>
        ({
          data: undefined,
          isError: false,
          error: null,
          isPending: false,
          isPaused: false,
          isFetching: false,
          refetch: vi.fn(),
          ...stub,
        }) as never
    );
  }

  it("si la consulta falla, dice el fallo con Reintentar — 'Cuentas a las que has entrado' no desaparece sin una palabra", () => {
    ajustarPerfil();
    ajustarPersonas({});
    const recargar = vi.fn();
    ajustarRegistro({
      data: undefined,
      isError: true,
      error: new Error("boom"),
      refetch: recargar,
    });

    render(<PaginaAdmin />);

    expect(
      screen.getByText(
        "No pudimos cargar el registro de entradas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    // El fallo del registro es un anuncio propio, no un vacío que miente.
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el registro de entradas" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("pausada sin red, el registro dice 'Sin conexión'", () => {
    ajustarPerfil();
    ajustarPersonas({});
    ajustarRegistro({ data: undefined, isPaused: true });

    render(<PaginaAdmin />);

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar el registro de entradas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar el registro de entradas" })).toBeInTheDocument();
  });

  it("un refetch fallido con entradas ya en pantalla no las borra ni muestra el fallo por encima", () => {
    ajustarPerfil();
    ajustarPersonas({});
    ajustarRegistro({
      data: [
        {
          id: "e-1",
          targetEmail: "sam@cuadre.co",
          startedAt: "2026-10-05T10:00:00.000Z",
        },
      ],
      isError: true,
      error: new Error("boom"),
    });

    render(<PaginaAdmin />);

    expect(screen.getByText("Cuentas a las que has entrado")).toBeInTheDocument();
    expect(screen.getByText("sam@cuadre.co")).toBeInTheDocument();
  });

  it("cargó bien y no hay entradas: la sección se pinta con una línea apagada, no se queda muda", () => {
    ajustarPerfil();
    ajustarPersonas({});
    ajustarRegistro({ data: [] });

    render(<PaginaAdmin />);

    expect(screen.getByText("Cuentas a las que has entrado")).toBeInTheDocument();
    expect(screen.getByText("Todavía no has entrado a ninguna cuenta.")).toBeInTheDocument();
    // Un vacío no es ni un fallo ni una conexión caída: no hay bloque de error.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reintentar el registro de entradas" })
    ).not.toBeInTheDocument();
  });
});

describe("Admin: suplantar no arranca sin confirmar (octava critique, P2)", () => {
  it("'Entrar' solo pide la cuenta; la suplantación corre al confirmar", () => {
    ajustarPerfil();
    const suplantarMutate = vi.fn();
    ajustarPersonas({
      data: [
        {
          id: "u-1",
          email: "sam@cuadre.co",
          name: "Sam",
          role: "user",
          banned: false,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ] as UsuarioDelSistema[],
    });
    vi.mocked(useAdminModule.useSuplantar).mockImplementation(
      () => ({ mutate: suplantarMutate, isPending: false }) as never
    );

    render(<PaginaAdmin />);

    // Un toque no puede entrar a la cuenta de otra persona: primero pregunta.
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(suplantarMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("¿Entrar a la cuenta de Sam?")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Vas a ver lo mismo que su dueño ve: sus movimientos y sus saldos. Desde ahí no se puede cambiar nada, solo se mira. La entrada queda registrada./
      )
    ).toBeInTheDocument();

    // Confirmar sí corre la suplantación, y de esa persona.
    fireEvent.click(screen.getByRole("button", { name: "Sí, entrar" }));
    expect(suplantarMutate).toHaveBeenCalledTimes(1);
    expect(suplantarMutate).toHaveBeenCalledWith(
      { id: "u-1", email: "sam@cuadre.co" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it("Cancelar cierra el diálogo sin suplantar", () => {
    ajustarPerfil();
    const suplantarMutate = vi.fn();
    ajustarPersonas({
      data: [
        {
          id: "u-2",
          email: "jordan@cuadre.co",
          name: null,
          role: "user",
          banned: false,
          createdAt: "2026-08-02T00:00:00.000Z",
        },
      ] as UsuarioDelSistema[],
    });
    vi.mocked(useAdminModule.useSuplantar).mockImplementation(
      () => ({ mutate: suplantarMutate, isPending: false }) as never
    );

    render(<PaginaAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByText("¿Entrar a la cuenta de jordan@cuadre.co?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(suplantarMutate).not.toHaveBeenCalled();
  });

  it("'Cancelar' y 'Sí, entrar' llevan el piso de toque de 44px", () => {
    ajustarPerfil();
    ajustarPersonas({
      data: [
        {
          id: "u-1",
          email: "sam@cuadre.co",
          name: "Sam",
          role: "user",
          banned: false,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ] as UsuarioDelSistema[],
    });

    render(<PaginaAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    // El patrón de confirmación de la app es una gramática: los pies de
    // diálogo ya viven en 44px (ver confirmar-anulacion).
    expect(screen.getByRole("button", { name: "Cancelar" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Sí, entrar" }).className).toContain("min-h-11");
  });

  it("un fallo al entrar deja el diálogo abierto con un Reintentar posible", () => {
    ajustarPerfil();
    ajustarPersonas({
      data: [
        {
          id: "u-1",
          email: "sam@cuadre.co",
          name: "Sam",
          role: "user",
          banned: false,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ] as UsuarioDelSistema[],
    });
    // El mutate falla en seco: manda el onError y ahí queda.
    vi.mocked(useAdminModule.useSuplantar).mockImplementation(
      () =>
        ({
          mutate: (_persona: unknown, config: { onError: () => void }) => config.onError(),
          isPending: false,
        }) as never
    );

    render(<PaginaAdmin />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, entrar" }));

    // La cuenta no cambió: se lo dice el toast y el diálogo queda en pie con
    // el botón re-armado para volver a intentar.
    expect(toast.error).toHaveBeenCalledWith("No se pudo entrar a esa cuenta.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, entrar" })).not.toBeDisabled();
  });
});

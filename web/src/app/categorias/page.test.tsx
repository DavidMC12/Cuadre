// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import PaginaCategorias from "./page";
import * as useCategoriasModule from "@/hooks/use-categorias";
import type { Categoria } from "@/lib/api/types";

vi.mock("@/hooks/use-categorias", () => ({ useCategorias: vi.fn() }));

vi.mock("@/components/categorias/formulario-categoria", () => ({
  FormularioCategoria: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/categorias/categoria-item", () => ({
  CategoriaItem: ({ categoria }: { categoria: Categoria }) => <li>{categoria.name}</li>,
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

function ajustar(stub: Stub = {}, stubArchivadas: Stub = {}) {
  vi.mocked(useCategoriasModule.useCategorias).mockImplementation(
    (includeArchived = false) =>
      ({
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        ...(includeArchived ? stubArchivadas : stub),
      }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ajustar({});
});

afterEach(cleanup);

const mercado: Categoria = {
  id: "c-1",
  name: "Mercado",
  kind: "expense",
  archivedAt: null,
} as Categoria;

describe("Categorías: un fallo de red no es 'no tienes categorías'", () => {
  it("si la consulta falla, muestra error y Reintentar — no el vacío que miente", () => {
    const recargar = vi.fn();
    ajustar({ data: undefined, isError: true, error: new Error("boom"), refetch: recargar });

    render(<PaginaCategorias />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar tus categorías. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar categorías" })).toBeInTheDocument();
    // `hayCategorias` sale de `data ?? []`, así que sin esto el fallo se veía
    // como "Todavía no tienes categorías".
    expect(screen.queryByText("Todavía no tienes categorías")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar categorías" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("de verdad sin categorías muestra el vacío de siempre, sin Reintentar", () => {
    ajustar({ data: [] });

    render(<PaginaCategorias />);

    expect(screen.getByText("Todavía no tienes categorías")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("con categorías cargadas las lista, sin error", () => {
    ajustar({ data: [mercado] });

    render(<PaginaCategorias />);

    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con categorías ya cargadas, un refetch fallido no las borra", () => {
    ajustar({ data: [mercado], isError: true, error: new Error("boom") });

    render(<PaginaCategorias />);

    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si falla la consulta de archivadas, no dice 'No hay categorías archivadas'", () => {
    ajustar({ data: [] }, { data: undefined, isError: true, error: new Error("boom") });

    render(<PaginaCategorias />);

    fireEvent.click(screen.getByRole("button", { name: "Ver categorías archivadas" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("No hay categorías archivadas")).not.toBeInTheDocument();
  });

  it("una consulta pausada sin red no se disfraza de 'todavía no tienes categorías'", () => {
    ajustar({ data: undefined, isPaused: true });

    render(<PaginaCategorias />);

    // Si alguien revierte la política, esto vuelve a dibujar el vacío y se cae.
    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar tus categorías. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Todavía no tienes categorías")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar categorías" })).toBeInTheDocument();
  });
});

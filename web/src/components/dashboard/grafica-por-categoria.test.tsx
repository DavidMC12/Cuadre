// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { GraficaPorCategoria } from "./grafica-por-categoria";
import * as useCategoriasModule from "@/hooks/use-categorias";
import * as useReportesModule from "@/hooks/use-reportes";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock("@/hooks/use-categorias", () => ({ useCategorias: vi.fn() }));
vi.mock("@/hooks/use-reportes", () => ({ usePorCategoria: vi.fn() }));

afterEach(cleanup);

function ajustarConsultas(stub: Record<string, unknown> = {}, catalogo: unknown[] = []) {
  vi.mocked(useReportesModule.usePorCategoria).mockImplementation(
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
  vi.mocked(useCategoriasModule.useCategorias).mockImplementation(
    () => ({ isLoading: false, refetch: vi.fn(), data: catalogo }) as never
  );
}

describe("GraficaPorCategoria: un fallo de red no es 'sin gastos este mes'", () => {
  it("si la consulta falla, muestra error y Reintentar — no el texto del vacío", () => {
    const recargar = vi.fn();
    ajustarConsultas({
      data: undefined,
      isError: true,
      error: new Error("boom"),
      refetch: recargar,
    });

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar los gastos por categoría. Puede ser que el servidor esté dormido."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    // El texto de siempre mentía: presentaba una lectura fallida como un
    // mes sin gastos.
    expect(screen.queryByText("Sin gastos este mes.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("de verdad sin gastos sigue mostrando su texto del vacío, sin Reintentar", () => {
    ajustarConsultas({ data: [] });

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
      />
    );

    expect(screen.getByText("Sin gastos este mes.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("con datos muestra las barras de siempre", () => {
    ajustarConsultas(
      { data: [{ categoryId: "c-1", categoryName: "Mercado", total: "20500" }] },
      []
    );

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
      />
    );

    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

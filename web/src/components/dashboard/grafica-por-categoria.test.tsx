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
        "No pudimos cargar los gastos por categoría. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar por categoría" })).toBeInTheDocument();
    // El texto de siempre mentía: presentaba una lectura fallida como un
    // mes sin gastos.
    expect(screen.queryByText("Sin gastos este mes.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar por categoría" }));
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

  it("el color de la barra sale del helper compartido: la paleta de gasto por nombre", () => {
    ajustarConsultas(
      { data: [{ categoryId: "c-1", categoryName: "Mercado", total: "20500" }] },
      [{ id: "c-1", name: "Mercado", kind: "expense", archivedAt: null }]
    );

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
      />
    );

    // Primera (y única) categoría de gasto del catálogo: primer tono de la
    // paleta. Si el helper compartido cambiara el reparto, esto se cae.
    const barra = screen.getByText("Mercado").closest("a")!.querySelector("div[style]") as HTMLElement;
    expect(barra.style.backgroundColor).toBe("rgb(42, 120, 214)");
  });

  it("el repliegue 'Otras categorías' suma exacto, sin perder centavos en flotante", () => {
    const montosRepliegue = ["1099946.7554", "2358772.6602", "3294162.5450", "5142164.8111"];
    // Once categorías: las 7 primeras quedan visibles y las 4 últimas caen
    // dentro del repliegue "Otras categorías".
    const datos = [
      ...Array.from({ length: 7 }, (_, i) => ({
        categoryId: `c-${i}`,
        categoryName: `C${i}`,
        total: "100",
      })),
      ...montosRepliegue.map((total, i) => ({
        categoryId: `c-otra-${i}`,
        categoryName: `Otra ${i}`,
        total,
      })),
    ];
    ajustarConsultas({ data: datos }, []);

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
      />
    );

    // Con Number() el total del repliegue mostraba $11.895.046,771699999: el
    // flotante inventaba dígitos que la suma exacta del libro no tiene
    // (,7717). La regla de money.ts: el dinero nunca pasa por flotante.
    const filaRepliegue = screen.getByText("Otras categorías").closest("div")!;
    expect(filaRepliegue).toHaveTextContent("$11.895.046,7717");
  });

  it("los segmentos de tipo (Gasto/Ingreso) cumplen el piso de 44px, como en los formularios", () => {
    ajustarConsultas({ data: [] });

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
      />
    );

    // La variante `tap` del toggle: h-11 son los 44px del pulgar.
    const gastos = screen.getByRole("button", { name: "Gastos" });
    const ingresos = screen.getByRole("button", { name: "Ingresos" });
    expect(gastos.classList.contains("h-11")).toBe(true);
    expect(gastos.classList.contains("min-w-11")).toBe(true);
    expect(ingresos.classList.contains("h-11")).toBe(true);
    expect(ingresos.classList.contains("min-w-11")).toBe(true);
  });

  it("cuando comparte pantalla con otro fallo, el suyo deja de anunciar solo (group, no alert)", () => {
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
        compartePantalla
      />
    );

    // El bloque sigue completo — mensaje y Reintentar con su etiqueta propia —
    // solo que no interrumpe: el anuncio queda en manos de la pantalla.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // (El ToggleGroup de arriba también es role=group: el bloque se busca por
    // su mensaje, no por ser el único group en pantalla.)
    expect(
      screen
        .getByText(
          "No pudimos cargar los gastos por categoría. Revisa tu conexión y vuelve a intentarlo."
        )
        .closest('[role="group"]')
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar por categoría" })).toBeInTheDocument();
  });

  it("una consulta pausada sin red no se disfraza de 'sin gastos este mes'", () => {
    ajustarConsultas({ data: undefined, isPaused: true });

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar los gastos por categoría. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Sin gastos este mes.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar por categoría" })).toBeInTheDocument();
  });

  it("avisa a la pantalla si no se pudo leer, para que componga el anuncio único", () => {
    const avisar = vi.fn();
    ajustarConsultas({ data: undefined, isPaused: true });

    render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
        onNoLeible={avisar}
      />
    );

    expect(avisar).toHaveBeenCalledWith(true);
  });

  it("con datos avisa false (no se dispara de más) y al desmontar resetea", () => {
    const avisar = vi.fn();
    ajustarConsultas({ data: [], catalogo: [] });

    const { unmount } = render(
      <GraficaPorCategoria
        mes="2026-09"
        moneda="COP"
        tipo="expense"
        onCambiarTipo={vi.fn()}
        onNoLeible={avisar}
      />
    );

    expect(avisar).toHaveBeenCalledWith(false);
    avisar.mockClear();
    unmount();
    expect(avisar).toHaveBeenCalledWith(false);
  });
});

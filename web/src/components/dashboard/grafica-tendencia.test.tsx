// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { GraficaTendencia } from "./grafica-tendencia";
import type { TendenciaMes } from "@/lib/api/types";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Recharts mide su contenedor y dibuja un SVG que en jsdom no aporta nada a lo
// que se prueba aquí —que exista un nombre accesible y una tabla con los
// mismos datos—, así que se reemplaza por contenedores simples. El `BarChart`
// guarda sus props para poder comprobar que la capa de accesibilidad de
// Recharts queda apagada.
const { propsBarChart } = vi.hoisted(() => ({ propsBarChart: [] as Record<string, unknown>[] }));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  BarChart: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    propsBarChart.push(props);
    return <div>{props.children}</div>;
  },
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Bar: () => null,
  ReferenceDot: () => null,
}));

afterEach(cleanup);

const periodo: TendenciaMes[] = [
  { month: "2026-08", income: "500000.0000", expense: "200000.0000" },
  { month: "2026-09", income: "300000.0000", expense: "450000.0000" },
];

describe("GraficaTendencia: la gráfica también se puede leer sin verla", () => {
  it("expone un resumen con el periodo y los totales en un role=img", () => {
    render(<GraficaTendencia tendencia={periodo} moneda="COP" cargando={false} />);

    expect(
      screen.getByRole("img", {
        name: "Tendencia de 2 meses, de Agosto de 2026 a Septiembre de 2026. Ingresos $800.000; gastos $650.000.",
      })
    ).toBeInTheDocument();
    // Sin esto, Recharts envolvería el SVG en role="application" y lo dejaría
    // enfocable dentro de un contenedor aria-hidden.
    expect(propsBarChart.at(-1)?.accessibilityLayer).toBe(false);
  });

  it("ofrece los mismos datos en una tabla para lectores de pantalla", () => {
    render(<GraficaTendencia tendencia={periodo} moneda="COP" cargando={false} />);

    expect(
      screen.getByRole("table", { name: "Tendencia de ingresos y gastos por mes" })
    ).toBeInTheDocument();
    // Los meses y los montos exactos, no solo la barra.
    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText("Septiembre de 2026")).toBeInTheDocument();
    expect(screen.getByText("$500.000")).toBeInTheDocument();
    expect(screen.getByText("$450.000")).toBeInTheDocument();
  });

  it("sin meses con movimientos sigue mostrando su texto, sin role=img", () => {
    render(<GraficaTendencia tendencia={[]} moneda="COP" cargando={false} />);

    expect(screen.getByText("Todavía no hay suficientes meses con movimientos.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("GraficaTendencia: el anuncio del fallo depende de la compañía", () => {
  const fallo = {
    mensaje: "No pudimos cargar la tendencia. Revisa tu conexión y vuelve a intentarlo.",
    onReintentar: vi.fn(),
    etiquetaBoton: "Reintentar tendencia",
  };

  it("sola en pantalla, su fallo interrumpe con role=alert", () => {
    render(<GraficaTendencia tendencia={undefined} moneda="COP" cargando={false} fallo={fallo} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar tendencia" })).toBeInTheDocument();
  });

  it("cuando comparte pantalla con otro fallo, deja de anunciar solo (group, no alert)", () => {
    render(
      <GraficaTendencia
        tendencia={undefined}
        moneda="COP"
        cargando={false}
        fallo={fallo}
        compartePantalla
      />
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar tendencia" })).toBeInTheDocument();
  });
});

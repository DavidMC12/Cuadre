// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { GraficaAhorro } from "./grafica-ahorro";
import * as reportes from "@/hooks/use-reportes";
import { MENOS } from "@/lib/money";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Igual que en la tendencia: el SVG de Recharts no aporta a lo que se prueba.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Cell: () => null,
  Bar: () => null,
  ReferenceDot: () => null,
}));

vi.mock("@/hooks/use-reportes", () => ({ useAhorroMensual: vi.fn() }));

afterEach(cleanup);

function ajustar(data: unknown) {
  vi.mocked(reportes.useAhorroMensual).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  } as never);
}

const meses = [
  { month: "2026-08", amount: "100000.0000" },
  { month: "2026-09", amount: "-50000.0000" },
];

describe("GraficaAhorro: la gráfica también se puede leer sin verla", () => {
  it("expone el total del periodo en un role=img", () => {
    ajustar(meses);

    render(<GraficaAhorro months={2} currency="COP" />);

    expect(
      screen.getByRole("img", {
        name: "Ahorro de 2 meses, de Agosto de 2026 a Septiembre de 2026. Total $50.000.",
      })
    ).toBeInTheDocument();
  });

  it("ofrece los mismos datos en una tabla para lectores de pantalla", () => {
    ajustar(meses);

    render(<GraficaAhorro months={2} currency="COP" />);

    expect(screen.getByRole("table", { name: "Ahorro por mes" })).toBeInTheDocument();
    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText("$100.000")).toBeInTheDocument();
    // Un mes en negativo se lee con su signo, igual que en `Monto`.
    expect(screen.getByText(`${MENOS}$50.000`)).toBeInTheDocument();
  });

  it("sin movimientos de ahorro sigue mostrando su texto, sin role=img", () => {
    ajustar([{ month: "2026-09", amount: "0.0000" }]);

    render(<GraficaAhorro months={1} currency="COP" />);

    expect(
      screen.getByText("Todavía no hay movimientos en tus cuentas de ahorro.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

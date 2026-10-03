// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { GraficaAhorro } from "./grafica-ahorro";
import * as reportes from "@/hooks/use-reportes";
import { MENOS } from "@/lib/money";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Igual que en la tendencia: el SVG de Recharts no aporta a lo que se prueba,
// y se guardan las props para comprobar que su capa de accesibilidad queda
// apagada.
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
    // La capa de accesibilidad de Recharts dejaría el SVG enfocable dentro del
    // aria-hidden; aquí queda apagada.
    expect(propsBarChart.at(-1)?.accessibilityLayer).toBe(false);
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

describe("GraficaAhorro: el anuncio del fallo depende de la compañía", () => {
  function ajustarFallo() {
    vi.mocked(reportes.useAhorroMensual).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      isFetching: false,
      refetch: vi.fn(),
    } as never);
  }

  it("sola en pantalla, su fallo interrumpe con role=alert", () => {
    ajustarFallo();

    render(<GraficaAhorro months={2} currency="COP" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar ahorro" })).toBeInTheDocument();
  });

  it("cuando comparte pantalla con otro fallo, deja de anunciar solo (group, no alert)", () => {
    ajustarFallo();

    render(<GraficaAhorro months={2} currency="COP" compartePantalla />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar ahorro" })).toBeInTheDocument();
  });

  it("una consulta pausada sin red no se disfraza de cuentas de ahorro quietas", () => {
    vi.mocked(reportes.useAhorroMensual).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never);

    render(<GraficaAhorro months={2} currency="COP" />);

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar el ahorro. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Todavía no hay movimientos en tus cuentas de ahorro.")
    ).not.toBeInTheDocument();
  });

  it("avisa a la pantalla si no se pudo leer, para que componga el anuncio único", () => {
    const avisar = vi.fn();
    vi.mocked(reportes.useAhorroMensual).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    } as never);

    render(<GraficaAhorro months={2} currency="COP" onNoLeible={avisar} />);

    expect(avisar).toHaveBeenCalledWith(true);
  });
});

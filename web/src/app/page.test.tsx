// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import PaginaResumen from "./page";
import * as reportes from "@/hooks/use-reportes";
import * as ordenCuentas from "@/hooks/use-cuentas";
import * as presupuesto from "@/hooks/use-presupuesto";
import { GraficaTendencia } from "@/components/dashboard/grafica-tendencia";
import { GraficaPorCategoria } from "@/components/dashboard/grafica-por-categoria";
import { PanelPresupuesto } from "@/components/presupuesto/panel-presupuesto";
import { CuantoMeSobra } from "@/components/dashboard/cuanto-me-sobra";
import { ApiError } from "@/lib/api/client";
import type { Cuenta, ResumenMes } from "@/lib/api/types";

vi.mock("next/link", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock("@/hooks/use-reportes", () => ({
  useMonedas: vi.fn(),
  useResumenMes: vi.fn(),
  useTendencia: vi.fn(),
}));

vi.mock("@/hooks/use-cuentas", () => ({
  useCuentas: vi.fn(),
}));

vi.mock("@/hooks/use-presupuesto", () => ({
  useChecklistDelMes: vi.fn(),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useIrAPantallaDeInicio: () => undefined,
}));

// Lo pesado —cajones, selectores, gráficas de recharts y el panel del
// presupuesto, prohibido a otro agente por ahora— no es lo que se prueba
// aquí: lo que importa es que un fallo de consulta no se disfrace de datos.
//
// `ventanaAncha` controla lo que responde matchMedia para el tramo xl, y así
// probar que el cuadrito no se duplica (móvil vs aside).
let ventanaAncha = false;
window.matchMedia = ((consulta: string) =>
  ({
    matches: ventanaAncha && consulta.includes("min-width: 1280px"),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList) as typeof window.matchMedia;
vi.mock("@/components/dashboard/selector-mes", () => ({ SelectorMes: () => null }));
vi.mock("@/components/dashboard/total-cuentas", () => ({ TotalCuentas: () => null }));
vi.mock("@/components/dashboard/total-ahorrado", () => ({ TotalAhorrado: () => null }));
vi.mock("@/components/dashboard/grafica-por-categoria", () => ({
  GraficaPorCategoria: vi.fn(() => null),
}));
vi.mock("@/components/dashboard/grafica-tendencia", () => ({ GraficaTendencia: vi.fn(() => null) }));
vi.mock("@/components/dashboard/grafica-ahorro", () => ({ GraficaAhorro: () => null }));
vi.mock("@/components/dashboard/cuanto-me-sobra", () => ({
  CuantoMeSobra: vi.fn(() => <div data-testid="me-sobra" />),
}));
vi.mock("@/components/presupuesto/panel-presupuesto", () => ({
  PanelPresupuesto: vi.fn(() => <div data-testid="panel-presupuesto" />),
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

function refetchable(stub: Stub = {}): Stub {
  return {
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    ...stub,
  };
}

const cuantas: Cuenta[] = [
  {
    id: "cuenta-1",
    name: "Bancolombia",
    currency: "COP",
    balance: "1234567",
    isSavings: false,
    archivedAt: null,
  } as Cuenta,
];

const resumen: ResumenMes = { income: "500000", expense: "200000", net: "300000" } as ResumenMes;

function ajustar(
  overrides: {
    deMonedas?: Stub;
    deResumen?: Stub;
    deTendencia?: Stub;
    deCuentas?: Stub;
    deChecklist?: Stub;
  } = {}
) {
  const { deMonedas, deResumen, deTendencia, deCuentas, deChecklist } = overrides;

  vi.mocked(reportes.useMonedas).mockImplementation(
    () => refetchable({ data: ["COP"], ...deMonedas }) as never
  );
  vi.mocked(reportes.useResumenMes).mockImplementation(
    () => refetchable({ data: resumen, ...deResumen }) as never
  );
  vi.mocked(reportes.useTendencia).mockImplementation(
    () => refetchable({ data: [], ...deTendencia }) as never
  );
  vi.mocked(ordenCuentas.useCuentas).mockImplementation(
    () => refetchable({ data: cuantas, ...deCuentas }) as never
  );
  // El checklist del mes vive adentro del cuadrito; la página lo escucha
  // también (misma consulta) para saber cuándo el resumen es el único caído.
  vi.mocked(presupuesto.useChecklistDelMes).mockImplementation(
    () => refetchable({ data: undefined, ...deChecklist }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ventanaAncha = false;
  ajustar({});
});

afterEach(cleanup);

describe("Resumen: un fallo de red no es un cero ni un mes vacío", () => {
  it('si la consulta de monedas falla, no dice "Todavía no hay nada que resumir": muestra error y Reintentar', () => {
    const recargar = vi.fn();
    ajustar({ deMonedas: { data: undefined, isError: true, error: new Error("boom"), refetch: recargar } });

    render(<PaginaResumen />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No pudimos cargar las monedas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    // Esto era verdad antes y sería lo grave: presentaba un fallo como si no hubiera nada.
    expect(screen.queryByText("Todavía no hay nada que resumir")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("un fallo con una sesión vencida usa el mensaje en español del servidor", () => {
    ajustar({
      deMonedas: {
        data: undefined,
        isError: true,
        error: new ApiError({ code: "UNAUTHORIZED", message: "Tu sesión expiró. Vuelve a entrar." }),
      },
    });

    render(<PaginaResumen />);
    expect(screen.getByText("Tu sesión expiró. Vuelve a entrar.")).toBeInTheDocument();
  });

  it('de verdad sin monedas sigue diciendo "Todavía no hay nada que resumir", sin botón de reintentar', () => {
    ajustar({ deMonedas: { data: [] } });

    render(<PaginaResumen />);

    expect(screen.getByText("Todavía no hay nada que resumir")).toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
  });

  it("si la consulta de monedas queda pausada sin red, no se disfraza de 'nada que resumir'", () => {
    const recargar = vi.fn();
    ajustar({ deMonedas: { data: undefined, isPaused: true, refetch: recargar } });

    render(<PaginaResumen />);

    // Falla si el Resumen vuelve a mostrar el vacío con la consulta pausada.
    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar las monedas. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay nada que resumir")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar monedas" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("con varias consultas pausadas por la misma causa, una sola voz (nada de tormenta de alertas)", () => {
    ajustar({
      deCuentas: { data: undefined, isPaused: true },
      deResumen: { data: undefined, isPaused: true },
    });

    render(<PaginaResumen />);

    // Ningún bloque interrumpe por su cuenta: la pantalla compone el anuncio.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen
        .getByText(
          "Sin conexión: no pudimos cargar tus cuentas. Revisa tu conexión y vuelve a intentarlo."
        )
        .closest('[role="group"]')
    ).not.toBeNull();
    expect(
      screen
        .getByText(
          "Sin conexión: no pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo."
        )
        .closest('[role="group"]')
    ).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/Varias partes del Resumen no cargaron/);
  });

  it("si la consulta del resumen falla, no pinta $0 en Ingresos/Gastos/Balance: muestra error y Reintentar", () => {
    const recargar = vi.fn();
    ajustar({
      deResumen: {
        data: undefined,
        isError: true,
        error: new Error("boom"),
        refetch: recargar,
      },
    });

    render(<PaginaResumen />);

    expect(
      screen.getByText(
        "No pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    // El disgusto completo del hallazgo: hasta que enfrenta el fallo, el
    // resumen entero se dibujaba como un mes sin plata.
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
    expect(screen.queryByText("Ingresos")).not.toBeInTheDocument();
    expect(screen.queryByText("Gastos")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance del mes")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("con todo cargado muestra la pantalla de siempre, sin error ni Reintentar", () => {
    render(<PaginaResumen />);

    expect(screen.getByRole("heading", { name: "Resumen" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Reintentar")).not.toBeInTheDocument();
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("Gastos")).toBeInTheDocument();
    expect(screen.getByText("Balance del mes")).toBeInTheDocument();

    // Sin fallos, los componentes que comparten pantalla reciben la orden
    // contraria: si alguno falla, anuncia él solo.
    const propsTendencia = vi.mocked(GraficaTendencia).mock.calls.at(-1)?.[0] as unknown as {
      compartePantalla?: boolean;
    };
    expect(propsTendencia.compartePantalla).toBe(false);
  });

  it("con un solo fallo se sigue anunciando él solo, con role=alert y sin resumen compuesto", () => {
    ajustar({ deCuentas: { data: undefined, isError: true, error: new Error("boom") } });

    render(<PaginaResumen />);

    // El comportamiento de siempre: una alerta, ninguna composición. La
    // región del anuncio vive siempre montada, pero queda vacía.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Reintentar cuentas" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByText(/Varias partes del Resumen/)).not.toBeInTheDocument();
  });

  it("con dos o más fallos a la vez no hay alertas compitiendo: un solo anuncio y bloques en group", () => {
    ajustar({
      deCuentas: { data: undefined, isError: true, error: new Error("boom") },
      deResumen: { data: undefined, isError: true, error: new Error("boom") },
    });

    render(<PaginaResumen />);

    // Ningún bloque interrumpe por su cuenta: la tormenta de alertas se
    // vuelve un único anuncio de la pantalla.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // (El ToggleGroup del encabezado también es role=group: cada bloque de
    // fallo se busca por su mensaje.)
    expect(
      screen
        .getByText("No pudimos cargar tus cuentas. Revisa tu conexión y vuelve a intentarlo.")
        .closest('[role="group"]')
    ).not.toBeNull();
    expect(
      screen
        .getByText("No pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo.")
        .closest('[role="group"]')
    ).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Varias partes del Resumen no cargaron. Revisa abajo: cada parte tiene su Reintentar."
    );
    // Las etiquetas de Reintentar distintas sobreviven: se distinguen de oído
    // al recorrer los bloques.
    expect(screen.getByRole("button", { name: "Reintentar cuentas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar resumen" })).toBeInTheDocument();

    // El cableado: los componentes que piden su consulta adentro reciben la
    // orden de ceder cuando otro fallo convive (una prop opcional que nadie
    // pasa es una tormenta que regresa sin que falle ninguna prueba).
    const propsTendencia = vi.mocked(GraficaTendencia).mock.calls.at(-1)?.[0] as unknown as {
      compartePantalla?: boolean;
    };
    const propsPorCategoria = vi.mocked(GraficaPorCategoria).mock.calls.at(-1)?.[0] as unknown as {
      compartePantalla?: boolean;
    };
    expect(propsTendencia.compartePantalla).toBe(true);
    expect(propsPorCategoria.compartePantalla).toBe(true);
  });

  it("tres fallos a la vez componen igual: un anuncio, ningún alert", () => {
    ajustar({
      deCuentas: { data: undefined, isError: true, error: new Error("boom") },
      deResumen: { data: undefined, isError: true, error: new Error("boom") },
      deTendencia: { data: undefined, isError: true, error: new Error("boom") },
    });

    render(<PaginaResumen />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    // El bloque de la tendencia vive dentro de la gráfica, que aquí está
    // maqueteada; sus dos compañeros bastan para fijar la política.
    expect(
      screen
        .getByText("No pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo.")
        .closest('[role="group"]')
    ).not.toBeNull();
  });

  it("un fallo SOLO del resumen deja UN bloque de error: el cuadrito no lo duplica", () => {
    ajustar({ deResumen: { data: undefined, isError: true, error: new Error("boom") } });

    render(<PaginaResumen />);

    // Una sola consulta caída, un solo bloque: ResumenCards lo muestra con
    // su Reintentar. El cuadrito "cuánto me sobra" —que además necesita el
    // checklist— no repite el error de esa misma consulta (octava critique,
    // P2): la sección entera se esconde, encabezado incluido.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(
      screen.getAllByText(
        "No pudimos cargar el resumen del mes. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Reintentar resumen" })).toBeInTheDocument();
    expect(screen.queryByTestId("me-sobra")).not.toBeInTheDocument();
    expect(screen.queryByText("Cuánto me sobra este mes")).not.toBeInTheDocument();
  });

  it("si el resumen y el presupuesto caen juntos, la sección del cuadrito vuelve (con su propio error)", () => {
    ajustar({
      deResumen: { data: undefined, isError: true, error: new Error("boom") },
      deChecklist: { data: undefined, isError: true, error: new Error("boom") },
    });

    render(<PaginaResumen />);

    // Dos consultas caídas son dos bloques con Reintentar distintos; el que
    // se esconde es solo cuando el resumen cae SOLO.
    expect(screen.getByRole("button", { name: "Reintentar resumen" })).toBeInTheDocument();
    expect(screen.getByTestId("me-sobra")).toBeInTheDocument();
    expect(screen.getByText("Cuánto me sobra este mes")).toBeInTheDocument();
  });

  it("el cajón móvil monta el panel sin tope propio (el cajón ya scrollea)", () => {
    render(<PaginaResumen />);

    // El cajón nace cerrado; al abrirlo se monta el panel con su prop.
    fireEvent.click(screen.getByRole("button", { name: /Presupuesto/ }));

    const props = vi.mocked(PanelPresupuesto).mock.calls.at(-1)?.[0] as unknown as {
      variante?: string;
      topePropio?: boolean;
    };
    // Suelto (el cajón ya trae encabezado) y sin tope propio: si alguien borra
    // esta prop, el doble scroll vuelve sin que ninguna otra prueba se caiga.
    expect(props.variante).toBe("suelta");
    expect(props.topePropio).toBe(false);
    // El contenedor que scrollea en el cajón lleva la barra fina.
    expect(document.querySelector(".scroll-fino")).not.toBeNull();
  });

  it("monta 'Cuánto me sobra' una sola vez y fuera del aside, en todos los anchos", () => {
    ventanaAncha = true;
    render(<PaginaResumen />);

    const props = vi.mocked(CuantoMeSobra).mock.calls.at(-1)![0] as unknown as {
      mes?: string;
      moneda?: string;
      variante?: string;
      compartePantalla?: boolean;
      anunciaPresupuesto?: boolean;
      anunciaResumen?: boolean;
    };
    expect(props.mes).toBeDefined();
    expect(props.moneda).toBe("COP");
    expect(props.variante).toBe("suelta");
    expect(props.compartePantalla).toBe(false);
    // En xl el panel del presupuesto es el que anuncia: el bloque cede.
    expect(props.anunciaPresupuesto).toBe(false);
    // ResumenCards consulta el mismo resumen y siempre anuncia: el cuadrito
    // nunca dispara su propia alerta por esa consulta.
    expect(props.anunciaResumen).toBe(false);

    // Una sola instancia en pantalla, y vive en la columna principal, nunca
    // dentro del aside del presupuesto.
    expect(screen.getAllByTestId("me-sobra")).toHaveLength(1);
    expect(screen.getByTestId("me-sobra").closest("aside")).toBeNull();
    expect(screen.getByTestId("panel-presupuesto").closest("aside")).not.toBeNull();
  });

  it("en móvil también es una sola instancia y anuncia él mismo el presupuesto", () => {
    ventanaAncha = false;
    render(<PaginaResumen />);

    expect(screen.getAllByTestId("me-sobra")).toHaveLength(1);
    const props = vi.mocked(CuantoMeSobra).mock.calls.at(-1)![0] as unknown as {
      anunciaPresupuesto?: boolean;
    };
    expect(props.anunciaPresupuesto).toBe(true);
  });

  it("desde xl, el panel del aside conserva su propio tope (el aside no scrollea)", () => {
    ventanaAncha = true;

    render(<PaginaResumen />);

    const props = vi.mocked(PanelPresupuesto).mock.calls.at(-1)?.[0] as unknown as {
      topePropio?: boolean;
    };
    // El scroll vive en la lista del panel, dentro de la tarjeta; el aside no
    // scrollea, así que el panel NO cede su tope.
    expect(props.topePropio).toBeUndefined();
  });

  it("un fallo del presupuesto desde el cuadrito compone el anuncio único con otro fallo", () => {
    ventanaAncha = true;
    // Otro fallo en la pantalla (el resumen) además del presupuesto; el
    // checklist caído mantiene la sección del cuadrito en pantalla.
    ajustar({
      deResumen: { data: undefined, isError: true, error: new Error("boom") },
      deChecklist: { data: undefined, isError: true, error: new Error("boom") },
    });
    render(<PaginaResumen />);

    // El cuadrito reporta que el presupuesto falló: ya son dos fallos.
    const props = vi.mocked(CuantoMeSobra).mock.calls.at(-1)?.[0] as unknown as {
      onFalloPresupuesto?: (fallo: boolean) => void;
    };
    act(() => props.onFalloPresupuesto?.(true));

    // Con dos fallos, el panel cede a group y la pantalla compone el anuncio.
    const propsPanel = vi.mocked(PanelPresupuesto).mock.calls.at(-1)?.[0] as unknown as {
      compartePantalla?: boolean;
    };
    expect(propsPanel.compartePantalla).toBe(true);
    expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
    // Y con la composición no queda ninguna alerta suelta compitiendo.
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Resumen: piso de toque de 44px", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ventanaAncha = false;
    ajustar({});
  });
  afterEach(cleanup);

  it('el trigger "Presupuesto" del móvil lleva el piso de toque', () => {
    // Séptima critique: el DrawerTrigger del cajón era size="sm" a 28px.
    render(<PaginaResumen />);

    const trigger = screen.getByRole("button", { name: /Presupuesto/ });
    expect(trigger.classList.contains("min-h-11")).toBe(true);
  });

  it("el selector de moneda lleva el piso de toque de 44px", () => {
    // El trigger está pegado a un bloque redondeado con el mes: la clase
    // h-11 sube el objetivo al piso sin romper la franja.
    ajustar({ deMonedas: { data: ["COP", "USD"] } });
    render(<PaginaResumen />);

    const disparador = screen.getByRole("combobox");
    expect(disparador.classList.contains("min-h-11")).toBe(true);
  });
});

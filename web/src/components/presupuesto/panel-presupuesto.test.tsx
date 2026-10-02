// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

import { PanelPresupuesto } from "./panel-presupuesto";
import * as useCategoriasModule from "@/hooks/use-categorias";
import * as usePresupuestoModule from "@/hooks/use-presupuesto";
import type { ItemDelChecklist, ItemPresupuesto } from "@/lib/api/types";

vi.mock("@/hooks/use-presupuesto", () => ({
  useChecklistDelMes: vi.fn(),
  usePresupuestoItems: vi.fn(),
  useDesarchivarItemPresupuesto: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
}));

vi.mock("@/hooks/use-categorias", () => ({
  useCategorias: vi.fn(),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => false,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@/components/presupuesto/formulario-item-presupuesto", () => ({
  FormularioItemPresupuesto: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const renglon: ItemDelChecklist = {
  id: "r-1",
  label: "Mercado",
  kind: "category",
  currency: "COP",
  target: "30000",
  progress: "20500",
  checked: false,
  exceeded: false,
} as ItemDelChecklist;

function ajustarConsultas(
  checklist: Record<string, unknown>,
  items: Record<string, unknown> = {},
  catalogo: unknown[] = []
) {
  vi.mocked(usePresupuestoModule.useChecklistDelMes).mockImplementation(
    () =>
      ({
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        ...checklist,
      }) as never
  );
  vi.mocked(usePresupuestoModule.usePresupuestoItems).mockImplementation(
    () =>
      ({
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: vi.fn(),
        ...items,
      }) as never
  );
  vi.mocked(useCategoriasModule.useCategorias).mockImplementation(
    () => ({ isLoading: false, data: catalogo, refetch: vi.fn() }) as never
  );
}

afterEach(cleanup);

describe("PanelPresupuesto: una variante por contenedor", () => {
  it("la variante tarjeta trae su Card con título y el botón Agregar", () => {
    ajustarConsultas({ data: { items: [renglon] } }, { data: [] });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByText("Presupuesto del mes")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
  });

  it("la variante suelta (dentro de un cajón o de una pantalla) no agrega un segundo encabezado", () => {
    ajustarConsultas({ data: { items: [renglon] } }, { data: [] });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />);

    expect(screen.queryByText("Presupuesto del mes")).not.toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeInTheDocument();
  });

  it("si falla la consulta de los ítems archivados, se dice y se ofrece reintentar — no desaparece el bloque", () => {
    ajustarConsultas(
      { data: { items: [renglon] } },
      { isError: true, error: new Error("boom") }
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(
      screen.getByText(
        "No pudimos cargar los ítems archivados. Puede ser que el servidor esté dormido."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reintentar archivados" })
    ).toBeInTheDocument();
    // Un bloque que se sume en silencio diría "no archivaste nada", que
    // puede ser mentira.
    expect(screen.queryByText(/Archivados/)).not.toBeInTheDocument();
  });

  it("con los dos fallos del panel a la vez, solo el checklist interrumpe y los archivados ceden", () => {
    ajustarConsultas(
      { isError: true, error: new Error("boom") },
      { isError: true, error: new Error("boom") }
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Dos alertas del mismo panel serían una tormenta: una sola anuncia y la
    // otra queda visible y navegable, con su Reintentar propio.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar tu presupuesto del mes. Puede ser que el servidor esté dormido."
    );
    expect(screen.getByRole("group")).toHaveTextContent(
      "No pudimos cargar los ítems archivados. Puede ser que el servidor esté dormido."
    );
    expect(screen.getByRole("button", { name: "Reintentar presupuesto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar archivados" })).toBeInTheDocument();
  });

  it("con la pantalla componiendo el anuncio, ninguno de los dos interrumpe", () => {
    ajustarConsultas(
      { isError: true, error: new Error("boom") },
      { isError: true, error: new Error("boom") }
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" compartePantalla />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reintentar presupuesto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar archivados" })).toBeInTheDocument();
  });

  it("solo los archivados fallando interrumpe con alert: no cede si no hay con quién", () => {
    ajustarConsultas(
      { data: { items: [renglon] } },
      { isError: true, error: new Error("boom") }
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar los ítems archivados. Puede ser que el servidor esté dormido."
    );
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});

// -------------------------------------------------------------------------
// Agrupación por categoría
// -------------------------------------------------------------------------

function itemPresupuesto(over: Partial<ItemPresupuesto> & { id: string }): ItemPresupuesto {
  return {
    kind: "category",
    currency: "COP",
    categoryId: null,
    categoryName: null,
    accountId: null,
    accountName: null,
    label: null,
    currentAmount: "1000",
    archivedAt: null,
    ...over,
  };
}

function renglonDe(item: ItemPresupuesto): ItemDelChecklist {
  return {
    id: item.id,
    kind: item.kind,
    currency: item.currency,
    label: item.label ?? item.categoryName ?? item.accountName ?? "Ítem",
    target: "100",
    progress: "50",
    checked: false,
    exceeded: false,
  };
}

/** Catálogo con una categoría de ingreso a propósito: debe quedar fuera del
 * mapa de colores de gasto, igual que en la gráfica "Por categoría". */
const CATALOGO = [
  { id: "cat-comida", name: "Comida", kind: "expense", archivedAt: null },
  { id: "cat-transporte", name: "Transporte", kind: "expense", archivedAt: null },
  { id: "cat-ocio", name: "Ocio", kind: "expense", archivedAt: null },
  { id: "cat-sueldo", name: "Sueldo", kind: "income", archivedAt: null },
];

function deCategoria(id: string, categoria: "comida" | "transporte" | "ocio", label: string) {
  const nombres = { comida: "Comida", transporte: "Transporte", ocio: "Ocio" } as const;
  return itemPresupuesto({
    id,
    categoryId: `cat-${categoria}`,
    categoryName: nombres[categoria],
    label,
  });
}

function deAhorro(id: string, label: string) {
  return itemPresupuesto({
    id,
    kind: "savings",
    accountId: `acc-${id}`,
    accountName: label,
    label,
  });
}

function encabezados() {
  return screen.getAllByRole("button", { expanded: true }).map((h) => h.getAttribute("aria-label"));
}

describe("PanelPresupuesto: agrupado por categoría", () => {
  it("ordena los grupos del que más ítems tiene al que menos", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "comida", "Restaurantes"),
      deCategoria("c3", "comida", "Panadería"),
      deCategoria("t1", "transporte", "Bus"),
      deCategoria("t2", "transporte", "Taxi"),
      deCategoria("o1", "ocio", "Cine"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(encabezados()).toEqual(["Comida", "Transporte", "Ocio"]);
  });

  it("a igual cantidad de ítems, desempata alfabéticamente", () => {
    const items = [
      deCategoria("t1", "transporte", "Bus"),
      deCategoria("o1", "ocio", "Cine"),
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "comida", "Restaurantes"),
      deCategoria("o2", "ocio", "Concierto"),
      deCategoria("t2", "transporte", "Taxi"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Los tres grupos tienen 2 ítems cada uno: manda el nombre.
    expect(encabezados()).toEqual(["Comida", "Ocio", "Transporte"]);
  });

  it("las metas de ahorro van en su propio grupo, al final, aunque sean las más", () => {
    const items = [
      deAhorro("a1", "Viaje"),
      deCategoria("c1", "comida", "Mercado"),
      deAhorro("a2", "Emergencias"),
      deAhorro("a3", "Carro"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Ahorro tiene 3 y Comida 1; aun así cierra la lista: es el otro tipo de
    // meta (apartar plata), no un tope de gasto más.
    expect(encabezados()).toEqual(["Comida", "Ahorro"]);
  });

  it("cada grupo lleva el color de su categoría, el mismo de la gráfica, y el nombre lo acompaña en texto", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const comida = screen.getByRole("button", { name: "Comida", expanded: true });
    const transporte = screen.getByRole("button", { name: "Transporte", expanded: true });

    // Paleta categórica en claro, sobre las categorías de gasto ordenadas por
    // nombre (Comida 1º = azul, Ocio 2º, Transporte 3º = aqua). "Sueldo" es de
    // ingreso y no corre el índice.
    const puntoComida = comida.querySelector('span[aria-hidden="true"]') as HTMLElement;
    const puntoTransporte = transporte.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(puntoComida.style.backgroundColor).toBe("rgb(42, 120, 214)");
    expect(puntoTransporte.style.backgroundColor).toBe("rgb(27, 175, 122)");
    // El color refuerza, pero el nombre visible es el que informa.
    expect(within(comida).getByText("Comida")).toBeInTheDocument();
  });

  it("el encabezado del grupo es un control de 44px que repliega y despliega", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "comida", "Restaurantes"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const header = screen.getByRole("button", { name: "Comida", expanded: true });
    expect(header.classList.contains("min-h-11")).toBe(true);

    fireEvent.click(header);

    const replegado = screen.getByRole("button", { name: "Comida", expanded: false });
    // El contenido queda oculto sin desmontarse: `aria-controls` sigue apuntando
    // a un id real.
    expect(screen.getByText("Mercado")).not.toBeVisible();
    expect(screen.getByText("Restaurantes")).not.toBeVisible();

    fireEvent.click(replegado);
    expect(screen.getByText("Mercado")).toBeVisible();
  });

  it("si todavía no hay metadatos de los ítems, no inventa un grupo 'Sin categoría'", () => {
    // La consulta de ítems (que trae la categoría) aún no resolvió o falló.
    ajustarConsultas({ data: { items: [renglon] } });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Se ve plano, sin encabezados que afirmen una categoría que no conocemos.
    expect(screen.queryByText("Sin categoría")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);
    expect(screen.getByText("Mercado")).toBeInTheDocument();
  });

  it("una categoría archivada conserva su lugar en el mapa de colores", () => {
    // "Alquiler" está archivada y va antes alfabéticamente; igual cuenta para
    // el índice, como en la gráfica, para que Comida no salte de color.
    const catalogo = [
      ...CATALOGO,
      { id: "cat-alquiler", name: "Alquiler", kind: "expense", archivedAt: "2026-01-01" },
    ];
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, catalogo);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Con "Alquiler" primero: Comida 2ª = naranja, Transporte 4ª = amarillo.
    const comida = screen.getByRole("button", { name: "Comida", expanded: true });
    const transporte = screen.getByRole("button", { name: "Transporte", expanded: true });
    const puntoComida = comida.querySelector('span[aria-hidden="true"]') as HTMLElement;
    const puntoTransporte = transporte.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(puntoComida.style.backgroundColor).toBe("rgb(235, 104, 52)");
    expect(puntoTransporte.style.backgroundColor).toBe("rgb(237, 161, 0)");
  });

  it("contiene la lista en una región con altura máxima y scroll interno", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const region = screen.getByRole("region", { name: "Ítems del presupuesto" });
    expect(region.classList.contains("max-h-[70vh]")).toBe(true);
    expect(region.classList.contains("overflow-y-auto")).toBe(true);
    // Enfocable para poder recorrerla con el teclado.
    expect(region.tabIndex).toBe(0);
  });
});

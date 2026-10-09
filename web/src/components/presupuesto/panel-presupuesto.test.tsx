// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

import { PanelPresupuesto } from "./panel-presupuesto";
import { FormularioItemPresupuesto } from "@/components/presupuesto/formulario-item-presupuesto";
import * as useCategoriasModule from "@/hooks/use-categorias";
import * as usePresupuestoModule from "@/hooks/use-presupuesto";
import type { Categoria, ItemDelChecklist, ItemPresupuesto } from "@/lib/api/types";
import { CLASES_ASIDE } from "@/lib/aside-resumen";
import { mapaColoresCategoriasDelCatalogo } from "@/lib/chart-colors";
import { cuantoSobraEnElMes, totalesPrevistos } from "@/lib/cuanto-sobra";
import { restar } from "@/lib/money";

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
  FormularioItemPresupuesto: vi.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>),
}));

import { mesActual, nombreDelMes, sumarMeses } from "@/lib/fecha";

const renglon: ItemDelChecklist = {
  id: "r-1",
  label: "Mercado",
  kind: "category",
  currency: "COP",
  categoryKind: "expense",
  categoryId: null,
  categoryName: null,
  target: "30000",
  progress: "20500",
  checked: false,
  exceeded: false,
  status: "pending",
} as ItemDelChecklist;

// Renglón de un mes en planeación: nada se ha movido todavía (el servidor
// reporta progreso en cero) y el tope está puesto de propina.
const renglonFuturo: ItemDelChecklist = {
  ...renglon,
  id: "r-futuro",
  target: "50000",
  progress: "0",
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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.mocked(FormularioItemPresupuesto).mockClear();
});

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
        "No pudimos cargar los ítems archivados. Revisa tu conexión y vuelve a intentarlo."
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
      "No pudimos cargar tu presupuesto del mes. Revisa tu conexión y vuelve a intentarlo."
    );
    expect(screen.getByRole("group")).toHaveTextContent(
      "No pudimos cargar los ítems archivados. Revisa tu conexión y vuelve a intentarlo."
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
      "No pudimos cargar los ítems archivados. Revisa tu conexión y vuelve a intentarlo."
    );
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("una consulta pausada sin red no se disfraza de 'nada por revisar este mes'", () => {
    ajustarConsultas({ data: undefined, isPaused: true }, { data: [] });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Falla si el panel vuelve a mostrar el vacío con la consulta pausada.
    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar tu presupuesto del mes. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Nada por revisar este mes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar presupuesto" })).toBeInTheDocument();
  });

  it("si la consulta de archivados queda pausada, no dice que no archivaste nada", () => {
    ajustarConsultas({ data: { items: [renglon] } }, { data: undefined, isPaused: true });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar los ítems archivados. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Archivados \(/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar archivados" })).toBeInTheDocument();
  });

  it("con el checklist pausado y los archivados pausados, una sola voz (el checklist anuncia)", () => {
    ajustarConsultas({ data: undefined, isPaused: true }, { data: undefined, isPaused: true });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sin conexión: no pudimos cargar tu presupuesto del mes."
    );
    expect(screen.getByRole("group")).toHaveTextContent(
      "Sin conexión: no pudimos cargar los ítems archivados."
    );
  });

  it("los controles de recuperación del panel miden 44px: Reintentar, Restaurar y Archivados", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas(
      { data: { items: items.map(renglonDe) } },
      { data: [{ ...items[0], archivedAt: "2026-01-01T00:00:00Z" }] },
      CATALOGO
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const archivados = screen.getByRole("button", { name: "Archivados (1)" });
    expect(archivados.classList.contains("min-h-11")).toBe(true);

    fireEvent.click(archivados);

    const restaurar = screen.getByRole("button", { name: "Restaurar" });
    expect(restaurar.classList.contains("min-h-11")).toBe(true);
  });

  it("el botón Reintentar del bloque de fallo también mide 44px", () => {
    ajustarConsultas({ data: undefined, isError: true, error: new Error("boom") });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const reintentar = screen.getByRole("button", { name: "Reintentar presupuesto" });
    expect(reintentar.classList.contains("min-h-11")).toBe(true);
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
    categoryKind: null,
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
    categoryKind: item.categoryKind,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    target: "100",
    progress: "50",
    checked: false,
    exceeded: false,
    status: "pending",
  };
}

/** Catálogo con una categoría de ingreso a propósito: debe quedar fuera del
 * mapa de colores de gasto, igual que en la gráfica "Por categoría". */
const CATALOGO: Categoria[] = [
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
    categoryKind: "expense",
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

function deIngreso(id: string, label: string) {
  return itemPresupuesto({
    id,
    categoryId: "cat-sueldo",
    categoryName: "Sueldo",
    categoryKind: "income",
    label,
  });
}

function encabezados() {
  return screen.getAllByRole("button", { expanded: true }).map((h) => h.getAttribute("aria-label"));
}

/** La misma etiqueta accesible que arma el panel: incluye el conteo. */
function etiquetaGrupo(titulo: string, cantidad: number) {
  return `${titulo}, ${cantidad} ${cantidad === 1 ? "ítem" : "ítems"}`;
}

/** "#2a78d6" -> "rgb(42, 120, 214)", como lo reporta el estilo en jsdom. */
function colorCss(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
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

    expect(encabezados()).toEqual([
      etiquetaGrupo("Comida", 3),
      etiquetaGrupo("Transporte", 2),
      etiquetaGrupo("Ocio", 1),
    ]);
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
    expect(encabezados()).toEqual([
      etiquetaGrupo("Comida", 2),
      etiquetaGrupo("Ocio", 2),
      etiquetaGrupo("Transporte", 2),
    ]);
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
    expect(encabezados()).toEqual([etiquetaGrupo("Comida", 1), etiquetaGrupo("Ahorro", 3)]);
  });

  it("cada grupo lleva el color de su categoría, el mismo de la gráfica, y el nombre lo acompaña en texto", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const comida = screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true });
    const transporte = screen.getByRole("button", {
      name: etiquetaGrupo("Transporte", 1),
      expanded: true,
    });

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

    const header = screen.getByRole("button", {
      name: etiquetaGrupo("Comida", 2),
      expanded: true,
    });
    expect(header.classList.contains("min-h-11")).toBe(true);

    fireEvent.click(header);

    const replegado = screen.getByRole("button", {
      name: etiquetaGrupo("Comida", 2),
      expanded: false,
    });
    // El contenido queda oculto sin desmontarse: `aria-controls` sigue apuntando
    // a un id real.
    expect(screen.getByText("Mercado")).not.toBeVisible();
    expect(screen.getByText("Restaurantes")).not.toBeVisible();

    fireEvent.click(replegado);
    expect(screen.getByText("Mercado")).toBeVisible();
  });

  it("al replegar un grupo con un tope excedido, el aviso sobrevive en el encabezado", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = items.map((item) => ({ ...renglonDe(item), exceeded: true }));
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true }));

    // Replegado, el encabezado dice que hay un tope excedido: la alerta roja no
    // se esconde con el grupo.
    expect(
      screen.getByRole("button", {
        name: `${etiquetaGrupo("Comida", 1)}, con un tope excedido`,
        expanded: false,
      })
    ).toBeInTheDocument();
  });

  it("con más de un tope excedido, el aviso del encabezado va en plural", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "comida", "Restaurantes"),
    ];
    const checklist = items.map((item) => ({ ...renglonDe(item), exceeded: true }));
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Comida", 2), expanded: true }));

    expect(
      screen.getByRole("button", {
        name: `${etiquetaGrupo("Comida", 2)}, con topes excedidos`,
        expanded: false,
      })
    ).toBeInTheDocument();
  });

  it("los ids de aria-controls son únicos entre dos paneles montados a la vez", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(
      <>
        <PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />
        <PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />
      </>
    );

    const headers = screen.getAllByRole("button", {
      name: etiquetaGrupo("Comida", 1),
      expanded: true,
    });
    expect(headers).toHaveLength(2);
    const ids = headers.map((h) => h.getAttribute("aria-controls"));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(document.getElementById(id!)).not.toBeNull();
    }
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

  it("si a un renglón le falta su ítem, no agrupa ni lo deja sin edición bajo un grupo falso", () => {
    // La consulta de ítems llegó, pero incompleta: falta el renglón "r-1".
    const items = [deCategoria("c1", "comida", "Panadería")];
    ajustarConsultas(
      { data: { items: [renglon, ...items.map(renglonDe)] } },
      { data: items },
      CATALOGO
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Cae a lista plana en vez de inventar un grupo "Sin categoría".
    expect(screen.queryByText("Sin categoría")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);
    expect(screen.getByText("Mercado")).toBeInTheDocument();

    // El renglón sin detalle explica su estado de solo lectura...
    const sinDetalle = screen.getByText("Mercado").closest("li")!;
    expect(
      within(sinDetalle).getByText("No pudimos cargar los detalles de este ítem.")
    ).toBeInTheDocument();
    expect(within(sinDetalle).queryByRole("button")).not.toBeInTheDocument();

    // ...y el que sí tiene metadatos conserva su botón de editar.
    const conDetalle = screen.getByText("Panadería").closest("li")!;
    expect(within(conDetalle).getByRole("button")).toBeInTheDocument();
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
    const comida = screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true });
    const transporte = screen.getByRole("button", {
      name: etiquetaGrupo("Transporte", 1),
      expanded: true,
    });
    const puntoComida = comida.querySelector('span[aria-hidden="true"]') as HTMLElement;
    const puntoTransporte = transporte.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(puntoComida.style.backgroundColor).toBe("rgb(235, 104, 52)");
    expect(puntoTransporte.style.backgroundColor).toBe("rgb(237, 161, 0)");
  });

  it("en el aside la tarjeta se ajusta a la ventana y la lista toma el alto que sobra, con su carril reservado", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    const { container } = render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // La tarjeta lleva el tope de ventana; su contenido es una columna flex.
    const card = container.querySelector("[data-slot='card']")!;
    expect(card.className).toContain("max-h-[calc(100vh-2rem)]");

    const region = screen.getByRole("region", { name: "Ítems del presupuesto" });
    // La lista toma el espacio libre y scrollea solo ella, con el carril de la
    // barra reservado para que el contenido no cambie de ancho.
    expect(region.classList.contains("flex-1")).toBe(true);
    expect(region.classList.contains("min-h-0")).toBe(true);
    expect(region.classList.contains("overflow-y-auto")).toBe(true);
    expect(region.classList.contains("[scrollbar-gutter:stable]")).toBe(true);
    expect(region.classList.contains("scroll-fino")).toBe(true);
    expect(region.classList.contains("max-h-[70vh]")).toBe(false);
    // Enfocable para poder recorrerla con el teclado.
    expect(region.tabIndex).toBe(0);

    // El renglón no lleva margen negativo: dentro del scroll horizontal
    // automático se salía 8px y descuadraba. Lo vigila la prueba, no solo el
    // script de Chromium.
    const fila = screen.getByText("Mercado").closest("li")!;
    expect(fila.className).toContain("rounded-lg");
    expect(fila.className).not.toContain("-mx-2");
  });

  it("en la pantalla de Presupuesto (suelta) la región conserva su tope de 70vh y su carril", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />);

    const region = screen.getByRole("region", { name: "Ítems del presupuesto" });
    expect(region.classList.contains("max-h-[70vh]")).toBe(true);
    expect(region.classList.contains("overflow-y-auto")).toBe(true);
    expect(region.classList.contains("[scrollbar-gutter:stable]")).toBe(true);
    expect(region.classList.contains("scroll-fino")).toBe(true);
    expect(region.classList.contains("flex-1")).toBe(false);
  });

  it("sin tope propio (dentro del cajón que ya scrollea) la región no scrollea sola", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(
      <PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" topePropio={false} />
    );

    const region = screen.getByRole("region", { name: "Ítems del presupuesto" });
    // Sin tope propio el scroll lo hace el contenedor que envuelve al panel.
    // La región tampoco lleva su propio `overflow-y-auto`: un scroll anidado
    // atraparía el dedo.
    expect(region.classList.contains("max-h-[70vh]")).toBe(false);
    expect(region.classList.contains("overflow-y-auto")).toBe(false);
    expect(region.classList.contains("flex-1")).toBe(false);
  });

  it("la tarjeta del panel no se encoge dentro del aside (shrink-0) y se ajusta a la ventana", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    const { container } = render(<PanelPresupuesto mes="2026-09" moneda="COP" />);
    const card = container.querySelector("[data-slot='card']")!;
    // Sin `shrink-0` el flex podría aplastarla; el tope de ventana la hace
    // caber entera aunque la lista sea larga.
    expect(card.className).toContain("shrink-0");
    expect(card.className).toContain("max-h-[calc(100vh-2rem)]");
  });

  it("el encabezado del grupo queda pegado al scroll de la lista (sticky)", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    const { container } = render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const header = screen.getByRole("button", { name: etiquetaGrupo("Comida", 1) });
    // Pegado al scroll de la lista, con fondo que tapa los renglones que pasan
    // por debajo y z-index para pintar por encima.
    expect(header.classList.contains("sticky")).toBe(true);
    expect(header.classList.contains("top-0")).toBe(true);
    expect(header.classList.contains("z-10")).toBe(true);
    expect(header.classList.contains("bg-card")).toBe(true);

    // La tarjeta conserva su `overflow-hidden` (recorta a su radio): el sticky
    // se pega a la región, que es la que scrollea, no a la tarjeta.
    const card = container.querySelector("[data-slot='card']")!;
    expect(card.className).toContain("overflow-hidden");
    expect(card.className).not.toContain("max-h-[70vh]");
  });

  it("el aside no retoma su scroll y la lista reserva el carril (guarda contra el recorte)", () => {
    // El recorte original venía del scroll de la COLUMNA (el aside) y de no
    // reservar el carril de la barra. Esta prueba fija el contrato en las
    // clases compartidas; la medición de Chromium lo comprueba en píxeles.
    expect(CLASES_ASIDE).not.toContain("overflow-y-auto");
    expect(CLASES_ASIDE).not.toContain("max-h-");
    expect(CLASES_ASIDE).toContain("shrink-0");

    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    const { container } = render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const region = screen.getByRole("region", { name: "Ítems del presupuesto" });
    const card = container.querySelector("[data-slot='card']")!;
    // La columna mide 320px: el panel no clava ese ancho; la lista reserva el
    // carril, así aparezca o no la barra el contenido no cambia de ancho.
    for (const clase of ["w-80", "w-[320px]"]) {
      expect(region.classList.contains(clase)).toBe(false);
      expect(card.classList.contains(clase)).toBe(false);
    }
    expect(region.classList.contains("[scrollbar-gutter:stable]")).toBe(true);
    expect(region.classList.contains("scroll-fino")).toBe(true);
    // Agregar no se recorta y se toca: 44px de alto.
    const agregar = screen.getByRole("button", { name: "Agregar" });
    expect(agregar.classList.contains("min-h-11")).toBe(true);
  });

  it("en la variante suelta el encabezado no se pega ni pinta fondo de tarjeta", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" topePropio={false} />);

    const header = screen.getByRole("button", { name: etiquetaGrupo("Comida", 1) });
    // Fuera de la tarjeta (la pantalla /presupuesto o el cajón) el encabezado
    // sigue transparente: en tema oscuro un `bg-card` pegado dejaría una banda
    // de otro color.
    expect(header.classList.contains("sticky")).toBe(false);
    expect(header.classList.contains("bg-card")).toBe(false);
    expect(header.classList.contains("z-10")).toBe(false);
  });

  it("el renglón editable deja margen de scroll para no quedar bajo el encabezado fijo", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const boton = screen.getByText("Mercado").closest("button")!;
    // Al enfocar con Tab, el navegador deja 44px arriba: el foco no queda
    // oculto debajo del encabezado `sticky`.
    expect(boton.classList.contains("scroll-mt-11")).toBe(true);
  });

  it("el botón de un renglón editable muestra anillo de foco, no queda ciego", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const boton = screen.getByText("Mercado").closest("button")!;
    expect(boton.className).toContain("focus-visible:ring-3");
    expect(boton.className).toContain("focus-visible:ring-ring/85");
  });
});

// -------------------------------------------------------------------------
// Contraer todo
// -------------------------------------------------------------------------

describe("PanelPresupuesto: contraer/desplegar todo", () => {
  it("un solo botón alterna: 'Contraer todo' con algo abierto y 'Desplegar todo' con todo cerrado", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "comida", "Restaurantes"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const contraer = screen.getByRole("button", { name: "Contraer todo" });
    // Texto pequeño, fantasma y piso de toque de 44px.
    expect(contraer.textContent).toBe("Contraer todo");
    expect(contraer.classList.contains("min-h-11")).toBe(true);

    fireEvent.click(contraer);

    // Los dos grupos quedan replegados...
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(2);
    // ...y el botón NO desaparece: pasa a ofrecer desplegar.
    const desplegar = screen.getByRole("button", { name: "Desplegar todo" });
    expect(desplegar.textContent).toBe("Desplegar todo");
    expect(desplegar.classList.contains("min-h-11")).toBe(true);

    fireEvent.click(desplegar);

    // Vuelve a abrir todo y el botón vuelve a contraer.
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Contraer todo" })).toBeInTheDocument();
  });

  it("con un grupo cerrado y otro abierto sigue ofreciéndolo", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Cierro solo Comida: queda Transporte abierto.
    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true }));

    expect(
      screen.getByRole("button", { name: "Contraer todo" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Desplegar todo" })
    ).not.toBeInTheDocument();
  });

  it("con una clave replegada de otro mes, el grupo nuevo abierto cuenta igual (no se oculta el botón)", () => {
    const comida = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: comida.map(renglonDe) } }, { data: comida }, CATALOGO);
    const { rerender } = render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Cambio de mes: Comida queda replegada (clave obsoleta en el estado).
    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    expect(screen.getByRole("button", { name: "Desplegar todo" })).toBeInTheDocument();

    // El mes nuevo solo trae Transporte, que no está en el estado: sale
    // abierto y el botón debe ofrecer contraer aunque el tamaño de la clave
    // vieja coincida con el número de grupos.
    const transporte = [deCategoria("t1", "transporte", "Bus")];
    ajustarConsultas({ data: { items: transporte.map(renglonDe) } }, { data: transporte }, CATALOGO);
    rerender(<PanelPresupuesto mes="2026-10" moneda="COP" />);

    expect(
      screen.getByRole("button", { name: "Contraer todo" })
    ).toBeInTheDocument();
  });

  it("no se muestra en la lista plana (sin metadatos de categoría)", () => {
    ajustarConsultas({ data: { items: [renglon] } });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(
      screen.queryByRole("button", { name: "Contraer todo" })
    ).not.toBeInTheDocument();
  });

  it("con una categoría cerrada de varias, una pista discreta cuenta cuántas y las vuelve a mostrar", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Con todo abierto no hay ruido.
    expect(screen.queryByText("1 categoría cerrada")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true }));

    // La pista aparece y es la entrada para desplegar: piso de 44px, sin
    // depender solo del color (es texto) y con nombre audible de acción.
    const pista = screen.getByRole("button", { name: "Desplegar 1 categoría cerrada" });
    expect(pista).toHaveTextContent("1 categoría cerrada");
    expect(pista.classList.contains("min-h-11")).toBe(true);

    fireEvent.click(pista);

    expect(
      screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true })
    ).toBeInTheDocument();
    expect(screen.queryByText("1 categoría cerrada")).not.toBeInTheDocument();
  });

  it("con dos cerradas la pista va en plural y sigue siendo la entrada a desplegar", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
      deCategoria("o1", "ocio", "Cine"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true }));
    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Transporte", 1), expanded: true }));

    const pista = screen.getByRole("button", { name: "Desplegar 2 categorías cerradas" });
    expect(pista).toHaveTextContent("2 categorías cerradas");
    fireEvent.click(pista);

    expect(
      screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: etiquetaGrupo("Transporte", 1), expanded: true })
    ).toBeInTheDocument();
  });

  it("con todo cerrado no se duplica la pista: el alternante ya dice 'Desplegar todo'", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));

    expect(screen.getByRole("button", { name: "Desplegar todo" })).toBeInTheDocument();
    expect(screen.queryByText("2 categorías cerradas")).not.toBeInTheDocument();
  });

  it("en la variante suelta también aparece, junto al encabezado de la lista", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />);

    expect(
      screen.getByRole("button", { name: "Contraer todo" })
    ).toBeInTheDocument();
  });

  it("al contraer todo, el aviso de un tope excedido sobrevive en el encabezado", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = items.map((item) => ({ ...renglonDe(item), exceeded: true }));
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));

    expect(
      screen.getByRole("button", {
        name: `${etiquetaGrupo("Comida", 1)}, con un tope excedido`,
        expanded: false,
      })
    ).toBeInTheDocument();
  });
});

// -------------------------------------------------------------------------
// Persistencia de grupos replegados (localStorage)
// -------------------------------------------------------------------------

const CLAVE_GRUPOS = "cuadre:presupuesto:grupos-cerrados:v1";

function guardarCerrados(claves: string[]) {
  window.localStorage.setItem(CLAVE_GRUPOS, JSON.stringify(claves));
}

describe("PanelPresupuesto: recuerda los grupos replegados", () => {
  it("lee lo guardado y monta cerrado ese grupo", async () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);
    guardarCerrados(["cat-comida"]);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: false })
      ).toBeInTheDocument()
    );
    // El que no estaba guardado sigue abierto.
    expect(
      screen.getByRole("button", { name: etiquetaGrupo("Transporte", 1), expanded: true })
    ).toBeInTheDocument();
  });

  it("al cerrar un grupo lo guarda", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);
    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true }));

    expect(JSON.parse(window.localStorage.getItem(CLAVE_GRUPOS)!)).toEqual(["cat-comida"]);
  });

  it("'Contraer todo' guarda todos los grupos", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);
    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));

    expect(JSON.parse(window.localStorage.getItem(CLAVE_GRUPOS)!).sort()).toEqual([
      "cat-comida",
      "cat-transporte",
    ]);
  });

  it("'Contraer todo' conserva lo ya cerrado de una categoría que hoy no aparece", () => {
    // Contraer no reemplaza: suma. "cat-ocio" no tiene ítems este mes pero su
    // preferencia debe sobrevivir.
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);
    guardarCerrados(["cat-ocio"]);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);
    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));

    expect(JSON.parse(window.localStorage.getItem(CLAVE_GRUPOS)!).sort()).toEqual([
      "cat-comida",
      "cat-ocio",
    ]);
  });

  it("'Desplegar todo' vacía el conjunto guardado", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);
    guardarCerrados(["cat-comida", "cat-ocio"]);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    fireEvent.click(screen.getByRole("button", { name: "Desplegar todo" }));

    expect(JSON.parse(window.localStorage.getItem(CLAVE_GRUPOS)!)).toEqual([]);
    expect(screen.getByRole("button", { name: "Contraer todo" })).toBeInTheDocument();
  });

  it("un grupo nuevo aparece abierto aunque haya otros guardados cerrados", async () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("t1", "transporte", "Bus"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);
    guardarCerrados(["cat-comida"]);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: etiquetaGrupo("Transporte", 1), expanded: true })
      ).toBeInTheDocument()
    );
  });

  it("con JSON corrupto no rompe y todo aparece abierto", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);
    window.localStorage.setItem(CLAVE_GRUPOS, "{no es json");

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(
      screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true })
    ).toBeInTheDocument();
  });

  it("dos paneles montados a la vez se mantienen sincronizados", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(
      <>
        <PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />
        <PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />
      </>
    );

    const abiertos = screen.getAllByRole("button", {
      name: etiquetaGrupo("Comida", 1),
      expanded: true,
    });
    expect(abiertos).toHaveLength(2);

    fireEvent.click(abiertos[0]);

    // El segundo panel (mismo documento) releyó el almacén: quedó cerrado.
    expect(
      screen.getAllByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: false })
    ).toHaveLength(2);
  });

  it("poda una clave de una categoría que ya no existe", async () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);
    guardarCerrados(["cat-comida", "cat-borrada"]);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(CLAVE_GRUPOS)!)).toEqual(["cat-comida"])
    );
  });
});

// -------------------------------------------------------------------------
// Dos secciones: Ingresos y Gastos
// -------------------------------------------------------------------------

describe("PanelPresupuesto: ingresos y gastos en secciones", () => {
  it("separa los renglones en 'Ingresos' y 'Gastos', cada uno con su agrupación", () => {
    const items = [
      deIngreso("i1", "Salario"),
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "comida", "Restaurantes"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Las dos secciones, con nombre (h3) — no solo el encabezado del grupo.
    expect(screen.getByRole("heading", { name: "Ingresos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gastos" })).toBeInTheDocument();
    // Cada grupo vive en su sección.
    const seccionIng = screen.getByRole("heading", { name: "Ingresos" }).closest("section")!;
    const seccionGas = screen.getByRole("heading", { name: "Gastos" }).closest("section")!;
    expect(within(seccionIng).getByRole("button", { name: etiquetaGrupo("Sueldo", 1) })).toBeInTheDocument();
    expect(within(seccionGas).getByRole("button", { name: etiquetaGrupo("Comida", 2) })).toBeInTheDocument();
  });

  it("el ahorro cierra 'Gastos' y no abre una sección aparte", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deAhorro("a1", "Viaje"),
    ];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.queryByRole("heading", { name: "Ahorro" })).not.toBeInTheDocument();
    const seccionGas = screen.getByRole("heading", { name: "Gastos" }).closest("section")!;
    // El ahorro vive en Gastos —apartar no es recibir— y cierra la sección.
    const gruposDeGastos = within(seccionGas)
      .getAllByRole("button", { expanded: true })
      .map((b) => b.getAttribute("aria-label"));
    expect(gruposDeGastos.at(-1)).toBe(etiquetaGrupo("Ahorro", 1));
    expect(gruposDeGastos).toContain(etiquetaGrupo("Comida", 1));
    // El ahorro no arrastra una sección "Ingresos".
    expect(screen.queryByRole("heading", { name: "Ingresos" })).not.toBeInTheDocument();
  });

  it("un ingreso en logro se pinta como éxito, nunca como alerta roja", () => {
    const items = [deIngreso("i1", "Salario")];
    const checklist = [{ ...renglonDe(items[0]), progress: "1500", target: "1000", checked: true, exceeded: false }];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Logro verde con su texto accesible...
    expect(screen.getByText("Meta alcanzada")).toBeInTheDocument();
    // ...y ningún aviso de exceso.
    expect(screen.queryByText("Tope excedido")).not.toBeInTheDocument();
    expect(screen.queryByText(/Te pasaste por/)).not.toBeInTheDocument();
  });

  it("aunque el estado de un ingreso llegara con 'exceeded', el panel no lo pinta como alerta", () => {
    // El servicio nunca marca 'exceeded' en un ingreso, pero el panel respeta
    // el estado que recibe sin inventarlo por su cuenta: un renglón de ingreso
    // jamás se tiñe de rojo por "pasarse", ni con 'exceeded' en true.
    const items = [deIngreso("i1", "Salario")];
    const checklist = [{ ...renglonDe(items[0]), progress: "1500", target: "1000", checked: false, exceeded: true }];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.queryByText("Tope excedido")).not.toBeInTheDocument();
    expect(screen.queryByText(/Te pasaste por/)).not.toBeInTheDocument();
  });

  it("el mismo exceso en un tope de gasto sí avisa en rojo", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = [{ ...renglonDe(items[0]), progress: "1500", target: "1000", checked: false, exceeded: true }];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByText("Tope excedido")).toBeInTheDocument();
    expect(screen.getByText(/Te pasaste por/)).toBeInTheDocument();
  });

  it("la etiqueta del progreso dice 'recibido' en ingresos y 'gastado' en gastos", () => {
    const items = [deIngreso("i1", "Salario"), deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), progress: "800", target: "1000" },
      { ...renglonDe(items[1]), progress: "200", target: "1000" },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByRole("progressbar", { name: /Salario:.*recibido de/ })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /Mercado:.*gastado de/ })).toBeInTheDocument();
  });

  it("cada sección toma su color del mapa de su tipo: ingreso con la paleta de ingresos", () => {
    const items = [deIngreso("i1", "Salario"), deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // El mapa de ingresos del catálogo da el primer tono a la primera categoría
    // de ingreso; la de gasto, el suyo.
    const ingreso = mapaColoresCategoriasDelCatalogo(CATALOGO, "income", "claro").get("cat-sueldo");
    const gasto = mapaColoresCategoriasDelCatalogo(CATALOGO, "expense", "claro").get("cat-comida");
    const punto = (titulo: string) =>
      screen
        .getByRole("button", { name: etiquetaGrupo(titulo, 1) })
        .querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(punto("Sueldo").style.backgroundColor).not.toBe("");
    expect(punto("Sueldo").style.backgroundColor).toBe(colorCss(ingreso!));
    expect(punto("Comida").style.backgroundColor).toBe(colorCss(gasto!));
  });

  it("sin renglones de ingreso no aparece la sección 'Ingresos'", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.queryByRole("heading", { name: "Ingresos" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gastos" })).toBeInTheDocument();
  });
});

// -------------------------------------------------------------------------
// Monto propio por mes
// -------------------------------------------------------------------------

describe("PanelPresupuesto: el monto del mes visto", () => {
  it("pasa el mes visto y el monto de ese mes al formulario de cada renglón", () => {
    const items = [
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "comida", "Restaurantes"),
    ];
    const checklist = [
      { ...renglonDe(items[0]), target: "1200" },
      { ...renglonDe(items[1]), target: null },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    const llamadas = vi.mocked(FormularioItemPresupuesto).mock.calls.map(([props]) => props);
    const deRenglones = llamadas.filter((props) => props.item);
    expect(deRenglones.map((props) => props.mes)).toEqual(["2026-01", "2026-01"]);
    expect(deRenglones.map((props) => props.montoDelMes)).toEqual(["1200", null]);

    // El botón Agregar también nace en el mes visto.
    const agregar = llamadas.find((props) => !props.item);
    expect(agregar?.mes).toBe("2026-01");
  });

  it("un renglón sin monto en el mes visto lo dice y ofrece 'Poner monto' de 44px", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = [{ ...renglonDe(items[0]), target: null }];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    expect(screen.getByText("Sin monto en Enero de 2026")).toBeInTheDocument();
    expect(screen.getByText("Poner monto").classList.contains("min-h-11")).toBe(true);

    // Abre el formulario en edición para ESE mes, con monto nulo.
    const llamada = vi
      .mocked(FormularioItemPresupuesto)
      .mock.calls.map(([props]) => props)
      .find((props) => props.item);
    expect(llamada?.mes).toBe("2026-01");
    expect(llamada?.montoDelMes).toBeNull();
  });

  it("un renglón con monto muestra su progreso y no ofrece 'Poner monto'", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = [{ ...renglonDe(items[0]), target: "30000", progress: "20500" }];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    expect(screen.queryByText("Poner monto")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("un renglón sin detalle (no editable) y sin monto no ofrece 'Poner monto'", () => {
    // Sin metadatos de ítems el renglón es de solo lectura: no hay formulario
    // que abrir, así que no se ofrece el control.
    ajustarConsultas({ data: { items: [{ ...renglon, target: null }] } });

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    expect(screen.getByText("Sin monto en Enero de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Poner monto")).not.toBeInTheDocument();
  });
});

describe("PanelPresupuesto: este mes no aplica (target 0)", () => {
  it("un renglón con target 0 se atenuado como 'Sin presupuesto este mes', sin barra ni porcentaje", () => {
    const items = [deCategoria("c1", "comida", "Agua")];
    // "0.0000" es truthy: ni falsedad ni comparaciones de string cuentan
    // aquí; el estado se lee con esCero en el componente.
    const checklist = [
      { ...renglonDe(items[0]), target: "0.0000", progress: "0", exceeded: false },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    // En palabras, no solo de color.
    expect(screen.getByText("Sin presupuesto este mes")).toBeInTheDocument();
    expect(screen.getByText("Agua").className).toContain("text-muted-foreground");
    // Sin barra: con objetivo cero un porcentaje no mide nada.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // Sigue tocable: el renglón nace dentro del formulario de edición.
    const llamada = vi
      .mocked(FormularioItemPresupuesto)
      .mock.calls.map(([props]) => props)
      .find((props) => props.item);
    expect(llamada?.item?.id).toBe("c1");
    expect(llamada?.montoDelMes).toBe("0.0000");
    // El camino de vuelta está a la vista, con piso de 44px.
    expect(screen.getByText("Poner monto").classList.contains("min-h-11")).toBe(true);
  });

  it("gastando sobre un tope de cero, el aviso rojo dice la cantidad y manda sobre la calma atenuada", () => {
    const items = [deCategoria("c1", "comida", "Agua")];
    const checklist = [
      { ...renglonDe(items[0]), target: "0.0000", progress: "12.5", exceeded: true },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    const aviso = screen.getByText(/Te pasaste por/);
    expect(aviso.className).toContain("text-destructive");
    // Sin barra: con objetivo cero un porcentaje no mide nada.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("un ingreso con meta en cero dice 'Sin meta este mes', no 'Sin presupuesto'", () => {
    const items = [deIngreso("c5", "Sueldo")];
    const checklist = [
      { ...renglonDe(items[0]), target: "0.0000", progress: "0", exceeded: false },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    expect(screen.getByText("Sin meta este mes")).toBeInTheDocument();
    expect(screen.queryByText("Sin presupuesto este mes")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("un ítem de ahorro en cero (nunca exceeded) dice 'Sin presupuesto este mes'", () => {
    const items = [deAhorro("c6", "Vacaciones")];
    const checklist = [{ ...renglonDe(items[0]), target: "0.0000", progress: "0" }];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    expect(screen.getByText("Sin presupuesto este mes")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("PanelPresupuesto: un mes futuro se planea, no se confunde con lo real", () => {
  // Un mes adelante del actual: la pantalla de Presupuesto lo deja ver para
  // planear (YNAB/Monarch); ahí nada se ha movido todavía.
  const mesFuturo = sumarMeses(mesActual(), 3);

  it("en el mes futuro el renglón muestra la barra en cero y ningún aviso falso de 'te pasaste'", () => {
    ajustarConsultas({ data: { items: [renglonFuturo] } }, { data: [] });

    render(<PanelPresupuesto mes={mesFuturo} moneda="COP" />);

    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("0");
    expect(screen.queryByText("Te pasaste por")).not.toBeInTheDocument();
    expect(screen.queryByText("Meta alcanzada")).not.toBeInTheDocument();
    expect(screen.queryByText("Tope excedido")).not.toBeInTheDocument();
  });

  it("un renglón sin monto en el mes futuro dice de qué mes falta y no hay estados de otra historia", () => {
    const sinMonto = { ...renglonFuturo, target: null } as unknown as ItemDelChecklist;
    ajustarConsultas({ data: { items: [sinMonto] } }, { data: [] });

    render(<PanelPresupuesto mes={mesFuturo} moneda="COP" />);

    expect(screen.getByText(`Sin monto en ${nombreDelMes(mesFuturo)}`)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Meta alcanzada")).not.toBeInTheDocument();
  });
});

// -------------------------------------------------------------------------
// Total de cada sección (Ingresos y Gastos)
// -------------------------------------------------------------------------

describe("PanelPresupuesto: total de cada sección", () => {
  it("muestra el total de ingresos y de gastos, y su resta es el previsto de cuantoSobraEnElMes", () => {
    const items = [
      deIngreso("i1", "Salario"),
      deIngreso("i2", "Bonos"),
      deCategoria("c1", "comida", "Mercado"),
      deCategoria("c2", "transporte", "Bus"),
    ];
    const checklist = [
      { ...renglonDe(items[0]), target: "3000000" },
      { ...renglonDe(items[1]), target: "500000" },
      { ...renglonDe(items[2]), target: "1200000" },
      { ...renglonDe(items[3]), target: "300000" },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // Cifras exactas y accesibles en palabras, una por sección.
    expect(screen.getByLabelText("Total de ingresos previstos: $3.500.000")).toBeInTheDocument();
    expect(screen.getByLabelText("Total de gastos previstos: $1.500.000")).toBeInTheDocument();

    // La resta a la vista es EXACTAMENTE el previsto del cuadrito: misma
    // función, no pueden diferir jamás.
    const totales = totalesPrevistos(checklist);
    const estado = cuantoSobraEnElMes({ renglones: checklist, income: "0", expense: "0" });
    expect(restar(totales.ingresos, totales.gastos)).toBe(estado.previsto);
    expect(estado.previsto).toBe("2000000.0000");
  });

  it("el total lleva texto accesible, no solo la cifra, como una unidad con nombre", () => {
    const items = [deIngreso("i1", "Salario"), deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), target: "3000000" },
      { ...renglonDe(items[1]), target: "200000" },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // El total es una unidad con nombre accesible (`role="img"` + `aria-label`,
    // el patrón de las gráficas): el lector anuncia las palabras, no solo el
    // número, y no lo lee dos veces.
    expect(
      screen.getByRole("img", { name: "Total de ingresos previstos: $3.000.000" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Total de gastos previstos: $200.000" })
    ).toBeInTheDocument();
  });

  it("una sección con 'Este mes no aplica' (target 0.0000) muestra $0, no lo esconde", () => {
    const items = [deIngreso("i1", "Salario"), deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), target: "0.0000" },
      { ...renglonDe(items[1]), target: "300000" },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // El lado existe con monto fijado (aunque sume 0): el total es "$0", no un
    // rótulo sin cifra.
    expect(screen.getByLabelText("Total de ingresos previstos: $0")).toBeInTheDocument();
  });

  it("una sección con renglones pero sin monto en el mes no muestra total (ni un cero inventado)", () => {
    const items = [deIngreso("i1", "Salario"), deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), target: null },
      { ...renglonDe(items[1]), target: "300000" },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // La sección existe (hay un grupo de ingreso), pero su total no se inventa.
    expect(screen.getByRole("heading", { name: "Ingresos" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Total de ingresos previstos/)).not.toBeInTheDocument();
    // El lado que sí tiene monto muestra su total.
    expect(screen.getByLabelText("Total de gastos previstos: $300.000")).toBeInTheDocument();
  });

  it("sin renglones de gasto no hay total de gastos, aunque la sección Gastos exista por el ahorro", () => {
    // El ahorro cierra "Gastos" pero NO entra en el total (ahorrar no es
    // gastar): con solo un ahorro y un ingreso, el total de gastos no existe.
    const items = [deIngreso("i1", "Salario"), deAhorro("a1", "Viaje")];
    const checklist = [
      { ...renglonDe(items[0]), target: "3000000" },
      { ...renglonDe(items[1]), target: "500000" },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByRole("heading", { name: "Gastos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Total de ingresos previstos: $3.000.000")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Total de gastos previstos/)).not.toBeInTheDocument();
  });

  it("un mes sin renglones de ingreso no muestra la sección Ingresos ni su total", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.queryByRole("heading", { name: "Ingresos" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Total de ingresos previstos/)).not.toBeInTheDocument();
  });

  it("los mismos totales aparecen en las tres vistas del panel (aside, cajón y /presupuesto)", () => {
    const items = [deIngreso("i1", "Salario"), deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), target: "3000000" },
      { ...renglonDe(items[1]), target: "200000" },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(
      <>
        {/* aside xl: tarjeta en la columna derecha */}
        <PanelPresupuesto mes="2026-09" moneda="COP" />
        {/* /presupuesto: suelta, con su propio tope */}
        <PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />
        {/* cajón móvil: suelta, sin tope propio (el cajón ya scrollea) */}
        <PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" topePropio={false} />
      </>
    );

    expect(screen.getAllByLabelText("Total de ingresos previstos: $3.000.000")).toHaveLength(3);
    expect(screen.getAllByLabelText("Total de gastos previstos: $200.000")).toHaveLength(3);
  });

  it("el rótulo cede ante la cifra: recorta el título, nunca el total", () => {
    const items = [deIngreso("i1", "Salario")];
    ajustarConsultas({ data: { items: items.map(renglonDe) } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const titulo = screen.getByRole("heading", { name: "Ingresos" });
    expect(titulo.classList.contains("truncate")).toBe(true);
    expect(titulo.classList.contains("min-w-0")).toBe(true);
    const total = screen.getByLabelText(/Total de ingresos previstos/);
    expect(total.classList.contains("shrink-0")).toBe(true);
  });
});

// -------------------------------------------------------------------------
// El estado de cada ítem, en palabras
// -------------------------------------------------------------------------

describe("PanelPresupuesto: el estado de cada ítem, en palabras", () => {
  it("un tope de gasto sin movimientos dice Pendiente, no solo barra vacía", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = [{ ...renglonDe(items[0]), status: "pending" as const }];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it("algo pero menos del objetivo dice Parcial, apagado", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), progress: "30000", status: "partial" as const },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const parcial = screen.getByText("Parcial");
    expect(parcial.className).toContain("text-muted-foreground");
  });

  it("el objetivo alcanzado en un tope de gasto dice Pagado y se pinta de logro", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), progress: "100500", target: "100500", status: "paid" as const },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const pagado = screen.getByText("Pagado");
    expect(pagado.className).toContain("emerald");
  });

  it("un ingreso alcanzado dice Recibido, y una meta de ahorro Cumplida", () => {
    const items = [deIngreso("i1", "Salario"), deAhorro("a1", "Viaje")];
    const checklist = [
      { ...renglonDe(items[0]), progress: "3000000", target: "3000000", status: "paid" as const, checked: true },
      { ...renglonDe(items[1]), progress: "500000", target: "500000", status: "paid" as const, checked: true },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByText("Recibido")).toBeInTheDocument();
    expect(screen.getByText("Cumplida")).toBeInTheDocument();
    expect(screen.queryByText("Pagado")).not.toBeInTheDocument();
  });

  it("'Te pasaste por X' sigue siendo la voz del exceso: la palabra del estado se calla", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    const checklist = [
      { ...renglonDe(items[0]), progress: "1500", target: "1000", exceeded: true, status: "exceeded" as const },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByText(/Te pasaste por/)).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
    expect(screen.queryByText("Parcial")).not.toBeInTheDocument();
    expect(screen.queryByText("Pagado")).not.toBeInTheDocument();
  });

  it("'Sin presupuesto este mes' y 'Sin monto en X' no añaden otra palabra", () => {
    const items = [deCategoria("c1", "comida", "Agua")];
    const checklist = [
      { ...renglonDe(items[0]), target: "0.0000", status: "none" as const },
    ];
    ajustarConsultas({ data: { items: checklist } }, { data: items }, CATALOGO);

    render(<PanelPresupuesto mes="2026-01" moneda="COP" />);

    expect(screen.getByText("Sin presupuesto este mes")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
  });
});

// -------------------------------------------------------------------------
// La fila "Sin asignar" de cada categoría
// -------------------------------------------------------------------------

describe("PanelPresupuesto: lo que queda Sin asignar por categoría", () => {
  it("dentro del grupo de cada categoría, después de sus ítems, dice cuánto quedó sin item", () => {
    const items = [deCategoria("c1", "comida", "Mercado"), deCategoria("t1", "transporte", "Bus")];
    const checklist = items.map(renglonDe);
    ajustarConsultas(
      { data: { items: checklist, unassigned: [{ categoryId: "cat-comida", categoryName: "Comida", categoryKind: "expense", amount: "267530" }] } },
      { data: items },
      CATALOGO
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const comida = screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true })
      .closest("div")!;
    expect(within(comida).getByText(/Sin asignar:/)).toBeInTheDocument();
    expect(within(comida).getByText("$267.530")).toBeInTheDocument();
    // El otro grupo no tiene nada sin asignar: ni rastro.
    const transporte = screen
      .getByRole("button", { name: etiquetaGrupo("Transporte", 1), expanded: true })
      .closest("div")!;
    expect(within(transporte).queryByText(/Sin asignar:/)).not.toBeInTheDocument();
  });

  it("sin 'unassigned' (todo quedó asignado o no hay nada movido), la fila no aparece", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas(
      { data: { items: items.map(renglonDe), unassigned: [] } },
      { data: items },
      CATALOGO
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.queryByText(/Sin asignar:/)).not.toBeInTheDocument();
  });

  it("la fila Sin asignar es texto apagado, sin barra de progreso", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas(
      { data: { items: items.map(renglonDe), unassigned: [{ categoryId: "cat-comida", categoryName: "Comida", categoryKind: "expense", amount: "267530" }] } },
      { data: items },
      CATALOGO
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    const fila = screen.getByText(/Sin asignar:/).closest("li")!;
    expect(fila.className).toContain("text-muted-foreground");
    expect(within(fila).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("la fila Sin asignar NO entra en los totales de sección (siguen viendo solo los montos presupuestados)", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas(
      { data: { items: items.map(renglonDe), unassigned: [{ categoryId: "cat-comida", categoryName: "Comida", categoryKind: "expense", amount: "267530" }] } },
      { data: items },
      CATALOGO
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    // target 100 del renglón De: el total no suma los 267.530 sin asignar.
    expect(screen.getByLabelText("Total de gastos previstos: $100")).toBeInTheDocument();
  });

  it("si el grupo está replegado, su fila Sin asignar se pliega con él", () => {
    const items = [deCategoria("c1", "comida", "Mercado")];
    ajustarConsultas(
      { data: { items: items.map(renglonDe), unassigned: [{ categoryId: "cat-comida", categoryName: "Comida", categoryKind: "expense", amount: "267530" }] } },
      { data: items },
      CATALOGO
    );

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);
    fireEvent.click(screen.getByRole("button", { name: etiquetaGrupo("Comida", 1), expanded: true }));

    expect(screen.getByText(/Sin asignar:/)).not.toBeVisible();
  });
});

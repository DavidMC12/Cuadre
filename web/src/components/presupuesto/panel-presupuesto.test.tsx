// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { PanelPresupuesto } from "./panel-presupuesto";
import * as usePresupuestoModule from "@/hooks/use-presupuesto";
import type { ItemDelChecklist } from "@/lib/api/types";

vi.mock("@/hooks/use-presupuesto", () => ({
  useChecklistDelMes: vi.fn(),
  usePresupuestoItems: vi.fn(),
  useDesarchivarItemPresupuesto: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => false,
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

function ajustarConsultas(checklist: Record<string, unknown>, items: Record<string, unknown> = {}) {
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
}

afterEach(cleanup);

describe("PanelPresupuesto: una variante por contenedor", () => {
  it("la variante tarjeta trae su Card con título y el botón Agregar", () => {
    ajustarConsultas({ data: { items: [renglon] } }, { data: [] });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" />);

    expect(screen.getByText("Checklist del mes")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
  });

  it("la variante suelta (dentro de un cajón o de una pantalla) no agrega un segundo encabezado", () => {
    ajustarConsultas({ data: { items: [renglon] } }, { data: [] });

    render(<PanelPresupuesto mes="2026-09" moneda="COP" variante="suelta" />);

    expect(screen.queryByText("Checklist del mes")).not.toBeInTheDocument();
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
      "No pudimos cargar el checklist del mes. Puede ser que el servidor esté dormido."
    );
    expect(screen.getByRole("group")).toHaveTextContent(
      "No pudimos cargar los ítems archivados. Puede ser que el servidor esté dormido."
    );
    expect(screen.getByRole("button", { name: "Reintentar checklist" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Reintentar checklist" })).toBeInTheDocument();
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

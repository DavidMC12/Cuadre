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
});

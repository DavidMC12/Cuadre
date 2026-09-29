// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { FormularioMovimiento } from "./formulario-movimiento";
import type { Cuenta } from "@/lib/api/types";

vi.mock("@/hooks/use-movimientos", () => ({
  useCrearMovimiento: () => ({ isPending: false, mutate: vi.fn() }),
  useCrearTransferencia: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-categorias", () => ({ useCategorias: () => ({ data: [] }) }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));
vi.mock("@/hooks/use-pantalla-grande", () => ({ usePantallaGrande: () => false }));
// El selector real es un desplegable; aquí basta con ver qué valor recibió.
vi.mock("@/components/movimientos/selector-categoria", () => ({
  SelectorCategoria: ({ value }: { value?: string }) => (
    <div data-testid="categoria-seleccionada">{value ?? "sin-categoria"}</div>
  ),
}));

afterEach(cleanup);

const cuentas: Cuenta[] = [
  {
    id: "a-1",
    name: "Bancolombia",
    type: "bank",
    currency: "COP",
    balance: "1234567",
    isSavings: false,
    archivedAt: null,
  } as Cuenta,
];

describe("FormularioMovimiento abierto desde afuera (corregir un movimiento)", () => {
  it("aplica los valores iniciales a los campos, sin disparador visible", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          categoriaId: "c-3",
          fecha: "2026-09-10",
          descripcion: "Mercado",
          tipo: "gasto",
        }}
      />
    );

    expect(screen.getByLabelText("Monto")).toHaveValue("12.500");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-09-10");
    expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Mercado");
    // La categoría y la fecha vienen en "Más detalles", que abre ya desplegado.
    expect(screen.getByTestId("categoria-seleccionada")).toHaveTextContent("c-3");
    expect(screen.getByRole("button", { name: "Gasto" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("sin valores iniciales abre en blanco y con el tipo pedido", () => {
    render(<FormularioMovimiento cuentas={cuentas} abierto tipoInicial="ingreso" />);

    expect(screen.getByLabelText("Monto")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Ingreso" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("precarga un ingreso con su monto y se anuncia como corrección, no como registro nuevo", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{ monto: "12.500", cuentaId: "a-1", tipo: "ingreso" }}
        tituloCabecera="Corregir movimiento"
        descripcionCabecera="Registra el movimiento correcto: el original ya quedó anulado."
      />
    );

    expect(screen.getByLabelText("Monto")).toHaveValue("12.500");
    expect(screen.getByRole("button", { name: "Ingreso" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Corregir movimiento")).toBeInTheDocument();
  });
});

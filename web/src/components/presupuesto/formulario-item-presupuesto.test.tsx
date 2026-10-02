/**
 * Pruebas del formulario de presupuesto, con Testing Library y las consultas
 * como mocks: lo que aquí importa es el componente, no la red.
 *
 * En particular esta batería existe por un error real: un derivado (`seleccionada`)
 * que leía `cuentaId` antes de que el `useState` correspondiente lo declarara
 * crasheaba por zona muerta en el primer render — y era invisible para quien
 * probaba con cuentas vacías porque otros archivos mockean el formulario
 * entero. Montarlo con una cuenta de ahorro disponible es la prueba que lo
 * habría atrapado.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FormularioItemPresupuesto } from "./formulario-item-presupuesto";

vi.mock("@/hooks/use-presupuesto", () => ({
  useCrearItemPresupuesto: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useFijarMontoDelMes: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useEditarEtiquetaItem: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  useArchivarItemPresupuesto: vi.fn(() => ({ isPending: false })),
  useDesarchivarItemPresupuesto: vi.fn(() => ({ isPending: false })),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => false,
}));

vi.mock("@/hooks/use-categorias", () => ({
  useCategorias: () => ({
    data: [
      { id: "cat-1", name: "Mercado", kind: "expense", archivedAt: null },
      { id: "cat-2", name: "Salario", kind: "income", archivedAt: null },
    ],
  }),
}));

vi.mock("@/hooks/use-cuentas", () => ({
  useCuentas: () => ({
    data: [
      { id: "cta-1", name: "Vacaciones", currency: "COP", isSavings: true, archivedAt: null },
    ],
  }),
}));

describe("FormularioItemPresupuesto", () => {
  it("se monta sin explotar con una cuenta de ahorro en la lista", async () => {
    render(
      <FormularioItemPresupuesto moneda="COP">
        <button type="button">Agregar</button>
      </FormularioItemPresupuesto>
    );

    // Al abrir el cajón se ve el cuerpo del formulario: si algún valor se
    // lee antes de estar declarado, este render tira y la prueba cae aquí.
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(screen.getByLabelText("Monto")).toBeTruthy();
  });
});

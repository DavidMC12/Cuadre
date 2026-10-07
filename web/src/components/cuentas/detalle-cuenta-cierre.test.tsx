// @vitest-environment jsdom
/**
 * La X del cajón de detalle de cuenta tiene que cerrar por el mismo camino
 * que el gesto y el fondo: `onOpenChange`. Si se saltara ese camino, el cajón
 * que avisa "Tienes cambios sin guardar" perdería el texto en silencio. Aquí
 * se monta el Drawer real (sin reemplazarlo) para probar justo eso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { Cuenta } from "@/lib/api/types";

const holders = vi.hoisted(() => ({
  actualizar: vi.fn(),
  marcarAhorro: vi.fn(),
  archivar: vi.fn(),
}));

vi.mock("@/hooks/use-cuentas", () => ({
  useCuentas: () => ({ data: [] }),
  useActualizarCuenta: () => ({ mutate: holders.actualizar, isPending: false }),
  useMarcarAhorro: () => ({ mutate: holders.marcarAhorro, isPending: false }),
  useArchivarCuenta: () => ({ mutate: holders.archivar, isPending: false }),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => false,
}));

import { DetalleCuenta } from "./detalle-cuenta";

afterEach(() => {
  cleanup();
  holders.actualizar.mockReset();
  holders.marcarAhorro.mockReset();
  holders.archivar.mockReset();
});

const banco: Cuenta = {
  id: "c1",
  name: "Bancolombia",
  type: "bank",
  currency: "COP",
  balance: "100000.0000",
  movementCount: 0,
  lastMovementAt: null,
  archivedAt: null,
  isSavings: false,
  creditLimit: null,
  linkedAccountId: null,
};

function abrirCajon() {
  render(
    <DetalleCuenta cuenta={banco}>
      <button type="button">Abrir</button>
    </DetalleCuenta>
  );
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
}

describe("DetalleCuenta: la X visible del cajón", () => {
  it("existe con su nombre accesible", () => {
    abrirCajon();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });

  it("con texto sin guardar, la X respeta la confirmación y no cierra", () => {
    abrirCajon();
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Banco Nuevo" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    // El cajón no se cerró: avisa y conserva lo escrito.
    expect(screen.getByText(/cambios sin guardar/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Banco Nuevo");
    expect(holders.actualizar).not.toHaveBeenCalled();
  });

  it("sin cambios pendientes, la X cierra y no avisa", async () => {
    abrirCajon();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByText(/cambios sin guardar/i)).not.toBeInTheDocument();
    // Cierra de verdad: el contenido del cajón deja de estar montado.
    await waitFor(() =>
      expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument()
    );
  });
});

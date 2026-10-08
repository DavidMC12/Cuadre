// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { EditarCategoriaMovimiento } from "./editar-categoria-movimiento";
import type { Movimiento } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

// El Drawer de Base UI no hace falta para revisar el pie: con este reemplazo
// el contenido queda montado.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerFooter: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTrigger: ({ render }: { render?: ReactElement }) => render ?? null,
}));

vi.mock("@/components/movimientos/selector-categoria", () => ({
  SelectorCategoria: () => null,
}));

vi.mock("@/hooks/use-movimientos", () => ({
  useActualizarCategoriaMovimiento: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));

afterEach(cleanup);

const movimiento: Movimiento = {
  id: "m-1",
  accountId: "a-1",
  categoryId: null,
  kind: "standard",
  amount: "-12500",
  currency: "COP",
  occurredAt: "2026-09-10T12:00:00Z",
  description: "Mercado",
  transferGroupId: null,
  budgetItemId: null,
  reversesTransactionId: null,
  reversedByTransactionId: null,
};

describe("EditarCategoriaMovimiento: el botón Guardar lleva el piso de toque", () => {
  it("'Guardar' mide 44px, igual que el selector de categoría a su lado", () => {
    // Era un Button de 32px (h-8) en el pie del cajón.
    render(
      <EditarCategoriaMovimiento movimiento={movimiento}>
        <button type="button">Cambiar categoría</button>
      </EditarCategoriaMovimiento>
    );

    // El disparador está montado y el cuerpo del cajón también (Drawer doble).
    expect(screen.getByRole("button", { name: "Guardar" }).className).toContain("min-h-11");
    // (Se toca el disparador para descartar cualquier dependencia de estado.)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar categoría" }));
    expect(screen.getByRole("button", { name: "Guardar" }).className).toContain("min-h-11");
  });
});

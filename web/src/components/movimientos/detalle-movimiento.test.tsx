// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { DetalleMovimiento } from "./detalle-movimiento";
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
}));

vi.mock("@/components/movimientos/editar-categoria-movimiento", () => ({
  EditarCategoriaMovimiento: ({ children }: { children?: ReactElement }) => children ?? null,
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
  reversesTransactionId: null,
  reversedByTransactionId: null,
};

describe("DetalleMovimiento: los botones del pie llevan el piso de toque", () => {
  it("'Cambiar categoría' y 'Anular' miden 44px", () => {
    // Eran Button de 32px (h-8) en el pie del cajón.
    render(
      <DetalleMovimiento
        movimiento={movimiento}
        cuenta={undefined}
        categoria={undefined}
        abierto
        onOpenChange={vi.fn()}
        onSolicitarAnular={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /Cambiar categoría/ }).className
    ).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Anular" }).className).toContain("min-h-11");
  });
});

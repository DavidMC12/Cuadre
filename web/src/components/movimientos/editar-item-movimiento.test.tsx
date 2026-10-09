// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { EditarItemMovimiento } from "./editar-item-movimiento";
import { useChecklistDelMes } from "@/hooks/use-presupuesto";
import type { ChecklistDelMes, ItemDelChecklist, Movimiento } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

// El Drawer de Base UI no hace falta para revisar el contenido: con este
// reemplazo todo queda montado.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerFooter: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTrigger: ({ render }: { render?: ReactElement }) => render ?? null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const actualizarItem = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-movimientos", () => ({
  useActualizarItemMovimiento: () => ({ isPending: false, mutate: actualizarItem }),
}));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));

vi.mock("@/hooks/use-presupuesto", () => ({ useChecklistDelMes: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function itemChecklist(over: Partial<ItemDelChecklist> & { id: string }): ItemDelChecklist {
  return {
    kind: "category",
    currency: "COP",
    label: "Deuda TC Nu",
    categoryKind: "expense",
    categoryId: "c-deu",
    categoryName: "Deudas",
    target: "250000",
    progress: "0",
    checked: false,
    exceeded: false,
    status: "pending",
    ...over,
  };
}

function dejarChecklist(items: ItemDelChecklist[]) {
  const data: ChecklistDelMes = { month: "2026-09", currency: "COP", items, unassigned: [] };
  vi.mocked(useChecklistDelMes).mockImplementation(() => ({ data }) as never);
}

const movimiento: Movimiento = {
  id: "m-1",
  accountId: "a-1",
  categoryId: "c-deu",
  budgetItemId: "i-nu",
  kind: "standard",
  amount: "-12500",
  currency: "COP",
  occurredAt: "2026-09-10T12:00:00Z",
  description: "Mercado",
  transferGroupId: null,
  reversesTransactionId: null,
  reversedByTransactionId: null,
};

describe("EditarItemMovimiento: el cajón de asignar item", () => {
  it("Guarda llaga con su piso de 44px junto al selector", () => {
    dejarChecklist([itemChecklist({ id: "i-nu" })]);

    render(
      <EditarItemMovimiento movimiento={movimiento}>
        <button type="button">Cambiar item</button>
      </EditarItemMovimiento>
    );

    expect(screen.getByRole("button", { name: "Guardar" }).className).toContain("min-h-11");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar item" }));
    expect(screen.getByRole("button", { name: "Guardar" }).className).toContain("min-h-11");
  });

  it("pide el checklist del MES del movimiento, en su moneda", () => {
    dejarChecklist([itemChecklist({ id: "i-nu" })]);

    render(
      <EditarItemMovimiento movimiento={movimiento}>
        <button type="button">Cambiar item</button>
      </EditarItemMovimiento>
    );

    expect(vi.mocked(useChecklistDelMes)).toHaveBeenCalledWith({
      month: "2026-09",
      currency: "COP",
    });
  });

  it("guardar sin tocar manda el item que el movimiento ya contaba", () => {
    dejarChecklist([itemChecklist({ id: "i-nu" })]);
    actualizarItem.mockImplementation(
      (_datos: unknown, opciones: { onSuccess?: () => void }) => opciones.onSuccess?.()
    );

    render(
      <EditarItemMovimiento movimiento={movimiento}>
        <button type="button">Cambiar item</button>
      </EditarItemMovimiento>
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(actualizarItem).toHaveBeenCalledWith(
      { id: "m-1", budgetItemId: "i-nu" },
      expect.anything()
    );
  });

  it("un movimiento sin item guarda null: el servidor responde con el movimiento igual", () => {
    dejarChecklist([itemChecklist({ id: "i-nu" })]);
    const sinItem: Movimiento = { ...movimiento, budgetItemId: null };

    render(
      <EditarItemMovimiento movimiento={sinItem}>
        <button type="button">Cambiar item</button>
      </EditarItemMovimiento>
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(actualizarItem).toHaveBeenCalledWith(
      { id: "m-1", budgetItemId: null },
      expect.anything()
    );
  });

  it("una categoría sin items este mes lo dice, sin inventar selector vacío", () => {
    dejarChecklist([]);

    render(
      <EditarItemMovimiento movimiento={movimiento}>
        <button type="button">Cambiar item</button>
      </EditarItemMovimiento>
    );

    expect(
      screen.getByText("Esta categoría no tiene ítems de presupuesto este mes.")
    ).toBeInTheDocument();
  });

  it("una transferencia no pide items de su 'categoría' (no la lleva): pide los de gasto", () => {
    dejarChecklist([
      itemChecklist({ id: "i-nu", target: "147000" }),
      itemChecklist({
        id: "i-sue",
        label: "Sueldo",
        categoryId: "c-sue",
        categoryKind: "income",
        categoryName: "Sueldo",
      }),
    ]);
    const pata: Movimiento = {
      ...movimiento,
      kind: "transfer",
      categoryId: null,
      transferGroupId: "g-1",
      budgetItemId: null,
    };

    render(
      <EditarItemMovimiento movimiento={pata}>
        <button type="button">Cambiar item</button>
      </EditarItemMovimiento>
    );

    // Con el selector cerrado no se ven las opciones; basta con que el
    // cajón no haya caído en el aviso de "sin items".
    expect(
      screen.queryByText("Esta categoría no tiene ítems de presupuesto este mes.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });
});

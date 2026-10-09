// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

// Las ids literales de estos subtalleres pasaron a useId por defensa en
// profundidad: hoy un solo cajón puede estar abierto a la vez (el portal del
// Drawer desmonta el contenido al cerrar, así que las dos instancias del
// AppShell no comparten DOM al mismo tiempo), pero si eso cambia las ids
// fijas se duplicarían y romperían la asociación etiqueta↔control y los
// aria-describedby/aria-labelledby. Esta prueba ancla el invariante: dos
// instancias montadas a la vez no dejan una id repetida en todo el documento.

import { CamposPagoDividido, type PagoDivididoEnEdicion } from "./campos-pago-dividido";
import { EditarCategoriaMovimiento } from "./editar-categoria-movimiento";
import { EditarItemMovimiento } from "./editar-item-movimiento";
import { useChecklistDelMes } from "@/hooks/use-presupuesto";
import { useCategorias } from "@/hooks/use-categorias";
import type { Movimiento } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

// Como en las demás pruebas de estos componentes: el Drawer queda montado
// siempre y el Select se reduce a sus etiquetas, que es lo que lleva las ids.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerFooter: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTrigger: ({ render }: { render?: ReactElement }) => render ?? null,
}));

vi.mock("@/components/ui/select", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/components/ui/select")>();
  return {
    ...original,
    SelectTrigger: ({
      id,
      "aria-describedby": descrito,
      children,
    }: { id?: string; "aria-describedby"?: string; children?: ReactNode }) => (
      <button
        type="button"
        id={id}
        data-testid="select-trigger"
        aria-describedby={descrito}
      >
        {children}
      </button>
    ),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/use-movimientos", () => ({
  useActualizarItemMovimiento: () => ({ isPending: false, mutate: vi.fn() }),
  useActualizarCategoriaMovimiento: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));

vi.mock("@/hooks/use-presupuesto", () => ({ useChecklistDelMes: vi.fn() }));
vi.mock("@/hooks/use-categorias", () => ({ useCategorias: vi.fn() }));

afterEach(cleanup);

const movimiento: Movimiento = {
  id: "m-1",
  accountId: "a-1",
  categoryId: "c-deu",
  budgetItemId: "i-nu",
  paymentGroupId: null,
  kind: "standard",
  amount: "-12500",
  currency: "COP",
  occurredAt: "2026-09-10T12:00:00Z",
  description: "Mercado",
  transferGroupId: null,
  reversesTransactionId: null,
  reversedByTransactionId: null,
};

const reparto: PagoDivididoEnEdicion = {
  cuenta1Id: "a-1",
  cuenta2Id: "a-2",
  texto1: "100.000",
  texto2: "100.000",
};

it("dos instancias de cada taller montadas a la vez no dejan ids repetidas en el DOM", () => {
  // Sin items este mes: los dos selects de ítem quedan descritos por su
  // aviso de "sin ítems" (la relación vive en el trigger, no en el Root del
  // Select de Base UI, que descarta aria-describedby).
  vi.mocked(useChecklistDelMes).mockImplementation(
    () =>
      ({
        data: { month: "2026-09", currency: "COP", items: [], unassigned: [] },
      }) as never
  );
  vi.mocked(useCategorias).mockImplementation(() => ({ data: [] }) as never);

  render(
    <>
      {/* Lo que el AppShell hace de verdad: dos formularios de movimiento
          con su modo "Pagar con dos cuentas" cada uno. */}
      <CamposPagoDividido
        valor={reparto}
        onChange={() => {}}
        onVolver={() => {}}
        total="200000.0000"
        moneda="COP"
        cuentas={[]}
      />
      <CamposPagoDividido
        valor={{ ...reparto, cuenta1Id: "a-3" }}
        onChange={() => {}}
        onVolver={() => {}}
        total="200000.0000"
        moneda="COP"
        cuentas={[]}
      />
      {/* Dos cajones de cambiar ítem y dos de cambiar categoría, abiertos. */}
      <EditarItemMovimiento movimiento={movimiento}>
        <button type="button">Cambiar ítem 1</button>
      </EditarItemMovimiento>
      <EditarItemMovimiento movimiento={{ ...movimiento, id: "m-2" }}>
        <button type="button">Cambiar ítem 2</button>
      </EditarItemMovimiento>
      <EditarCategoriaMovimiento movimiento={movimiento}>
        <button type="button">Cambiar categoría 1</button>
      </EditarCategoriaMovimiento>
      <EditarCategoriaMovimiento movimiento={{ ...movimiento, id: "m-2" }}>
        <button type="button">Cambiar categoría 2</button>
      </EditarCategoriaMovimiento>
    </>
  );

  // Cada control aparece dos veces: las etiquetas "Cuenta 1/2", los montos
  // en la cuenta, "Cuenta para" y "Categoría" están todos en el documento.
  expect(screen.getAllByText("Cuenta para")).toHaveLength(2);
  expect(screen.getAllByText("Categoría")).toHaveLength(2);
  expect(screen.getAllByText("Monto en la cuenta 1")).toHaveLength(2);
  expect(
    screen.getAllByText("Esta categoría no tiene ítems de presupuesto este mes.")
  ).toHaveLength(2);

  // La relación descripción es REAL, no una id que cuelga: cada trigger de
  // ítem apunta a un nodo que existe en el DOM (su aviso propio).
  for (const trigger of screen.getAllByTestId("select-trigger")) {
    const descrito = trigger.getAttribute("aria-describedby");
    if (descrito === null) continue;
    expect(document.getElementById(descrito)).not.toBeNull();
  }

  // La regla: ninguna id se repite en el documento entero.
  const ids = Array.from(document.querySelectorAll("[id]")).map(
    (nodo) => nodo.getAttribute("id")!
  );
  expect(new Set(ids).size).toBe(ids.length);
});

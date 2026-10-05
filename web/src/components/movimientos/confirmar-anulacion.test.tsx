// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ConfirmarAnulacion } from "./confirmar-anulacion";
import type { Movimiento } from "@/lib/api/types";

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

describe("ConfirmarAnulacion: los botones del diálogo llevan el piso de toque", () => {
  it("'Cancelar' y 'Sí, anular' miden 44px", () => {
    // Eran Button de 32px (h-8) en el pie del diálogo de confirmación.
    render(
      <ConfirmarAnulacion
        movimiento={movimiento}
        procesando={false}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Cancelar" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Sí, anular" }).className).toContain("min-h-11");
  });
});

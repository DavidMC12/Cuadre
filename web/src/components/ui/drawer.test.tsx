// @vitest-environment jsdom
/**
 * El cajón ya no depende solo del gesto o del fondo para cerrarse: tiene una X
 * visible, con el mismo nombre accesible que la del Dialog y su piso de toque
 * de 44px. Cerrar por ahí pasa por `onOpenChange`, el mismo camino que el
 * gesto y el fondo, para que un cajón que confirma antes de cerrar (por
 * ejemplo, el detalle de cuenta con texto sin guardar) siga confirmando.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "./drawer";

afterEach(cleanup);

function renderCajon(onOpenChange = vi.fn()) {
  render(
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Un título</DrawerTitle>
        </DrawerHeader>
        <p>Contenido</p>
      </DrawerContent>
    </Drawer>
  );
  return onOpenChange;
}

describe("Drawer: el cierre visible", () => {
  it("el botón de la esquina se anuncia Cerrar", () => {
    renderCajon();

    const boton = screen.getByRole("button", { name: "Cerrar" });
    expect(boton).toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("tiene el piso de toque de 44px, como la X del Dialog", () => {
    renderCajon();

    const boton = screen.getByRole("button", { name: "Cerrar" });
    expect(boton.className).toContain("min-h-11");
    expect(boton.className).toContain("min-w-11");
  });

  it("cerrar por la X llama a onOpenChange, el mismo camino que el gesto y el fondo", () => {
    const onOpenChange = renderCajon();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("el encabezado reserva el ancho de la X para no tapar el título", () => {
    renderCajon();

    const encabezado = document.querySelector('[data-slot="drawer-header"]');
    // A la derecha siempre; a la izquierda solo en los cajones centrados en
    // móvil, para no correr el título del centro.
    expect(encabezado?.className).toContain("pr-14");
    expect(encabezado?.className).toContain("pl-14");
  });

  it("un cajón puede pedir que no le pongan la X", () => {
    render(
      <Drawer open>
        <DrawerContent showCloseButton={false}>
          <DrawerHeader>
            <DrawerTitle>Un título</DrawerTitle>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    );

    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument();
  });
});

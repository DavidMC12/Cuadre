// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

afterEach(cleanup);

describe("Dialog: el cierre se dice en español", () => {
  it("el botón de cierre del contenido se anuncia Cerrar, no Close", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Un título</DialogTitle>
          </DialogHeader>
          <p>Contenido</p>
        </DialogContent>
      </Dialog>
    );

    // El botón de la esquina: su nombre accesible es el texto sr-only.
    const boton = screen.getByRole("button", { name: "Cerrar" });
    expect(boton).toBeInTheDocument();
    expect(boton.textContent).toBe("Cerrar");
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("el botón de cierre del pie también dice Cerrar", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Un título</DialogTitle>
          </DialogHeader>
          <p>Contenido</p>
          <DialogFooter showCloseButton>
            <span>Acción</span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    // Dos cierres con el mismo nombre: el de la esquina y el del pie.
    expect(screen.getAllByRole("button", { name: "Cerrar" })).toHaveLength(2);
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });
});

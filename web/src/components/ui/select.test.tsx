// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

afterEach(cleanup);

/**
 * Abrir el menú en jsdom abre también el popup: se necesitan las APIs de
 * desplazamiento (scroll*). jsdom no las trae; stubs mínimos bastan porque el
 * componente no las ejercita aquí.
 */
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 300,
  });
});

describe("SelectItem: piso de toque de 44px", () => {
  it("los renglones del menú llevan el piso de toque", () => {
    render(
      // ABIERTO por prop: el trigger abre con gestos de puntero que jsdom no
      // tiene; así el popup está montado desde el primer render.
      <Select open>
        <SelectTrigger aria-label="Un selector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Primera</SelectItem>
          <SelectItem value="b">Segunda</SelectItem>
        </SelectContent>
      </Select>
    );

    const renglones = screen.getAllByRole("option");

    // min-h-11 fija el piso; nada recorta la altura del renglón.
    for (const renglon of renglones) {
      expect(renglon.className).toMatch(/(^| )min-h-11( |$)/);
      expect(renglon.className.match(/(^| )h-11( |$)/)).toBeNull();
    }
    // El relleno ya no es el angosto de 4px por lado del renglón chico.
    expect(renglones[0].className).toContain("py-1.5");
  });
});

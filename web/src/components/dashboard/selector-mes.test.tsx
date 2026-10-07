// @vitest-environment jsdom
/**
 * El piso de toque de 44px (más DESIGN.md y la séptima critique): las dos
 * flechas del selector de mes se renderizaban con `size="icon-sm"` (28px),
 * un objetivo que el dedo en un móvil pisa con error. La prueba fija las
 * clases `min-h-11`/`min-w-11` que devuelven el objetivo real al piso — si
 * alguien las quita (o vuelve a un `size="icon-sm"` sin override), esta
 * prueba cae.
 *
 * Y el tope de meses futuros: el default `0` conserva el comportamiento de
 * siempre (Resumen y Movimientos no van al futuro), y `mesesAdelante` aparta
 * mesetas de planeación (`/presupuesto` pasa 12). El límite es EXACTO: el
 * mes actual + N se deshabilita, el anterior a él se deja avanzar. La
 * comparación va por texto ("YYYY-MM" ordena bien) y `sumarMeses` cruza el
 * año sin ayuda.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { SelectorMes } from "./selector-mes";
import { mesActual, sumarMeses } from "@/lib/fecha";

describe("SelectorMes: piso de toque de 44px", () => {
  afterEach(cleanup);

  it("las dos flechas llevan el piso de 44px en alto y ancho", () => {
    render(<SelectorMes mes="2026-10" onCambiar={() => {}} />);

    for (const nombre of ["Mes anterior", "Mes siguiente"]) {
      const flecha = screen.getByRole("button", { name: nombre });
      expect(flecha.classList.contains("min-h-11")).toBe(true);
      expect(flecha.classList.contains("min-w-11")).toBe(true);
    }
  });
});

describe("SelectorMes: tope de meses futuros", () => {
  afterEach(cleanup);

  function flechaSiguiente() {
    return screen.getByRole("button", { name: "Mes siguiente" });
  }

  it("default 0: el Resumen y Movimientos no avanzan al futuro — tope exacto en el mes actual", () => {
    const hoy = mesActual();

    render(<SelectorMes mes={hoy} onCambiar={() => {}} />);
    expect(flechaSiguiente()).toBeDisabled();
    cleanup();

    // Un mes antes del tope sí se deja avanzar (el comportamiento de siempre
    // con los meses pasados).
    render(<SelectorMes mes={sumarMeses(hoy, -1)} onCambiar={() => {}} />);
    expect(flechaSiguiente()).toBeEnabled();
  });

  it("con mesesAdelante=12 se avanza hasta 11 meses después del actual, no 12", () => {
    const hoy = mesActual();

    render(
      <SelectorMes mes={sumarMeses(hoy, 11)} onCambiar={() => {}} mesesAdelante={12} />
    );
    expect(flechaSiguiente()).toBeEnabled();
    cleanup();

    render(
      <SelectorMes mes={sumarMeses(hoy, 12)} onCambiar={() => {}} mesesAdelante={12} />
    );
    expect(flechaSiguiente()).toBeDisabled();
  });

  it("el cruce de diciembre a enero cae dentro del tope: sumarMeses cruza el año y la comparación por texto no miente", () => {
    // Independiente del mes de fondo: la comparación del tope funciona igual
    // cuando el mes actual+12 cae en otro año, porque `sumarMeses` cruza el
    // año y el texto "YYYY-MM" ordena bien.
    render(
      <SelectorMes mes={sumarMeses(mesActual(), 12)} onCambiar={() => {}} mesesAdelante={12} />
    );
    expect(flechaSiguiente()).toBeDisabled();
    cleanup();

    // Y un mes antes del cruce del año (el diciembre del tope) está habilitado
    // avanzar hacia él.
    render(
      <SelectorMes mes={sumarMeses(mesActual(), 11)} onCambiar={() => {}} mesesAdelante={12} />
    );
    expect(flechaSiguiente()).toBeEnabled();
  });
});

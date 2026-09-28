// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/components/movimientos/accion-registrar", () => ({
  AccionRegistrar: () => null,
}));

vi.mock("@/components/admin/banner-suplantacion", () => ({
  BannerSuplantacion: () => null,
}));

afterEach(cleanup);

describe("Navegación: el checklist tiene casa propia en el menú", () => {
  it("el menú trae la entrada Presupuesto, alcanzable desde cualquier pantalla", () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>
    );

    const entradas = screen.getAllByRole("link", { name: "Presupuesto" });
    // Una en el menú lateral (escritorio) y otra en la barra inferior (celular):
    // las dos viven del mismo listado.
    expect(entradas.length).toBeGreaterThanOrEqual(1);
    expect(entradas[0]).toHaveAttribute("href", "/presupuesto");

    // Las cuatro de siempre siguen ahí.
    expect(screen.getAllByRole("link", { name: "Resumen" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Cuentas" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Movimientos" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Ajustes" }).length).toBeGreaterThanOrEqual(1);
  });
});

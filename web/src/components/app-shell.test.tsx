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
    // Exactamente dos: una en el menú lateral (escritorio) y otra en la
    // barra inferior (celular). Las dos viven del mismo listado.
    expect(entradas).toHaveLength(2);
    for (const entrada of entradas) {
      expect(entrada).toHaveAttribute("href", "/presupuesto");
    }

    // Las cuatro de siempre siguen ahí.
    expect(screen.getAllByRole("link", { name: "Resumen" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Cuentas" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Movimientos" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: "Ajustes" }).length).toBeGreaterThanOrEqual(1);
  });

  it("la barra de abajo tiene red de seguridad: cada rótulo se recorta en vez de desbordar", () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>
    );

    const navMovil = screen
      .getAllByRole("navigation")
      .find((nav) => nav.className.includes("fixed"));
    expect(navMovil).toBeDefined();

    // Con cinco (o más) pestañas cada una puede encogerse (`min-w-0`) y su
    // rótulo se recorta con puntos suspensivos (`truncate`), en vez de
    // empujar la barra de ancho.
    expect(navMovil!.querySelectorAll("a.min-w-0")).toHaveLength(5);
    expect(navMovil!.querySelectorAll("span.truncate")).toHaveLength(5);
  });
});

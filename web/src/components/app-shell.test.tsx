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

  it("la barra de abajo tiene piso de toque y red de seguridad: se encoge hasta 44px y el rótulo se recorta, no el objetivo", () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>
    );

    const navMovil = screen
      .getAllByRole("navigation")
      .find((nav) => nav.className.includes("fixed"));
    expect(navMovil).toBeDefined();

    // Con cinco (o más) pestañas cada una puede encogerse (`grow` reparte por
    // contenido; nunca `flex-1`, que a 320px clava 64px por pestaña y recorta
    // "Movimientos"/"Presupuesto") pero no por debajo del toque mínimo de
    // 44px (`min-w-11`): con letra del sistema más grande o un sexto ítem, el
    // rótulo se recorta con puntos suspensivos (`truncate`), nunca el objetivo.
    // jsdom no calcula layout, así que se fijan las clases que garantizan el
    // piso y el recorte; los anchos reales se miden con Chromium headless en
    // web/scripts/medir-nav-pestanas.mjs (320px, letra al 100%–200%).
    const enlaces = navMovil!.querySelectorAll("a");
    expect(enlaces.length).toBeGreaterThanOrEqual(5);
    for (const enlace of enlaces) {
      // `grow`, nunca `flex-1`: el ancho por contenido es la decisión de la
      // ronda anterior y la que evitó el recorte real a 320px.
      expect(enlace.className).toContain("grow");
      expect(enlace.className).not.toContain("flex-1");
      // El piso del pulgar, el mismo 44px que el resto de la app.
      expect(enlace.className).toContain("min-w-11");
      expect(enlace.className).not.toContain("min-w-0");
      // Red de seguridad: el rótulo se recorta en vez de desbordar.
      expect(enlace.querySelector("span.truncate")).not.toBeNull();
    }
  });
});

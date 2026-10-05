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

    // Las otras cuatro entradas (las que había antes de Presupuesto) siguen
    // ahí.
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
    // 44px — en píxeles fijos (`min-w-[44px]`), no en rem: un objetivo de
    // toque es una constante física del dedo, y con piso en rem cinco pisos
    // dejarían de caber a 320px desde ~145% de escala. Ahí el rótulo se
    // recorta con puntos suspensivos (`truncate`), nunca el objetivo.
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
      // El piso del pulgar, fijo y no rem.
      expect(enlace.className).toContain("min-w-[44px]");
      expect(enlace.className).not.toContain("min-w-0");
      expect(enlace.className).not.toContain("min-w-11");
      // Red de seguridad: el rótulo se recorta en vez de desbordar.
      expect(enlace.querySelector("span.truncate")).not.toBeNull();
    }
  });

  it("el menú lateral de escritorio también lleva el piso de toque", () => {
    // Era py-2 + text-sm (~36px): una entrada de navegación que se toca con el
    // dedo en tablet/escritorio táctil. min-h-11 la sube a 44px.
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>
    );

    const navEscritorio = screen
      .getAllByRole("navigation")
      .find((nav) => !nav.className.includes("fixed"));
    expect(navEscritorio).toBeDefined();

    for (const enlace of navEscritorio!.querySelectorAll("a")) {
      expect(enlace.className).toContain("min-h-11");
    }
  });
});

import { describe, expect, it } from "vitest";
import { etiquetaMesCorta } from "./fecha";

describe("etiquetaMesCorta", () => {
  it("siempre corta a 3 letras, incluido septiembre", () => {
    // "sept." es el único mes que Intl.DateTimeFormat("es-CO", { month: "short" })
    // abrevia a 4 letras en español; el resto ya sale en 3.
    expect(etiquetaMesCorta("2026-09")).toBe("Sep");
    expect(etiquetaMesCorta("2026-01")).toBe("Ene");
    expect(etiquetaMesCorta("2026-12")).toBe("Dic");
  });
});

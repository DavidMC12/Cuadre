import { describe, expect, it } from "vitest";
import { diferenciaDeTexto } from "./diferencia-de-texto";

describe("diferenciaDeTexto", () => {
  it("una tecla agregada al final", () => {
    expect(diferenciaDeTexto("1.500", "1.5000")).toEqual({
      prefijoComun: 5,
      sufijoComun: 0,
      insertado: 1,
    });
  });

  it("una tecla insertada en medio", () => {
    // "1" + "7" + ".500"
    expect(diferenciaDeTexto("1.500", "17.500")).toEqual({
      prefijoComun: 1,
      sufijoComun: 4,
      insertado: 1,
    });
  });

  it("un borrado (Backspace) es insertado 0", () => {
    expect(diferenciaDeTexto("1.500", "1.50")).toEqual({
      prefijoComun: 4,
      sufijoComun: 0,
      insertado: 0,
    });
  });

  it("un texto completamente distinto no comparte nada", () => {
    expect(diferenciaDeTexto("1.500", "9.999")).toEqual({
      prefijoComun: 0,
      sufijoComun: 0,
      insertado: 5,
    });
  });

  it("pegar varios caracteres de una vez es un insertado grande", () => {
    expect(diferenciaDeTexto("", "1,500.50").insertado).toBe(8);
  });

  it("seleccionar todo y escribir un solo carácter nuevo es insertado 1", () => {
    expect(diferenciaDeTexto("1.500.000", "5").insertado).toBe(1);
  });
});

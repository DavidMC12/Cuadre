import { describe, expect, it } from "vitest";
import { contarSignificativos, posicionParaSignificativos } from "./cursor-de-monto";

describe("contarSignificativos", () => {
  it("cuenta dígitos y comas, pero no los puntos de miles", () => {
    expect(contarSignificativos("1.500.000", 9)).toBe(7);
    // "1.500,50" completo: 6 dígitos + la coma decimal = 7 significativos.
    expect(contarSignificativos("1.500,50", 8)).toBe(7);
  });

  it("se detiene en la posición pedida", () => {
    expect(contarSignificativos("1.500.000", 2)).toBe(1); // "1."
    expect(contarSignificativos("1.500.000", 0)).toBe(0);
  });
});

describe("posicionParaSignificativos", () => {
  it("ubica el cursor justo después del n-ésimo dígito, saltando puntos", () => {
    // "17.500": después de "17" (2 significativos) va justo antes del punto.
    expect(posicionParaSignificativos("17.500", 2)).toBe(2);
    expect(posicionParaSignificativos("178.500", 3)).toBe(3);
  });

  it("con la coma decimal incluida en el conteo", () => {
    // "1.500,50": 1,5,0,0 son los primeros 4 significativos (el punto no cuenta).
    expect(posicionParaSignificativos("1.500,50", 4)).toBe(5);
    // El 5º significativo es la propia coma.
    expect(posicionParaSignificativos("1.500,50", 5)).toBe(6);
  });

  it("0 o menos siempre es el principio", () => {
    expect(posicionParaSignificativos("1.500", 0)).toBe(0);
    expect(posicionParaSignificativos("1.500", -1)).toBe(0);
  });

  it("más significativos de los que hay va al final", () => {
    expect(posicionParaSignificativos("1.500", 99)).toBe(5);
  });

  it("un texto vacío siempre da posición 0", () => {
    expect(posicionParaSignificativos("", 3)).toBe(0);
  });
});

describe("caso real: insertar un dígito en medio de un monto ya agrupado", () => {
  it("insertar '7' entre '1' y '.500' dentro de '1.500' debe quedar después de '17'", () => {
    // Antes de la tecla: value="1.500", cursor en la posición 1 (justo
    // después del "1"). Se escribe "7": el navegador inserta el carácter
    // ahí mismo, dando el crudo "17.500" con el cursor ya en la posición 2.
    const cursorEnElCrudo = 2;
    const deseados = contarSignificativos("17.500", cursorEnElCrudo);
    expect(deseados).toBe(2);

    // El texto ya reformateado (el mismo en este caso, agrupado de nuevo).
    const formateado = "17.500";
    expect(posicionParaSignificativos(formateado, deseados)).toBe(2);
  });
});

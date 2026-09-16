import { describe, expect, it } from "vitest";
import { formatearMientrasEscribe } from "./formatear-mientras-escribe";
import { normalizarMontoConSigno, normalizarMontoIngresado } from "./money";

/** Lee el resultado y compara el MONTO NUMÉRICO exacto, no solo "sin error". */
function leerMonto(formateado: string, moneda: string): string {
  const lectura = normalizarMontoIngresado(formateado, moneda);
  if ("error" in lectura)
    throw new Error(`Se esperaba un monto válido, dio error: ${lectura.error}`);
  return lectura.monto;
}

function esperarError(formateado: string, moneda: string): void {
  const lectura = normalizarMontoIngresado(formateado, moneda);
  expect("error" in lectura, `se esperaba un error, pero dio: ${JSON.stringify(lectura)}`).toBe(
    true
  );
}

describe("formatearMientrasEscribe", () => {
  describe("monedas sin decimales (COP)", () => {
    it("agrupa de a tres mientras se escribe, y el valor leído es el correcto", () => {
      expect(formatearMientrasEscribe("1", "COP")).toBe("1");
      expect(formatearMientrasEscribe("150", "COP")).toBe("150");
      expect(formatearMientrasEscribe("1500", "COP")).toBe("1.500");
      expect(formatearMientrasEscribe("150000", "COP")).toBe("150.000");
      expect(formatearMientrasEscribe("1500000", "COP")).toBe("1.500.000");
      expect(leerMonto(formatearMientrasEscribe("1500000", "COP"), "COP")).toBe("1500000");
    });

    it("ignora letras y espacios sueltos, sin cambiar el valor", () => {
      expect(formatearMientrasEscribe("abc150000xyz", "COP")).toBe("150.000");
      expect(leerMonto(formatearMientrasEscribe("abc150000xyz", "COP"), "COP")).toBe("150000");
    });

    it("un campo vacío queda vacío", () => {
      expect(formatearMientrasEscribe("", "COP")).toBe("");
    });

    it("quita ceros a la izquierda, pero deja un solo cero", () => {
      expect(formatearMientrasEscribe("0", "COP")).toBe("0");
      expect(formatearMientrasEscribe("00", "COP")).toBe("0");
      expect(formatearMientrasEscribe("05000", "COP")).toBe("5.000");
      expect(leerMonto(formatearMientrasEscribe("05000", "COP"), "COP")).toBe("5000");
    });

    it("sin permitir signo, un guion (o el menos de la app) se ignora del todo", () => {
      expect(formatearMientrasEscribe("-150000", "COP")).toBe("150.000");
      expect(formatearMientrasEscribe("−150000", "COP")).toBe("150.000");
    });

    it("un agrupamiento de miles pegado y bien formado se reconoce", () => {
      expect(formatearMientrasEscribe("1.500.000", "COP")).toBe("1.500.000");
      expect(formatearMientrasEscribe("1,500,000", "COP")).toBe("1.500.000");
      expect(leerMonto(formatearMientrasEscribe("1.500.000", "COP"), "COP")).toBe("1500000");
    });

    // Hallazgo crítico de la revisión: esto ANTES se "limpiaba" hasta
    // convertirse en 150000 (multiplicaba por 100 el monto real). Ahora no
    // se toca, y el validador de siempre da su error real.
    it("un intento de decimales en una moneda que no los usa NO se reformatea, para que el validador dé su error real", () => {
      expect(formatearMientrasEscribe("1500,50", "COP")).toBe("1500,50");
      esperarError(formatearMientrasEscribe("1500,50", "COP"), "COP");
      expect(formatearMientrasEscribe("1500.50", "COP")).toBe("1500.50");
      esperarError(formatearMientrasEscribe("1500.50", "COP"), "COP");
    });

    it("un formato inglés pegado (dos separadores) tampoco se reformatea", () => {
      expect(formatearMientrasEscribe("1,500.50", "COP")).toBe("1,500.50");
      esperarError(formatearMientrasEscribe("1,500.50", "COP"), "COP");
    });
  });

  describe("monedas con decimales (USD)", () => {
    it("agrupa la parte entera igual que sin decimales, mientras no haya separador decimal", () => {
      expect(formatearMientrasEscribe("1500000", "USD")).toBe("1.500.000");
    });

    it("al escribir la coma, arranca la parte decimal", () => {
      expect(formatearMientrasEscribe("1500,", "USD")).toBe("1.500,");
      expect(formatearMientrasEscribe("1500,5", "USD")).toBe("1.500,5");
      expect(formatearMientrasEscribe("1500,50", "USD")).toBe("1.500,50");
      expect(leerMonto(formatearMientrasEscribe("1500,50", "USD"), "USD")).toBe("1500.50");
    });

    it("no deja escribir más decimales de los que la moneda usa: se recorta, no se rechaza", () => {
      expect(formatearMientrasEscribe("1500,509", "USD")).toBe("1.500,50");
    });

    // Hallazgo crítico de la revisión: un único punto pegado o escrito
    // (numérico de celular sin coma) es decimal, igual que ya tolera
    // normalizarMontoIngresado al validar. Antes esto multiplicaba el
    // monto por 100 en vez de leerse como centavos.
    it("un único punto seguido de pocos dígitos se lee como decimal, igual que ya tolera el validador", () => {
      expect(formatearMientrasEscribe("1500.50", "USD")).toBe("1.500,50");
      expect(leerMonto(formatearMientrasEscribe("1500.50", "USD"), "USD")).toBe("1500.50");
      expect(formatearMientrasEscribe("1500.5", "USD")).toBe("1.500,5");
      expect(leerMonto(formatearMientrasEscribe("1500.5", "USD"), "USD")).toBe("1500.5");
    });

    it("un punto seguido de más dígitos de los que la moneda admite no es decimal, y no se adivina", () => {
      expect(formatearMientrasEscribe("1500.509", "USD")).toBe("1500.509");
      esperarError(formatearMientrasEscribe("1500.509", "USD"), "USD");
    });

    it("varios puntos siguen siendo un agrupamiento de miles, no decimales", () => {
      expect(formatearMientrasEscribe("1.500.000", "USD")).toBe("1.500.000");
      expect(leerMonto(formatearMientrasEscribe("1.500.000", "USD"), "USD")).toBe("1500000");
    });

    it("los dos separadores a la vez (formato inglés pegado) no se reformatean", () => {
      expect(formatearMientrasEscribe("1,500.50", "USD")).toBe("1,500.50");
      esperarError(formatearMientrasEscribe("1,500.50", "USD"), "USD");
    });

    it("cero coma algo conserva el cero", () => {
      expect(formatearMientrasEscribe("0,5", "USD")).toBe("0,5");
      expect(leerMonto(formatearMientrasEscribe("0,5", "USD"), "USD")).toBe("0.5");
    });

    it("solo la última coma separa decimales; una coma de más suma sus dígitos al entero", () => {
      expect(formatearMientrasEscribe("1,500,50", "USD")).toBe("1.500,50");
      expect(leerMonto(formatearMientrasEscribe("1,500,50", "USD"), "USD")).toBe("1500.50");
    });

    it("con signo permitido, conserva el guion o el menos de la app", () => {
      expect(formatearMientrasEscribe("-1500,50", "USD", { permiteSigno: true })).toBe("-1.500,50");
      expect(formatearMientrasEscribe("−1500,50", "USD", { permiteSigno: true })).toBe("-1.500,50");
    });
  });

  describe("idempotencia: reformatear un resultado ya formateado no lo cambia", () => {
    const casos: Array<[string, string, boolean?]> = [
      ["1500000", "COP"],
      ["05000", "COP"],
      ["1500,50", "COP"], // el caso "no se toca" también debe ser estable
      ["1500000", "USD"],
      ["1500,50", "USD"],
      ["0,5", "USD"],
      ["1,500.50", "USD"], // idem
      ["-1500,50", "USD", true],
    ];

    it.each(casos)("formatear(%s, %s) es estable", (crudo, moneda, permiteSigno) => {
      const unaVez = formatearMientrasEscribe(crudo, moneda, { permiteSigno });
      const dosVeces = formatearMientrasEscribe(unaVez, moneda, { permiteSigno });
      expect(dosVeces).toBe(unaVez);
    });
  });

  describe("con signo, el resultado lo lee normalizarMontoConSigno", () => {
    it("un monto negativo válido", () => {
      const formateado = formatearMientrasEscribe("-1500,50", "USD", { permiteSigno: true });
      const lectura = normalizarMontoConSigno(formateado, "USD");
      expect("error" in lectura, JSON.stringify(lectura)).toBe(false);
      if (!("error" in lectura)) expect(lectura.monto).toBe("-1500.50");
    });
  });
});

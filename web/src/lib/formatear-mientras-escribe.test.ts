import { describe, expect, it } from "vitest";
import { formatearMientrasEscribe } from "./formatear-mientras-escribe";
import { normalizarMontoConSigno, normalizarMontoIngresado } from "./money";

describe("formatearMientrasEscribe", () => {
  describe("monedas sin decimales (COP)", () => {
    it("agrupa de a tres mientras se escribe", () => {
      expect(formatearMientrasEscribe("1", "COP")).toBe("1");
      expect(formatearMientrasEscribe("15", "COP")).toBe("15");
      expect(formatearMientrasEscribe("150", "COP")).toBe("150");
      expect(formatearMientrasEscribe("1500", "COP")).toBe("1.500");
      expect(formatearMientrasEscribe("150000", "COP")).toBe("150.000");
      expect(formatearMientrasEscribe("1500000", "COP")).toBe("1.500.000");
    });

    it("ignora cualquier cosa que no sea un dígito", () => {
      expect(formatearMientrasEscribe("1.500.000", "COP")).toBe("1.500.000");
      expect(formatearMientrasEscribe("1,500,000", "COP")).toBe("1.500.000");
      expect(formatearMientrasEscribe("abc150000xyz", "COP")).toBe("150.000");
    });

    it("un campo vacío queda vacío", () => {
      expect(formatearMientrasEscribe("", "COP")).toBe("");
    });

    it("quita ceros a la izquierda, pero deja un solo cero", () => {
      expect(formatearMientrasEscribe("0", "COP")).toBe("0");
      expect(formatearMientrasEscribe("00", "COP")).toBe("0");
      expect(formatearMientrasEscribe("05000", "COP")).toBe("5.000");
    });

    it("sin permitir signo, un guion se ignora del todo", () => {
      expect(formatearMientrasEscribe("-150000", "COP")).toBe("150.000");
    });
  });

  describe("monedas con decimales (USD)", () => {
    it("agrupa la parte entera igual que sin decimales, mientras no haya coma", () => {
      expect(formatearMientrasEscribe("1500000", "USD")).toBe("1.500.000");
    });

    it("al escribir la coma, arranca la parte decimal", () => {
      expect(formatearMientrasEscribe("1500,", "USD")).toBe("1.500,");
      expect(formatearMientrasEscribe("1500,5", "USD")).toBe("1.500,5");
      expect(formatearMientrasEscribe("1500,50", "USD")).toBe("1.500,50");
    });

    it("no deja escribir más decimales de los que la moneda usa", () => {
      expect(formatearMientrasEscribe("1500,509", "USD")).toBe("1.500,50");
    });

    it("un punto se descarta: solo la coma es decimal mientras se escribe", () => {
      expect(formatearMientrasEscribe("1500.50", "USD")).toBe("150.050");
    });

    it("cero coma algo conserva el cero", () => {
      expect(formatearMientrasEscribe("0,5", "USD")).toBe("0,5");
    });

    it("solo la última coma separa decimales; una coma de más se trata como dígitos sueltos", () => {
      // La coma sobrante se descarta, pero los dígitos que agrupaba NO se
      // pierden: se suman al entero. Perder un dígito escrito de verdad sin
      // avisar sería peor que agruparlo donde no tocaba.
      expect(formatearMientrasEscribe("1,500,50", "USD")).toBe("1.500,50");
    });

    it("con signo permitido, conserva el guion inicial", () => {
      expect(formatearMientrasEscribe("-1500,50", "USD", { permiteSigno: true })).toBe("-1.500,50");
    });
  });

  describe("todo lo que produce sigue siendo válido para los parsers existentes", () => {
    const casosSinSigno: Array<[string, string]> = [
      ["1500000", "COP"],
      ["05000", "COP"],
      ["1500000", "USD"],
      ["1500,5", "USD"],
      ["1500,50", "USD"],
      ["0,5", "USD"],
    ];

    it.each(casosSinSigno)(
      "formatearMientrasEscribe(%s, %s) es leído sin error",
      (crudo, moneda) => {
        const formateado = formatearMientrasEscribe(crudo, moneda);
        if (formateado === "") return;
        const lectura = normalizarMontoIngresado(formateado, moneda);
        expect("error" in lectura, JSON.stringify(lectura)).toBe(false);
      }
    );

    it("con signo, el resultado lo lee normalizarMontoConSigno", () => {
      const formateado = formatearMientrasEscribe("-1500,50", "USD", { permiteSigno: true });
      const lectura = normalizarMontoConSigno(formateado, "USD");
      expect("error" in lectura, JSON.stringify(lectura)).toBe(false);
      if (!("error" in lectura)) expect(lectura.monto).toBe("-1500.50");
    });
  });
});

import { describe, expect, it } from "vitest";
import { etiquetaMesCorta, mesActual, nombreDelMes, rangoDelMes, sumarMeses, tramoDelMes } from "./fecha";

describe("tramoDelMes", () => {
  it("nombra el mes en curso y los de antes y después", () => {
    const actual = mesActual();
    expect(tramoDelMes(actual)).toBe("actual");
    expect(tramoDelMes(sumarMeses(actual, -1))).toBe("pasado");
    expect(tramoDelMes(sumarMeses(actual, -13))).toBe("pasado");
    expect(tramoDelMes(sumarMeses(actual, 1))).toBe("futuro");
    expect(tramoDelMes(sumarMeses(actual, 13))).toBe("futuro");
  });
});

describe("etiquetaMesCorta", () => {
  it("siempre corta a 3 letras, incluido septiembre", () => {
    // "sept." es el único mes que Intl.DateTimeFormat("es-CO", { month: "short" })
    // abrevia a 4 letras en español; el resto ya sale en 3.
    expect(etiquetaMesCorta("2026-09")).toBe("Sep");
    expect(etiquetaMesCorta("2026-01")).toBe("Ene");
    expect(etiquetaMesCorta("2026-12")).toBe("Dic");
  });
});

describe("rangoDelMes", () => {
  it("corta el mes en hora de Bogotá, no en UTC", () => {
    // Bogotá es UTC-5: la medianoche del 1 de septiembre allá son las 5 de la
    // mañana en UTC. Un movimiento de las 11 de la noche del 31 de agosto en
    // Bogotá (04:00 UTC del 1 de septiembre) todavía es de agosto.
    expect(rangoDelMes("2026-09")).toEqual({
      desde: "2026-09-01T05:00:00.000Z",
      hasta: "2026-10-01T04:59:59.999Z",
    });
  });

  it("cruza el fin de año", () => {
    expect(rangoDelMes("2026-12")).toEqual({
      desde: "2026-12-01T05:00:00.000Z",
      hasta: "2027-01-01T04:59:59.999Z",
    });
  });
});

describe("nombreDelMes", () => {
  it("dice el mes y el año de un YYYY-MM, como lo dice el calendario colombiano", () => {
    expect(nombreDelMes("2026-01")).toBe("Enero de 2026");
    expect(nombreDelMes("2025-12")).toBe("Diciembre de 2025");
  });
});

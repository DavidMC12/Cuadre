// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TotalCuentas } from "./total-cuentas";
import type { Cuenta } from "@/lib/api/types";

afterEach(cleanup);

function cuenta(datos: Partial<Cuenta> & Pick<Cuenta, "id" | "name" | "currency">): Cuenta {
  return {
    type: "bank",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
    isSavings: false,
    saved: "0.0000",
    creditLimit: null,
    linkedAccountId: null,
    ...datos,
  };
}

const banco = cuenta({ id: "banco", name: "Banco", currency: "COP", balance: "1000000.0000" });
const efectivo = cuenta({
  id: "efectivo",
  name: "Efectivo",
  currency: "COP",
  balance: "250000.0000",
});
const visa = cuenta({
  id: "visa",
  name: "Visa",
  currency: "COP",
  type: "card",
  balance: "-800000.0000",
  creditLimit: "2000000.0000",
});
const master = cuenta({
  id: "master",
  name: "Master",
  currency: "COP",
  type: "card",
  balance: "-200000.0000",
});
const sobrepagada = cuenta({
  id: "sobre",
  name: "Sobrepagada",
  currency: "COP",
  type: "card",
  balance: "50000.0000",
});
const usd = cuenta({ id: "usd", name: "Dólares", currency: "USD", balance: "300.0000" });
const visaUsd = cuenta({
  id: "visa-usd",
  name: "Visa USD",
  currency: "USD",
  type: "card",
  balance: "-400.0000",
});

describe("TotalCuentas", () => {
  it("'Tienes' suma solo las cuentas que no son tarjeta, aunque haya deuda", () => {
    render(<TotalCuentas cuentas={[banco, efectivo, visa, master]} moneda="COP" cargando={false} />);

    expect(screen.getByText("Tienes")).toBeInTheDocument();
    expect(screen.getByText("$1.250.000")).toBeInTheDocument();
    // La deuda no se descuenta de "Tienes".
    expect(screen.queryByText("$250.000")).not.toBeInTheDocument();
  });

  it("sin tarjetas no hay renglón de deuda", () => {
    render(<TotalCuentas cuentas={[banco, efectivo]} moneda="COP" cargando={false} />);

    expect(screen.queryByText(/Debes en tarjetas/)).not.toBeInTheDocument();
  });

  it("con solo tarjetas, 'Tienes' es $0 y la deuda se muestra igual", () => {
    render(<TotalCuentas cuentas={[visa]} moneda="COP" cargando={false} />);

    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText(/Debes en tarjetas/)).toHaveTextContent("Debes en tarjetas: $800.000");
  });

  it("con tarjetas que no deben nada tampoco aparece el renglón (ni un $0)", () => {
    render(<TotalCuentas cuentas={[banco, sobrepagada]} moneda="COP" cargando={false} />);

    expect(screen.queryByText(/Debes en tarjetas/)).not.toBeInTheDocument();
  });

  it("con deuda muestra 'Debes en tarjetas' sumando varias, con la sobrepagada en cero", () => {
    render(
      <TotalCuentas
        cuentas={[banco, visa, master, sobrepagada]}
        moneda="COP"
        cargando={false}
      />
    );

    expect(screen.getByText(/Debes en tarjetas/)).toBeInTheDocument();
    // 800.000 + 200.000 + 0 (la sobrepagada nunca resta).
    expect(screen.getByText(/Debes en tarjetas/)).toHaveTextContent("Debes en tarjetas: $1.000.000");
  });

  it("no mezcla monedas: ni el saldo ni la deuda de otra moneda entran", () => {
    render(
      <TotalCuentas
        cuentas={[banco, visa, usd, visaUsd]}
        moneda="COP"
        cargando={false}
      />
    );

    expect(screen.getByText("$1.000.000")).toBeInTheDocument();
    // La deuda sigue siendo solo la de la tarjeta en pesos, no la de USD.
    expect(screen.getByText(/Debes en tarjetas/)).toHaveTextContent("Debes en tarjetas: $800.000");
  });

  it("mientras carga muestra un esqueleto, no cifras", () => {
    const { container } = render(<TotalCuentas cuentas={undefined} moneda="COP" cargando />);

    expect(screen.queryByText("$1.000.000")).not.toBeInTheDocument();
    const hueso = container.querySelector('[data-slot="card"]');
    expect(hueso).toHaveAttribute("aria-hidden", "true");
    expect(hueso!.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("el esqueleto es la MISMA tarjeta: renglones de texto con el texto real, invisible, y una barra donde va el monto", () => {
    const { container } = render(<TotalCuentas cuentas={undefined} moneda="COP" cargando />);

    const hueso = container.querySelector('[data-slot="card"]');
    expect(hueso).toHaveAttribute("aria-hidden", "true");
    // Dos pulsantes: la etiqueta y la barra del monto (h-8, el alto de una
    // línea text-2xl). Carga fría sin lista anterior: ni renglón de deuda.
    const barras = hueso!.querySelectorAll(".animate-pulse");
    expect(barras).toHaveLength(2);
    // La etiqueta que verá la tarjeta ya está aquí, transparente: mismo texto
    // y mismas clases de tipografía, así el alto ya es el de la tarjeta.
    expect(barras[0].textContent).toBe("Tienes");
    expect(barras[0]).toHaveClass("text-transparent", "uppercase", "tracking-wide");
    expect(barras[1]).toHaveClass("h-8");
  });

  it("con la lista anterior a mano (la de hoy), el esqueleto ya reserva el renglón de deuda", () => {
    const { container } = render(
      <TotalCuentas
        cuentas={undefined}
        moneda="COP"
        cargando
        cuentasDeReferencia={[banco, visa]}
      />
    );

    const barras = container.querySelectorAll('[data-slot="card"] .animate-pulse');
    expect(barras).toHaveLength(3);
    // El monto de la deuda ni se adivina: la referencia es de HOY. Pero el
    // renglón existe para que el alto no salte cuando llegue la del cierre.
    expect(barras[2].textContent).toBe("Debes en tarjetas: $800.000");
    expect(barras[2]).toHaveClass("text-transparent");
  });
});

describe("TotalCuentas: en un mes pasado habla del cierre, no del ahora", () => {
  it("cambia el tiempo verbal: 'Tenías al cierre de...' y 'Debías en tarjetas'", () => {
    render(
      <TotalCuentas
        cuentas={[banco, efectivo, visa, master]}
        moneda="COP"
        cargando={false}
        mesDeCierre="2026-09"
      />
    );

    expect(screen.getByText("Tenías al cierre de Septiembre de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Tienes")).not.toBeInTheDocument();
    expect(screen.getByText(/Debías en tarjetas/)).toHaveTextContent(
      "Debías en tarjetas: $1.000.000"
    );
    expect(screen.queryByText(/Debes en tarjetas/)).not.toBeInTheDocument();
  });

  it("sin tarjetas que deban, no aparece el renglón aunque el mes sea pasado", () => {
    render(
      <TotalCuentas cuentas={[banco, efectivo]} moneda="COP" cargando={false} mesDeCierre="2026-09" />
    );

    expect(screen.getByText("Tenías al cierre de Septiembre de 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Debías en tarjetas/)).not.toBeInTheDocument();
  });

  it("el esqueleto del mes pasado ya habla del cierre (mismo texto, invisible) y cuenta con el renglón de deuda conocida", () => {
    const { container } = render(
      <TotalCuentas
        cuentas={undefined}
        moneda="COP"
        cargando
        mesDeCierre="2026-09"
        cuentasDeReferencia={[banco, visa]}
      />
    );

    // La etiqueta larga está en el hueso, transparente: parte en dos
    // renglones igual que la tarjeta en un mes pasado.
    const etiqueta = screen.getByText("Tenías al cierre de Septiembre de 2026");
    expect(etiqueta).toHaveClass("text-transparent", "uppercase");
    // Y el renglón que la tarjeta mostrará ("Debías...") ya tiene su barra.
    const barras = container.querySelectorAll('[data-slot="card"] .animate-pulse');
    expect(barras).toHaveLength(3);
    expect(barras[2].textContent).toBe("Debías en tarjetas: $800.000");
  });
});

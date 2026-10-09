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
    render(<TotalCuentas cuentas={undefined} moneda="COP" cargando />);

    expect(screen.queryByText("Tienes")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
  });
});

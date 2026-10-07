// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ConfirmarArchivar } from "./confirmar-archivar";
import { MENOS } from "@/lib/money";
import type { Cuenta } from "@/lib/api/types";

afterEach(cleanup);

const banco: Cuenta = {
  id: "c1",
  name: "Bancolombia",
  type: "bank",
  currency: "COP",
  balance: "0.0000",
  movementCount: 0,
  lastMovementAt: null,
  archivedAt: null,
  isSavings: false,
  creditLimit: null,
  linkedAccountId: null,
};

const visa: Cuenta = {
  ...banco,
  id: "c2",
  name: "Visa",
  type: "card",
  balance: "-500000.0000",
  creditLimit: "2000000.0000",
};

function renderConfirmacion(cuenta: Cuenta | null, error: string | null = null) {
  render(
    <ConfirmarArchivar
      cuenta={cuenta}
      procesando={false}
      error={error}
      onConfirmar={vi.fn()}
      onCancelar={vi.fn()}
    />
  );
}

describe("ConfirmarArchivar: la pregunta y las consecuencias en palabras", () => {
  it("pregunta por la cuenta y explica que se esconde, que no borra y que se puede volver", () => {
    renderConfirmacion(banco);

    expect(screen.getByText("¿Archivar Bancolombia?")).toBeInTheDocument();
    expect(
      screen.getByText(
        /La cuenta se esconde: deja de aparecer y no recibe movimientos nuevos\. Su historia sigue contando en los reportes del pasado\. Puedes desarchivarla cuando quieras\./
      )
    ).toBeInTheDocument();
  });

  it("con deuda en una tarjeta, avisa la cifra y que no suma a los totales", () => {
    renderConfirmacion(visa);

    expect(screen.getByText("Todavía tiene una deuda de")).toBeInTheDocument();
    expect(screen.getByText(`${MENOS}$500.000`)).toBeInTheDocument();
    expect(screen.getByText("Mientras esté archivada no se suma en tus totales.")).toBeInTheDocument();
  });

  it("en una cuenta que no es tarjeta lo llama saldo", () => {
    renderConfirmacion({ ...banco, balance: "120000.0000" });

    expect(screen.getByText("Todavía tiene un saldo de")).toBeInTheDocument();
  });

  it("sin saldo no ensucia la confirmación con un aviso de cero", () => {
    renderConfirmacion(banco);

    expect(screen.queryByText(/no se suma en tus totales/)).not.toBeInTheDocument();
  });

  it("un rechazo del servidor se muestra tal cual", () => {
    renderConfirmacion(banco, "Otra tarjeta usa esta cuenta.");

    expect(screen.getByRole("alert")).toHaveTextContent("Otra tarjeta usa esta cuenta.");
  });

  it("'Cancelar' y 'Sí, archivar' llevan el piso de toque de 44px", () => {
    renderConfirmacion(banco);

    expect(screen.getByRole("button", { name: "Cancelar" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Sí, archivar" }).className).toContain("min-h-11");
  });
});

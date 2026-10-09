// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TotalAhorrado } from "./total-ahorrado";
import type { Cuenta } from "@/lib/api/types";

// El formulario abajo no es lo que se prueba aquí: con este reemplazo la
// tarjeta se ve tal como la ve la persona, sin montar diálogos ni hooks.
vi.mock("@/components/ahorro/formulario-ahorro", () => ({
  FormularioAhorro: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="formulario-ahorro">{children}</div>
  ),
}));

afterEach(cleanup);

function cuenta(datos: Partial<Cuenta> & Pick<Cuenta, "id" | "name" | "currency">): Cuenta {
  return {
    type: "bank",
    balance: "0.0000",
    saved: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
    isSavings: false,
    creditLimit: null,
    linkedAccountId: null,
    ...datos,
  };
}

describe("TotalAhorrado: suma lo apartado, no el saldo", () => {
  it("suma saved de las cuentas de ahorro y olvida el balance", () => {
    render(
      <TotalAhorrado
        moneda="COP"
        cargando={false}
        cuentas={[
          cuenta({
            id: "cta-1",
            name: "Vacaciones",
            currency: "COP",
            isSavings: true,
            balance: "5000000.0000",
            saved: "500000.0000",
          }),
          cuenta({
            id: "cta-2",
            name: "Bancolombia",
            currency: "COP",
            balance: "7000000.0000",
            saved: "0.0000",
          }),
        ]}
      />
    );

    // Ni el saldo de la cuenta de ahorro (5.000.000) ni el de la otra
    // cuenta cuentan: solo lo que se apartó en ella.
    expect(screen.getByText("$500.000")).toBeInTheDocument();
    expect(screen.queryByText("$5.000.000")).not.toBeInTheDocument();
    expect(screen.queryByText("$7.500.000")).not.toBeInTheDocument();
  });

  it("los retiros bajan la cuenta: la suma usa el signo", () => {
    render(
      <TotalAhorrado
        moneda="COP"
        cargando={false}
        cuentas={[
          cuenta({
            id: "cta-1",
            name: "Vacaciones",
            currency: "COP",
            isSavings: true,
            saved: "500000.0000",
          }),
          cuenta({
            id: "cta-2",
            name: "Estreno",
            currency: "COP",
            isSavings: true,
            saved: "-25000.0000",
          }),
        ]}
      />
    );

    expect(screen.getByText("$475.000")).toBeInTheDocument();
  });

  it("excluye las cuentas de otra moneda", () => {
    render(
      <TotalAhorrado
        moneda="COP"
        cargando={false}
        cuentas={[
          cuenta({
            id: "cta-1",
            name: "Vacaciones",
            currency: "COP",
            isSavings: true,
            saved: "500000.0000",
          }),
          cuenta({
            id: "cta-2",
            name: "Savings USD",
            currency: "USD",
            isSavings: true,
            saved: "9000.0000",
          }),
        ]}
      />
    );

    expect(screen.getByText("$500.000")).toBeInTheDocument();
    expect(screen.queryByText("US$9.000")).not.toBeInTheDocument();
  });

  it("excluye las cuentas archivadas", () => {
    render(
      <TotalAhorrado
        moneda="COP"
        cargando={false}
        cuentas={[
          cuenta({
            id: "cta-1",
            name: "Vacaciones",
            currency: "COP",
            isSavings: true,
            archivedAt: "2026-09-01T00:00:00.000Z",
            saved: "500000.0000",
          }),
        ]}
      />
    );

    expect(screen.queryByText("Ahorrado")).not.toBeInTheDocument();
  });
});

describe("TotalAhorrado: cuando empezar y cuando callar", () => {
  it("con cuentas de ahorro y total en cero se muestra igual, con $0 y el botón", () => {
    render(
      <TotalAhorrado
        moneda="COP"
        cargando={false}
        cuentas={[cuenta({ id: "cta-1", name: "Vacaciones", currency: "COP", isSavings: true })]}
      />
    );

    expect(screen.getByText("Ahorrado")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar ahorro" })).toBeInTheDocument();
  });

  it("sin cuentas de ahorro en esta moneda no se muestra nada, ni el lugar", () => {
    const { container } = render(
      <TotalAhorrado
        moneda="COP"
        cargando={false}
        cuentas={[cuenta({ id: "cta-1", name: "Bancolombia", currency: "COP" })]}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("TotalAhorrado: la tarjeta dice lo que es y cómo empezar", () => {
  it("habla de apartar, no de lo que hay en las cuentas", () => {
    render(
      <TotalAhorrado
        moneda="COP"
        cargando={false}
        cuentas={[cuenta({ id: "cta-1", name: "Vacaciones", currency: "COP", isSavings: true, saved: "100000.0000" })]}
      />
    );

    expect(screen.getByText("Lo que apartaste, no el saldo de tus cuentas.")).toBeInTheDocument();
    // El botón dentro del formulario le pasa SOLO las cuentas de ahorro
    // activas de esta moneda: una cuenta normal no entra a elegir.
    expect(screen.getByTestId("formulario-ahorro")).toBeInTheDocument();
  });

  it("cargando muestra el hueso de la tarjeta", () => {
    const { container } = render(<TotalAhorrado moneda="COP" cargando cuentas={undefined} />);
    expect(screen.queryByText("Ahorrado")).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass("animate-pulse");
  });
});

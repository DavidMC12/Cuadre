// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CuentaCard } from "./cuenta-card";
import type { Cuenta } from "@/lib/api/types";

// El cajón de detalle no es lo que se prueba aquí; montarlo arrastraría
// hooks, cajones y sonner sin aportar a estas cifras.
vi.mock("@/components/cuentas/detalle-cuenta", () => ({
  DetalleCuenta: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

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

const visa = cuenta({
  id: "visa",
  name: "Visa",
  currency: "COP",
  type: "card",
  balance: "-800000.0000",
  creditLimit: "2000000.0000",
});

function barra() {
  return screen.getByRole("progressbar");
}

describe("CuentaCard: una tarjeta con cupo", () => {
  it("muestra el disponible como cifra principal y la deuda con su barra", () => {
    render(<CuentaCard cuenta={visa} />);

    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("$1.200.000")).toBeInTheDocument();
    // Cupo libre, no ingreso: tinta apagada, nunca el verde del dinero.
    expect(screen.getByText("$1.200.000").className).toContain("text-muted-foreground");
    expect(screen.getByText("$1.200.000").className).not.toContain("text-emerald-600");
    expect(screen.getByText("Debes $800.000")).toBeInTheDocument();
    expect(barra()).toHaveAccessibleName("Cupo de Visa: usado $800.000 de $2.000.000");
  });

  it("sin deuda el secundario es 'de $cupo', no un 'Debes $0'", () => {
    render(<CuentaCard cuenta={{ ...visa, balance: "0.0000" }} />);

    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("$2.000.000")).toBeInTheDocument();
    expect(screen.getByText("de $2.000.000")).toBeInTheDocument();
    expect(screen.queryByText(/Debes /)).not.toBeInTheDocument();
  });
});

describe("CuentaCard: una tarjeta sin cupo", () => {
  it("muestra 'Debes $Z' en vez de un saldo negativo grande", () => {
    render(<CuentaCard cuenta={{ ...visa, creditLimit: null, balance: "-500000.0000" }} />);

    expect(screen.getByText("Debes")).toBeInTheDocument();
    expect(screen.getByText("$500.000")).toBeInTheDocument();
    // Ni verde (no es ingreso) ni rojo (no es un error): tinta apagada.
    expect(screen.getByText("$500.000").className).toContain("text-muted-foreground");
    expect(screen.getByText("$500.000").className).not.toContain("text-emerald-600");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Disponible")).not.toBeInTheDocument();
  });

  it("sin deuda dice 'Sin deuda' y no pinta un $0", () => {
    render(<CuentaCard cuenta={{ ...visa, creditLimit: null, balance: "0.0000" }} />);

    expect(screen.getByText("Sin deuda")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("sobrepagada dice 'A favor $X'", () => {
    render(<CuentaCard cuenta={{ ...visa, creditLimit: null, balance: "50000.0000" }} />);

    expect(screen.getByText("A favor")).toBeInTheDocument();
    expect(screen.getByText("$50.000")).toBeInTheDocument();
  });
});

describe("CuentaCard: la barra avisa con color y con nombre", () => {
  it("en ámbar al 80% de uso", () => {
    render(<CuentaCard cuenta={{ ...visa, balance: "-80000.0000", creditLimit: "100000.0000" }} />);

    const relleno = barra().querySelector("div");
    expect(relleno?.className).toContain("bg-warning");
  });

  it("en rojo al 100% de uso", () => {
    render(
      <CuentaCard cuenta={{ ...visa, balance: "-100000.0000", creditLimit: "100000.0000" }} />
    );

    const relleno = barra().querySelector("div");
    expect(relleno?.className).toContain("bg-destructive");
  });

  it("neutra por debajo del umbral", () => {
    render(<CuentaCard cuenta={{ ...visa, balance: "-79000.0000", creditLimit: "100000.0000" }} />);

    const relleno = barra().querySelector("div");
    expect(relleno?.className).toContain("bg-foreground/60");
  });
});

describe("CuentaCard: un pago sube el disponible y baja la deuda", () => {
  it("al subir el saldo (pagar), el disponible crece y la deuda baja", () => {
    const { rerender } = render(<CuentaCard cuenta={visa} />);

    expect(screen.getByText("$1.200.000")).toBeInTheDocument();
    expect(screen.getByText("Debes $800.000")).toBeInTheDocument();

    // Un pago de 300.000 sube el saldo de la tarjeta a -500.000.
    rerender(<CuentaCard cuenta={{ ...visa, balance: "-500000.0000" }} />);

    expect(screen.getByText("$1.500.000")).toBeInTheDocument();
    expect(screen.getByText("Debes $500.000")).toBeInTheDocument();
    expect(screen.queryByText("$1.200.000")).not.toBeInTheDocument();
  });
});

describe("CuentaCard: las cuentas que no son tarjeta se quedan igual", () => {
  it("un banco muestra su saldo, sin disponible ni barra", () => {
    render(
      <CuentaCard
        cuenta={cuenta({ id: "banco", name: "Banco", currency: "COP", balance: "1000000.0000" })}
      />
    );

    expect(screen.getByText("$1.000.000")).toBeInTheDocument();
    expect(screen.queryByText("Disponible")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("CuentaCard: la línea de ahorro es del ahorro, no del saldo", () => {
  it("una cuenta de ahorro con algo apartado muestra 'Ahorrado $X' bajo el saldo", () => {
    render(
      <CuentaCard
        cuenta={cuenta({
          id: "cta-1",
          name: "Vacaciones",
          currency: "COP",
          isSavings: true,
          balance: "2000000.0000",
          saved: "500000.0000",
        })}
      />
    );

    // Los dos datos conviven, y se leen como lo que son: el saldo de la
    // cuenta y lo apartado en ella.
    expect(screen.getByText("$2.000.000")).toBeInTheDocument();
    expect(screen.getByText("Ahorrado $500.000")).toBeInTheDocument();
  });

  it("con nada apartado no pinta un 'Ahorrado $0'", () => {
    render(
      <CuentaCard
        cuenta={cuenta({
          id: "cta-1",
          name: "Vacaciones",
          currency: "COP",
          isSavings: true,
          balance: "2000000.0000",
          saved: "0.0000",
        })}
      />
    );

    expect(screen.getByText("$2.000.000")).toBeInTheDocument();
    expect(screen.queryByText(/Ahorrado/)).not.toBeInTheDocument();
  });

  it("una cuenta que no es de ahorro no la muestra, aunque el servidor le mande una cifra", () => {
    render(
      <CuentaCard
        cuenta={cuenta({
          id: "cta-2",
          name: "Bancolombia",
          currency: "COP",
          balance: "3000000.0000",
          saved: "150000.0000",
        })}
      />
    );

    expect(screen.queryByText(/Ahorrado/)).not.toBeInTheDocument();
  });

  it("una cuenta de ahorro con retiros de más muestra el menos también", () => {
    render(
      <CuentaCard
        cuenta={cuenta({
          id: "cta-1",
          name: "Vacaciones",
          currency: "COP",
          isSavings: true,
          saved: "-25000.0000",
        })}
      />
    );

    expect(screen.getByText("Ahorrado −$25.000")).toBeInTheDocument();
  });
});

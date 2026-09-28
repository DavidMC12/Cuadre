// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { MENOS } from "@/lib/money";
import type { Cuenta } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

interface OpcionesMutacion {
  onSuccess?: (respuesta: { data: Cuenta }) => void;
  onError?: (error: unknown) => void;
}

const holders = vi.hoisted(() => ({
  drawerOnOpenChange: undefined as undefined | ((valor: boolean) => void),
  actualizar: vi.fn(),
  marcarAhorro: vi.fn(),
}));

// El Drawer de Base UI no hace falta para probar la lógica del cajón: con
// este reemplazo el contenido queda montado y se puede pedir el cierre a mano.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children, onOpenChange }: ConHijos & { onOpenChange?: (valor: boolean) => void }) => {
    holders.drawerOnOpenChange = onOpenChange;
    return <div>{children}</div>;
  },
  DrawerTrigger: ({ render }: { render?: ReactElement }) => render,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: ConHijos) => <div>{children}</div>,
  SelectTrigger: ({ children }: ConHijos) => <button type="button">{children}</button>,
  SelectValue: () => null,
  SelectContent: ({ children }: ConHijos) => <div>{children}</div>,
  SelectItem: ({ children }: ConHijos) => <div>{children}</div>,
}));

vi.mock("@/components/movimientos/formulario-movimiento", () => ({
  FormularioMovimiento: ({ children }: ConHijos) => <>{children}</>,
}));

vi.mock("@/hooks/use-cuentas", () => ({
  useCuentas: () => ({ data: [] }),
  useActualizarCuenta: () => ({ mutate: holders.actualizar, isPending: false }),
  useMarcarAhorro: () => ({ mutate: holders.marcarAhorro, isPending: false }),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => false,
}));

import { DetalleCuenta, MontoSaldo } from "./detalle-cuenta";

afterEach(() => {
  cleanup();
  holders.actualizar.mockReset();
  holders.marcarAhorro.mockReset();
  holders.drawerOnOpenChange = undefined;
});

const banco: Cuenta = {
  id: "c1",
  name: "Bancolombia",
  type: "bank",
  currency: "COP",
  balance: "100000.0000",
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

function renderDetalle(cuenta: Cuenta) {
  render(
    <DetalleCuenta cuenta={cuenta}>
      <button type="button">Abrir</button>
    </DetalleCuenta>
  );
}

function pedirCierre() {
  act(() => holders.drawerOnOpenChange?.(false));
}

describe("DetalleCuenta: una sola gramática de guardado", () => {
  it("guarda el nombre al salir del campo", () => {
    renderDetalle(banco);
    const input = screen.getByLabelText("Nombre");
    fireEvent.change(input, { target: { value: "Banco Nuevo" } });
    fireEvent.blur(input);

    expect(holders.actualizar).toHaveBeenCalledTimes(1);
    expect(holders.actualizar.mock.calls[0][0]).toEqual({
      id: "c1",
      cambios: { name: "Banco Nuevo" },
    });
  });

  it("Enter guarda el nombre igual que salir del campo", () => {
    renderDetalle(banco);
    const input = screen.getByLabelText("Nombre");
    fireEvent.change(input, { target: { value: "Banco Nuevo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(holders.actualizar).toHaveBeenCalledTimes(1);
    expect(holders.actualizar.mock.calls[0][0]).toEqual({
      id: "c1",
      cambios: { name: "Banco Nuevo" },
    });
  });

  it("no guarda si el nombre no cambió", () => {
    renderDetalle(banco);
    fireEvent.blur(screen.getByLabelText("Nombre"));
    expect(holders.actualizar).not.toHaveBeenCalled();
  });

  it("un nombre vacío al salir del campo se avisa en línea", () => {
    renderDetalle(banco);
    const input = screen.getByLabelText("Nombre");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(screen.getByText("Ponle un nombre a la cuenta.")).toBeInTheDocument();
    expect(holders.actualizar).not.toHaveBeenCalled();
  });

  it("al guardar bien, el indicador dice Guardado y el campo queda con lo del servidor", () => {
    renderDetalle(banco);
    holders.actualizar.mockImplementationOnce(
      (_variables: unknown, opciones: OpcionesMutacion) => {
        opciones.onSuccess?.({ data: { ...banco, name: "Banco Nuevo" } });
      }
    );

    const input = screen.getByLabelText("Nombre");
    fireEvent.change(input, { target: { value: "Banco Nuevo" } });
    fireEvent.blur(input);

    expect(screen.getByText("Guardado")).toBeInTheDocument();
    expect(input).toHaveValue("Banco Nuevo");
  });

  it("si el guardado falla, el texto no se pierde y al cerrar avisa", () => {
    renderDetalle(banco);
    holders.actualizar.mockImplementationOnce(
      (_variables: unknown, opciones: OpcionesMutacion) => {
        opciones.onError?.(new Error("boom"));
      }
    );

    const input = screen.getByLabelText("Nombre");
    fireEvent.change(input, { target: { value: "Banco Nuevo" } });
    fireEvent.blur(input);

    expect(input).toHaveValue("Banco Nuevo");
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument();
    pedirCierre();
    expect(screen.getByText(/cambios sin guardar/i)).toBeInTheDocument();
  });

  it("avisa antes de cerrar con texto válido sin guardar y no lo pierde", () => {
    renderDetalle(banco);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Banco Nuevo" } });

    pedirCierre();

    expect(screen.getByText(/cambios sin guardar/i)).toBeInTheDocument();
    expect(holders.actualizar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Banco Nuevo");
  });

  it("'Seguir editando' deja el cajón abierto y luego el blur guarda", () => {
    renderDetalle(banco);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Banco Nuevo" } });
    pedirCierre();

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByText(/cambios sin guardar/i)).not.toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("Nombre"));
    expect(holders.actualizar).toHaveBeenCalledTimes(1);
  });

  it("'Descartar' cierra y al reabrir vuelve al valor del servidor", () => {
    renderDetalle(banco);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Banco Nuevo" } });
    pedirCierre();

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByText(/cambios sin guardar/i)).not.toBeInTheDocument();
    expect(holders.actualizar).not.toHaveBeenCalled();

    // Reabrir muestra lo del servidor, no lo descartado.
    act(() => holders.drawerOnOpenChange?.(true));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Bancolombia");
  });

  it("cerrar sin cambios no muestra aviso", () => {
    renderDetalle(banco);
    pedirCierre();
    expect(screen.queryByText(/cambios sin guardar/i)).not.toBeInTheDocument();
  });

  it("el interruptor de ahorro guarda al cambiarlo", () => {
    renderDetalle(banco);
    fireEvent.click(screen.getByRole("switch", { name: "Cuenta de ahorro" }));

    expect(holders.marcarAhorro).toHaveBeenCalledWith(
      { id: "c1", isSavings: true },
      expect.anything()
    );
  });
});

describe("DetalleCuenta: un cupo inválido no se pierde en silencio", () => {
  it("avisa antes de cerrar con el cupo en cero y lo deja escrito", () => {
    renderDetalle(visa);
    fireEvent.change(screen.getByLabelText("Cupo"), { target: { value: "0" } });

    pedirCierre();

    expect(screen.getByText(/cambios sin guardar/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Cupo")).toHaveValue("0");
    expect(holders.actualizar).not.toHaveBeenCalled();
  });

  it("'Descartar' cierra y al reabrir vuelve al cupo del servidor", () => {
    renderDetalle(visa);
    fireEvent.change(screen.getByLabelText("Cupo"), { target: { value: "0" } });
    pedirCierre();

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByText(/cambios sin guardar/i)).not.toBeInTheDocument();
    act(() => holders.drawerOnOpenChange?.(true));
    expect(screen.getByLabelText("Cupo")).toHaveValue("2.000.000");
  });

  it("avisa antes de cerrar con un cupo válido sin guardar", () => {
    renderDetalle(visa);
    fireEvent.change(screen.getByLabelText("Cupo"), { target: { value: "3.000.000" } });

    pedirCierre();

    expect(screen.getByText(/cambios sin guardar/i)).toBeInTheDocument();
    expect(holders.actualizar).not.toHaveBeenCalled();
  });
});

describe("DetalleCuenta: el saldo real de una tarjeta", () => {
  it("con deuda se etiqueta 'Debes'", () => {
    renderDetalle(visa);
    expect(screen.getByText("Debes")).toBeInTheDocument();
    expect(screen.queryByText("A favor")).not.toBeInTheDocument();
  });

  it("sobrepagada se etiqueta 'A favor', no 'Debes'", () => {
    renderDetalle({ ...visa, balance: "50000.0000" });
    expect(screen.getByText("A favor")).toBeInTheDocument();
    expect(screen.queryByText("Debes")).not.toBeInTheDocument();
  });

  it("la barra del cupo avisa en ámbar cerca del límite", () => {
    renderDetalle({ ...visa, balance: "-1800000.0000" });
    const relleno = screen.getByRole("progressbar").querySelector("div");
    expect(relleno).toHaveClass("bg-warning");
  });

  it("la barra del cupo pasa a rojo al llegar al límite", () => {
    renderDetalle({ ...visa, balance: "-2000000.0000" });
    const relleno = screen.getByRole("progressbar").querySelector("div");
    expect(relleno).toHaveClass("bg-destructive");
  });
});

describe("MontoSaldo", () => {
  it("una tarjeta que debe muestra el signo de deuda en tinta, no en verde", () => {
    render(<MontoSaldo cuenta={visa} />);
    const monto = screen.getByText(`${MENOS}$500.000`);
    expect(monto).toHaveClass("text-foreground");
  });

  it("una tarjeta sobrepagada no lleva signo de deuda", () => {
    render(<MontoSaldo cuenta={{ ...visa, balance: "50000.0000" }} />);
    expect(screen.getByText("$50.000")).toBeInTheDocument();
    expect(screen.queryByText(`${MENOS}$50.000`)).not.toBeInTheDocument();
  });
});

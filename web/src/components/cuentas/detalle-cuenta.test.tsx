// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { toast } from "sonner";

import { MENOS } from "@/lib/money";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type ConHijos = { children?: ReactNode };

interface OpcionesMutacion {
  onSuccess?: (respuesta: { data: Cuenta }) => void;
  onError?: (error: unknown) => void;
}

const holders = vi.hoisted(() => ({
  drawerOnOpenChange: undefined as undefined | ((valor: boolean) => void),
  drawerAbierto: false,
  actualizar: vi.fn(),
  marcarAhorro: vi.fn(),
  archivar: vi.fn(),
  ajustar: vi.fn(),
  soloMirar: false,
}));

// El Drawer de Base UI no hace falta para probar la lógica del cajón: con
// este reemplazo el contenido queda montado y se puede pedir el cierre a mano.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({
    children,
    onOpenChange,
    open,
  }: ConHijos & { onOpenChange?: (valor: boolean) => void; open?: boolean }) => {
    holders.drawerOnOpenChange = onOpenChange;
    holders.drawerAbierto = Boolean(open);
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
  useArchivarCuenta: () => ({ mutate: holders.archivar, isPending: false }),
  useAjustarSaldo: () => ({ mutate: holders.ajustar, isPending: false }),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => holders.soloMirar,
}));

import { DetalleCuenta, MontoSaldo } from "./detalle-cuenta";

afterEach(() => {
  cleanup();
  holders.actualizar.mockReset();
  holders.marcarAhorro.mockReset();
  holders.archivar.mockReset();
  holders.ajustar.mockReset();
  holders.soloMirar = false;
  holders.drawerAbierto = false;
  holders.drawerOnOpenChange = undefined;
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
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
  saved: "0.0000",
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

const visaAjustada: Cuenta = {
  ...visa,
  balance: "-350000.0000",
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

function abrirCajon() {
  act(() => holders.drawerOnOpenChange?.(true));
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

  it("el campo Nombre y el interruptor de ahorro llevan el piso de 44px", () => {
    // El Input era de 32px (h-8). El Switch conserva su píldora de 18.4px:
    // su área táctil ::after es la que se estira (no min-h-11, que inflaría
    // la píldora visible).
    renderDetalle(banco);

    expect(screen.getByLabelText("Nombre").className).toContain("min-h-11");
    const interruptor = screen.getByRole("switch", { name: "Cuenta de ahorro" });
    expect(interruptor.className).toContain("after:-inset-y-[13px]");
    expect(interruptor.className).not.toContain("min-h-11");
  });

  it("en una tarjeta, el campo Cupo lleva el piso de 44px", () => {
    renderDetalle(visa);
    expect(screen.getByLabelText("Cupo").className).toContain("min-h-11");
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

describe("DetalleCuenta: archivar la cuenta", () => {
  it("abrir la confirmación y cancelar no llama al servidor", () => {
    renderDetalle(banco);
    fireEvent.click(screen.getByRole("button", { name: "Archivar cuenta" }));

    expect(screen.getByText("¿Archivar Bancolombia?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(holders.archivar).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Archivar Bancolombia?")).not.toBeInTheDocument();
  });

  it("confirmar llama a archivar con el id de la cuenta", () => {
    renderDetalle(banco);
    fireEvent.click(screen.getByRole("button", { name: "Archivar cuenta" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, archivar" }));

    expect(holders.archivar).toHaveBeenCalledTimes(1);
    expect(holders.archivar.mock.calls[0][0]).toBe("c1");
  });

  it("al archivar bien, cierra la confirmación y el cajón", () => {
    renderDetalle(banco);
    abrirCajon();
    holders.archivar.mockImplementationOnce((_id: unknown, opciones: OpcionesMutacion) => {
      opciones.onSuccess?.({ data: { ...banco, archivedAt: "2026-10-06T00:00:00.000Z" } });
    });

    fireEvent.click(screen.getByRole("button", { name: "Archivar cuenta" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, archivar" }));

    expect(screen.queryByText("¿Archivar Bancolombia?")).not.toBeInTheDocument();
    expect(holders.drawerAbierto).toBe(false);
  });

  it("si el servidor rechaza, muestra el motivo y no cierra el cajón", () => {
    renderDetalle(banco);
    abrirCajon();
    holders.archivar.mockImplementationOnce((_id: unknown, opciones: OpcionesMutacion) => {
      opciones.onError?.(
        new ApiError({ code: "CONFLICT", message: "Esa cuenta ya está archivada." })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Archivar cuenta" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, archivar" }));

    // El cajón sigue abierto y la confirmación sigue mostrando el motivo.
    expect(holders.drawerAbierto).toBe(true);
    expect(screen.getByText("¿Archivar Bancolombia?")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Esa cuenta ya está archivada.");
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
  });

  it("en modo solo-mirar el botón queda deshabilitado", () => {
    holders.soloMirar = true;
    renderDetalle(banco);

    expect(screen.getByRole("button", { name: "Archivar cuenta" })).toBeDisabled();
  });
});

describe("DetalleCuenta: ajustar el saldo (o la deuda)", () => {
  it("en una tarjeta el botón dice 'Ajustar deuda'", () => {
    renderDetalle(visa);
    expect(screen.getByRole("button", { name: "Ajustar deuda" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajustar saldo" })).not.toBeInTheDocument();
  });

  it("en las demás cuentas el botón dice 'Ajustar saldo'", () => {
    renderDetalle(banco);
    expect(screen.getByRole("button", { name: "Ajustar saldo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajustar deuda" })).not.toBeInTheDocument();
  });

  it("el botón es outline de 44px y va discreto", () => {
    renderDetalle(visa);
    const boton = screen.getByRole("button", { name: "Ajustar deuda" });
    expect(boton.className).toContain("min-h-11");
    expect(boton.className).toContain("outline");
  });

  it("en modo solo-mirar el botón queda deshabilitado", () => {
    holders.soloMirar = true;
    renderDetalle(visa);
    expect(screen.getByRole("button", { name: "Ajustar deuda" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archivar cuenta" })).toBeDisabled();
  });

  it("en una cuenta archivada el botón no existe", () => {
    renderDetalle({
      ...banco,
      archivedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(screen.queryByRole("button", { name: "Ajustar saldo" })).not.toBeInTheDocument();
    // Archivar sí se conserva: es donde se desarchiva... (este cajón lo ofrece).
    expect(screen.getByRole("button", { name: "Archivar cuenta" })).toBeInTheDocument();
  });

  it("la pregunta del campo depende del tipo y el título nombra la cuenta", () => {
    renderDetalle(visa);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));
    expect(screen.getByText(/¿Cuánto debes hoy según tu banco\?/)).toBeInTheDocument();

    // En las demás cuentas se pregunta por el saldo.
    cleanup();
    renderDetalle(banco);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar saldo" }));
    expect(screen.getByText(/¿Cuánto hay hoy en esta cuenta\?/)).toBeInTheDocument();
  });

  it("la vista previa es exacta: la deuda se escribe en positivo y va con signo al servidor", () => {
    renderDetalle(visa);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));

    const campo = screen.getByLabelText("¿Cuánto debes hoy según tu banco?");
    fireEvent.change(campo, { target: { value: "400.000" } });

    expect(
      screen.getByText(
        "Hoy la app dice que debes $500.000. Se registrará un ajuste de +$100.000 para que coincida."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Esto no cuenta como gasto ni ingreso/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sí, ajustar" }));

    expect(holders.ajustar).toHaveBeenCalledTimes(1);
    expect(holders.ajustar.mock.calls[0][0]).toEqual({
      id: "c2",
      balance: "-400000",
    });
  });

  it("una tarjeta sobrepagada se dice bien: queda a tu favor", () => {
    renderDetalle({ ...visa, balance: "50000.0000" });
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));

    fireEvent.change(screen.getByLabelText("¿Cuánto debes hoy según tu banco?"), {
      target: { value: "0" },
    });

    expect(
      screen.getByText(
        "Hoy la app dice que queda $50.000 a tu favor. Se registrará un ajuste de −$50.000 para que coincida."
      )
    ).toBeInTheDocument();
  });

  it("sin diferencia dice 'Ya coincide' y el botón principal queda apagado, sin viaje al servidor", () => {
    renderDetalle(visa);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));

    fireEvent.change(screen.getByLabelText("¿Cuánto debes hoy según tu banco?"), {
      target: { value: "500.000" },
    });

    expect(screen.getByText("Ya coincide.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, ajustar" })).toBeDisabled();
  });

  it("con el campo vacío no hay botón que pulsar", () => {
    renderDetalle(banco);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar saldo" }));
    expect(screen.getByRole("button", { name: "Sí, ajustar" })).toBeDisabled();
    expect(holders.ajustar).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza, el motivo se lee dentro del diálogo y el diálogo no se cierra", () => {
    renderDetalle(visa);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));
    fireEvent.change(screen.getByLabelText("¿Cuánto debes hoy según tu banco?"), {
      target: { value: "350.000" },
    });
    holders.ajustar.mockImplementationOnce(
      (_variables: unknown, opciones: OpcionesMutacion) => {
        opciones.onError?.(
          new ApiError({ code: "RULE_VIOLATION", message: "Esa cuenta ya tiene ese saldo." })
        );
      }
    );

    fireEvent.click(screen.getByRole("button", { name: "Sí, ajustar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Esa cuenta ya tiene ese saldo.");
    expect(screen.getByText(/¿Cuánto debes hoy según tu banco\?/)).toBeInTheDocument();
  });

  it("el rechazo del servidor se borra al volver a editar el monto", () => {
    renderDetalle(visa);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));
    const campo = screen.getByLabelText("¿Cuánto debes hoy según tu banco?");
    fireEvent.change(campo, { target: { value: "350.000" } });
    holders.ajustar.mockImplementationOnce(
      (_variables: unknown, opciones: OpcionesMutacion) => {
        opciones.onError?.(
          new ApiError({ code: "RULE_VIOLATION", message: "Esa cuenta ya tiene ese saldo." })
        );
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, ajustar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Esa cuenta ya tiene ese saldo.");

    // Un dígito de más y el aviso viejo ya no dice nada útil: la vista previa
    // cambió, el error del servidor no puede seguir contradiciéndola.
    fireEvent.change(campo, { target: { value: "360.000" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aria-invalid del campo marca solo el error del campo, no el rechazo del servidor", () => {
    renderDetalle(visa);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));
    const campo = screen.getByLabelText("¿Cuánto debes hoy según tu banco?");

    // Sin escribir nada no hay error de campo.
    expect(campo).toHaveAttribute("aria-invalid", "false");

    // El rechazo del servidor NO marca el campo: la cifra estaba bien escrita.
    fireEvent.change(campo, { target: { value: "350.000" } });
    holders.ajustar.mockImplementationOnce(
      (_variables: unknown, opciones: OpcionesMutacion) => {
        opciones.onError?.(
          new ApiError({ code: "RULE_VIOLATION", message: "Esa cuenta ya tiene ese saldo." })
        );
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Sí, ajustar" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(campo).toHaveAttribute("aria-invalid", "false");

    // Un monto mal escrito sí es cosa del campo.
    fireEvent.change(campo, { target: { value: "0,5" } });
    expect(screen.getByText(/los pesos no llevan decimales/i)).toBeInTheDocument();
    expect(campo).toHaveAttribute("aria-invalid", "true");
  });

  it("al ajustar bien, el diálogo se cierra y el cajón queda", () => {
    renderDetalle(visa);
    abrirCajon();
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));
    fireEvent.change(screen.getByLabelText("¿Cuánto debes hoy según tu banco?"), {
      target: { value: "350.000" },
    });
    holders.ajustar.mockImplementationOnce((_variables: unknown, opciones: OpcionesMutacion) => {
      opciones.onSuccess?.({ data: visaAjustada });
    });

    fireEvent.click(screen.getByRole("button", { name: "Sí, ajustar" }));

    expect(screen.queryByText(/¿Cuánto debes hoy según tu banco\?/)).not.toBeInTheDocument();
    expect(holders.drawerAbierto).toBe(true);
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
  });

  it("al ajustar una tarjeta, el toast habla de deuda en positivo, como la pantalla", () => {
    renderDetalle(visa);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar deuda" }));
    fireEvent.change(screen.getByLabelText("¿Cuánto debes hoy según tu banco?"), {
      target: { value: "350.000" },
    });
    holders.ajustar.mockImplementationOnce((_variables: unknown, opciones: OpcionesMutacion) => {
      opciones.onSuccess?.({ data: visaAjustada });
    });

    fireEvent.click(screen.getByRole("button", { name: "Sí, ajustar" }));

    expect(toast.success).toHaveBeenCalledWith("Listo. Ahora debes $350.000.");
  });

  it("al ajustar una cuenta que no es tarjeta, el toast dice en qué quedó", () => {
    renderDetalle(banco);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar saldo" }));
    fireEvent.change(screen.getByLabelText("¿Cuánto hay hoy en esta cuenta?"), {
      target: { value: "80.000" },
    });
    holders.ajustar.mockImplementationOnce((_variables: unknown, opciones: OpcionesMutacion) => {
      opciones.onSuccess?.({ data: { ...banco, balance: "80000.0000" } });
    });

    fireEvent.click(screen.getByRole("button", { name: "Sí, ajustar" }));

    expect(toast.success).toHaveBeenCalledWith("Listo. Quedó en $80.000.");
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

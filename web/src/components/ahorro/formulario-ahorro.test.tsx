// @vitest-environment jsdom
/**
 * Pruebas del formulario de "Registrar ahorro" con la mutación como mock:
 * el signo que manda al servidor, la preselección, el cero y el rechazo del
 * servidor que se lee tal cual.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FormularioAhorro } from "./formulario-ahorro";
import { ApiError } from "@/lib/api/client";
import type { Cuenta, NuevoRegistroAhorro } from "@/lib/api/types";

// La mutación se guarda para poder mirar qué recibió el servidor y decidir
// qué le responde cada prueba.
const registrar = vi.hoisted(() => ({ mutate: vi.fn() }));
const soloMirar = vi.hoisted(() => ({ activo: false }));

vi.mock("@/hooks/use-ahorros", () => ({
  useCrearRegistroAhorro: () => ({ isPending: false, mutate: registrar.mutate }),
}));

vi.mock("@/hooks/use-perfil", () => ({
  useSoloMirar: () => soloMirar.activo,
}));

afterEach(() => {
  cleanup();
  registrar.mutate.mockReset();
  soloMirar.activo = false;
});

function cuenta(datos: Partial<Cuenta> & Pick<Cuenta, "id" | "name">): Cuenta {
  return {
    type: "bank",
    currency: "COP",
    balance: "0.0000",
    saved: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
    isSavings: true,
    creditLimit: null,
    linkedAccountId: null,
    ...datos,
  };
}

const vacaciones = cuenta({ id: "cta-1", name: "Vacaciones" });
const estreno = cuenta({ id: "cta-2", name: "Estreno" });

function abrirDominio(cuentas: Cuenta[], cuentaIdPorDefecto?: string) {
  render(
    <FormularioAhorro cuentas={cuentas} cuentaIdPorDefecto={cuentaIdPorDefecto}>
      <button type="button">Registrar ahorro</button>
    </FormularioAhorro>
  );
  fireEvent.click(screen.getByRole("button", { name: "Registrar ahorro" }));
}

describe("FormularioAhorro: qué llega al servidor", () => {
  it("un Aparte envía el monto positivo, con la fecha y la descripción", () => {
    abrirDominio([vacaciones]);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "500.000" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("Descripción (opcional)"), {
      target: { value: "Prima" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));

    expect(registrar.mutate).toHaveBeenCalledTimes(1);
    const envio = registrar.mutate.mock.calls[0][0] as NuevoRegistroAhorro;
    expect(envio).toEqual({
      accountId: "cta-1",
      amount: "500000",
      occurredAt: expect.any(String),
      description: "Prima",
    });
    // Mediodía local: la fecha del input no se corre de día al ir a UTC.
    expect(envio.occurredAt).toContain("2026-10-03");
  });

  it("un Retire envía el monto negativo: el signo lo aporta el toggle, no el tecleo", () => {
    abrirDominio([vacaciones]);
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "25.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));

    expect(registrar.mutate.mock.calls[0][0].amount).toBe("-25000");
    // La pantalla nunca mintió: el campo siempre se leyó como positivo.
    expect(screen.getByLabelText("Monto")).toHaveValue("25.000");
  });

  it("sin descripción el envío va sin description, no con una cadena vacía", () => {
    abrirDominio([vacaciones]);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "10.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));

    const envio = registrar.mutate.mock.calls[0][0] as NuevoRegistroAhorro;
    // `description: undefined` es el mismo "sin descripción" del contrato.
    expect(envio.description).toBeUndefined();
  });

  it("la vista previa habla antes de guardar, en aparte y en retiro", () => {
    abrirDominio([vacaciones]);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "500.000" } });
    expect(
      screen.getByText("Vas a anotar que apartaste $500.000 para ahorro.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "500.000" } });
    expect(
      screen.getByText("Vas a anotar que retiraste $500.000 para ahorro.")
    ).toBeInTheDocument();
  });
});

describe("FormularioAhorro: con qué cuenta abre", () => {
  it("con una sola cuenta de ahorro, esa va preseleccionada y listo para guardar", () => {
    abrirDominio([vacaciones]);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "10.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));

    expect(registrar.mutate.mock.calls[0][0].accountId).toBe("cta-1");
  });

  it("con la preselección de afuera (la cuenta misma), manda esa aunque haya varias", () => {
    abrirDominio([vacaciones, estreno], "cta-2");
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "10.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));

    expect(registrar.mutate.mock.calls[0][0].accountId).toBe("cta-2");
  });

  it("con varias y sin preselección no inventa: el botón queda apagado hasta elegir", () => {
    abrirDominio([vacaciones, estreno]);

    expect(screen.getByRole("button", { name: "Sí, anotar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "10.000" } });
    expect(screen.getByRole("button", { name: "Sí, anotar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));
    expect(registrar.mutate).not.toHaveBeenCalled();
  });

  it("el cero no se aparta: cifra valida distinta de cero", () => {
    abrirDominio([vacaciones]);
    expect(screen.getByRole("button", { name: "Sí, anotar" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Sí, anotar" })).toBeDisabled();
    expect(screen.getByText("El monto tiene que ser mayor que cero.")).toBeInTheDocument();
  });

  it("sin cuentas de ahorro no muestra un formulario muerto", () => {
    abrirDominio([]);
    expect(
      screen.getByText("Primero marca una cuenta como de ahorro para anotar en ella.")
    ).toBeInTheDocument();
    // Defensivo que no debería ocurrir, pero si ocurriera no hay botón
    // apagado confundiendo: el cuerpo no ofrece nada por anotar.
    expect(screen.queryByRole("button", { name: "Sí, anotar" })).not.toBeInTheDocument();
  });
});

describe("FormularioAhorro: el servidor manda", () => {
  it("un rechazo se muestra tal cual y el diálogo no se cierra", () => {
    registrar.mutate.mockImplementationOnce(
      (_variables: unknown, opciones: { onError?: (error: unknown) => void }) => {
        // Un ApiError de verdad: el mismo tipo que construye el cliente.
        opciones.onError?.(
          new ApiError({
            code: "RULE_VIOLATION",
            message: "Esta cuenta ya no es de ahorro. Marcarla de nuevo para seguir anotando.",
          })
        );
      }
    );

    abrirDominio([vacaciones]);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "10.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));

    expect(
      screen.getByText(
        "Esta cuenta ya no es de ahorro. Marcarla de nuevo para seguir anotando."
      )
    ).toBeInTheDocument();
    // Sigue el diálogo abierto: el motivo del rechazo debe poder leerse.
    expect(screen.getByLabelText("Monto")).toBeInTheDocument();
  });

  it("desde la cuenta de otra persona ni se abre nada", () => {
    soloMirar.activo = true;
    render(
      <FormularioAhorro cuentas={[vacaciones]}>
        <button type="button">Registrar ahorro</button>
      </FormularioAhorro>
    );

    expect(screen.queryByRole("button", { name: "Registrar ahorro" })).not.toBeInTheDocument();
  });

  it("al guardar bien el diálogo se cierra y el formulario queda limpio", () => {
    registrar.mutate.mockImplementationOnce(
      (_variables: unknown, opciones: { onSuccess?: (respuesta: unknown) => void }) => {
        opciones.onSuccess?.({
          data: {
            id: "reg-1",
            accountId: "cta-1",
            currency: "COP",
            amount: "10000",
            occurredAt: "2026-10-08T12:00:00.000Z",
            description: null,
          },
        });
      }
    );

    abrirDominio([vacaciones]);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "10.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Sí, anotar" }));

    expect(screen.queryByRole("button", { name: "Sí, anotar" })).not.toBeInTheDocument();
  });
});

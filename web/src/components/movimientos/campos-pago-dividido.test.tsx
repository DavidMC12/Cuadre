// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { CamposPagoDividido, type PagoDivididoEnEdicion } from "./campos-pago-dividido";
import type { Cuenta } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

// El popup del Select no abre bien en jsdom: este reemplazo deja un <select>
// nativo con las mismas opciones para revisar qué cuentas se ofrecen y qué
// pasa al elegir una.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: ConHijos & { value?: string; onValueChange?: (valor: string) => void }) => (
    <select
      data-testid="select"
      value={value ?? ""}
      onChange={(evento) => onValueChange?.(evento.target.value)}
    >
      <option value="">—</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: ConHijos) => <>{children}</>,
  SelectItem: ({ value, children }: ConHijos & { value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

afterEach(cleanup);

function cuenta(id: string, nombre: string, extras: Partial<Cuenta> = {}): Cuenta {
  return { id, name: nombre, currency: "COP", archivedAt: null, ...extras } as Cuenta;
}

const cuentas = [
  cuenta("tarjeta", "Tarjeta Nu"),
  cuenta("banco", "Nu Bank"),
  cuenta("efectivo", "Efectivo"),
  cuenta("dolares", "Dólares", { currency: "USD" }),
  cuenta("vieja", "Cuenta vieja", { archivedAt: "2026-01-01T00:00:00Z" }),
];

const inicial: PagoDivididoEnEdicion = {
  cuenta1Id: "tarjeta",
  cuenta2Id: "banco",
  texto1: "100.000",
  texto2: "100.000",
};

function montar(
  valor: PagoDivididoEnEdicion = inicial,
  extras: {
    total?: string | null;
    onChange?: (siguiente: PagoDivididoEnEdicion) => void;
    onVolver?: () => void;
  } = {}
) {
  const onChange = extras.onChange ?? vi.fn<(siguiente: PagoDivididoEnEdicion) => void>();
  render(
    <CamposPagoDividido
      valor={valor}
      onChange={onChange}
      onVolver={extras.onVolver ?? vi.fn()}
      total={extras.total === undefined ? "200000.0000" : extras.total}
      moneda="COP"
      cuentas={cuentas}
    />
  );
  return onChange;
}

describe("CamposPagoDividido", () => {
  it("muestra las dos cuentas con su monto y dice que suma el total cuando cuadra", () => {
    montar();

    expect(screen.getByText("Pagar con dos cuentas")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto en la cuenta 1")).toHaveValue("100.000");
    expect(screen.getByLabelText("Monto en la cuenta 2")).toHaveValue("100.000");
    const estado = document.getElementById("estado-pago-dividido")!;
    expect(estado).toHaveTextContent("✓ Suma $200.000");
    expect(estado).toHaveAttribute("aria-live", "polite");
  });

  it("si no cuadra, lo dice en palabras con la cifra exacta", () => {
    montar({ ...inicial, texto2: "50.000" });

    expect(document.getElementById("estado-pago-dividido")).toHaveTextContent(
      "Faltan $50.000 por repartir."
    );
  });

  it("si se pasa, dice cuánto", () => {
    montar({ ...inicial, texto1: "150.000" });

    expect(document.getElementById("estado-pago-dividido")).toHaveTextContent(
      "Te pasaste por $50.000."
    );
  });

  it("editar el monto de una parte completa la otra para sumar el total", () => {
    const onChange = montar();

    fireEvent.change(screen.getByLabelText("Monto en la cuenta 1"), { target: { value: "150.000" } });

    expect(onChange).toHaveBeenCalledWith({ ...inicial, texto1: "150.000", texto2: "50.000" });
  });

  it("editar la segunda también completa la primera", () => {
    const onChange = montar();

    fireEvent.change(screen.getByLabelText("Monto en la cuenta 2"), { target: { value: "30.000" } });

    expect(onChange).toHaveBeenCalledWith({ ...inicial, texto1: "170.000", texto2: "30.000" });
  });

  it("si lo escrito no sirve (se pasa del total), deja la otra parte como estaba", () => {
    const onChange = montar();

    fireEvent.change(screen.getByLabelText("Monto en la cuenta 1"), { target: { value: "300.000" } });

    expect(onChange).toHaveBeenCalledWith({ ...inicial, texto1: "300.000", texto2: "100.000" });
  });

  it("cada cuenta ofrece solo las activas, de la misma moneda y sin la que eligió la otra", () => {
    montar();
    const [cuenta1, cuenta2] = screen.getAllByTestId("select");

    const nombres = (selector: HTMLElement) =>
      Array.from(selector.querySelectorAll("option"))
        .map((opcion) => opcion.textContent)
        .filter((texto) => texto !== "—");

    // La 1 no ofrece la que eligió la 2 (Nu Bank), la 2 no ofrece la de la 1
    // (Tarjeta Nu); ninguna ofrece dólares ni la cuenta archivada.
    expect(nombres(cuenta1!)).toEqual(["Tarjeta Nu", "Efectivo"]);
    expect(nombres(cuenta2!)).toEqual(["Nu Bank", "Efectivo"]);
  });

  it("elegir otra cuenta avisa cuál cambió y deja intactos los montos", () => {
    const onChange = montar();
    const [, cuenta2] = screen.getAllByTestId("select");

    fireEvent.change(cuenta2!, { target: { value: "efectivo" } });

    expect(onChange).toHaveBeenCalledWith({ ...inicial, cuenta2Id: "efectivo" });
  });

  it("'Volver a una cuenta' mide 44px y avisa", () => {
    const onVolver = vi.fn();
    montar(inicial, { onVolver });

    const boton = screen.getByRole("button", { name: "Volver a una cuenta" });
    expect(boton.className).toContain("min-h-11");
    fireEvent.click(boton);

    expect(onVolver).toHaveBeenCalledTimes(1);
  });

  it("sin total válido pide primero el monto de la compra", () => {
    montar(inicial, { total: null });

    expect(document.getElementById("estado-pago-dividido")).toHaveTextContent(
      "Escribe primero el monto de la compra."
    );
  });
});

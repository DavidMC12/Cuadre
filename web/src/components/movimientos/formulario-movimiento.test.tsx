// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FormularioMovimiento } from "./formulario-movimiento";
import type { Cuenta } from "@/lib/api/types";

vi.mock("@/hooks/use-movimientos", () => ({
  useCrearMovimiento: () => ({ isPending: false, mutate: vi.fn() }),
  useCrearTransferencia: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-categorias", () => ({ useCategorias: () => ({ data: [] }) }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));
vi.mock("@/hooks/use-pantalla-grande", () => ({ usePantallaGrande: () => false }));
// El selector real es un desplegable; aquí basta con ver qué valor recibió.
vi.mock("@/components/movimientos/selector-categoria", () => ({
  SelectorCategoria: ({ value }: { value?: string }) => (
    <div data-testid="categoria-seleccionada">{value ?? "sin-categoria"}</div>
  ),
}));

afterEach(cleanup);

const cuentas: Cuenta[] = [
  {
    id: "a-1",
    name: "Bancolombia",
    type: "bank",
    currency: "COP",
    balance: "1234567",
    isSavings: false,
    archivedAt: null,
  } as Cuenta,
];

describe("FormularioMovimiento abierto desde afuera (corregir un movimiento)", () => {
  it("aplica los valores iniciales a los campos, sin disparador visible", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          categoriaId: "c-3",
          fecha: "2026-09-10",
          descripcion: "Mercado",
          tipo: "gasto",
        }}
      />
    );

    expect(screen.getByLabelText("Monto")).toHaveValue("12.500");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-09-10");
    expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Mercado");
    // La categoría y la fecha vienen en "Más detalles", que abre ya desplegado.
    expect(screen.getByTestId("categoria-seleccionada")).toHaveTextContent("c-3");
    expect(screen.getByRole("button", { name: "Gasto" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("sin valores iniciales abre en blanco y con el tipo pedido", () => {
    render(<FormularioMovimiento cuentas={cuentas} abierto tipoInicial="ingreso" />);

    expect(screen.getByLabelText("Monto")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Ingreso" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("precarga un ingreso con su monto y se anuncia como corrección, no como registro nuevo", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{ monto: "12.500", cuentaId: "a-1", tipo: "ingreso" }}
        tituloCabecera="Corregir movimiento"
        descripcionCabecera="Registra el movimiento correcto: el original ya quedó anulado."
      />
    );

    expect(screen.getByLabelText("Monto")).toHaveValue("12.500");
    expect(screen.getByRole("button", { name: "Ingreso" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Corregir movimiento")).toBeInTheDocument();
  });

  it("en modo corrección la cabecera se ve: el título y la explicación no son sr-only", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{ monto: "12.500", cuentaId: "a-1", tipo: "gasto" }}
        tituloCabecera="Corregir movimiento"
        descripcionCabecera="Registra el movimiento correcto: el original ya quedó anulado."
      />
    );

    // La persona que corrige llega de anular algo: el título y la explicación
    // tienen que verlos el ojo, no solo el lector de pantalla.
    const cabecera = screen
      .getByText("Corregir movimiento")
      .closest('[data-slot="drawer-header"]');
    expect(cabecera).not.toHaveClass("sr-only");
    expect(
      screen.getByText("Registra el movimiento correcto: el original ya quedó anulado.")
    ).toBeInTheDocument();
  });

  it("en un registro nuevo la cabecera sigue sr-only y Registrar funciona desde el primer toque", () => {
    render(<FormularioMovimiento cuentas={cuentas} abierto tipoInicial="gasto" />);

    // El monto héroe es el encabezado visible de un registro nuevo: el título
    // vive escondido para los lectores, como siempre.
    const cabecera = screen
      .getByText("Nuevo movimiento")
      .closest('[data-slot="drawer-header"]');
    expect(cabecera).toHaveClass("sr-only");

    expect(screen.getByRole("button", { name: "Registrar" })).toBeEnabled();
  });

  it("en modo corrección Registrar no reenvía la precarga tal cual: exige un cambio", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          fecha: "2026-09-10",
          descripcion: "Mercado",
          tipo: "gasto",
        }}
      />
    );

    const registrar = screen.getByRole("button", { name: "Registrar" });
    // Sin cambios, enviar recrearía el movimiento que se acaba de anular.
    expect(registrar).toBeDisabled();
    // Y el botón apagado se explica: no es un cajón roto.
    expect(
      screen.getByText("Ajusta lo que estaba mal para habilitar Registrar.")
    ).toBeInTheDocument();

    // Un cambio lo enciende, el aviso desaparece…
    fireEvent.change(screen.getByLabelText("Descripción (opcional)"), {
      target: { value: "Mercado de la semana" },
    });
    expect(registrar).toBeEnabled();
    expect(
      screen.queryByText("Ajusta lo que estaba mal para habilitar Registrar.")
    ).not.toBeInTheDocument();
    // …y volver atrás lo apaga otra vez: la comparación es contra la precarga,
    // no un "ya tocó algo".
    fireEvent.change(screen.getByLabelText("Descripción (opcional)"), {
      target: { value: "Mercado" },
    });
    expect(registrar).toBeDisabled();
  });

  it("cambiar el monto también habilita Registrar", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          fecha: "2026-09-10",
          tipo: "gasto",
        }}
      />
    );

    const registrar = screen.getByRole("button", { name: "Registrar" });
    expect(registrar).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "13.000" } });
    expect(registrar).toBeEnabled();
  });

  it("cambiar la fecha también cuenta como cambio", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          fecha: "2026-09-10",
          tipo: "gasto",
        }}
      />
    );

    const registrar = screen.getByRole("button", { name: "Registrar" });
    expect(registrar).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-09" } });
    expect(registrar).toBeEnabled();
  });
});

const cuentaActiva: Cuenta = {
  id: "a-activa",
  name: "Efectivo",
  type: "cash",
  currency: "COP",
  balance: "0",
  movementCount: 0,
  lastMovementAt: null,
  archivedAt: null,
  isSavings: false,
  creditLimit: null,
  linkedAccountId: null,
} as Cuenta;

const cuentaArchivada: Cuenta = {
  ...cuentaActiva,
  id: "a-vieja",
  name: "Cuenta vieja",
  archivedAt: "2026-01-01T00:00:00Z",
};

describe("FormularioMovimiento: la corrección conserva la cuenta original", () => {
  it("con la cuenta original archivada, la muestra seleccionada y avisa", () => {
    render(
      <FormularioMovimiento
        cuentas={[cuentaActiva, cuentaArchivada]}
        abierto
        valoresIniciales={{ monto: "12.500", cuentaId: "a-vieja", tipo: "gasto" }}
      />
    );

    expect(screen.getByLabelText("Cuenta")).toHaveTextContent("Cuenta vieja");
    expect(
      screen.getByText("Esta cuenta está archivada: la corrección quedará registrada en ella.")
    ).toBeInTheDocument();
  });

  it("con la cuenta original activa, la muestra sin el aviso de archivada", () => {
    render(
      <FormularioMovimiento
        cuentas={[cuentaActiva, cuentaArchivada]}
        abierto
        valoresIniciales={{ monto: "12.500", cuentaId: "a-activa", tipo: "gasto" }}
      />
    );

    expect(screen.getByLabelText("Cuenta")).toHaveTextContent("Efectivo");
    expect(
      screen.queryByText("Esta cuenta está archivada: la corrección quedará registrada en ella.")
    ).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { FormularioMovimiento } from "./formulario-movimiento";
import * as useCategoriasModule from "@/hooks/use-categorias";
import * as usePresupuestoModule from "@/hooks/use-presupuesto";
import type { ChecklistDelMes, Cuenta, ItemDelChecklist } from "@/lib/api/types";

// Las mutaciones se guardan fuera para poder mirar qué recibió el servidor.
const mutaciones = vi.hoisted(() => ({
  movimiento: vi.fn(),
  transferencia: vi.fn(),
}));

vi.mock("@/hooks/use-movimientos", () => ({
  useCrearMovimiento: () => ({ isPending: false, mutate: mutaciones.movimiento }),
  useCrearTransferencia: () => ({ isPending: false, mutate: mutaciones.transferencia }),
}));

vi.mock("@/hooks/use-categorias", () => ({ useCategorias: vi.fn(() => ({ data: [] })) }));

vi.mock("@/hooks/use-presupuesto", () => ({ useChecklistDelMes: vi.fn(() => ({ data: undefined })) }));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));
vi.mock("@/hooks/use-pantalla-grande", () => ({ usePantallaGrande: () => false }));
// El selector real es un desplegable; aquí basta con ver qué valor recibió.
vi.mock("@/components/movimientos/selector-categoria", () => ({
  SelectorCategoria: ({ value }: { value?: string }) => (
    <div data-testid="categoria-seleccionada">{value ?? "sin-categoria"}</div>
  ),
}));

afterEach(() => {
  cleanup();
  // Los mocks de hoisted mutaciones y del checklist no deben arrastrar
  // llamadas ni valores de una prueba a la siguiente.
  vi.clearAllMocks();
});

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
      screen.getByText("Esta cuenta está archivada: desarchívala para poder registrar la corrección.")
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
    expect(document.getElementById("cuenta-archivada-aviso")).toBeNull();
  });
});

describe("FormularioMovimiento: piso de toque de 44px", () => {
  it("los chips rápidos de categoría llevan el piso de toque", () => {
    // Séptima critique: los chips medían ~40px (py-2.5 sin piso). El chip
    // entra en la 320px si sigue cabiendo: la altura sube, no el ancho.
    vi.mocked(useCategoriasModule.useCategorias).mockReturnValue({
      data: [
        { id: "c-1", name: "Mercado", kind: "expense", archivedAt: null },
        { id: "c-2", name: "Transporte", kind: "expense", archivedAt: null },
      ],
    } as never);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    const chip = screen.getByRole("button", { name: "Mercado" });
    expect(chip.classList.contains("min-h-11")).toBe(true);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });

  it("el botón 'Más detalles' lleva el piso de toque", () => {
    // Era un botón de texto chico (~16px sin piso): el control más angosto del
    // formulario. La altura sube, no el ancho, y en 320px sigue cabiendo.
    vi.mocked(useCategoriasModule.useCategorias).mockReturnValue({ data: [] } as never);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    expect(
      screen.getByRole("button", { name: /Más detalles/ }).classList.contains("min-h-11")
    ).toBe(true);
  });

  it("el selector de cuenta y los campos Fecha y Descripción llevan el piso de toque", () => {
    // Eran SelectTrigger/Input de 32px (h-8). En el SelectTrigger la altura
    // h-8 gana la cascada, así que el piso va con min-h-11.
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    expect(screen.getByLabelText("Cuenta").className).toContain("min-h-11");

    fireEvent.click(screen.getByRole("button", { name: /Más detalles/ }));
    expect(screen.getByLabelText("Fecha").className).toContain("min-h-11");
    expect(screen.getByLabelText("Descripción (opcional)").className).toContain("min-h-11");
  });

  it("en una transferencia, los selectores Desde y Hacia llevan el piso de toque", () => {
    const segunda: Cuenta = { ...cuentaActiva, id: "a-2", name: "Ahorros" };

    render(<FormularioMovimiento cuentas={[cuentaActiva, segunda]} abierto tipoInicial="transferencia" />);

    expect(screen.getByLabelText("Desde").className).toContain("min-h-11");
    expect(screen.getByLabelText("Hacia").className).toContain("min-h-11");
  });

  it("el botón Registrar del cajón lleva el piso de toque", () => {
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    expect(screen.getByRole("button", { name: "Registrar" }).classList.contains("min-h-11")).toBe(
      true
    );
  });

  it("el botón Entendido (sin cuentas) lleva el piso de toque", () => {
    render(<FormularioMovimiento cuentas={[]} abierto />);

    expect(screen.getByRole("button", { name: "Entendido" }).classList.contains("min-h-11")).toBe(
      true
    );
  });

  it("el campo de monto héroe también llega al piso de toque", () => {
    // Con h-auto y text-4xl medía ~40px, cuatro por debajo del piso. min-h-11
    // lo sube sin tocar su apariencia de campo sin caja.
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    expect(screen.getByLabelText("Monto").className).toContain("min-h-11");
  });
});

// -------------------------------------------------------------------------
// El item del presupuesto: cada movimiento cuenta para uno solo
// -------------------------------------------------------------------------

const CATEGORIAS = [
  { id: "c-deu", name: "Deudas", kind: "expense", archivedAt: null },
  { id: "c-mer", name: "Mercado", kind: "expense", archivedAt: null },
  { id: "c-str", name: "Transporte", kind: "expense", archivedAt: null },
  { id: "c-sue", name: "Sueldo", kind: "income", archivedAt: null },
] as const;

function itemChecklist(over: Partial<ItemDelChecklist> & { id: string }): ItemDelChecklist {
  return {
    kind: "category",
    currency: "COP",
    label: "Deuda TC Nu",
    categoryKind: "expense",
    categoryId: "c-deu",
    categoryName: "Deudas",
    target: "250000",
    progress: "0",
    checked: false,
    exceeded: false,
    status: "pending",
    ...over,
  };
}

function checklistCon(items: ItemDelChecklist[]) {
  const data: ChecklistDelMes = { month: "2026-09", currency: "COP", items, unassigned: [] };
  vi.mocked(usePresupuestoModule.useChecklistDelMes).mockImplementation(
    () => ({ data }) as never
  );
}

function categoriasRapidas() {
  vi.mocked(useCategoriasModule.useCategorias).mockImplementation(
    () => ({ data: [...CATEGORIAS] }) as never
  );
}

/** Abre "Más detalles" y elige la categoría con el chip rápido. */
function elegirCategoria(nombre: string) {
  fireEvent.click(screen.getByRole("button", { name: /Más detalles/ }));
  fireEvent.click(screen.getByRole("button", { name: nombre }));
}

describe("FormularioMovimiento: el item del presupuesto del movimiento", () => {
  it("con exactamente un ítem de la categoría, viene preseleccionado con lo que falta", () => {
    categoriasRapidas();
    checklistCon([
      // target 250.000 − progress 147.500 = faltan $102.500, texto exacto.
      itemChecklist({ id: "i-nu", progress: "147500", status: "partial", checked: true }),
    ]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");

    const campo = screen.getByLabelText("Ítem del presupuesto (opcional)");
    expect(campo).toHaveTextContent("Deuda TC Nu — faltan $102.500");
  });

  it("un item ya pagado dice pagado, no le inventa un faltante de $0", () => {
    categoriasRapidas();
    checklistCon([
      itemChecklist({ id: "i-nu", progress: "250000", status: "paid", checked: true }),
    ]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");

    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Deuda TC Nu — pagado"
    );
  });

  it("un item de ingreso dice recibido, no pagado", () => {
    categoriasRapidas();
    checklistCon([
      itemChecklist({
        id: "i-sue",
        label: "Sueldo septiembre",
        categoryId: "c-sue",
        categoryKind: "income",
        progress: "1200000",
        status: "paid",
        checked: true,
      }),
    ]);

    render(<FormularioMovimiento cuentas={cuentas} abierto tipoInicial="ingreso" />);
    elegirCategoria("Sueldo");

    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Sueldo septiembre — recibido"
    );
  });

  it("con varios ítems de la categoría abre en Sin asignar: la persona elige", () => {
    categoriasRapidas();
    checklistCon([
      itemChecklist({ id: "i-nu", target: "147000" }),
      itemChecklist({ id: "i-dav", label: "Deuda Davivienda", target: "267530" }),
    ]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");

    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Sin asignar"
    );
  });

  it("cambiar de categoría reinicia la selección: la propuesta de la nueva manda", () => {
    categoriasRapidas();
    checklistCon([
      itemChecklist({ id: "i-nu", target: "250000", progress: "147500" }),
      itemChecklist({
        id: "i-jp",
        label: "John Perez",
        categoryId: "c-mer",
        categoryName: "Mercado",
        target: "60000",
        progress: "0",
      }),
    ]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");
    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Deuda TC Nu"
    );

    // Mercado tiene un solo item: el reinicio lo propone, no trae "Deuda TC Nu".
    fireEvent.click(screen.getByRole("button", { name: "Mercado" }));
    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "John Perez — faltan $60.000"
    );
  });

  it("cambiar de tipo (Gasto a Ingreso) también reinicia: sin categoría no hay campo", () => {
    categoriasRapidas();
    checklistCon([itemChecklist({ id: "i-nu" })]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");
    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Deuda TC Nu"
    );

    // Ahora es un ingreso: la categoría se limpia y con ella la selección.
    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));
    expect(screen.queryByLabelText("Ítem del presupuesto (opcional)")).not.toBeInTheDocument();
  });

  it("si el checklist del mes no llegó todavía, el campo no aparece hasta cargar (no inventa nombres)", () => {
    categoriasRapidas();
    // El checklist no llegó: data undefined, como en un cargue lento.
    vi.mocked(usePresupuestoModule.useChecklistDelMes).mockImplementation(
      () => ({ data: undefined }) as never
    );
    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");

    // Sin datos no hay qué proponer: el campo espera a que cargue, igual que
    // hace el formulario con el resto de listas (cuentas, categorías).
    expect(screen.queryByLabelText("Ítem del presupuesto (opcional)")).not.toBeInTheDocument();
  });

  it("si la categoría no tiene items, el campo no aparece (nada nuevo que explicar)", () => {
    categoriasRapidas();
    checklistCon([]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Transporte");

    expect(screen.queryByLabelText("Ítem del presupuesto (opcional)")).not.toBeInTheDocument();
  });

  it("si la categoría no tiene items y no está elegida, el campo tampoco aparece", () => {
    categoriasRapidas();
    checklistCon([itemChecklist({ id: "i-nu" })]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    fireEvent.click(screen.getByRole("button", { name: /Más detalles/ }));

    expect(screen.queryByLabelText("Ítem del presupuesto (opcional)")).not.toBeInTheDocument();
  });

  it("envía al servidor el item preseleccionado cuando hay exactamente uno", () => {
    categoriasRapidas();
    checklistCon([itemChecklist({ id: "i-nu", progress: "147500" })]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(mutaciones.movimiento).toHaveBeenCalledTimes(1);
    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio).toEqual({
      accountId: "a-1",
      amount: "-12500",
      occurredAt: expect.any(String),
      categoryId: "c-deu",
      budgetItemId: "i-nu",
    });
  });

  it("con varios ítems y 'Sin asignar', envía null: queda sin item, no con el último tocado", () => {
    categoriasRapidas();
    checklistCon([
      itemChecklist({ id: "i-nu", target: "147000" }),
      itemChecklist({ id: "i-dav", label: "Deuda Davivienda" }),
    ]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(mutaciones.movimiento.mock.calls[0][0].budgetItemId).toBeNull();
  });

  it("sin categoría elegida, el envío no lleva item", () => {
    categoriasRapidas();
    checklistCon([itemChecklist({ id: "i-nu" })]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.budgetItemId).toBeUndefined();
  });

  it("la corrección trae el item que contaba y Registrar queda apagado hasta un cambio", () => {
    categoriasRapidas();
    checklistCon([itemChecklist({ id: "i-nu" })]);

    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          categoriaId: "c-deu",
          itemDelPresupuesto: "i-nu",
          fecha: "2026-09-10",
          descripcion: "Mercado",
          tipo: "gasto",
        }}
      />
    );

    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Deuda TC Nu"
    );
    const registrar = screen.getByRole("button", { name: "Registrar" });
    expect(registrar).toBeDisabled();

    // Un cambio en otro campo lo enciende… y volver atrás lo apaga otra vez:
    // el item es un campo como cualquier otro en la comparación con la precarga.
    const descripcion = screen.getByLabelText("Descripción (opcional)");
    fireEvent.change(descripcion, { target: { value: "Pago de la semana" } });
    expect(registrar).toBeEnabled();
    fireEvent.change(descripcion, { target: { value: "Mercado" } });
    expect(registrar).toBeDisabled();
  });

  it("el selector de item lleva el piso de toque de 44px", () => {
    categoriasRapidas();
    checklistCon([itemChecklist({ id: "i-nu" })]);

    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    elegirCategoria("Deudas");

    expect(
      screen.getByLabelText("Ítem del presupuesto (opcional)").className
    ).toContain("min-h-11");
  });
});

// -------------------------------------------------------------------------
// Pagar una tarjeta: puede apagar una deuda del presupuesto
// -------------------------------------------------------------------------

const banco: Cuenta = {
  id: "a-banco",
  name: "Bancolombia",
  type: "bank",
  currency: "COP",
  balance: "5000000",
  movementCount: 0,
  lastMovementAt: null,
  archivedAt: null,
  isSavings: false,
  creditLimit: null,
  linkedAccountId: null,
} as Cuenta;

const tarjetaNu: Cuenta = {
  ...banco,
  id: "a-nu",
  name: "Nu",
  type: "card",
  creditLimit: "500000",
  linkedAccountId: "a-banco",
} as Cuenta;

const otroBanco: Cuenta = {
  ...banco,
  id: "a-davi",
  name: "Davivienda",
} as Cuenta;

describe("FormularioMovimiento: pagar una tarjeta y su pago del presupuesto", () => {
  it("con destino tarjeta y items de gasto, pregunta el pago y no viene preseleccionado", () => {
    checklistCon([
      itemChecklist({ id: "i-nu", target: "147000" }),
      itemChecklist({ id: "i-dav", label: "Deuda Davivienda", target: "267530" }),
    ]);

    render(
      <FormularioMovimiento
        cuentas={[banco, tarjetaNu]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-nu" }}
      />
    );

    const campo = screen.getByLabelText("¿Qué pago del presupuesto es? (opcional)");
    expect(campo).toHaveTextContent("Sin asignar");
  });

  it("con destino a otra cuenta (no tarjeta), ni pregunta", () => {
    checklistCon([itemChecklist({ id: "i-nu", target: "147000" })]);

    render(
      <FormularioMovimiento
        cuentas={[banco, otroBanco, tarjetaNu]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-davi" }}
      />
    );

    expect(
      screen.queryByLabelText("¿Qué pago del presupuesto es? (opcional)")
    ).not.toBeInTheDocument();
  });

  it("con destino tarjeta pero sin items de gasto este mes, tampoco pregunta", () => {
    checklistCon([]);

    render(
      <FormularioMovimiento
        cuentas={[banco, tarjetaNu]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-nu" }}
      />
    );

    expect(
      screen.queryByLabelText("¿Qué pago del presupuesto es? (opcional)")
    ).not.toBeInTheDocument();
  });

  it("solo las categorías de gasto son opciones de pago: un item de ingreso no aparece", () => {
    checklistCon([
      itemChecklist({
        id: "i-sue",
        label: "Sueldo",
        categoryId: "c-sue",
        categoryKind: "income",
        categoryName: "Sueldo",
      }),
      itemChecklist({ id: "i-nu", target: "147000" }),
    ]);

    render(
      <FormularioMovimiento
        cuentas={[banco, tarjetaNu]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-nu" }}
      />
    );

    const campo = screen.getByLabelText("¿Qué pago del presupuesto es? (opcional)");
    expect(campo).toHaveTextContent("Sin asignar");
  });

  it("envía el pago tal cual queda: sin asignar va null, y así alcanza el cuadre igual", () => {
    checklistCon([itemChecklist({ id: "i-nu", target: "147000" })]);

    render(
      <FormularioMovimiento
        cuentas={[banco, tarjetaNu]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-nu" }}
      />
    );

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "102.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(mutaciones.transferencia).toHaveBeenCalledTimes(1);
    expect(mutaciones.transferencia.mock.calls[0][0].budgetItemId).toBeNull();
  });

  it("un pago enviado por una cuenta a cuenta no lleva item (no pregunta, no manda)", () => {
    checklistCon([itemChecklist({ id: "i-nu", target: "147000" })]);

    render(
      <FormularioMovimiento
        cuentas={[banco, otroBanco]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-davi" }}
      />
    );

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "102.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(mutaciones.transferencia.mock.calls[0][0].budgetItemId).toBeUndefined();
  });

  it("el selector de pago lleva el piso de toque de 44px", () => {
    checklistCon([itemChecklist({ id: "i-nu", target: "147000" })]);

    render(
      <FormularioMovimiento
        cuentas={[banco, tarjetaNu]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-nu" }}
      />
    );

    expect(
      screen.getByLabelText("¿Qué pago del presupuesto es? (opcional)").className
    ).toContain("min-h-11");
  });
});

describe("FormularioMovimiento: cambiar el mes de la fecha reinicia la elección del ítem", () => {
  function checklistPorMes(septiembre: ItemDelChecklist[], octubre: ItemDelChecklist[]) {
    vi.mocked(usePresupuestoModule.useChecklistDelMes).mockImplementation(
      ({ month }: { month: string }) =>
        ({
          data:
            month === "2026-08"
              ? {
                  month: "2026-08",
                  currency: "COP",
                  items: septiembre,
                  unassigned: [],
                }
              : {
                  month: "2026-09",
                  currency: "COP",
                  items: octubre,
                  unassigned: [],
                },
        }) as never
    );
  }

  const iAgosto = itemChecklist({ id: "i-ago", label: "Cuota 8", target: "150000" });
  const iSeptiembre = itemChecklist({ id: "i-sep", label: "Cuota 9", target: "250000" });

  it("el item precargado no viaja a la lista del otro mes: la propuesta de la fecha manda", () => {
    categoriasRapidas();
    // Septiembre tiene un mismo renglón con cifras de septiembre; octubre
    // otro con las suyas. El checklist responde por mes, como el servidor.
    checklistPorMes(
      [itemChecklist({ ...iAgosto, progress: "0" })],
      [{ ...iSeptiembre, progress: "0" }]
    );

    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          categoriaId: "c-deu",
          itemDelPresupuesto: "i-ago",
          fecha: "2026-08-10",
          descripcion: "Mercado",
          tipo: "gasto",
        }}
      />
    );

    // Precarga de agosto: muestra la cifra de ese mes ("faltan $150.000").
    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Cuota 8 — faltan $150.000"
    );

    // Suena la fecha a septiembre: la lista cambia de mes y la selección vuelve
    // a calcularse con la de septiembre ("faltan $250.000"), no queda pegada a
    // la decisión que se tomó mirando agosto.
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-10" } });
    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Cuota 9 — faltan $250.000"
    );

    // Y el envío lleva la decisión del MES DE LA FECHA, no la precargada.
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(mutaciones.movimiento.mock.calls[0][0]).toMatchObject({
      budgetItemId: "i-sep",
      occurredAt: expect.stringContaining("2026-09"),
    });
  });

  it("si el nuevo mes tiene varios ítems, la fecha los deja en Sin asignar", () => {
    categoriasRapidas();
    checklistPorMes(
      [iAgosto],
      [iSeptiembre, itemChecklist({ id: "i-dav-sep", label: "Deuda Davivienda", target: "60000" })]
    );

    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          categoriaId: "c-deu",
          itemDelPresupuesto: "i-ago",
          fecha: "2026-08-10",
          descripcion: "Mercado",
          tipo: "gasto",
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-10" } });
    expect(screen.getByLabelText("Ítem del presupuesto (opcional)")).toHaveTextContent(
      "Sin asignar"
    );

    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(mutaciones.movimiento.mock.calls[0][0].budgetItemId).toBeNull();
  });
});

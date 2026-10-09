// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";

import { FormularioMovimiento } from "./formulario-movimiento";
import * as useCategoriasModule from "@/hooks/use-categorias";
import * as usePresupuestoModule from "@/hooks/use-presupuesto";
import type { ChecklistDelMes, Cuenta, ItemDelChecklist } from "@/lib/api/types";

// Las mutaciones se guardan fuera para poder mirar qué recibió el servidor.
const mutaciones = vi.hoisted(() => ({
  movimiento: vi.fn(),
  transferencia: vi.fn(),
  pagoDividido: vi.fn(),
}));

vi.mock("@/hooks/use-movimientos", () => ({
  useCrearMovimiento: () => ({ isPending: false, mutate: mutaciones.movimiento }),
  useCrearTransferencia: () => ({ isPending: false, mutate: mutaciones.transferencia }),
  useCrearPagoDividido: () => ({ isPending: false, mutate: mutaciones.pagoDividido }),
}));

vi.mock("@/hooks/use-categorias", () => ({ useCategorias: vi.fn(() => ({ data: [] })) }));

vi.mock("@/hooks/use-presupuesto", () => ({ useChecklistDelMes: vi.fn(() => ({ data: undefined })) }));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));
vi.mock("@/hooks/use-pantalla-grande", () => ({ usePantallaGrande: () => false }));

// El Select real abre su popup en un portal que jsdom no puede abrir. Este
// mock lo vuelve plano: el contenido se ve siempre y cada opción es un botón
// que le pasa el value al `onValueChange` del Select que lo contiene. Así las
// pruebas eligen opciones con clics y el trigger conserva id/className/aria.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type CtxSelector = {
    valor: string | undefined;
    elegir: (valor: string | null) => void;
  };
  const Ctx = React.createContext<CtxSelector>({ valor: undefined, elegir: () => {} });

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (valor: string | null) => void;
    children?: React.ReactNode;
  }) {
    return (
      <Ctx.Provider
        value={{ valor: value, elegir: (valor) => onValueChange?.(valor ?? null) }}
      >
        {children}
      </Ctx.Provider>
    );
  }

  function SelectTrigger({
    id,
    className,
    children,
  }: {
    id?: string;
    className?: string;
    children?: React.ReactNode;
  }) {
    // `output` es de los pocos elementos etiquetables por htmlFor sin ser
    // `button`: así el trigger no se grapa el rol de botón ni choca con las
    // opciones del menú en las consultas por rol.
    return (
      <output id={id} className={className}>
        {children}
      </output>
    );
  }

  function SelectValue({ children }: { children?: unknown; placeholder?: string }) {
    const { valor } = React.useContext(Ctx);
    return <span>{typeof children === "function" ? children(valor ?? "") : children}</span>;
  }

  function SelectContent({ children }: { children?: React.ReactNode }) {
    const { elegir } = React.useContext(Ctx);
    return (
      <Ctx.Provider value={{ valor: undefined, elegir }}>
        <div>{children}</div>
      </Ctx.Provider>
    );
  }

  function SelectItem({
    value,
    children,
  }: {
    value: string;
    children?: React.ReactNode;
  }) {
    const { elegir } = React.useContext(Ctx);
    return (
      <button type="button" onClick={() => elegir(value)}>
        {children}
      </button>
    );
  }

  function SelectGroup({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  }

  function SelectLabel({ children }: { children?: React.ReactNode }) {
    return <span>{children}</span>;
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel };
});

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
    saved: "0.0000",
    archivedAt: null,
  } as Cuenta,
];

describe("FormularioMovimiento abierto desde afuera (corregir un movimiento)", () => {
  it("aplica los valores iniciales a los campos, sin disparador visible", () => {
    vi.mocked(useCategoriasModule.useCategorias).mockReturnValue({
      data: [{ id: "c-3", name: "Mercado", kind: "expense", archivedAt: null }],
    } as never);
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
    // La categoría precargada se ve bien elegida en el desplegable, que ya no
    // vive escondido en "Más detalles".
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Mercado");
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

  it("cambiar solo la elección del desplegable cuenta como cambio", () => {
    vi.mocked(useCategoriasModule.useCategorias).mockReturnValue({
      data: [{ id: "c-3", name: "Mercado", kind: "expense", archivedAt: null }],
    } as never);
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

    const registrar = screen.getByRole("button", { name: "Registrar" });
    expect(registrar).toBeDisabled();

    // Elegir "Sin categoría" (quitar la precargada) es un cambio de verdad.
    fireEvent.click(screen.getByRole("button", { name: "Sin categoría" }));
    expect(registrar).toBeEnabled();

    // Y volver a la precargada lo apaga otra vez, como cualquier otro campo.
    fireEvent.click(screen.getByRole("button", { name: "Mercado" }));
    expect(registrar).toBeDisabled();
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
  saved: "0.0000",
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
  it("el desplegable de '¿En qué fue?' lleva el piso de toque", () => {
    // Reemplaza a los chips: es el control de la fila principal que no puede
    // quedar por debajo del piso. La altura sube, no el ancho.
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    expect(screen.getByLabelText("¿En qué fue?").className).toContain("min-h-11");
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
// El desplegable "¿En qué fue?": una sola pregunta para categoría e item
// -------------------------------------------------------------------------

const CATEGORIAS = [
  { id: "c-deu", name: "Deudas", kind: "expense", archivedAt: null },
  { id: "c-mer", name: "Mercado", kind: "expense", archivedAt: null },
  { id: "c-str", name: "Transporte", kind: "expense", archivedAt: null },
  { id: "c-sue", name: "Sueldo", kind: "income", archivedAt: null },
  { id: "c-hon", name: "Honorarios", kind: "income", archivedAt: null },
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

function catalogo(lista = CATEGORIAS) {
  vi.mocked(useCategoriasModule.useCategorias).mockImplementation(
    () => ({ data: [...lista] }) as never
  );
}

/** Elige una opción del menú del desplegable (con el Select aplanado en mock,
 * cada opción es un botón con su texto). Acepta texto parcial. */
function elegirDelMenu(texto: string) {
  fireEvent.click(screen.getByRole("button", { name: descripcionDeOpcion(texto) }));
}

/** getByRole compara el nombre accesible completo; el texto del monto usa
 * espacios duros. Con un regex parcial se busca sin pelear con eso. */
function descripcionDeOpcion(texto: string): RegExp {
  return new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

describe("FormularioMovimiento: el desplegable '¿En qué fue?'", () => {
  it("abre en 'Sin categoría' y es siempre visible, sin abrir Más detalles", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu" })]);
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    const campo = screen.getByLabelText("¿En qué fue?");
    expect(campo).toHaveTextContent("Sin categoría");
    // El botón ya no anuncia categoría: es solo fecha y descripción.
    expect(screen.getByRole("button", { name: /Más detalles/ })).toHaveTextContent(
      "Más detalles (fecha, descripción)"
    );
    expect(
      screen.queryByRole("button", { name: "Más detalles (fecha, descripción, categoría)" })
    ).toBeNull();
  });

  it("en un ingreso la etiqueta cambia a '¿De dónde viene?'", () => {
    catalogo();
    render(<FormularioMovimiento cuentas={cuentas} abierto tipoInicial="ingreso" />);

    expect(screen.queryByLabelText("¿En qué fue?")).toBeNull();
    expect(screen.getByLabelText("¿De dónde viene?")).toBeInTheDocument();
  });

  it("agrupa los items por su categoría y deja un renglón 'Otro de ...' por cada una", () => {
    catalogo();
    checklistCon([
      itemChecklist({ id: "i-nu", target: "250000", progress: "147500" }),
      itemChecklist({ id: "i-dav", label: "Deuda Davivienda", target: "267530" }),
      itemChecklist({
        id: "i-mer",
        label: "Compra semanal",
        categoryId: "c-mer",
        categoryName: "Mercado",
        target: "60000",
      }),
    ]);
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    // Los renglones de cada grupo están en el menú (el mock lo mantiene
    // siempre montado: así se puede revisar su contenido sin abrir popup).
    expect(screen.getByRole("button", { name: "Deuda TC Nu — faltan $102.500" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deuda Davivienda — faltan $267.530" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Otro de Deudas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compra semanal — faltan $60.000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Otro de Mercado" })).toBeInTheDocument();
    // Transporte no tiene items este mes: su lugar es "Otras categorías".
    expect(screen.getByRole("button", { name: "Transporte" })).toBeInTheDocument();
    expect(screen.getByText("Otras categorías")).toBeInTheDocument();
  });

  it("elegir un item fija categoría e item a la vez y envía los dos", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu", target: "250000", progress: "147500" })]);
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    elegirDelMenu("Deuda TC Nu — faltan $102.500");
    // Cerrado muestra "<Categoría> - <nombre>", sin el "faltan".
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas - Deuda TC Nu");

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.categoryId).toBe("c-deu");
    expect(envio.budgetItemId).toBe("i-nu");
  });

  it("'Otro de ...' envía solo la categoría, sin item", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu" })]);
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    elegirDelMenu("Otro de Deudas");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas (sin item)");

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.categoryId).toBe("c-deu");
    expect(envio.budgetItemId).toBeNull();
  });

  it("una categoría sin items vive bajo 'Otras categorías' y envía solo la categoría", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu" })]);
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    // Transporte no aparece como grupo propio: solo bajo Otras categorías.
    elegirDelMenu("Transporte");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Transporte");

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.categoryId).toBe("c-str");
    expect(envio.budgetItemId).toBeNull();
  });

  it("un ingreso ve los items de ingreso (recibido), no los de gasto", () => {
    catalogo();
    checklistCon([
      itemChecklist({ id: "i-nu" }),
      itemChecklist({
        id: "i-sue",
        label: "Sueldo septiembre",
        categoryId: "c-sue",
        categoryKind: "income",
        categoryName: "Sueldo",
        progress: "1200000",
        status: "paid",
        checked: true,
      }),
    ]);
    render(<FormularioMovimiento cuentas={cuentas} abierto tipoInicial="ingreso" />);

    // Un item de gasto no se ofrece en un ingreso…
    expect(screen.queryByRole("button", { name: /Deuda TC Nu/ })).toBeNull();
    // …y el de ingreso sí, con su logro.
    elegirDelMenu("Sueldo septiembre — recibido");
    expect(screen.getByLabelText("¿De dónde viene?")).toHaveTextContent(
      "Sueldo - Sueldo septiembre"
    );

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.categoryId).toBe("c-sue");
    expect(envio.budgetItemId).toBe("i-sue");
  });

  it("elegir 'Sin categoría' borra la elección: ni categoría ni item en el envío", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu" })]);
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    elegirDelMenu("Deuda TC Nu — faltan $250.000");
    elegirDelMenu("Sin categoría");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Sin categoría");

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.categoryId).toBeUndefined();
    expect(envio.budgetItemId).toBeUndefined();
  });

  it("cambiar el tipo (Gasto a Ingreso) limpia la elección del desplegable", () => {
    catalogo();
    checklistCon([
      itemChecklist({ id: "i-nu" }),
      itemChecklist({
        id: "i-sue",
        categoryId: "c-sue",
        categoryName: "Sueldo",
        categoryKind: "income",
      }),
    ]);
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    elegirDelMenu("Deuda TC Nu");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas - Deuda TC Nu");

    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));
    // El desplegable del ingreso arranca de nuevo en "Sin categoría": la
    // deuda era una historia del gasto.
    expect(screen.getByLabelText("¿De dónde viene?")).toHaveTextContent("Sin categoría");
  });

  it("si cambia el mes y el item ya no se ofrece, la elección cae a 'Otro de <su categoría>'", () => {
    catalogo();
    // El checklist responde por mes, como el servidor.
    vi.mocked(usePresupuestoModule.useChecklistDelMes).mockImplementation(
      ({ month }: { month: string }) =>
        ({
          data:
            month === "2026-09"
              ? {
                  month: "2026-09",
                  currency: "COP",
                  items: [itemChecklist({ id: "i-sep", label: "Cuota 9", target: "250000" })],
                  unassigned: [],
                }
              : {
                  month: "2026-10",
                  currency: "COP",
                  items: [itemChecklist({ id: "i-ago", label: "Cuota 8", target: "150000" })],
                  unassigned: [],
                },
        }) as never
    );
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    elegirDelMenu("Cuota 8 — faltan $150.000");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas - Cuota 8");

    // Suena la fecha a septiembre: i-ago ya no está en la lista. La categoría
    // sigue siendo válida ("Otro de Deudas" se sigue ofreciendo), pero nunca
    // se manda un item que el menú no ofrece.
    fireEvent.click(screen.getByRole("button", { name: /Más detalles/ }));
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-10" } });
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas (sin item)");

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.categoryId).toBe("c-deu");
    expect(envio.budgetItemId).toBeNull();
  });

  it("si el item sigue ofrecido tras cambiar de cuenta, la elección se conserva", () => {
    catalogo();
    const otraMoneda: Cuenta = { ...cuentaActiva, id: "a-usd", name: "Cuenta USD", currency: "USD" };
    checklistCon([itemChecklist({ id: "i-nu", target: "150000" })]);
    render(<FormularioMovimiento cuentas={[cuentaActiva, otraMoneda]} abierto />);

    elegirDelMenu("Deuda TC Nu — faltan $150.000");
    // Pasar a la cuenta en USD: moneda distinta, pero el mock del checklist
    // sigue sirviendo la misma lista (el id sigue ofrecido).
    elegirDelMenu("Cuenta USD");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas - Deuda TC Nu");
  });

  it("si cambia la moneda y el item ya no se ofrece, la elección cae a 'Otro de <su categoría>'", () => {
    catalogo();
    const otraMoneda: Cuenta = { ...cuentaActiva, id: "a-usd", name: "Cuenta USD", currency: "USD" };
    // El checklist responde por moneda, como el servidor: en COP hay deuda,
    // en USD ese mes no hay items que ofrecer.
    vi.mocked(usePresupuestoModule.useChecklistDelMes).mockImplementation(
      ({ currency }: { currency: string }) =>
        ({
          data:
            currency === "COP"
              ? { month: "2026-10", currency: "COP", items: [itemChecklist({ id: "i-nu" })], unassigned: [] }
              : { month: "2026-10", currency: "USD", items: [], unassigned: [] },
        }) as never
    );
    render(<FormularioMovimiento cuentas={[cuentaActiva, otraMoneda]} abierto />);

    elegirDelMenu("Deuda TC Nu");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas - Deuda TC Nu");

    // Suenan los dólares: la lista se vacía y el item deja de ofrecerse. La
    // categoría sigue siendo válida y se lee a secas (ya no tiene items ese
    // mes en esa moneda: su lugar natural es "Otras categorías").
    elegirDelMenu("Cuenta USD");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas");

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(mutaciones.movimiento.mock.calls[0][0]).toMatchObject({
      categoryId: "c-deu",
      budgetItemId: null,
    });
  });

  it("al corregir, la precarga se ve bien elegida en el desplegable y Registrar queda apagado hasta el cambio", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu", target: "250000", progress: "147500" })]);
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

    // Item de la precarga: elegido y legible sin "faltan".
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Deudas - Deuda TC Nu");
    const registrar = screen.getByRole("button", { name: "Registrar" });
    expect(registrar).toBeDisabled();

    // Cambiar SOLO la elección lo enciende…
    elegirDelMenu("Otro de Deudas");
    expect(registrar).toBeEnabled();
    // …y volver a lo precargado lo apaga otra vez.
    elegirDelMenu("Deuda TC Nu — faltan $102.500");
    expect(registrar).toBeDisabled();
  });

  it("al corregir, un movimiento con categoría sin item se ve como la categoría sola", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu" })]);
    render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          categoriaId: "c-mer",
          itemDelPresupuesto: null,
          fecha: "2026-09-10",
          tipo: "gasto",
        }}
      />
    );

    // Mercado no tiene items este mes: su nombre a secas, no "(sin item)".
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Mercado");
    expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
  });

  it("al corregir con una categoría archivada, la muestra elegida y marcada, sin ofrecerla en un registro nuevo", () => {
    const VIEJA = {
      id: "c-vieja",
      name: "Vieja",
      kind: "expense",
      archivedAt: "2026-01-01T00:00:00Z",
    } as const;
    // El formulario pide las archivadas al corregir (y solo al corregir): el
    // catálogo activo no trae "Vieja".
    vi.mocked(useCategoriasModule.useCategorias).mockImplementation(
      (incluirArchivadas = false) =>
        ({ data: incluirArchivadas ? [...CATEGORIAS, VIEJA] : [...CATEGORIAS] }) as never
    );

    const { unmount } = render(
      <FormularioMovimiento
        cuentas={cuentas}
        abierto
        valoresIniciales={{
          monto: "12.500",
          cuentaId: "a-1",
          categoriaId: "c-vieja",
          itemDelPresupuesto: null,
          fecha: "2026-09-10",
          tipo: "gasto",
        }}
      />
    );

    // Se ve elegida con su nombre y la marca sobria de archivada; y el menú
    // tiene una opción que representa ese valor.
    const campo = screen.getByLabelText("¿En qué fue?");
    expect(campo).toHaveTextContent("Vieja");
    expect(campo).toHaveTextContent("archivada");
    expect(screen.getByRole("button", { name: /Vieja/ })).toBeInTheDocument();
    unmount();

    // Un registro nuevo no la ofrece: una archivada no se elige de nuevo.
    render(<FormularioMovimiento cuentas={cuentas} abierto />);
    expect(screen.queryByRole("button", { name: /Vieja/ })).toBeNull();
  });

  it("sin una selección todavía, Registrar sigue funcionando desde el primer toque", () => {
    catalogo();
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Sin categoría");
    expect(screen.getByRole("button", { name: "Registrar" })).toBeEnabled();
  });
});

describe("FormularioMovimiento: sin presupuesto el desplegable es el viejo selector de categoría", () => {
  it("solo hay 'Sin categoría' y las categorías del tipo bajo 'Otras categorías'", () => {
    catalogo();
    // El checklist no llegó (o no hay presupuesto ese mes).
    vi.mocked(usePresupuestoModule.useChecklistDelMes).mockImplementation(
      () => ({ data: undefined }) as never
    );
    render(<FormularioMovimiento cuentas={cuentas} abierto />);

    expect(screen.getByRole("button", { name: "Sin categoría" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deudas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Otro de/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sueldo" })).toBeNull();

    // Elegir una categoría ahí envía solo la categoría.
    elegirDelMenu("Mercado");
    expect(screen.getByLabelText("¿En qué fue?")).toHaveTextContent("Mercado");

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    const envio = mutaciones.movimiento.mock.calls[0][0];
    expect(envio.categoryId).toBe("c-mer");
    expect(envio.budgetItemId).toBeNull();
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
  saved: "0.0000",
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

  it("en 'Entre cuentas' no aparece el desplegable de ¿En qué fue?", () => {
    render(
      <FormularioMovimiento
        cuentas={[banco, otroBanco]}
        abierto
        tipoInicial="transferencia"
        transferenciaInicial={{ origen: "a-banco", destino: "a-davi" }}
      />
    );

    expect(screen.queryByLabelText("¿En qué fue?")).toBeNull();
    expect(screen.queryByLabelText("¿De dónde viene?")).toBeNull();
  });
});


// -------------------------------------------------------------------------
// "Pagar con dos cuentas": una compra repartida entre dos cuentas
// -------------------------------------------------------------------------

describe("FormularioMovimiento: pagar con dos cuentas", () => {
  const bancolombia = { id: "a-1", name: "Bancolombia", type: "bank", currency: "COP", archivedAt: null } as Cuenta;
  const tarjeta = { id: "a-2", name: "Tarjeta Nu", type: "card", currency: "COP", archivedAt: null } as Cuenta;
  const dolares = { id: "a-3", name: "Dólares", type: "bank", currency: "USD", archivedAt: null } as Cuenta;
  const vieja = { id: "a-4", name: "Vieja", type: "bank", currency: "COP", archivedAt: "2026-01-01T00:00:00Z" } as Cuenta;
  const cuentasDos = [bancolombia, tarjeta, dolares, vieja];

  function escribirTotal(texto: string) {
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: texto } });
  }

  function activar() {
    fireEvent.click(screen.getByRole("button", { name: "Pagar con dos cuentas" }));
  }

  /** Elige la Cuenta 2 (el Select aplanado deja sus opciones dentro de su contenedor). */
  function elegirCuenta2(nombre: string) {
    const contenedor = screen.getByLabelText("Cuenta 2").parentElement!;
    fireEvent.click(within(contenedor).getByRole("button", { name: nombre }));
  }

  function registrar() {
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
  }

  it("ofrece 'Pagar con dos cuentas' en gasto e ingreso cuando hay otra cuenta activa de la misma moneda", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);

    expect(screen.getByRole("button", { name: "Pagar con dos cuentas" }).className).toContain(
      "min-h-11"
    );
    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));
    expect(screen.getByRole("button", { name: "Pagar con dos cuentas" })).toBeInTheDocument();
  });

  it("no lo ofrece en 'Entre cuentas', al corregir, ni si no hay otra cuenta de la misma moneda", () => {
    const { unmount } = render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    fireEvent.click(screen.getByRole("button", { name: "Entre cuentas" }));
    expect(screen.queryByRole("button", { name: "Pagar con dos cuentas" })).toBeNull();
    unmount();

    const correccion = render(
      <FormularioMovimiento
        cuentas={cuentasDos}
        abierto
        valoresIniciales={{ monto: "12.500", cuentaId: "a-1", tipo: "gasto" }}
      />
    );
    expect(screen.queryByRole("button", { name: "Pagar con dos cuentas" })).toBeNull();
    correccion.unmount();

    // Sola en pesos: la de dólares y la archivada no cuentan.
    render(<FormularioMovimiento cuentas={[bancolombia, dolares, vieja]} abierto />);
    expect(screen.queryByRole("button", { name: "Pagar con dos cuentas" })).toBeNull();
  });

  it("al activarlo reparte la mitad en cada cuenta y 'Registrar' espera la segunda cuenta", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    activar();

    expect(screen.getByText("Pagar con dos cuentas")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cuenta")).toBeNull();
    expect(screen.getByLabelText("Cuenta 1")).toHaveTextContent("Bancolombia");
    expect(screen.getByLabelText("Monto en la cuenta 1")).toHaveValue("100.000");
    expect(screen.getByLabelText("Monto en la cuenta 2")).toHaveValue("100.000");
    expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
  });

  it("con las dos cuentas elegidas y la suma exacta, envía UNA compra con las dos partes en negativo", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    activar();
    elegirCuenta2("Tarjeta Nu");

    expect(screen.getByRole("button", { name: "Registrar" })).toBeEnabled();
    registrar();

    expect(mutaciones.pagoDividido).toHaveBeenCalledTimes(1);
    expect(mutaciones.pagoDividido.mock.calls[0]![0]).toMatchObject({
      payments: [
        { accountId: "a-1", amount: "-100000" },
        { accountId: "a-2", amount: "-100000" },
      ],
    });
    expect(mutaciones.movimiento).not.toHaveBeenCalled();
  });

  it("editar el monto de una cuenta completa la otra, y se envía ese reparto exacto", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    activar();
    elegirCuenta2("Tarjeta Nu");

    fireEvent.change(screen.getByLabelText("Monto en la cuenta 1"), { target: { value: "150.000" } });
    expect(screen.getByLabelText("Monto en la cuenta 2")).toHaveValue("50.000");
    registrar();

    expect(mutaciones.pagoDividido.mock.calls[0]![0].payments).toEqual([
      { accountId: "a-1", amount: "-150000" },
      { accountId: "a-2", amount: "-50000" },
    ]);
  });

  it("si lo repartido no suma el total, 'Registrar' queda apagado y se dice cuánto falta", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    activar();
    elegirCuenta2("Tarjeta Nu");

    // Se pasa del total: la otra parte no se puede completar sola y queda en
    // 100.000, así que 250.000 + 100.000 se pasa por 150.000.
    fireEvent.change(screen.getByLabelText("Monto en la cuenta 1"), { target: { value: "250.000" } });

    expect(document.getElementById("estado-pago-dividido")).toHaveTextContent(
      "Te pasaste por $150.000."
    );
    expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
  });

  it("cambiar el total vuelve a repartirlo a la mitad", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    activar();
    fireEvent.change(screen.getByLabelText("Monto en la cuenta 1"), { target: { value: "150.000" } });

    escribirTotal("300.000");

    expect(screen.getByLabelText("Monto en la cuenta 1")).toHaveValue("150.000");
    expect(screen.getByLabelText("Monto en la cuenta 2")).toHaveValue("150.000");
  });

  it("un total impar se reparte con el sobrante en la primera cuenta", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("100.001");
    activar();

    expect(screen.getByLabelText("Monto en la cuenta 1")).toHaveValue("50.001");
    expect(screen.getByLabelText("Monto en la cuenta 2")).toHaveValue("50.000");
  });

  it("un ingreso se envía con las dos partes en positivo", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto tipoInicial="ingreso" />);
    escribirTotal("200.000");
    activar();
    elegirCuenta2("Tarjeta Nu");
    registrar();

    expect(mutaciones.pagoDividido.mock.calls[0]![0].payments).toEqual([
      { accountId: "a-1", amount: "100000" },
      { accountId: "a-2", amount: "100000" },
    ]);
  });

  it("lleva la categoría y el ítem elegidos, y la fecha y la descripción", () => {
    catalogo();
    checklistCon([itemChecklist({ id: "i-nu" })]);
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    elegirDelMenu("Deuda TC Nu");
    fireEvent.click(screen.getByRole("button", { name: /Más detalles/ }));
    fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Mercado" } });
    activar();
    elegirCuenta2("Tarjeta Nu");
    registrar();

    expect(mutaciones.pagoDividido.mock.calls[0]![0]).toMatchObject({
      categoryId: "c-deu",
      budgetItemId: "i-nu",
      description: "Mercado",
    });
  });

  it("'Volver a una cuenta' regresa al campo Cuenta de siempre y descarta el reparto", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    activar();

    fireEvent.click(screen.getByRole("button", { name: "Volver a una cuenta" }));

    expect(screen.getByLabelText("Cuenta")).toHaveTextContent("Bancolombia");
    expect(screen.queryByLabelText("Cuenta 1")).toBeNull();
    registrar();
    expect(mutaciones.movimiento).toHaveBeenCalledTimes(1);
    expect(mutaciones.pagoDividido).not.toHaveBeenCalled();
  });

  it("pasar a 'Entre cuentas' sale del modo de dos cuentas", () => {
    render(<FormularioMovimiento cuentas={cuentasDos} abierto />);
    escribirTotal("200.000");
    activar();

    fireEvent.click(screen.getByRole("button", { name: "Entre cuentas" }));

    expect(screen.queryByLabelText("Cuenta 1")).toBeNull();
    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
  });

  it("el éxito avisa con las dos cuentas, cierra y no registra un gasto suelto", () => {
    mutaciones.pagoDividido.mockImplementation(
      (_datos: unknown, opciones: { onSuccess?: () => void }) => opciones.onSuccess?.()
    );
    const alCambiar = vi.fn();
    render(<FormularioMovimiento cuentas={cuentasDos} abierto onAbiertoChange={alCambiar} />);
    escribirTotal("200.000");
    activar();
    elegirCuenta2("Tarjeta Nu");
    registrar();

    expect(alCambiar).toHaveBeenCalledWith(false);
  });

  it("al corregir una compra dividida abre YA en dos cuentas con lo que había, y cambiar el reparto habilita", () => {
    render(
      <FormularioMovimiento
        cuentas={cuentasDos}
        abierto
        valoresIniciales={{
          monto: "200.000",
          cuentaId: "a-1",
          fecha: "2026-10-01",
          descripcion: "Mercado",
          tipo: "gasto",
        }}
        pagoDivididoInicial={{
          cuenta1Id: "a-1",
          cuenta2Id: "a-2",
          texto1: "150.000",
          texto2: "50.000",
        }}
        tituloCabecera="Corregir compra"
        descripcionCabecera="Registra la compra correcta: el original ya quedó anulado."
      />
    );

    // Abre repartido, con las dos cuentas y sus montos: no hay selector único.
    expect(screen.getByText("Pagar con dos cuentas")).toBeInTheDocument();
    expect(screen.getByText("Corregir compra")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cuenta")).toBeNull();
    expect(screen.getByLabelText("Cuenta 1")).toHaveTextContent("Bancolombia");
    expect(screen.getByLabelText("Cuenta 2")).toHaveTextContent("Tarjeta Nu");
    expect(screen.getByLabelText("Monto en la cuenta 1")).toHaveValue("150.000");
    expect(screen.getByLabelText("Monto en la cuenta 2")).toHaveValue("50.000");

    // Sin cambios, registrar recrearía la compra recién anulada.
    const botonRegistrar = screen.getByRole("button", { name: "Registrar" });
    expect(botonRegistrar).toBeDisabled();

    // Cambiar SOLO el reparto (mismo total) ya es una corrección válida; la
    // otra parte se completa sola para que la suma siga exacta.
    fireEvent.change(screen.getByLabelText("Monto en la cuenta 1"), {
      target: { value: "100.000" },
    });
    expect(screen.getByLabelText("Monto en la cuenta 2")).toHaveValue("100.000");
    expect(botonRegistrar).toBeEnabled();

    registrar();
    expect(mutaciones.pagoDividido.mock.calls[0]![0].payments).toEqual([
      { accountId: "a-1", amount: "-100000" },
      { accountId: "a-2", amount: "-100000" },
    ]);
    expect(mutaciones.movimiento).not.toHaveBeenCalled();
  });

  it("al corregir una compra dividida se puede volver a una cuenta, pero no en un movimiento simple", () => {
    const { unmount } = render(
      <FormularioMovimiento
        cuentas={cuentasDos}
        abierto
        valoresIniciales={{ monto: "200.000", cuentaId: "a-1", tipo: "gasto" }}
        pagoDivididoInicial={{
          cuenta1Id: "a-1",
          cuenta2Id: "a-2",
          texto1: "100.000",
          texto2: "100.000",
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Volver a una cuenta" }));
    // De vuelta al selector único, la pregunta de repartir sigue disponible
    // porque lo corregido era, de verdad, una compra dividida.
    expect(screen.getByLabelText("Cuenta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar con dos cuentas" })).toBeInTheDocument();
    unmount();

    // Un movimiento simple en corrección no ofrece repartir: no era una compra
    // dividida y no se puede convertir en una al corregir.
    render(
      <FormularioMovimiento
        cuentas={cuentasDos}
        abierto
        valoresIniciales={{ monto: "200.000", cuentaId: "a-1", tipo: "gasto" }}
      />
    );
    expect(screen.queryByRole("button", { name: "Pagar con dos cuentas" })).toBeNull();
  });

  it("si una cuenta del reparto se archiva después de elegirla, no deja enviar y avisa", () => {
    const { rerender } = render(
      <FormularioMovimiento
        cuentas={cuentasDos}
        abierto
        valoresIniciales={{ monto: "200.000", cuentaId: "a-1", fecha: "2026-10-01", tipo: "gasto" }}
        pagoDivididoInicial={{
          cuenta1Id: "a-1",
          cuenta2Id: "a-2",
          texto1: "100.000",
          texto2: "100.000",
        }}
      />
    );

    // Un cambio habilita Registrar: sin esto, el apagado de abajo no probaría
    // que la cuenta archivada es lo que lo frena.
    fireEvent.change(screen.getByLabelText("Descripción (opcional)"), {
      target: { value: "Mercado corregido" },
    });
    expect(screen.getByRole("button", { name: "Registrar" })).toBeEnabled();

    // La lista se refresca y la cuenta 2 aparece archivada.
    rerender(
      <FormularioMovimiento
        cuentas={[
          bancolombia,
          { ...tarjeta, archivedAt: "2026-10-09T00:00:00Z" },
          dolares,
          vieja,
        ]}
        abierto
        valoresIniciales={{ monto: "200.000", cuentaId: "a-1", fecha: "2026-10-01", tipo: "gasto" }}
        pagoDivididoInicial={{
          cuenta1Id: "a-1",
          cuenta2Id: "a-2",
          texto1: "100.000",
          texto2: "100.000",
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
    expect(
      screen.getByText("Una de las cuentas elegidas ya no está disponible: elígela de nuevo.")
    ).toBeInTheDocument();
  });
});

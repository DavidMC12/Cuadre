// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { AsignarSinAsignar } from "./asignar-sin-asignar";
import { ApiError } from "@/lib/api/client";
import { rangoDelMes } from "@/lib/fecha";
import { toast } from "sonner";
import type { ItemDelChecklist, Movimiento } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

// -------------------------------------------------------------------------
// Dobles que reproducen lo que importa del Drawer y del Select de verdad,
// sin depender de portales ni de APIs de puntero que jsdom no tiene.
// -------------------------------------------------------------------------

vi.mock("@/components/ui/drawer", async () => {
  const React = await import("react");
  const Abierto = React.createContext<{ open: boolean; setOpen: (valor: boolean) => void }>({
    open: false,
    setOpen: () => {},
  });

  return {
    Drawer: ({
      open,
      onOpenChange,
      children,
    }: ConHijos & { open?: boolean; onOpenChange?: (valor: boolean) => void }) => (
      <Abierto.Provider value={{ open: Boolean(open), setOpen: (valor) => onOpenChange?.(valor) }}>
        {children}
      </Abierto.Provider>
    ),
    DrawerTrigger: ({ render }: { render?: ReactElement<{ onClick?: () => void }> }) => {
      const { setOpen } = React.useContext(Abierto);
      return render ? React.cloneElement(render, { onClick: () => setOpen(true) }) : null;
    },
    DrawerContent: ({ children }: ConHijos) => {
      const { open } = React.useContext(Abierto);
      return open ? <div>{children}</div> : null;
    },
    DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
    DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
    DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  };
});

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Elegir = React.createContext<(valor: string) => void>(() => {});

  return {
    Select: ({ onValueChange, children }: ConHijos & { onValueChange?: (valor: string) => void }) => (
      <Elegir.Provider value={onValueChange ?? (() => {})}>{children}</Elegir.Provider>
    ),
    SelectTrigger: ({ children, ...props }: ConHijos) => <div {...props}>{children}</div>,
    SelectValue: ({ children }: { children?: ReactNode | ((valor: string) => ReactNode) }) => (
      <span>{typeof children === "function" ? children("__elegir__") : children}</span>
    ),
    SelectContent: ({ children }: ConHijos) => <div>{children}</div>,
    SelectItem: ({ value, children }: ConHijos & { value: string }) => {
      const onChange = React.useContext(Elegir);
      return (
        <button type="button" onClick={() => onChange(value)}>
          {children}
        </button>
      );
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => false }));

const usarMovimientos = vi.hoisted(() => vi.fn());
const actualizarItem = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-movimientos", () => ({
  useMovimientos: (filtros: unknown) => usarMovimientos(filtros),
  useActualizarItemMovimiento: () => ({ isPending: false, mutate: actualizarItem }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  usarMovimientos.mockReset();
  actualizarItem.mockReset();
});

// -------------------------------------------------------------------------
// Datos
// -------------------------------------------------------------------------

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

function movimiento(over: Partial<Movimiento> & { id: string }): Movimiento {
  return {
    accountId: "a-1",
    categoryId: "c-deu",
    budgetItemId: null,
    kind: "standard",
    amount: "-12500",
    currency: "COP",
    occurredAt: "2026-09-10T12:00:00Z",
    description: "Cuota",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...over,
  };
}

/** Deja la consulta en "ok" con estos movimientos y estas banderas. */
function dejarConsulta(over: Record<string, unknown> = {}) {
  const refetch = vi.fn();
  const fetchNextPage = vi.fn();
  usarMovimientos.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    isPaused: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch,
    fetchNextPage,
    ...over,
  });
  return { refetch, fetchNextPage };
}

function montar(over: Partial<ComponentProps<typeof AsignarSinAsignar>> = {}) {
  return render(
    <ul>
      <AsignarSinAsignar
        categoryId="c-deu"
        categoriaNombre="Deudas"
        monto="267530"
        moneda="COP"
        mes="2026-09"
        items={[itemChecklist({ id: "i-nu" })]}
        {...over}
      />
    </ul>
  );
}

function abrir() {
  fireEvent.click(screen.getByRole("button", { name: /Asignar/ }));
}

// -------------------------------------------------------------------------

describe("AsignarSinAsignar: el botón de la fila", () => {
  it("es un botón de 44px que dice cuánto queda sin asignar y ofrece asignar", () => {
    dejarConsulta();
    montar();

    const boton = screen.getByRole("button", { name: /Sin asignar/ });
    expect(boton.classList.contains("min-h-11")).toBe(true);
    expect(boton).toHaveTextContent("Sin asignar:");
    expect(boton).toHaveTextContent("$267.530");
    expect(boton).toHaveTextContent("Asignar");
  });

  it("no consulta movimientos hasta que el cajón se abre", () => {
    dejarConsulta();
    montar();
    // El cajón cerrado no monta su contenido: sin red por cada categoría.
    expect(usarMovimientos).not.toHaveBeenCalled();
    abrir();
    expect(usarMovimientos).toHaveBeenCalledTimes(1);
  });
});

describe("AsignarSinAsignar: el cajón", () => {
  it("se abre con el título de la categoría y el mes visto, y pide el rango del mes", () => {
    dejarConsulta();
    montar();
    abrir();

    expect(screen.getByText("Sin asignar en Deudas")).toBeInTheDocument();
    expect(screen.getByText("Septiembre de 2026 · COP")).toBeInTheDocument();

    const rango = rangoDelMes("2026-09");
    expect(usarMovimientos).toHaveBeenCalledWith({
      categoryId: "c-deu",
      from: rango.desde,
      to: rango.hasta,
      limit: 200,
    });
  });

  it("lista fecha, descripción y monto; sin descripción dice 'Sin descripción'", () => {
    dejarConsulta({
      data: [
        movimiento({ id: "m-1", description: "Cuota" }),
        movimiento({ id: "m-2", description: null, amount: "-5000" }),
      ],
    });
    montar();
    abrir();

    expect(screen.getByText("Cuota")).toBeInTheDocument();
    expect(screen.getByText("Sin descripción")).toBeInTheDocument();
    expect(screen.getByText(/12\.500/)).toBeInTheDocument();
    expect(screen.getByText(/5\.000/)).toBeInTheDocument();
  });

  it("deja fuera lo que no está sin asignar (anulado, transferencia, otra moneda, ya asignado)", () => {
    dejarConsulta({
      data: [
        movimiento({ id: "bueno", description: "Cuota buena" }),
        movimiento({ id: "asignado", description: "Ya asignado", budgetItemId: "i-1" }),
        movimiento({ id: "anulado", description: "Anulado", reversedByTransactionId: "x" }),
        movimiento({ id: "transferencia", description: "Transferencia", kind: "transfer" }),
        movimiento({ id: "otra-moneda", description: "Dólares", currency: "USD" }),
      ],
    });
    montar();
    abrir();

    expect(screen.getByText("Cuota buena")).toBeInTheDocument();
    expect(screen.queryByText("Ya asignado")).not.toBeInTheDocument();
    expect(screen.queryByText("Anulado")).not.toBeInTheDocument();
    expect(screen.queryByText("Transferencia")).not.toBeInTheDocument();
    expect(screen.queryByText("Dólares")).not.toBeInTheDocument();
  });

  it("un ingreso sin ítem muestra el monto en positivo y los ítems de ingreso", () => {
    dejarConsulta({
      data: [
        movimiento({
          id: "ingreso",
          categoryId: "c-sue",
          amount: "3000000",
          description: "Nómina",
        }),
      ],
    });
    montar({
      categoryId: "c-sue",
      categoriaNombre: "Sueldo",
      moneda: "COP",
      items: [
        itemChecklist({
          id: "i-sue",
          label: "Sueldo",
          categoryId: "c-sue",
          categoryKind: "income",
          target: "3000000",
        }),
      ],
    });
    abrir();

    expect(screen.getByText("Nómina")).toBeInTheDocument();
    // El monto del ingreso se muestra en positivo, con su signo.
    expect(screen.getByText(/\+.*3\.000\.000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /faltan \$3\.000\.000/ })).toBeInTheDocument();
  });
});

describe("AsignarSinAsignar: asignar guarda al instante", () => {
  it("elegir un ítem guarda, avisa y la fila desaparece", async () => {
    dejarConsulta({ data: [movimiento({ id: "m-1" })] });
    actualizarItem.mockImplementation(
      (_datos: unknown, opciones: { onSuccess?: () => void; onSettled?: () => void }) => {
        opciones.onSuccess?.();
        opciones.onSettled?.();
      }
    );

    montar();
    abrir();

    fireEvent.click(screen.getByRole("button", { name: /faltan \$250\.000/ }));

    expect(actualizarItem).toHaveBeenCalledWith(
      { id: "m-1", budgetItemId: "i-nu" },
      expect.anything()
    );
    expect(toast.success).toHaveBeenCalledWith("Asignado a Deuda TC Nu");

    await waitFor(() => expect(screen.queryByText("Cuota")).not.toBeInTheDocument());
    // Y como ya no queda nada, aparece el estado vacío.
    expect(screen.getByText("Todo asignado")).toBeInTheDocument();
  });

  it("un fallo del servidor deja la fila y muestra su mensaje tal cual", () => {
    dejarConsulta({ data: [movimiento({ id: "m-1" })] });
    actualizarItem.mockImplementation(
      (_datos: unknown, opciones: { onError?: (e: unknown) => void; onSettled?: () => void }) => {
        opciones.onError?.(
          new ApiError({
            code: "RULE_VIOLATION",
            message: "El ítem no pertenece a la categoría del movimiento.",
          })
        );
        opciones.onSettled?.();
      }
    );

    montar();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /faltan \$250\.000/ }));

    expect(toast.error).toHaveBeenCalledWith(
      "El ítem no pertenece a la categoría del movimiento."
    );
    // La fila sigue y el desplegable vuelve a estar disponible.
    expect(screen.getByText("Cuota")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /faltan \$250\.000/ })).toBeInTheDocument();
    expect(screen.queryByText("Todo asignado")).not.toBeInTheDocument();
  });

  it("mientras guarda, la fila no manda un segundo PATCH", () => {
    dejarConsulta({ data: [movimiento({ id: "m-1" })] });
    // La mutación no resuelve: queda "guardando".
    actualizarItem.mockImplementation(() => {});

    montar();
    abrir();
    const opcion = screen.getByRole("button", { name: /faltan \$250\.000/ });
    fireEvent.click(opcion);
    fireEvent.click(opcion);

    expect(actualizarItem).toHaveBeenCalledTimes(1);
  });
});

describe("AsignarSinAsignar: vacío, fallo y paginación", () => {
  it("sin nada pendiente muestra 'Todo asignado'", () => {
    dejarConsulta({ data: [] });
    montar();
    abrir();

    expect(screen.getByText("Todo asignado")).toBeInTheDocument();
  });

  it("si la consulta falla, ofrece Reintentar y lo llama", () => {
    const { refetch } = dejarConsulta({ data: undefined, isError: true, error: new Error("boom") });
    montar();
    abrir();

    expect(
      screen.getByText(
        "No pudimos cargar los movimientos sin asignar. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar sin asignar" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("si la consulta queda pausada sin red, lo dice sin fingir un vacío", () => {
    dejarConsulta({ data: undefined, isPaused: true });
    montar();
    abrir();

    expect(
      screen.getByText(
        "Sin conexión: no pudimos cargar los movimientos sin asignar. Revisa tu conexión y vuelve a intentarlo."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Todo asignado")).not.toBeInTheDocument();
  });

  it("con más páginas, 'Cargar más' pide la siguiente", () => {
    const { fetchNextPage } = dejarConsulta({
      data: [movimiento({ id: "m-1" })],
      hasNextPage: true,
    });
    montar();
    abrir();

    const cargarMas = screen.getByRole("button", { name: "Cargar más" });
    expect(cargarMas.classList.contains("min-h-11")).toBe(true);
    fireEvent.click(cargarMas);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("'Cargar más' sigue disponible aunque la página no traiga filas pendientes", () => {
    // Página 1 toda asignada/otra moneda, pero el servidor dice que hay más:
    // sin el botón se escondería plata por repartir en la página 2.
    dejarConsulta({ data: [], hasNextPage: true });
    montar();
    abrir();

    expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
    expect(screen.queryByText("Todo asignado")).not.toBeInTheDocument();
  });
});

describe("AsignarSinAsignar: el desplegable", () => {
  it("no ofrece 'Sin asignar' (ya lo están) y sí el ítem real de la categoría", () => {
    dejarConsulta({ data: [movimiento({ id: "m-1" })] });
    montar();
    abrir();

    expect(screen.queryByRole("button", { name: "Sin asignar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /faltan \$250\.000/ })).toBeInTheDocument();
  });

  it("el cajón sigue abierto con 'Todo asignado' aunque el panel ya no mande la fila", async () => {
    // El servidor omite del checklist las categorías cuyo sin-asignar llegó a
    // cero. Al asignar la última, el panel deja de pasar `monto`, pero el cajón
    // abierto no debe desaparecer: el estado vacío se queda hasta que cierren.
    dejarConsulta({ data: [movimiento({ id: "m-1" })] });
    actualizarItem.mockImplementation(
      (_datos: unknown, opciones: { onSuccess?: () => void; onSettled?: () => void }) => {
        opciones.onSuccess?.();
        opciones.onSettled?.();
      }
    );

    const vista = montar();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /faltan \$250\.000/ }));
    await waitFor(() => expect(screen.getByText("Todo asignado")).toBeInTheDocument());

    vista.rerender(
      <ul>
        <AsignarSinAsignar
          categoryId="c-deu"
          categoriaNombre="Deudas"
          monto={null}
          moneda="COP"
          mes="2026-09"
          items={[itemChecklist({ id: "i-nu" })]}
        />
      </ul>
    );

    expect(screen.getByText("Sin asignar en Deudas")).toBeInTheDocument();
    expect(screen.getByText("Todo asignado")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { TransferenciaItem } from "./transferencia-item";
import type { Cuenta, Movimiento } from "@/lib/api/types";
import type { ParDeTransferencia } from "@/lib/combinar-transferencias";
import { type CatalogoDeItems, resolverCatalogoDeItems } from "@/lib/item-en-la-fila";

type ConHijos = { children?: ReactNode };

// El Drawer de Base UI no hace falta para revisar el contenido: con este
// reemplazo queda montado.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children, open }: ConHijos & { open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerHeader: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerTitle: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerDescription: ({ children }: ConHijos) => <div>{children}</div>,
  DrawerFooter: ({ children }: ConHijos) => <div>{children}</div>,
}));

const { soloMirar } = vi.hoisted(() => ({ soloMirar: { valor: false } }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => soloMirar.valor }));
vi.mock("@/hooks/use-presupuesto", () => ({
  usePresupuestoItems: () => ({
    data: [{ id: "i-nu", label: "Deuda TC Nu", categoryName: "Deudas", accountName: null }],
  }),
}));

afterEach(() => {
  cleanup();
  soloMirar.valor = false;
});

function pata(extras: Partial<Movimiento>): Movimiento {
  return {
    id: "salida",
    accountId: "banco",
    categoryId: null,
    budgetItemId: null,
    paymentGroupId: null,
    kind: "transfer",
    amount: "-100000.0000",
    currency: "COP",
    occurredAt: "2026-09-10T15:30:00Z",
    description: "Pago tarjeta",
    transferGroupId: "tg-1",
    reversesTransactionId: null,
    reversedByTransactionId: null,
    ...extras,
  };
}

const par: ParDeTransferencia = {
  tipo: "transferencia",
  transferGroupId: "tg-1",
  salida: pata({ id: "salida", accountId: "banco", amount: "-100000.0000" }),
  entrada: pata({ id: "entrada", accountId: "efectivo", amount: "100000.0000" }),
};

const cuentas = new Map<string, Cuenta>([
  ["banco", { id: "banco", name: "Bancolombia" } as Cuenta],
  ["efectivo", { id: "efectivo", name: "Efectivo" } as Cuenta],
]);

/** El catálogo ya resuelto que la lista le pasa a la fila. */
const catalogoConItem: CatalogoDeItems = resolverCatalogoDeItems([
  {
    id: "i-nu",
    kind: "category",
    currency: "COP",
    categoryId: "c-deu",
    categoryName: "Deudas",
    categoryKind: "expense",
    accountId: null,
    accountName: null,
    label: "Deuda TC Nu",
    currentAmount: null,
    archivedAt: null,
  },
])!;

function montar(
  p: ParDeTransferencia = par,
  alAnular = vi.fn(),
  catalogo: CatalogoDeItems | null = null
) {
  render(
    <TransferenciaItem
      par={p}
      cuentaOrigen={cuentas.get(p.salida.accountId)}
      cuentaDestino={cuentas.get(p.entrada.accountId)}
      catalogo={catalogo}
      onSolicitarAnular={alAnular}
    />
  );
  return alAnular;
}

function abrir() {
  fireEvent.click(screen.getByRole("button", { name: /Pago tarjeta/ }));
}

describe("TransferenciaItem: la fila", () => {
  it("es un botón accesible: muestra de qué cuenta a qué cuenta y el monto sin signo", () => {
    const alAnular = montar();

    // La fila entera es el botón, igual que un movimiento normal: antes no
    // abría nada y fingía ser un div.
    const fila = screen.getByRole("button", { name: /Pago tarjeta/ });
    expect(fila).toHaveAttribute("aria-haspopup", "dialog");
    // jsdom no mide píxeles: se anclan las clases que dan el piso de toque de
    // 44px, las mismas de MovimientoItem/CompraDivididaItem (py-3 + foco
    // visible con anillo).
    expect(fila.className).toContain("py-3");
    expect(fila.className).toContain("focus-visible:ring-3");
    expect(fila).toHaveTextContent("Bancolombia");
    expect(fila).toHaveTextContent("Efectivo");
    expect(fila).toHaveTextContent("$100.000");
    expect(fila).not.toHaveTextContent("+");
    expect(fila).not.toHaveTextContent("−");
    // Nada dentro dispara la anulación por accidente: el detalle la decide.
    expect(alAnular).not.toHaveBeenCalled();
  });

  it("una transferencia anulada se marca 'Anulada' y la anulación se marca 'Anulación'", () => {
    montar({
      ...par,
      salida: pata({ id: "salida", reversedByTransactionId: "r-1" }),
    });
    expect(screen.getByRole("button", { name: /Pago tarjeta/ })).toHaveTextContent("Anulada");

    cleanup();
    montar({
      ...par,
      salida: pata({ id: "salida", reversesTransactionId: "x-1" }),
    });
    expect(screen.getByRole("button", { name: /Pago tarjeta/ })).toHaveTextContent("Anulación");
  });

  it("con ítem, la fila muestra su nombre (en la pata que lo traiga)", () => {
    montar(
      { ...par, salida: pata({ id: "salida", budgetItemId: "i-nu" }) },
      vi.fn(),
      catalogoConItem
    );
    expect(screen.getByRole("button", { name: /Pago tarjeta/ })).toHaveTextContent("Deuda TC Nu");

    // El ítem puede venir en cualquiera de las dos patas: en el detalle se lee
    // igual, y la fila no puede decir menos.
    cleanup();
    montar(
      { ...par, entrada: pata({ id: "entrada", budgetItemId: "i-nu" }) },
      vi.fn(),
      catalogoConItem
    );
    expect(screen.getByRole("button", { name: /Pago tarjeta/ })).toHaveTextContent("Deuda TC Nu");
  });

  it("sin ítem la fila nunca dice 'Sin asignar' (asignarlo es opcional)", () => {
    montar(par, vi.fn(), catalogoConItem);
    expect(screen.getByRole("button", { name: /Pago tarjeta/ })).not.toHaveTextContent(
      "Sin asignar"
    );
  });

  it("con el catálogo cargando (null), la fila queda como hoy", () => {
    montar(
      { ...par, salida: pata({ id: "salida", budgetItemId: "i-nu" }) },
      vi.fn(),
      null
    );
    const fila = screen.getByRole("button", { name: /Pago tarjeta/ });
    expect(fila).not.toHaveTextContent("Deuda TC Nu");
    expect(fila).not.toHaveTextContent("Sin asignar");
  });
});

describe("TransferenciaItem: el detalle", () => {
  it("muestra de qué cuenta a qué cuenta, el monto y la fecha, y no miente con el ítem", () => {
    montar(
      {
        ...par,
        salida: pata({ id: "salida", budgetItemId: "i-nu" }),
      }
    );
    abrir();

    expect(screen.getByText("De una cuenta a otra")).toBeInTheDocument();
    const patas = screen.getAllByRole("listitem");
    expect(patas).toHaveLength(2);
    expect(patas[0]).toHaveTextContent("Bancolombia");
    expect(patas[1]).toHaveTextContent("Efectivo");
    expect(screen.getByText("Cuenta para")).toBeInTheDocument();
    expect(screen.getByText("Deuda TC Nu")).toBeInTheDocument();
    // La fecha está en el cajón, como en los demás detalles.
    expect(screen.getByText(/septiembre/)).toBeInTheDocument();
  });

  it("'Anular transferencia' pide anular el grupo completo (las dos patas) y mide 44px", () => {
    const alAnular = montar();
    abrir();

    const boton = screen.getByRole("button", { name: "Anular transferencia" });
    expect(boton.className).toContain("min-h-11");
    fireEvent.click(boton);

    expect(alAnular).toHaveBeenCalledTimes(1);
    expect(alAnular.mock.calls[0]![0]).toMatchObject({ transferGroupId: "tg-1" });
  });

  it("una transferencia ya anulada no ofrece anular y lo dice en una línea", () => {
    montar({
      ...par,
      salida: pata({ id: "salida", reversedByTransactionId: "r-1" }),
    });
    abrir();

    expect(screen.queryByRole("button", { name: "Anular transferencia" })).not.toBeInTheDocument();
    expect(screen.getByText(/ya está anulada/)).toBeInTheDocument();
  });

  it("la anulación misma no se vuelve a anular y lo dice en una línea", () => {
    montar({
      ...par,
      salida: pata({ id: "salida", reversesTransactionId: "x-1" }),
    });
    abrir();

    expect(screen.queryByRole("button", { name: "Anular transferencia" })).not.toBeInTheDocument();
    expect(screen.getByText(/Es la anulación de otra transferencia/)).toBeInTheDocument();
  });

  it("en la cuenta de otra persona (solo mirar) no se ofrece anular", () => {
    soloMirar.valor = true;
    montar();
    abrir();

    expect(screen.queryByRole("button", { name: "Anular transferencia" })).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * El foco al cerrar el cajón "Sin asignar". Aquí el Drawer NO se mockea: la
 * pregunta es de verdad de quién maneja el foco al cerrar (Base UI), y un
 * doble plano la respondería sin decir verdad.
 *
 * Caso límite: al asignar la última fila, la categoría queda en cero y el
 * panel deja de pasar `monto`; el botón "Sin asignar: $X" que abrió el cajón
 * se desmonta (la fila entera se va al cerrar). Si nada recoge el foco, al
 * cerrar cae en `body`, que no es un lugar sensato del panel.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

import { AsignarSinAsignar } from "./asignar-sin-asignar";
import type { ItemDelChecklist } from "@/lib/api/types";

type ConHijos = { children?: ReactNode };

// Los Select de shadcn/Base UI se mockean planos, igual que en las pruebas
// vecinas (portales y API de puntero que jsdom no tiene).
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Elegir = React.createContext<(valor: string) => void>(() => {});

  return {
    Select: ({ onValueChange, children }: ConHijos & { onValueChange?: (valor: string) => void }) => (
      <Elegir.Provider value={onValueChange ?? (() => {})}>{children}</Elegir.Provider>
    ),
    SelectTrigger: ({ children, ...props }: ConHijos) => <div {...props}>{children}</div>,
    SelectValue: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-perfil", () => ({ useSoloMirar: () => soloMirar.valor }));
const usarMovimientos = vi.hoisted(() => vi.fn());
const actualizarItem = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-movimientos", () => ({
  useMovimientos: (filtros: unknown) => usarMovimientos(filtros),
  useActualizarItemMovimiento: () => ({ isPending: false, mutate: actualizarItem }),
}));

const soloMirar = { valor: false };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  usarMovimientos.mockReset();
  actualizarItem.mockReset();
  soloMirar.valor = false;
});

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

function dejarConsulta() {
  usarMovimientos.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    isPaused: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  });
}

/**
 * La estructura mínima que el panel pone alrededor de la fila: un grupo de
 * categoría con su botón de encabezado (el "lugar sensato" al que el foco
 * debe poder caer) y la fila "Sin asignar" dentro.
 */
function Shell(props: Partial<ComponentProps<typeof AsignarSinAsignar>>) {
  return (
    <div>
      <button type="button" id="grupo-c-deu" aria-expanded>
        Deudas
      </button>
      <ul id="lista-c-deu">
        <AsignarSinAsignar
          categoryId="c-deu"
          categoriaNombre="Deudas"
          monto="267530"
          moneda="COP"
          mes="2026-09"
          items={[itemChecklist({ id: "i-nu" })]}
          idEncabezado="grupo-c-deu"
          {...props}
        />
      </ul>
    </div>
  );
}

describe("AsignarSinAsignar: el foco al cerrar el cajón", () => {
  it("el caso normal: el foco vuelve al botón 'Sin asignar: $X' que lo abrió", async () => {
    dejarConsulta();
    render(<Shell />);

    const boton = screen.getByRole("button", { name: /Sin asignar:/ });
    fireEvent.click(boton);
    await waitFor(() => expect(screen.getByText("Sin asignar en Deudas")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByText("Sin asignar en Deudas")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(boton));
  });

  it("si el botón desapareció (ya no queda nada sin asignar), el foco cae en el encabezado de la categoría, no en body", async () => {
    dejarConsulta();
    const vista = render(<Shell />);
    const header = screen.getByRole("button", { name: "Deudas" });

    fireEvent.click(screen.getByRole("button", { name: /Sin asignar:/ }));
    await waitFor(() => expect(screen.getByText("Sin asignar en Deudas")).toBeInTheDocument());

    // El panel deja de mandar la fila: la categoría quedó en cero. El botón
    // que abrió el cajón se desmonta mientras el cajón sigue abierto.
    vista.rerender(
      <Shell monto={null} />
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /Sin asignar:/ })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByText("Sin asignar en Deudas")).not.toBeInTheDocument());

    // El foco NO queda en body: cae en un lugar sensato del panel.
    await waitFor(() => expect(document.activeElement).toBe(header));
  });
});

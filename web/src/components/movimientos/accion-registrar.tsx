"use client";

import { Plus } from "lucide-react";

import { FormularioMovimiento } from "@/components/movimientos/formulario-movimiento";
import { useCuentas } from "@/hooks/use-cuentas";
import { cn } from "@/lib/utils";

/**
 * Registrar un movimiento es una de las dos situaciones para las que existe
 * esta app —la otra es repasar con calma—, y antes solo se podía desde un
 * botón chico en una esquina de Movimientos. Esto vive en el armazón, no en
 * una pantalla, para que la acción esté a un toque sin importar dónde estés.
 *
 * No decide la cuenta por defecto: eso lo resuelve `FormularioMovimiento`
 * solo, recordando la última que se usó en este aparato.
 */
export function AccionRegistrar({ variante }: { variante: "flotante" | "lateral" }) {
  const { data: cuentas } = useCuentas();

  return (
    <FormularioMovimiento cuentas={cuentas ?? []}>
      {variante === "flotante" ? (
        <button
          type="button"
          aria-label="Registrar movimiento"
          className={cn(
            "fixed right-4 z-40 flex size-14 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-[0_8px_24px_-4px_rgba(0,0,0,0.35)]",
            "transition-transform active:scale-95 md:hidden",
            "bottom-[calc(4rem+env(safe-area-inset-bottom)+16px)]"
          )}
        >
          <Plus className="size-6" />
        </button>
      ) : (
        <button
          type="button"
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          <Plus className="size-4" />
          Registrar
        </button>
      )}
    </FormularioMovimiento>
  );
}

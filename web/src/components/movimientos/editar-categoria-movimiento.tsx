"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectorCategoria } from "@/components/movimientos/selector-categoria";
import { useActualizarCategoriaMovimiento } from "@/hooks/use-movimientos";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Movimiento } from "@/lib/api/types";

/**
 * No filtra por gasto/ingreso: una anulación hereda la categoría del
 * original y su monto queda con el signo contrario, así que filtrar por el
 * signo de este movimiento dejaría fuera la categoría que ya tiene.
 */
export function EditarCategoriaMovimiento({
  movimiento,
  children,
}: {
  movimiento: Movimiento;
  children: React.ReactNode;
}) {
  const soloMirar = useSoloMirar();
  const [abierto, setAbierto] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>(
    movimiento.categoryId ?? undefined
  );

  const actualizarCategoria = useActualizarCategoriaMovimiento();

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    actualizarCategoria.mutate(
      { id: movimiento.id, categoryId: categoryId ?? null },
      {
        onSuccess: () => {
          toast.success("Categoría actualizada.");
          setAbierto(false);
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? error.message : "No se pudo cambiar la categoría."
          );
        },
      }
    );
  }

  // Quien está mirando la cuenta de otra persona no ve el botón siquiera: el
  // servidor rechazaría la escritura de todos modos.
  if (soloMirar) return null;

  return (
    <Drawer
      open={abierto}
      onOpenChange={(valor) => {
        setAbierto(valor);
        if (valor) setCategoryId(movimiento.categoryId ?? undefined);
      }}
    >
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <form onSubmit={manejarEnvio} className="flex min-h-0 flex-1 flex-col">
          <DrawerHeader>
            <DrawerTitle>Cambiar categoría</DrawerTitle>
            <DrawerDescription>
              {movimiento.description?.trim() || "Este movimiento"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-1.5 px-4 py-4">
            <Label htmlFor="categoria-existente">Categoría</Label>
            <SelectorCategoria
              id="categoria-existente"
              value={categoryId}
              onChange={setCategoryId}
            />
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={actualizarCategoria.isPending}>
              {actualizarCategoria.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

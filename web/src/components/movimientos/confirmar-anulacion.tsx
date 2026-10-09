"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monto } from "@/components/monto";
import type { Movimiento } from "@/lib/api/types";
import { descripcionDeLaCompra, totalDeLaCompra } from "@/lib/combinar-pagos-divididos";

export function ConfirmarAnulacion({
  movimiento,
  partesDeLaCompra,
  procesando,
  onConfirmar,
  onCancelar,
}: {
  movimiento: Movimiento | null;
  /**
   * Si el movimiento es una parte de una compra pagada con dos cuentas
   * (`paymentGroupId`), las partes que la pantalla conoce de esa compra: se
   * anula la compra COMPLETA y el diálogo lo dice. Con una sola parte a la
   * vista se anuncia igual, con el monto de esa parte.
   */
  partesDeLaCompra?: readonly Movimiento[];
  procesando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const esCompra = movimiento?.paymentGroupId != null;
  // Solo se confía en las partes de la pantalla si incluyen al propio movimiento:
  // la lista de la página siempre lo trae, pero que este diálogo no dependa de
  // eso evita mostrar el monto de una parte con el nombre de otra.
  const partesVistas =
    esCompra && movimiento && partesDeLaCompra?.some((parte) => parte.id === movimiento.id)
      ? partesDeLaCompra
      : undefined;
  const partes = partesVistas?.length ? partesVistas : movimiento ? [movimiento] : [];
  // Si la pantalla solo trae UNA de las dos partes (filtro por cuenta o
  // paginación), el total de la compra no se conoce: decir "$100.000" para una
  // compra de $200.000 engañaría justo antes de una acción que no se deshace.
  // Se muestra la parte que se ve, dicho como tal.
  const veLaCompraEntera = partes.length >= 2;

  return (
    <Dialog
      open={movimiento !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCancelar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esCompra ? "¿Anular la compra completa?" : "¿Anular este movimiento?"}</DialogTitle>
          <DialogDescription>
            {esCompra
              ? "Es una compra pagada con dos cuentas: se anulan las dos partes juntas, y los saldos y el presupuesto vuelven a como estaban. No se borra nada: se crean movimientos nuevos por el valor contrario. Esto no se puede deshacer."
              : "No se borra: se crea un movimiento nuevo por el valor contrario, para que el historial cuente lo que de verdad pasó. Esto no se puede deshacer."}
          </DialogDescription>
        </DialogHeader>

        {movimiento && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="truncate text-sm text-muted-foreground">
              {esCompra
                ? veLaCompraEntera
                  ? descripcionDeLaCompra(partes)
                  : `${descripcionDeLaCompra(partes)} · una de las dos partes`
                : movimiento.description?.trim() || "Movimiento"}
            </span>
            <Monto
              valor={esCompra && veLaCompraEntera ? totalDeLaCompra(partes) : movimiento.amount}
              moneda={movimiento.currency}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            onClick={onConfirmar}
            disabled={procesando}
          >
            {procesando ? "Anulando…" : esCompra ? "Sí, anular la compra" : "Sí, anular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

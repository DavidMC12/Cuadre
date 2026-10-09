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
  const partes = esCompra && partesDeLaCompra?.length ? partesDeLaCompra : movimiento ? [movimiento] : [];

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
                ? descripcionDeLaCompra(partes)
                : movimiento.description?.trim() || "Movimiento"}
            </span>
            <Monto
              valor={esCompra ? totalDeLaCompra(partes) : movimiento.amount}
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

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

export function ConfirmarAnulacion({
  movimiento,
  procesando,
  onConfirmar,
  onCancelar,
}: {
  movimiento: Movimiento | null;
  procesando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog
      open={movimiento !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCancelar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Anular este movimiento?</DialogTitle>
          <DialogDescription>
            No se borra: se crea un movimiento nuevo por el valor contrario, para que el
            historial cuente lo que de verdad pasó. Esto no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {movimiento && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="truncate text-sm text-muted-foreground">
              {movimiento.description?.trim() || "Movimiento"}
            </span>
            <Monto valor={movimiento.amount} moneda={movimiento.currency} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={procesando}>
            {procesando ? "Anulando…" : "Sí, anular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

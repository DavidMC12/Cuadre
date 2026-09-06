import { Ban } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monto } from "@/components/monto";
import type { Cuenta, Movimiento } from "@/lib/api/types";
import { horaCorta } from "@/lib/fecha";
import { ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/labels";

export function MovimientoItem({
  movimiento,
  cuenta,
  mostrarCuenta,
  onSolicitarAnular,
}: {
  movimiento: Movimiento;
  cuenta: Cuenta | undefined;
  mostrarCuenta: boolean;
  onSolicitarAnular: (movimiento: Movimiento) => void;
}) {
  const anulado = movimiento.reversedByTransactionId !== null;
  const esAnulacion = movimiento.reversesTransactionId !== null;

  const puedeAnularse = !anulado && !esAnulacion && movimiento.kind !== "opening";

  const descripcion =
    movimiento.description?.trim() || ETIQUETA_TIPO_MOVIMIENTO[movimiento.kind];

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={anulado ? "text-sm text-muted-foreground line-through" : "text-sm"}>
            {descripcion}
          </span>
          {anulado && (
            <Badge variant="outline" className="text-muted-foreground">
              Anulado
            </Badge>
          )}
          {esAnulacion && <Badge variant="secondary">Anulación</Badge>}
          {movimiento.kind === "opening" && <Badge variant="outline">Saldo inicial</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">
          {mostrarCuenta && cuenta ? `${cuenta.name} · ` : ""}
          {horaCorta(movimiento.occurredAt)}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1">
        <Monto
          valor={movimiento.amount}
          moneda={movimiento.currency}
          className={anulado ? "opacity-50" : undefined}
        />
        {puedeAnularse && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onSolicitarAnular(movimiento)}
          >
            <Ban data-icon="inline-start" />
            Anular
          </Button>
        )}
      </div>
    </div>
  );
}

import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Monto } from "@/components/monto";
import type { ParDeTransferencia } from "@/lib/combinar-transferencias";
import type { Cuenta } from "@/lib/api/types";
import { horaCorta } from "@/lib/fecha";
import { ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/labels";

/**
 * Las dos patas de una transferencia, en un solo renglón: "Bancolombia →
 * Efectivo", sin signo de más ni de menos, porque no es plata que entra ni
 * que sale, es la misma plata cambiando de lugar.
 *
 * A diferencia de `MovimientoItem`, esta fila no abre nada al tocarla: hoy
 * una transferencia no tiene nada que editar desde la lista (ni categoría,
 * que no le aplica, ni un botón para anularla, que llega después), así que no
 * hay para qué fingir que es un botón.
 */
export function TransferenciaItem({
  par,
  cuentaOrigen,
  cuentaDestino,
}: {
  par: ParDeTransferencia;
  cuentaOrigen: Cuenta | undefined;
  cuentaDestino: Cuenta | undefined;
}) {
  const { salida, entrada } = par;
  const anulada = salida.reversedByTransactionId !== null;
  const esAnulacion = salida.reversesTransactionId !== null;

  const descripcion = salida.description?.trim() || ETIQUETA_TIPO_MOVIMIENTO.transfer;

  return (
    <div className="-mx-2 flex w-full items-start gap-3 px-2 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={anulada ? "text-sm text-muted-foreground line-through" : "text-sm"}>
            {descripcion}
          </span>
          {anulada && (
            <Badge variant="outline" className="text-muted-foreground">
              Anulada
            </Badge>
          )}
          {esAnulacion && <Badge variant="secondary">Anulación</Badge>}
        </div>

        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{cuentaOrigen?.name ?? "…"}</span>
          <ArrowRight aria-hidden className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{cuentaDestino?.name ?? "…"}</span>
          <span aria-hidden className="shrink-0">
            ·
          </span>
          <span className="shrink-0">{horaCorta(salida.occurredAt)}</span>
        </span>
      </div>

      <Monto
        valor={entrada.amount}
        moneda={entrada.currency}
        signo="ninguno"
        className={anulada ? "opacity-50" : undefined}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Monto } from "@/components/monto";
import { DetalleTransferencia } from "@/components/movimientos/detalle-transferencia";
import type { ParDeTransferencia } from "@/lib/combinar-transferencias";
import type { Cuenta } from "@/lib/api/types";
import { horaCorta } from "@/lib/fecha";
import { type CatalogoDeItems, segmentosDeItemEnLaFila } from "@/lib/item-en-la-fila";
import { ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/labels";

/**
 * Las dos patas de una transferencia, en un solo renglón: "Bancolombia →
 * Efectivo", sin signo de más ni de menos, porque no es plata que entra ni
 * que sale, es la misma plata cambiando de lugar.
 *
 * La fila entera es el botón, igual que un movimiento normal: abre el detalle
 * con de qué cuenta a qué cuenta fue y la única acción que tiene sentido,
 * anular la transferencia completa (las dos patas juntas).
 */
export function TransferenciaItem({
  par,
  cuentaOrigen,
  cuentaDestino,
  catalogo,
  onSolicitarAnular,
}: {
  par: ParDeTransferencia;
  cuentaOrigen: Cuenta | undefined;
  cuentaDestino: Cuenta | undefined;
  /** El catálogo de ítems resuelto una vez por la lista; `null` mientras
   *  carga o si falló (la fila queda como hoy, sin ítem). */
  catalogo: CatalogoDeItems | null;
  onSolicitarAnular: (par: ParDeTransferencia) => void;
}) {
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const { salida, entrada } = par;
  const anulada = salida.reversedByTransactionId !== null;
  const esAnulacion = salida.reversesTransactionId !== null;

  const descripcion = salida.description?.trim() || ETIQUETA_TIPO_MOVIMIENTO.transfer;

  // Una transferencia nunca queda "Sin asignar": asignarle un ítem a un pago
  // de tarjeta es opcional. Solo se muestra el ítem cuando de verdad lo trae
  // (viaja en la pata de salida, igual que en el detalle). Sin categoría, la
  // función devuelve el nombre del ítem o nada.
  const segmentosItem = segmentosDeItemEnLaFila({
    movimiento: {
      ...salida,
      budgetItemId: salida.budgetItemId ?? entrada.budgetItemId,
    },
    categoria: undefined,
    catalogo,
  });

  return (
    <>
      {/* La fila entera es el botón: foco visible y Enter/Espacio abren el
          detalle, no solo el clic del mouse. El -mx-2 deja el texto alineado
          con el encabezado del día y da aire al fondo de hover, igual que en
          MovimientoItem. */}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setDetalleAbierto(true)}
        className="-mx-2 flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
      >
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

          {/* La línea parte en renglones cuando no cabe: a 320px un nombre de
              cuenta largo (el destino de un pago de tarjeta) ya no se corta con
              "…". Origen y destino viajan con su flecha, y la hora con su punto
              medio, para que ninguno quede huérfano al partir la línea. */}
          <span className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {/* El ítem viaja con su punto separador, como la hora: si la línea
                parte, el punto no abre el renglón siguiente. */}
            {segmentosItem.length > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <span className="min-w-0 break-words">{segmentosItem.join(" · ")}</span>
                <span aria-hidden className="shrink-0">
                  ·
                </span>
              </span>
            )}
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="min-w-0 break-words">{cuentaOrigen?.name ?? "…"}</span>
              <ArrowRight aria-hidden className="size-3 shrink-0" />
              <span className="min-w-0 break-words">{cuentaDestino?.name ?? "…"}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <span aria-hidden>·</span>
              <span>{horaCorta(salida.occurredAt)}</span>
            </span>
          </span>
        </div>

        <Monto
          valor={entrada.amount}
          moneda={entrada.currency}
          signo="ninguno"
          className={anulada ? "opacity-50" : undefined}
        />
      </button>

      <DetalleTransferencia
        par={par}
        cuentaOrigen={cuentaOrigen}
        cuentaDestino={cuentaDestino}
        abierto={detalleAbierto}
        onOpenChange={setDetalleAbierto}
        onSolicitarAnular={onSolicitarAnular}
      />
    </>
  );
}

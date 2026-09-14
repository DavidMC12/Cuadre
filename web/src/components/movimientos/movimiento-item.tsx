"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Monto } from "@/components/monto";
import { DetalleMovimiento } from "@/components/movimientos/detalle-movimiento";
import type { Categoria, Cuenta, Movimiento } from "@/lib/api/types";
import { horaCorta } from "@/lib/fecha";
import { ETIQUETA_TIPO_MOVIMIENTO } from "@/lib/labels";

/**
 * Un renglón del libro: se lee de un vistazo y nada más. Las acciones
 * (anular, cambiar la categoría) viven un toque adentro, en el detalle, para
 * que la lista no repita dos botones por fila.
 */
export function MovimientoItem({
  movimiento,
  cuenta,
  categoria,
  mostrarCuenta,
  onSolicitarAnular,
}: {
  movimiento: Movimiento;
  cuenta: Cuenta | undefined;
  categoria: Categoria | undefined;
  mostrarCuenta: boolean;
  onSolicitarAnular: (movimiento: Movimiento) => void;
}) {
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const anulado = movimiento.reversedByTransactionId !== null;
  const esAnulacion = movimiento.reversesTransactionId !== null;

  const descripcion = movimiento.description?.trim() || ETIQUETA_TIPO_MOVIMIENTO[movimiento.kind];

  // La categoría como texto tranquilo: solo aparece cuando la tiene; un
  // movimiento sin categoría no pide nada a gritos en cada fila.
  const detalle = [
    categoria?.name,
    mostrarCuenta ? cuenta?.name : undefined,
    horaCorta(movimiento.occurredAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* La fila entera es el botón: foco visible y Enter/Espacio abren el
          detalle, no solo el clic del mouse. El -mx-2 deja el texto alineado
          con el encabezado del día y da aire al fondo de hover. */}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setDetalleAbierto(true)}
        className="-mx-2 flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
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
            {/* Sin insignia para "opening": el texto de la fila ya dice "Saldo
                inicial" (es su descripción de siempre), repetirlo en una
                insignia al lado no agrega información, solo ruido. */}
          </div>

          <span className="text-xs text-muted-foreground">{detalle}</span>
        </div>

        <Monto
          valor={movimiento.amount}
          moneda={movimiento.currency}
          className={anulado ? "opacity-50" : undefined}
        />
      </button>

      <DetalleMovimiento
        movimiento={movimiento}
        cuenta={cuenta}
        categoria={categoria}
        abierto={detalleAbierto}
        onOpenChange={setDetalleAbierto}
        onSolicitarAnular={onSolicitarAnular}
      />
    </>
  );
}

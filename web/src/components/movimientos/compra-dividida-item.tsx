"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Monto } from "@/components/monto";
import { DetalleCompraDividida } from "@/components/movimientos/detalle-compra-dividida";
import type { Categoria, Cuenta, Movimiento } from "@/lib/api/types";
import {
  type CompraDividida,
  compraAnulada,
  descripcionDeLaCompra,
  esAnulacionDeCompra,
  totalDeLaCompra,
} from "@/lib/combinar-pagos-divididos";
import { horaCorta } from "@/lib/fecha";
import { textoMonto } from "@/lib/money";

/**
 * Una compra pagada con dos cuentas, en un solo renglón: "Mercado", el total y
 * debajo con qué se pagó ("Tarjeta Nu $100.000 + Nu Bank $100.000"). Sin esto
 * se vería como dos gastos sueltos y parecería que se gastó dos veces.
 *
 * La fila entera es el botón, igual que un movimiento normal: abre el detalle
 * con las dos partes y las acciones (cambiar categoría o ítem, anular la
 * compra completa).
 */
export function CompraDivididaItem({
  compra,
  cuentasPorId,
  categoria,
  onSolicitarAnular,
}: {
  compra: CompraDividida;
  cuentasPorId: ReadonlyMap<string, Cuenta>;
  categoria: Categoria | undefined;
  onSolicitarAnular: (parte: Movimiento) => void;
}) {
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const anulada = compraAnulada(compra);
  const esAnulacion = esAnulacionDeCompra(compra);
  const moneda = compra.partes[0].currency;

  // "Tarjeta Nu $100.000 + Nu Bank $100.000": cada parte con su cuenta, sin
  // signo (la fila ya es un gasto; el signo está en el total).
  const conQueSePago = compra.partes
    .map((parte) => {
      const nombre = cuentasPorId.get(parte.accountId)?.name ?? "…";
      return `${nombre} ${textoMonto(parte.amount.replace(/^-/, ""), parte.currency)}`;
    })
    .join(" + ");

  const detalle = [categoria?.name, horaCorta(compra.partes[0].occurredAt)]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setDetalleAbierto(true)}
        className="-mx-2 flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={anulada ? "text-sm text-muted-foreground line-through" : "text-sm"}>
              {descripcionDeLaCompra(compra.partes)}
            </span>
            {anulada && (
              <Badge variant="outline" className="text-muted-foreground">
                Anulada
              </Badge>
            )}
            {esAnulacion && <Badge variant="secondary">Anulación</Badge>}
          </div>

          <span className="text-xs text-muted-foreground">{detalle}</span>
          <span className="text-xs text-muted-foreground">{conQueSePago}</span>
        </div>

        <Monto
          valor={totalDeLaCompra(compra.partes)}
          moneda={moneda}
          className={anulada ? "opacity-50" : undefined}
        />
      </button>

      <DetalleCompraDividida
        compra={compra}
        cuentasPorId={cuentasPorId}
        categoria={categoria}
        abierto={detalleAbierto}
        onOpenChange={setDetalleAbierto}
        onSolicitarAnular={onSolicitarAnular}
      />
    </>
  );
}

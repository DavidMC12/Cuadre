"use client";

import { Ban, ArrowRight } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Monto } from "@/components/monto";
import { useSoloMirar } from "@/hooks/use-perfil";
import { usePresupuestoItems } from "@/hooks/use-presupuesto";
import type { Cuenta } from "@/lib/api/types";
import type { ParDeTransferencia } from "@/lib/combinar-transferencias";
import { etiquetaFecha, horaCorta } from "@/lib/fecha";
import { ETIQUETA_TIPO_MOVIMIENTO, SIN_ASIGNAR } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Todo lo de una transferencia entre cuentas, un toque adentro de la lista:
 * de qué cuenta a qué cuenta, el monto, la fecha, y lo único que se puede
 * hacer: anular la transferencia COMPLETA (las dos patas juntas; una mitad
 * sola no se anula). Anularla crea la transferencia contraria y la plata
 * vuelve a su cuenta de origen. Si la transferencia a una tarjeta contaba
 * para un ítem del presupuesto (el pago de la deuda), anularla también lo
 * deshace: aquí solo se dice a qué ítem contaba, no se miente.
 */
export function DetalleTransferencia({
  par,
  cuentaOrigen,
  cuentaDestino,
  abierto,
  onOpenChange,
  onSolicitarAnular,
}: {
  par: ParDeTransferencia;
  cuentaOrigen: Cuenta | undefined;
  cuentaDestino: Cuenta | undefined;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  onSolicitarAnular: (par: ParDeTransferencia) => void;
}) {
  const soloMirar = useSoloMirar();
  const { salida, entrada } = par;

  // El ítem del presupuesto viaja en la pata de salida (el pago de una
  // tarjeta). Se lee del catálogo, igual que en los demás detalles; el
  // renglón solo se muestra si la transferencia tenía uno.
  const { data: itemsDelPresupuesto } = usePresupuestoItems(true);
  const idDelItem = salida.budgetItemId ?? entrada.budgetItemId ?? null;
  const nombreDelItem = (() => {
    if (!idDelItem) return null;
    const item = (itemsDelPresupuesto ?? []).find((item) => item.id === idDelItem);
    if (!item) return idDelItem;
    return item.label ?? item.categoryName ?? item.accountName ?? SIN_ASIGNAR;
  })();

  const anulada = salida.reversedByTransactionId !== null;
  const esAnulacion = salida.reversesTransactionId !== null;

  // Anular escribe movimientos nuevos en el libro: desde la cuenta de otra
  // persona no se ofrece. Una transferencia ya anulada, o una anulación
  // misma, tampoco se vuelve a anular.
  const puedeAnular = !soloMirar && !anulada && !esAnulacion;

  const descripcion = salida.description?.trim() || ETIQUETA_TIPO_MOVIMIENTO.transfer;

  return (
    <Drawer open={abierto} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className={anulada ? "text-muted-foreground line-through" : undefined}>
            {descripcion}
          </DrawerTitle>
          <DrawerDescription>
            {[etiquetaFecha(salida.occurredAt), horaCorta(salida.occurredAt)].join(" · ")}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-2 py-2">
            <Monto
              valor={entrada.amount}
              moneda={entrada.currency}
              signo="ninguno"
              className={cn("text-2xl", anulada && "opacity-50")}
            />
            {anulada && (
              <Badge variant="outline" className="text-muted-foreground">
                Anulada
              </Badge>
            )}
            {esAnulacion && <Badge variant="secondary">Anulación</Badge>}
          </div>

          <Separator />
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">De una cuenta a otra</span>
            <ul className="flex flex-col gap-2">
              <li className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 text-sm">
                  <span className="min-w-0 truncate">{cuentaOrigen?.name ?? "…"}</span>
                  <ArrowRight aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                </span>
                <Monto
                  valor={salida.amount}
                  moneda={salida.currency}
                  className={cn("text-sm", anulada && "opacity-50")}
                />
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">{cuentaDestino?.name ?? "…"}</span>
                <Monto
                  valor={entrada.amount}
                  moneda={entrada.currency}
                  className={cn("text-sm", anulada && "opacity-50")}
                />
              </li>
            </ul>
          </div>

          {nombreDelItem && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Cuenta para</span>
                <span className="text-sm">{nombreDelItem}</span>
              </div>
            </>
          )}

          {anulada && (
            <p className="text-center text-xs text-muted-foreground">
              Esta transferencia ya está anulada: la plata volvió a su cuenta de origen.
            </p>
          )}
          {esAnulacion && (
            <p className="text-center text-xs text-muted-foreground">
              Es la anulación de otra transferencia: no se vuelve a anular.
            </p>
          )}
        </div>

        {puedeAnular && (
          <DrawerFooter>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                // La confirmación vive en la página: este cajón se cierra y el
                // diálogo "Sí, anular la transferencia" toma su lugar. Se pasa
                // el par; el servidor anula las dos patas.
                onOpenChange(false);
                onSolicitarAnular(par);
              }}
            >
              <Ban data-icon="inline-start" />
              Anular transferencia
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

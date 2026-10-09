"use client";

import { Ban, ListTodo, Tag } from "lucide-react";

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
import { EditarCategoriaMovimiento } from "@/components/movimientos/editar-categoria-movimiento";
import { EditarItemMovimiento } from "@/components/movimientos/editar-item-movimiento";
import { useSoloMirar } from "@/hooks/use-perfil";
import { usePresupuestoItems } from "@/hooks/use-presupuesto";
import type { Categoria, Cuenta, Movimiento } from "@/lib/api/types";
import {
  type CompraDividida,
  compraAnulada,
  descripcionDeLaCompra,
  esAnulacionDeCompra,
  totalDeLaCompra,
} from "@/lib/combinar-pagos-divididos";
import { etiquetaFecha, horaCorta } from "@/lib/fecha";
import { SIN_ASIGNAR, SIN_CATEGORIA } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Todo lo de una compra pagada con dos cuentas, un toque adentro de la lista:
 * el total, con qué se pagó (las dos partes), a qué categoría e ítem cuenta, y
 * lo que se puede hacer: cambiar categoría o ítem (el servidor lo cambia en las
 * dos partes) y anular la compra COMPLETA. Una parte sola nunca se anula: la
 * compra quedaría a medias.
 */
export function DetalleCompraDividida({
  compra,
  cuentasPorId,
  categoria,
  abierto,
  onOpenChange,
  onSolicitarAnular,
}: {
  compra: CompraDividida;
  cuentasPorId: ReadonlyMap<string, Cuenta>;
  categoria: Categoria | undefined;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  onSolicitarAnular: (parte: Movimiento) => void;
}) {
  const soloMirar = useSoloMirar();
  const [primera] = compra.partes;

  // El nombre del ítem sale del catálogo, como en el detalle de un movimiento
  // normal. Las dos partes comparten ítem y categoría.
  const { data: itemsDelPresupuesto } = usePresupuestoItems(true);
  const nombreDelItem = (() => {
    if (!primera.budgetItemId) return null;
    const item = (itemsDelPresupuesto ?? []).find((item) => item.id === primera.budgetItemId);
    if (!item) return primera.budgetItemId;
    return item.label ?? item.categoryName ?? item.accountName ?? SIN_ASIGNAR;
  })();

  const anulada = compraAnulada(compra);
  const esAnulacion = esAnulacionDeCompra(compra);

  // Anular escribe movimientos nuevos en el libro: desde la cuenta de otra
  // persona no se ofrece. Una anulación tampoco se anula.
  const puedeAnular = !soloMirar && !anulada && !esAnulacion;
  const puedeCambiarCategoria = !soloMirar;
  // El ítem solo existe si la compra lleva categoría.
  const puedeCambiarItem = !soloMirar && primera.categoryId !== null;

  return (
    <Drawer open={abierto} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className={anulada ? "text-muted-foreground line-through" : undefined}>
            {descripcionDeLaCompra(compra.partes)}
          </DrawerTitle>
          <DrawerDescription>
            {[etiquetaFecha(primera.occurredAt), horaCorta(primera.occurredAt)].join(" · ")}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-2 py-2">
            <Monto
              valor={totalDeLaCompra(compra.partes)}
              moneda={primera.currency}
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
            <span className="text-sm text-muted-foreground">Pagada con dos cuentas</span>
            <ul className="flex flex-col gap-2">
              {compra.partes.map((parte) => (
                <li key={parte.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">
                    {cuentasPorId.get(parte.accountId)?.name ?? "…"}
                  </span>
                  <Monto
                    valor={parte.amount}
                    moneda={parte.currency}
                    className={cn("text-sm", anulada && "opacity-50")}
                  />
                </li>
              ))}
            </ul>
          </div>

          <Separator />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Categoría</span>
            <span className={categoria ? "text-sm" : "text-sm text-muted-foreground"}>
              {categoria?.name ?? SIN_CATEGORIA}
            </span>
          </div>

          {primera.categoryId !== null && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Cuenta para</span>
                <span className={nombreDelItem ? "text-sm" : "text-sm text-muted-foreground"}>
                  {nombreDelItem ?? SIN_ASIGNAR}
                </span>
              </div>
            </>
          )}
        </div>

        {(puedeCambiarCategoria || puedeCambiarItem || puedeAnular) && (
          <DrawerFooter>
            {puedeCambiarItem && (
              <EditarItemMovimiento movimiento={primera}>
                <Button variant="outline" className="min-h-11">
                  <ListTodo data-icon="inline-start" />
                  Cambiar ítem
                </Button>
              </EditarItemMovimiento>
            )}
            {puedeCambiarCategoria && (
              <EditarCategoriaMovimiento movimiento={primera}>
                <Button variant="outline" className="min-h-11">
                  <Tag data-icon="inline-start" />
                  Cambiar categoría
                </Button>
              </EditarCategoriaMovimiento>
            )}
            {puedeAnular && (
              <Button
                variant="ghost"
                className="min-h-11"
                onClick={() => {
                  // La confirmación vive en la página: este cajón se cierra y el
                  // diálogo "Sí, anular compra" toma su lugar. Se pasa una parte;
                  // el servidor anula las dos.
                  onOpenChange(false);
                  onSolicitarAnular(primera);
                }}
              >
                <Ban data-icon="inline-start" />
                Anular compra
              </Button>
            )}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

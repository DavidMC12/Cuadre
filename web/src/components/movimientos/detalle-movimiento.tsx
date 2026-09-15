"use client";

import { Ban, Tag } from "lucide-react";

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
import { useSoloMirar } from "@/hooks/use-perfil";
import type { Categoria, Cuenta, Movimiento } from "@/lib/api/types";
import { etiquetaFecha, horaCorta } from "@/lib/fecha";
import { ETIQUETA_TIPO_MOVIMIENTO, SIN_CATEGORIA } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Todo lo de un movimiento, un toque adentro de la lista: los datos completos
 * y las dos únicas cosas que lo cambian (la categoría y la anulación). Abre
 * como cajón inferior, igual que los formularios, y en escritorio queda
 * centrado igual que ellos.
 */
export function DetalleMovimiento({
  movimiento,
  cuenta,
  categoria,
  abierto,
  onOpenChange,
  onSolicitarAnular,
}: {
  movimiento: Movimiento;
  cuenta: Cuenta | undefined;
  categoria: Categoria | undefined;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  onSolicitarAnular: (movimiento: Movimiento) => void;
}) {
  const soloMirar = useSoloMirar();

  const anulado = movimiento.reversedByTransactionId !== null;
  const esAnulacion = movimiento.reversesTransactionId !== null;

  // Anular escribe otro movimiento en el libro, y el libro no se edita. Desde
  // la cuenta de otra persona eso ni se ofrece. Una pata de transferencia
  // tampoco: el servidor la rechaza igual (se anula la transferencia
  // completa, no una de sus mitades), y ese botón todavía no existe aquí —
  // mejor no ofrecerlo que ofrecer uno que siempre falla. Solo llega a verse
  // esta pantalla cuando la lista no encontró su pareja (por ejemplo, está
  // filtrada a una sola cuenta): con las dos patas juntas, la fila combinada
  // no abre ningún detalle.
  const puedeAnularse =
    !soloMirar &&
    !anulado &&
    !esAnulacion &&
    movimiento.kind !== "opening" &&
    movimiento.kind !== "transfer";
  // La categoría tampoco se toca en la cuenta de otra persona: el detalle es
  // solo lectura ahí, como el resto de la app.
  const puedeCategorizarse = !soloMirar && movimiento.kind === "standard";
  const muestraCategoria = movimiento.kind === "standard";

  const descripcion = movimiento.description?.trim() || ETIQUETA_TIPO_MOVIMIENTO[movimiento.kind];

  return (
    <Drawer open={abierto} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className={anulado ? "text-muted-foreground line-through" : undefined}>
            {descripcion}
          </DrawerTitle>
          <DrawerDescription>
            {[cuenta?.name, etiquetaFecha(movimiento.occurredAt), horaCorta(movimiento.occurredAt)]
              .filter(Boolean)
              .join(" · ")}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-2 py-2">
            <Monto
              valor={movimiento.amount}
              moneda={movimiento.currency}
              className={cn("text-2xl", anulado && "opacity-50")}
            />
            {anulado && (
              <Badge variant="outline" className="text-muted-foreground">
                Anulado
              </Badge>
            )}
            {esAnulacion && <Badge variant="secondary">Anulación</Badge>}
          </div>

          {muestraCategoria && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Categoría</span>
                <span className={categoria ? "text-sm" : "text-sm text-muted-foreground"}>
                  {categoria?.name ?? SIN_CATEGORIA}
                </span>
              </div>
            </>
          )}
        </div>

        {(puedeCategorizarse || puedeAnularse) && (
          <DrawerFooter>
            {puedeCategorizarse && (
              <EditarCategoriaMovimiento movimiento={movimiento}>
                <Button variant="outline">
                  <Tag data-icon="inline-start" />
                  Cambiar categoría
                </Button>
              </EditarCategoriaMovimiento>
            )}
            {puedeAnularse && (
              <Button
                variant="ghost"
                onClick={() => {
                  // La confirmación sigue viviendo en la página: este cajón se
                  // cierra y el diálogo de "Sí, anular" toma su lugar.
                  onOpenChange(false);
                  onSolicitarAnular(movimiento);
                }}
              >
                <Ban data-icon="inline-start" />
                Anular
              </Button>
            )}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

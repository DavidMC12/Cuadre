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
import { etiquetaFecha, horaCorta } from "@/lib/fecha";
import { ETIQUETA_TIPO_MOVIMIENTO, SIN_ASIGNAR, SIN_CATEGORIA } from "@/lib/labels";
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

  // A qué nombre corresponde el ítem del presupuesto del movimiento: sale del
  // catálogo de ítems (la misma consulta que usa el resto de la app), con la
  // etiqueta si la tiene, o el nombre de la categoría/de la cuenta. Si el
  // catálogo no llegó todavía, el renglón queda anónimo de forma honesta.
  const { data: itemsDelPresupuesto } = usePresupuestoItems(true);
  const nombreDelItem = (() => {
    if (!movimiento.budgetItemId) return null;
    const item = (itemsDelPresupuesto ?? []).find(
      (item) => item.id === movimiento.budgetItemId
    );
    if (!item) return movimiento.budgetItemId;
    return item.label ?? item.categoryName ?? item.accountName ?? SIN_ASIGNAR;
  })();

  const anulado = movimiento.reversedByTransactionId !== null;
  const esAnulacion = movimiento.reversesTransactionId !== null;

  // Anular escribe otro movimiento en el libro, y el libro no se edita. Desde
  // la cuenta de otra persona eso ni se ofrece. Una pata de transferencia
  // tampoco: el servidor la rechaza igual (se anula la transferencia
  // completa, no una de sus mitades), y ese botón todavía no existe aquí —
  // mejor no ofrecerlo que ofrecer uno que siempre falla. Solo llega a verse
  // esta pantalla cuando la lista no encontró su pareja (por ejemplo, está
  // filtrada a una sola cuenta): con las dos patas juntas, la fila combinada
  // no abre ningún detalle. Un ajuste de saldo tampoco se anula: si quedó
  // mal, se hace otro ajuste.
  const puedeAnularse =
    !soloMirar &&
    !anulado &&
    !esAnulacion &&
    movimiento.kind !== "opening" &&
    movimiento.kind !== "transfer" &&
    movimiento.kind !== "adjustment";
  // La categoría tampoco se toca en la cuenta de otra persona: el detalle es
  // solo lectura ahí, como el resto de la app.
  const puedeCategorizarse = !soloMirar && movimiento.kind === "standard";
  const muestraCategoria = movimiento.kind === "standard";

  // El item del presupuesto se lee y se cambia en los mismos casos donde el
  // servidor lo acepta: un movimiento con categoría (gasto o ingreso) o una
  // pata de transferencia. Un saldo inicial y un ajuste no pueden (el
  // servidor lo rechaza), así que el renglón ni aparece.
  const aplicaItem =
    (movimiento.kind === "standard" && movimiento.categoryId !== null) ||
    movimiento.kind === "transfer";
  const puedeReasignarse = aplicaItem && !soloMirar;

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

          {aplicaItem && (
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

          {movimiento.kind === "adjustment" && (
            /* La explicación en palabras: un ajuste es la fila que empareja el saldo con la realidad del banco. */
            <p className="text-center text-xs text-muted-foreground">
              Es un ajuste para que el saldo coincida con tu banco. No cuenta como gasto ni
              ingreso. Si quedó mal, haz otro ajuste.
            </p>
          )}
        </div>

        {(puedeCategorizarse || puedeReasignarse || puedeAnularse) && (
          <DrawerFooter>
            {puedeReasignarse && (
              <EditarItemMovimiento movimiento={movimiento}>
                <Button variant="outline" className="min-h-11">
                  <ListTodo data-icon="inline-start" />
                  Cambiar ítem
                </Button>
              </EditarItemMovimiento>
            )}
            {puedeCategorizarse && (
              <EditarCategoriaMovimiento movimiento={movimiento}>
                <Button variant="outline" className="min-h-11">
                  <Tag data-icon="inline-start" />
                  Cambiar categoría
                </Button>
              </EditarCategoriaMovimiento>
            )}
            {puedeAnularse && (
              <Button
                variant="ghost"
                className="min-h-11"
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

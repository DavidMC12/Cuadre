"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActualizarItemMovimiento } from "@/hooks/use-movimientos";
import { useChecklistDelMes } from "@/hooks/use-presupuesto";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Movimiento } from "@/lib/api/types";
import { fechaParaInput } from "@/lib/fecha";
import { agruparItemsDePago, SIN_ITEM, textoDeOpcion } from "@/lib/item-presupuesto";

/** El valor del selector que marca "no cuenta para ningún ítem" y la opción
 * con su texto (lo que falta, o el logro) viven en `lib/item-presupuesto.ts`,
 * para que el formulario y el cajón del detalle digan lo mismo. */

/**
 * Cambiar a qué item del presupuesto cuenta un movimiento ya registrado
 * (asignar, cambiar o quitar). Los items son los del MES del movimiento, en
 * su moneda:
 *
 * - Un movimiento con categoría: los items de ESA categoría (el servidor
 *   rechaza items de otra).
 * - Una pata de transferencia (el servidor acepta el id de cualquiera de las
 *   dos): los items de gasto, agrupados por categoría como en el formulario
 *   de pagar tarjeta.
 *
 * Guarda con el mismo endpoint para ambos casos.
 */
export function EditarItemMovimiento({
  movimiento,
  children,
}: {
  movimiento: Movimiento;
  children: React.ReactNode;
}) {
  const soloMirar = useSoloMirar();
  const [abierto, setAbierto] = useState(false);
  const [eleccion, setEleccion] = useState<string | null>(movimiento.budgetItemId ?? null);

  const actualizarItem = useActualizarItemMovimiento();

  const esTransferencia = movimiento.kind === "transfer";
  const categoryId = esTransferencia ? null : movimiento.categoryId;
  const { data: checklist } = useChecklistDelMes({
    month: fechaParaInput(movimiento.occurredAt).slice(0, 7),
    currency: movimiento.currency || "",
  });

  // Un movimiento con categoría: los items de ESA categoría este mes.
  const itemsDeCategoria =
    categoryId !== null
      ? (checklist?.items ?? []).filter((renglon) => renglon.categoryId === categoryId)
      : [];

  // En una transferencia: los items de gasto, que van agrupados por
  // categoría (con un solo grupo no hay rótulo: el grupo entero plano).
  const itemsDePago =
    esTransferencia && categoryId === null
      ? (checklist?.items ?? []).filter(
          (renglon) => renglon.categoryId !== null && renglon.categoryKind === "expense"
        )
      : [];
  const gruposDePago = agruparItemsDePago(itemsDePago);

  const items = esTransferencia ? itemsDePago : itemsDeCategoria;
  const textoPorItem = new Map(items.map((renglon) => [renglon.id, textoDeOpcion(renglon)]));

  function guardar(item: string | null) {
    actualizarItem.mutate(
      { id: movimiento.id, budgetItemId: item },
      {
        onSuccess: () => {
          toast.success(
            item ? "Ítem del presupuesto actualizado." : "El movimiento ya no cuenta para ningún ítem."
          );
          setAbierto(false);
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "No se pudo cambiar el ítem del presupuesto."
          );
        },
      }
    );
  }

  // Quien está mirando la cuenta de otra persona no ve el botón siquiera: el
  // servidor rechazaría la escritura de todos modos.
  if (soloMirar) return null;

  return (
    <Drawer
      open={abierto}
      onOpenChange={(valor) => {
        setAbierto(valor);
        if (valor) setEleccion(movimiento.budgetItemId ?? null);
      }}
    >
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            guardar(eleccion ?? null);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DrawerHeader>
            <DrawerTitle>Ítem del presupuesto</DrawerTitle>
            <DrawerDescription>
              {movimiento.description?.trim() || "Este movimiento"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-1.5 px-4 py-4">
            <Label htmlFor="item-movimiento-existente">Cuenta para</Label>
            {/* El selector existe siempre: con items este mes muestra sus
                opciones; sin ellos queda "Sin asignar" con una ayuda que
                dice por qué — nunca un cajón que no se puede usar ni se
                puede quitar lo que el movimiento ya tenía. */}
            <Select
              value={eleccion ?? SIN_ITEM}
              onValueChange={setEleccion}
              aria-describedby={items.length === 0 ? "item-movimiento-sin-eleccion" : undefined}
            >
              <SelectTrigger id="item-movimiento-existente" className="min-h-11 w-full">
                {/* El popup de opciones vive en un portal que no está
                    montado mientras el selector está cerrado: hay que
                    resolver el texto a mano, como en los demás. */}
                <SelectValue>
                  {(valor: string) =>
                    valor && valor !== SIN_ITEM ? (textoPorItem.get(valor) ?? valor) : "Sin asignar"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ITEM}>Sin asignar</SelectItem>
                {esTransferencia
                  ? gruposDePago.map((grupo) =>
                      grupo.items.length > 1 ? (
                        <SelectGroup key={grupo.categoryId}>
                          <SelectLabel>{grupo.categoryName}</SelectLabel>
                          {grupo.items.map((renglon) => (
                            <SelectItem key={renglon.id} value={renglon.id}>
                              {textoDeOpcion(renglon)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : (
                        grupo.items.map((renglon) => (
                          <SelectItem key={renglon.id} value={renglon.id}>
                            {textoDeOpcion(renglon)}
                          </SelectItem>
                        ))
                      )
                    )
                  : itemsDeCategoria.map((renglon) => (
                      <SelectItem key={renglon.id} value={renglon.id}>
                        {textoDeOpcion(renglon)}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
            {items.length === 0 && (
              <p id="item-movimiento-sin-eleccion" className="text-xs text-muted-foreground">
                {esTransferencia
                  ? "No hay ítems de gasto este mes en esta moneda."
                  : "Esta categoría no tiene ítems de presupuesto este mes."}
              </p>
            )}
          </div>

          <DrawerFooter>
            <Button type="submit" className="min-h-11" disabled={actualizarItem.isPending}>
              {actualizarItem.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

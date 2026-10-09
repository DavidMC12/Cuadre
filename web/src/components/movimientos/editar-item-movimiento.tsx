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
import type { ItemDelChecklist, Movimiento } from "@/lib/api/types";
import { fechaParaInput } from "@/lib/fecha";
import { aUnidadesMinimas, restar, textoMonto } from "@/lib/money";

/** El valor del selector que marca "no cuenta para ningún item". */
const SIN_ITEM = "__sin_item__";

/**
 * La opción del selector de item, con lo que falta por pagar o recibir, igual
 * que en el formulario de registrar: "Deuda TC Nu — faltan $102.500" (texto
 * exacto), o "pagado" cuando el objetivo ya se cumplió o se pasó. Sin
 * objetivo ese mes, solo queda el nombre.
 */
function textoDeOpcion(renglon: ItemDelChecklist): string {
  if (renglon.target === null) return renglon.label;
  const alcanzado = aUnidadesMinimas(renglon.progress);
  const objetivo = aUnidadesMinimas(renglon.target);
  if (alcanzado >= objetivo) {
    return renglon.categoryKind === "income"
      ? `${renglon.label} — recibido`
      : `${renglon.label} — pagado`;
  }
  return `${renglon.label} — faltan ${textoMonto(
    restar(renglon.target, renglon.progress),
    renglon.currency
  )}`;
}

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

  // En una transferencia: los items de gasto agrupados por categoría. Con
  // un solo grupo no hay rótulo: el grupo entero se muestra plano.
  const itemsDePago =
    esTransferencia && categoryId === null
      ? (checklist?.items ?? []).filter(
          (renglon) => renglon.categoryId !== null && renglon.categoryKind === "expense"
        )
      : [];
  const gruposDePago = (() => {
    const porCategoria = new Map<
      string,
      { categoryId: string; categoryName: string; items: ItemDelChecklist[] }
    >();
    for (const renglon of itemsDePago) {
      const clave = renglon.categoryId as string;
      let grupo = porCategoria.get(clave);
      if (!grupo) {
        grupo = {
          categoryId: clave,
          categoryName: renglon.categoryName ?? "Categoría",
          items: [],
        };
        porCategoria.set(clave, grupo);
      }
      grupo.items.push(renglon);
    }
    return [...porCategoria.values()].sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName, "es")
    );
  })();

  const items = esTransferencia ? itemsDePago : itemsDeCategoria;
  const textoPorItem = new Map(items.map((renglon) => [renglon.id, textoDeOpcion(renglon)]));

  function guardar(item: string | null) {
    actualizarItem.mutate(
      { id: movimiento.id, budgetItemId: item },
      {
        onSuccess: () => {
          toast.success(
            item ? "Item del presupuesto actualizado." : "El movimiento ya no cuenta para ningún item."
          );
          setAbierto(false);
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "No se pudo cambiar el item del presupuesto."
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
            <DrawerTitle>Item del presupuesto</DrawerTitle>
            <DrawerDescription>
              {movimiento.description?.trim() || "Este movimiento"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-1.5 px-4 py-4">
            <Label htmlFor="item-movimiento-existente">Cuenta para</Label>
            {items.length > 0 ? (
              <Select value={eleccion ?? SIN_ITEM} onValueChange={setEleccion}>
                <SelectTrigger id="item-movimiento-existente" className="min-h-11 w-full">
                  {/* El popup de opciones vive en un portal que no está
                      montado mientras el selector está cerrado: hay que
                      resolver el texto a mano, como en los demás. */}
                  <SelectValue>
                    {(valor: string) =>
                      valor && valor !== SIN_ITEM
                        ? (textoPorItem.get(valor) ?? valor)
                        : "Sin asignar"
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
            ) : (
              // Sin items este mes no hay nada que asignar: en vez de un
              // selector vacío, se dice por qué (única salida razonable: el
              // movimiento no puede contar para un item que no existe).
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {esTransferencia
                  ? "No hay items de gasto este mes en esta moneda."
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

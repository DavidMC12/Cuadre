"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  FalloConsulta,
  estadoDeConsulta,
  mensajeDeCargaFallida,
  mensajeDeFallo,
  mensajeSinConexion,
} from "@/components/fallo-consulta";
import { Monto } from "@/components/monto";
import { useActualizarItemMovimiento, useMovimientos } from "@/hooks/use-movimientos";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { ItemDelChecklist, Movimiento } from "@/lib/api/types";
import { nombreDelMes, rangoDelMes } from "@/lib/fecha";
import { textoDeOpcion } from "@/lib/item-presupuesto";
import { fechaCorta, itemsDeLaCategoria, movimientosSinAsignar } from "@/lib/sin-asignar";
import { textoMonto } from "@/lib/money";

/**
 * El valor del selector cuando todavía no se eligió nada. El Select no acepta
 * una cadena vacía; con este centinela el desplegable siempre vuelve a su
 * sitio después de asignar (cada elección es una orden, no un estado que
 * quede prendido).
 */
const SIN_ELEGIR = "__elegir__";

/**
 * La fila "Sin asignar: $X" de una categoría deja de ser texto: es un botón
 * de 44px que abre un cajón con los movimientos de ESA categoría que no
 * cuentan para ningún ítem. Desde ahí se les elige ítem sin salir a
 * Movimientos; cada elección se guarda al instante.
 *
 * `items` son los renglones del checklist de esa categoría y ese mes (el
 * panel ya los tiene cargados); `monto` es el total sin asignar que el
 * servidor reportó, solo para la etiqueta del botón.
 */
export function AsignarSinAsignar({
  categoryId,
  categoriaNombre,
  monto,
  moneda,
  mes,
  items,
}: {
  categoryId: string;
  categoriaNombre: string;
  /** Texto exacto del servidor, siempre positivo. */
  monto: string;
  moneda: string;
  mes: string;
  items: readonly ItemDelChecklist[];
}) {
  const soloMirar = useSoloMirar();
  const [abierto, setAbierto] = useState(false);

  // Mirar la cuenta de otra persona es solo lectura: el botón no lleva a
  // ninguna escritura que el servidor fuese a rechazar. La cifra se sigue
  // viendo, porque es parte del cuadre.
  if (soloMirar) {
    return (
      <li className="border-t border-border px-2 py-2 text-xs text-muted-foreground">
        Sin asignar:{" "}
        <span className="font-mono tabular-nums">{textoMonto(monto, moneda)}</span>
      </li>
    );
  }

  return (
    <li className="border-t border-border">
      <Drawer open={abierto} onOpenChange={setAbierto}>
        <DrawerTrigger
          render={
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
            >
              <span className="min-w-0 truncate">
                Sin asignar:{" "}
                <span className="font-mono tabular-nums">{textoMonto(monto, moneda)}</span>
              </span>
              {/* La palabra le dice a quien no ve el color que la fila es una
                  acción; el tono de tinta la mantiene discreta. */}
              <span className="shrink-0 font-medium text-foreground">Asignar</span>
            </button>
          }
        />
        <DrawerContent>
          {/* Solo se monta con el cajón abierto: la consulta de movimientos no
              sale a la red por cada categoría del panel. */}
          {abierto && (
            <CajonSinAsignar
              categoryId={categoryId}
              categoriaNombre={categoriaNombre}
              moneda={moneda}
              mes={mes}
              items={items}
            />
          )}
        </DrawerContent>
      </Drawer>
    </li>
  );
}

function CajonSinAsignar({
  categoryId,
  categoriaNombre,
  moneda,
  mes,
  items,
}: {
  categoryId: string;
  categoriaNombre: string;
  moneda: string;
  mes: string;
  items: readonly ItemDelChecklist[];
}) {
  const idBase = useId();
  // El rango cortado en hora de Bogotá, el mismo que usa el tablero: los
  // movimientos del cajón son los del mes que se está viendo, ni uno de más.
  const { desde, hasta } = rangoDelMes(mes);
  const consulta = useMovimientos({ categoryId, from: desde, to: hasta, limit: 200 });
  const actualizarItem = useActualizarItemMovimiento();

  // Las filas que acaban de guardar se retiran de una vez, sin esperar a que
  // vuelva la recarga: el gesto tiene que verse inmediato.
  const [asignados, setAsignados] = useState<ReadonlySet<string>>(new Set());
  // Las filas que están guardando ahora mismo: cada una se bloquea para que
  // un doble toque no mande dos PATCH del mismo movimiento. Otra fila puede
  // seguir su camino sin estorbar.
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());

  const opciones = itemsDeLaCategoria(items, categoryId);
  const pendientes = movimientosSinAsignar(consulta.data ?? [], { categoryId, moneda }).filter(
    (movimiento) => !asignados.has(movimiento.id)
  );

  const { isError, error, isPaused, isLoading, isFetching, refetch } = consulta;
  const estado = estadoDeConsulta({
    data: consulta.data,
    isError,
    isPaused,
    isLoading,
  });

  function asignar(movimiento: Movimiento, itemId: string): void {
    if (guardando.has(movimiento.id)) return;
    const renglon = opciones.find((item) => item.id === itemId);
    setGuardando((previas) => new Set(previas).add(movimiento.id));
    actualizarItem.mutate(
      { id: movimiento.id, budgetItemId: itemId },
      {
        onSuccess: () => {
          toast.success(`Asignado a ${renglon?.label ?? "el ítem"}`);
          setAsignados((previos) => new Set(previos).add(movimiento.id));
        },
        onError: (fallo) => {
          // El mensaje del servidor llega tal cual; la fila se queda y el
          // desplegable vuelve a estar disponible.
          toast.error(
            fallo instanceof ApiError ? fallo.message : "No se pudo asignar. Intenta de nuevo."
          );
        },
        onSettled: () =>
          setGuardando((previas) => {
            const siguientes = new Set(previas);
            siguientes.delete(movimiento.id);
            return siguientes;
          }),
      }
    );
  }

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>Sin asignar en {categoriaNombre}</DrawerTitle>
        <DrawerDescription>
          {nombreDelMes(mes)} · {moneda}
        </DrawerDescription>
      </DrawerHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {estado === "fallo" ? (
          <FalloConsulta
            etiquetaBoton="Reintentar sin asignar"
            mensaje={mensajeDeFallo(error, mensajeDeCargaFallida("los movimientos sin asignar"))}
            reintento={isFetching}
            onReintentar={() => refetch()}
          />
        ) : estado === "pausada" ? (
          <FalloConsulta
            etiquetaBoton="Reintentar sin asignar"
            mensaje={mensajeSinConexion("los movimientos sin asignar")}
            onReintentar={() => refetch()}
          />
        ) : estado === "cargando" ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : pendientes.length === 0 ? (
          <EmptyState
            Icono={CircleCheck}
            titulo="Todo asignado"
            descripcion="Cada movimiento de esta categoría ya cuenta para un ítem."
            className="border-0 px-2 py-8"
          />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border">
              {pendientes.map((movimiento) => {
                const idItem = `${idBase}-item-${movimiento.id}`;
                const guardandoEsta = guardando.has(movimiento.id);
                return (
                  <li key={movimiento.id} className="flex flex-col gap-2 py-3 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">
                          {fechaCorta(movimiento.occurredAt)}
                        </span>
                        <span className="truncate text-sm">
                          {movimiento.description?.trim() || "Sin descripción"}
                        </span>
                      </div>
                      <Monto
                        valor={movimiento.amount}
                        moneda={movimiento.currency}
                        className="shrink-0"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={idItem} className="text-xs text-muted-foreground">
                        ¿A qué ítem cuenta?
                      </Label>
                      <Select
                        value={SIN_ELEGIR}
                        onValueChange={(valor) => {
                          if (valor && valor !== SIN_ELEGIR) asignar(movimiento, valor);
                        }}
                        disabled={guardandoEsta}
                      >
                        <SelectTrigger id={idItem} className="min-h-11 w-full">
                          {/* El popup vive en un portal que no está montado
                              mientras el selector está cerrado: el nombre del
                              elegido se resuelve a mano. */}
                          <SelectValue>
                            {(valor: string) =>
                              valor && valor !== SIN_ELEGIR
                                ? (opciones.find((item) => item.id === valor)?.label ?? valor)
                                : "Elige un ítem"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {opciones.map((renglon) => (
                            <SelectItem key={renglon.id} value={renglon.id}>
                              {textoDeOpcion(renglon)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ul>

            {consulta.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 self-center"
                onClick={() => consulta.fetchNextPage()}
                disabled={consulta.isFetchingNextPage}
              >
                {consulta.isFetchingNextPage ? "Cargando…" : "Cargar más"}
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}

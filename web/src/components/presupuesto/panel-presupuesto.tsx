"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, ListTodo, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FormularioItemPresupuesto } from "@/components/presupuesto/formulario-item-presupuesto";
import { useChecklistDelMes, useDesarchivarItemPresupuesto, usePresupuestoItems } from "@/hooks/use-presupuesto";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { ItemDelChecklist } from "@/lib/api/types";
import { textoMonto } from "@/lib/money";
import { cn } from "@/lib/utils";

const ESCALA = 10000n;

/** "80000.0000" -> 800000n, en diezmilésimas. Nunca parseFloat. */
function aUnidades(monto: string): bigint {
  const texto = monto.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = texto.replace(/^[-+]/, "");
  const [entera = "0", decimal = ""] = sinSigno.split(".");
  const decimalCompleto = (decimal + "0000").slice(0, 4);
  const valor = BigInt(entera || "0") * ESCALA + BigInt(decimalCompleto || "0");
  return negativo ? -valor : valor;
}

/**
 * Qué tan llena va la barra, en porcentaje para el CSS. Se calcula con
 * enteros grandes y se deja en un número solo aquí — es un ancho de barra,
 * no un monto de dinero.
 */
function porcentajeBarra(progress: string, target: string): number {
  const progreso = aUnidades(progress);
  const objetivo = aUnidades(target);

  if (objetivo <= 0n) return 0;
  if (progreso <= 0n) return 0;
  if (progreso >= objetivo) return 100;

  // Puntos básicos: (progreso / objetivo) * 10000, con enteros exactos.
  return Number((progreso * 10000n) / objetivo) / 100;
}

/**
 * El checklist del mes: qué había que revisar y cómo va cada renglón.
 *
 * Cada renglón es tocable para editar su monto o archivarlo, y en el
 * encabezado vive el botón para agregar uno nuevo. `mes` y `moneda` son los
 * que la pantalla de Resumen ya tiene elegidos.
 */
export function PanelPresupuesto({ mes, moneda }: { mes: string; moneda: string }) {
  const soloMirar = useSoloMirar();
  const { data: checklist, isLoading } = useChecklistDelMes({ month: mes, currency: moneda });
  const { data: todosLosItems } = usePresupuestoItems(true);
  const desarchivar = useDesarchivarItemPresupuesto();

  const [viendoArchivados, setViendoArchivados] = useState(false);

  const archivados = (todosLosItems ?? []).filter((item) => item.archivedAt !== null);
  const itemPorId = new Map((todosLosItems ?? []).map((item) => [item.id, item]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist del mes</CardTitle>
        {!soloMirar && (
          <CardAction>
            <FormularioItemPresupuesto moneda={moneda}>
              <Button variant="outline" size="sm">
                <Plus />
                Agregar
              </Button>
            </FormularioItemPresupuesto>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : !checklist || checklist.items.length === 0 ? (
          <EmptyState
            Icono={ListTodo}
            titulo="Nada por revisar este mes"
            descripcion="Agrega un tope para una categoría, o una meta para tus ahorros, y márcalos conforme los vayas cumpliendo."
            className="border-0 px-2 py-8"
          />
        ) : (
          <ul className="flex flex-col">
            {checklist.items.map((renglon, indice) => {
              const item = itemPorId.get(renglon.id);
              const porcentaje =
                renglon.target !== null
                  ? porcentajeBarra(renglon.progress, renglon.target)
                  : null;

              return (
                <li
                  key={renglon.id}
                  className={cn(
                    indice > 0 && "border-t border-border",
                    !soloMirar && item && "hover:bg-accent/50 -mx-2 rounded-lg"
                  )}
                >
                  {soloMirar || !item ? (
                    <div className="flex flex-col gap-1.5 px-2 py-3">
                      <ContenidoRenglon renglon={renglon} porcentaje={porcentaje} />
                    </div>
                  ) : (
                    <FormularioItemPresupuesto item={item} moneda={moneda}>
                      {/* Un botón de verdad: el Drawer de Base UI exige un
                          <button> nativo como disparador. */}
                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col gap-1.5 px-2 py-3 text-left outline-none"
                      >
                        <ContenidoRenglon renglon={renglon} porcentaje={porcentaje} />
                      </button>
                    </FormularioItemPresupuesto>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {archivados.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            {viendoArchivados ? (
              <ul className="flex flex-col gap-1 pb-1">
                {archivados.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="truncate text-sm text-muted-foreground">
                      {item.label ?? item.categoryName ?? item.accountName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={soloMirar || desarchivar.isPending}
                      onClick={() =>
                        desarchivar.mutate(item.id, {
                          onSuccess: () => toast.success("Ítem restaurado."),
                          onError: (error) =>
                            toast.error(
                              error instanceof ApiError
                                ? error.message
                                : "No se pudo restaurar. Intenta de nuevo."
                            ),
                        })
                      }
                    >
                      Restaurar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setViendoArchivados(!viendoArchivados)}>
              {viendoArchivados ? "Ocultar archivados" : `Archivados (${archivados.length})`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContenidoRenglon({
  renglon,
  porcentaje,
}: {
  renglon: ItemDelChecklist;
  porcentaje: number | null;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium">{renglon.label}</span>
        {renglon.checked && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-3.5" />
          </span>
        )}
      </div>

      {renglon.target === null ? (
        <p className="text-xs text-muted-foreground">Aún no aplica</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-valuenow={Math.round(porcentaje ?? 0)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${renglon.label}: ${textoMonto(renglon.progress, renglon.currency)} de ${textoMonto(renglon.target, renglon.currency)}`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                renglon.checked ? "bg-emerald-600" : "bg-foreground/60"
              )}
              style={{ width: `${porcentaje ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {/* textoMonto y no <Monto>: el ahorro de un mes puede ser
                negativo (se sacó más de lo que se metió), y un componente
                sin signo lo pintaría como positivo — ahí la barra dice una
                cosa y la cifra otra. */}
            <span className="font-mono tabular-nums">
              {textoMonto(renglon.progress, renglon.currency)}
            </span>
            {" de "}
            <span className="font-mono tabular-nums">
              {textoMonto(renglon.target, renglon.currency)}
            </span>
          </p>
        </>
      )}
    </>
  );
}

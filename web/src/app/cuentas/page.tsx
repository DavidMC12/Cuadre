"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FalloConsulta, estadoDeConsulta, mensajeDeCargaFallida, mensajeDeFallo, mensajeSinConexion } from "@/components/fallo-consulta";
import { CuentaCard } from "@/components/cuentas/cuenta-card";
import { FormularioCuenta } from "@/components/cuentas/formulario-cuenta";
import { useCuentas, useDesarchivarCuenta } from "@/hooks/use-cuentas";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import { agruparCuentasPorMoneda } from "@/lib/agrupar-cuentas";
import { ETIQUETA_TIPO_CUENTA } from "@/lib/labels";

export default function PaginaCuentas() {
  const { data: cuentas, isLoading, isError, error, isFetching, isPaused, refetch } = useCuentas();
  // Las archivadas van aparte para no romper la consulta de siempre: la lista
  // activa sigue pidiendo solo las suyas, y esta sección usa la consulta con
  // `includeArchived` y se queda con las que tienen `archivedAt`.
  const archivadasQuery = useCuentas(true);
  const desarchivar = useDesarchivarCuenta();
  const soloMirar = useSoloMirar();
  const [mostrarArchivadas, setMostrarArchivadas] = useState(false);

  // Un fallo no es "no tienes cuentas", y una consulta pausada sin red tampoco:
  // mientras no haya nada que mostrar, se dice. Con datos ya en memoria (un
  // refetch fallido) se siguen mostrando.
  const estado = estadoDeConsulta({ data: cuentas, isError, isPaused, isLoading });
  const fallo = estado === "fallo";
  const pausada = estado === "pausada";

  const grupos = agruparCuentasPorMoneda(cuentas ?? []);
  // Con una sola moneda el encabezado no dice nada que la pantalla ya no
  // diga: solo aparece si hay más de un grupo.
  const mostrarEncabezadoDeMoneda = grupos.size > 1;

  const archivadas = (archivadasQuery.data ?? []).filter((cuenta) => cuenta.archivedAt !== null);
  const estadoArchivadas = estadoDeConsulta({
    data: archivadasQuery.data,
    isError: archivadasQuery.isError,
    isPaused: archivadasQuery.isPaused,
    isLoading: archivadasQuery.isLoading,
  });
  // Si la lista principal ya avisa que no se pudo leer, no se repite el mismo
  // anuncio por las archivadas.
  const archivadasNoLeibles =
    !fallo && !pausada && (estadoArchivadas === "fallo" || estadoArchivadas === "pausada");

  function desarchivarCuenta(id: string) {
    desarchivar.mutate(id, {
      onSuccess: () => toast.success("Cuenta desarchivada."),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : "No se pudo desarchivar. Intenta de nuevo."
        ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cuentas</h1>
        <FormularioCuenta>
          {/* Sin `data-icon`: esa marca le da al botón un relleno más
              angosto del lado del ícono, y acá compite con `px-4` — el
              botón queda con menos aire de un lado que del otro. */}
          <Button size="sm" className="h-11 gap-1.5 px-4">
            <Plus />
            Nueva
          </Button>
        </FormularioCuenta>
      </div>

      {isLoading && (
        <div className="grid gap-2 lg:grid-cols-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {/* La consulta no se pudo leer y no hay nada que mostrar: se dice y se
          ofrece reintentar. Sin esto la pantalla quedaba en blanco, con solo
          el encabezado, como si no existiera nada. */}
      {fallo && (
        <FalloConsulta
          etiquetaBoton="Reintentar cuentas"
          mensaje={mensajeDeFallo(error, mensajeDeCargaFallida("tus cuentas"))}
          reintento={isFetching}
          onReintentar={() => refetch()}
        />
      )}

      {pausada && (
        <FalloConsulta
          etiquetaBoton="Reintentar cuentas"
          mensaje={mensajeSinConexion("tus cuentas")}
          onReintentar={() => refetch()}
        />
      )}

      {!isLoading && !fallo && !pausada && cuentas && cuentas.length === 0 && (
        <EmptyState
          Icono={Wallet}
          titulo="Todavía no tienes cuentas"
          descripcion="Crea la primera para empezar a registrar tus movimientos."
        >
          <FormularioCuenta>
            <Button size="sm" className="mt-1 min-h-11">
              <Plus data-icon="inline-start" />
              Crear cuenta
            </Button>
          </FormularioCuenta>
        </EmptyState>
      )}

      {!isLoading && !fallo && cuentas && cuentas.length > 0 && (
        <div className="flex flex-col gap-4">
          {[...grupos].map(([moneda, cuentasDeMoneda]) => (
            <div key={moneda} className="flex flex-col gap-2">
              {mostrarEncabezadoDeMoneda && (
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {moneda}
                </span>
              )}
              <div className="grid gap-2 lg:grid-cols-2">
                {cuentasDeMoneda.map((cuenta) => (
                  <CuentaCard key={cuenta.id} cuenta={cuenta} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Si falló solo la consulta de archivadas, se avisa sin fingir que no
          hay nada. Con la lista principal igual de caída, su bloque de arriba
          ya lo dice. */}
      {archivadasNoLeibles && (
        <FalloConsulta
          etiquetaBoton="Reintentar archivadas"
          mensaje={
            estadoArchivadas === "pausada"
              ? mensajeSinConexion("tus cuentas archivadas")
              : mensajeDeFallo(
                  archivadasQuery.error,
                  mensajeDeCargaFallida("tus cuentas archivadas")
                )
          }
          reintento={archivadasQuery.isFetching}
          onReintentar={() => archivadasQuery.refetch()}
        />
      )}

      {/* Al final y plegada: las archivadas no ensucian la lista de todos los
          días, pero no desaparecen — su historia sigue contando y se pueden
          revivir. Sin saldos: no suman en los totales de arriba. */}
      {archivadas.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            className="flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-muted-foreground"
            aria-expanded={mostrarArchivadas}
            aria-controls="cuentas-archivadas"
            onClick={() => setMostrarArchivadas((valor) => !valor)}
          >
            {mostrarArchivadas ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
            Archivadas ({archivadas.length})
          </button>

          {mostrarArchivadas && (
            <div
              id="cuentas-archivadas"
              className="flex flex-col divide-y divide-border rounded-xl border border-border"
            >
              {archivadas.map((cuenta) => (
                <div key={cuenta.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{cuenta.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {ETIQUETA_TIPO_CUENTA[cuenta.type]} · {cuenta.currency}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 shrink-0"
                    disabled={soloMirar || desarchivar.isPending}
                    onClick={() => desarchivarCuenta(cuenta.id)}
                  >
                    Desarchivar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

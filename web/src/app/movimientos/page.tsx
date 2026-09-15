"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { SelectorMes } from "@/components/dashboard/selector-mes";
import { MovimientoItem } from "@/components/movimientos/movimiento-item";
import { TransferenciaItem } from "@/components/movimientos/transferencia-item";
import { FormularioMovimiento } from "@/components/movimientos/formulario-movimiento";
import { ConfirmarAnulacion } from "@/components/movimientos/confirmar-anulacion";
import { useCuentas } from "@/hooks/use-cuentas";
import { useCategorias } from "@/hooks/use-categorias";
import { useAnularMovimiento, useMovimientos } from "@/hooks/use-movimientos";
import { agruparMovimientosPorDia } from "@/lib/agrupar-movimientos";
import { combinarTransferencias, esTransferencia } from "@/lib/combinar-transferencias";
import { ApiError } from "@/lib/api/client";
import type { FiltrosMovimientos, Movimiento } from "@/lib/api/types";
import { etiquetaMes, mesActual, rangoDelMes } from "@/lib/fecha";

const TODAS_LAS_CUENTAS = "todas";
const TODAS_LAS_CATEGORIAS = "todas";
const PARAM_MES = "mes";
const PARAM_CATEGORIA = "categoria";
const FORMA_DE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `useSearchParams` obliga a que el contenido viva dentro de un límite de
 * suspenso: durante el armado del servidor se muestra el esqueleto y el
 * navegador termina de pintar la pantalla con el mes que venga en la URL.
 */
export default function PaginaMovimientos() {
  return (
    <Suspense fallback={<EsqueletoMovimientos />}>
      <ContenidoMovimientos />
    </Suspense>
  );
}

function EsqueletoMovimientos() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Movimientos</h1>
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
    </div>
  );
}

function ContenidoMovimientos() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // El mes vive en la URL: así el enlace de una barra de categoría del Resumen
  // puede abrir Movimientos en su mes, y la pantalla se puede recargar o
  // compartir sin perderlo. Sin parámetro válido, es el mes en curso.
  const mesDeLaUrl = searchParams.get(PARAM_MES);
  const mes = mesDeLaUrl && FORMA_DE_MES.test(mesDeLaUrl) ? mesDeLaUrl : mesActual();

  // La categoría también llega por la URL, cuando se toca una barra del
  // Resumen. Un valor que no sea un identificador válido se ignora.
  const categoriaDeLaUrl = searchParams.get(PARAM_CATEGORIA);
  const categoriaFiltro =
    categoriaDeLaUrl && FORMA_DE_UUID.test(categoriaDeLaUrl) ? categoriaDeLaUrl : null;

  const [cuentaFiltro, setCuentaFiltro] = useState(TODAS_LAS_CUENTAS);
  const [movimientoAConfirmar, setMovimientoAConfirmar] = useState<Movimiento | null>(null);

  const { data: cuentas } = useCuentas();
  // Con archivadas incluidas: la lista puede estar filtrada por una categoría
  // que ya se archivó, y sus movimientos deben seguir mostrando el nombre.
  const { data: categorias } = useCategorias(true);

  const rango = useMemo(() => rangoDelMes(mes), [mes]);
  const filtros = useMemo<FiltrosMovimientos>(
    () => ({
      from: rango.desde,
      to: rango.hasta,
      ...(cuentaFiltro === TODAS_LAS_CUENTAS ? {} : { accountId: cuentaFiltro }),
      ...(categoriaFiltro ? { categoryId: categoriaFiltro } : {}),
    }),
    [rango, cuentaFiltro, categoriaFiltro]
  );

  const {
    data: movimientos,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMovimientos(filtros);
  const anularMovimiento = useAnularMovimiento();

  const cuentasPorId = useMemo(
    () => new Map((cuentas ?? []).map((cuenta) => [cuenta.id, cuenta])),
    [cuentas]
  );

  const categoriasPorId = useMemo(
    () => new Map((categorias ?? []).map((categoria) => [categoria.id, categoria])),
    [categorias]
  );

  // Para el selector de filtro: todas, separadas por tipo como en el catálogo.
  const categoriasDeGasto = (categorias ?? []).filter((categoria) => categoria.kind === "expense");
  const categoriasDeIngreso = (categorias ?? []).filter((categoria) => categoria.kind === "income");

  const grupos = useMemo(
    () => (movimientos ? agruparMovimientosPorDia(movimientos) : []),
    [movimientos]
  );

  const categoriaActiva = categorias?.find((categoria) => categoria.id === categoriaFiltro);

  function cambiarMes(nuevoMes: string) {
    const parametros = new URLSearchParams(searchParams.toString());
    parametros.set(PARAM_MES, nuevoMes);
    router.replace(`/movimientos?${parametros.toString()}`, { scroll: false });
  }

  // El filtro de categoría vive en la URL, igual que el mes: así el enlace de
  // una barra del Resumen y este selector son el mismo camino, y la pantalla se
  // puede recargar o compartir con el filtro puesto.
  function cambiarCategoria(nuevaCategoria: string) {
    const parametros = new URLSearchParams(searchParams.toString());
    if (nuevaCategoria === TODAS_LAS_CATEGORIAS) {
      parametros.delete(PARAM_CATEGORIA);
    } else {
      parametros.set(PARAM_CATEGORIA, nuevaCategoria);
    }
    router.replace(`/movimientos?${parametros.toString()}`, { scroll: false });
  }

  // Se combina DESPUÉS de agrupar por día, no antes: las dos patas de una
  // transferencia comparten la misma fecha, así que siempre caen en el mismo
  // grupo, y así el agrupamiento por fecha no se toca para nada.
  const gruposConTransferencias = useMemo(
    () =>
      grupos.map((grupo) => ({
        etiqueta: grupo.etiqueta,
        items: combinarTransferencias(grupo.items),
      })),
    [grupos]
  );

  function confirmarAnulacion() {
    if (!movimientoAConfirmar) return;
    anularMovimiento.mutate(movimientoAConfirmar.id, {
      onSuccess: () => {
        toast.success("Movimiento anulado.");
        setMovimientoAConfirmar(null);
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? error.message : "No se pudo anular. Intenta de nuevo."
        );
        setMovimientoAConfirmar(null);
      },
    });
  }

  const hayCuentas = Boolean(cuentas && cuentas.length > 0);
  const hayCategorias = (categorias?.length ?? 0) > 0;
  const esMesActual = mes === mesActual();

  return (
    <div className="flex flex-col gap-4">
      {/* Sin botón "Nuevo" aquí: registrar ya se alcanza desde cualquier
          pantalla con el botón del armazón. Uno solo, no dos caminos al mismo
          formulario. */}
      <h1 className="text-xl font-semibold">Movimientos</h1>

      <SelectorMes mes={mes} onCambiar={cambiarMes} />

      {(hayCuentas || hayCategorias) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {hayCuentas && (
            <div className="sm:flex-1">
              <Select
                value={cuentaFiltro}
                onValueChange={(valor) => setCuentaFiltro(valor ?? TODAS_LAS_CUENTAS)}
              >
                <SelectTrigger className="w-full" aria-label="Filtrar por cuenta">
                  {/* El popup de opciones vive en un portal que no está montado
                      mientras el selector está cerrado: hay que resolver el
                      nombre a mano, no asumir que lo encuentra solo. */}
                  <SelectValue>
                    {(valor: string) =>
                      valor === TODAS_LAS_CUENTAS
                        ? "Todas las cuentas"
                        : (cuentasPorId.get(valor)?.name ?? valor)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS_LAS_CUENTAS}>Todas las cuentas</SelectItem>
                  {cuentas!.map((cuenta) => (
                    <SelectItem key={cuenta.id} value={cuenta.id}>
                      {cuenta.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Mismo filtro que llega desde una barra del Resumen, pero a la
              mano: los dos escriben el mismo parámetro de la URL. */}
          {hayCategorias && (
            <div className="sm:flex-1">
              <Select
                value={categoriaFiltro ?? TODAS_LAS_CATEGORIAS}
                onValueChange={(valor) => cambiarCategoria(valor ?? TODAS_LAS_CATEGORIAS)}
              >
                <SelectTrigger className="w-full" aria-label="Filtrar por categoría">
                  {/* Igual que el de cuentas: el popup no está montado hasta
                      que se abre, así que el nombre se resuelve a mano. */}
                  <SelectValue>
                    {(valor: string) =>
                      valor === TODAS_LAS_CATEGORIAS
                        ? "Todas las categorías"
                        : (categoriasPorId.get(valor)?.name ?? valor)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS_LAS_CATEGORIAS}>Todas las categorías</SelectItem>
                  {categoriasDeGasto.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Gastos</SelectLabel>
                      {categoriasDeGasto.map((categoria) => (
                        <SelectItem key={categoria.id} value={categoria.id}>
                          {categoria.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {categoriasDeIngreso.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Ingresos</SelectLabel>
                      {categoriasDeIngreso.map((categoria) => (
                        <SelectItem key={categoria.id} value={categoria.id}>
                          {categoria.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      )}

      {!isLoading && movimientos?.length === 0 && categoriaFiltro && (
        <EmptyState
          Icono={Filter}
          titulo="Sin movimientos con ese filtro"
          descripcion={`No hay movimientos${
            categoriaActiva ? ` de ${categoriaActiva.name}` : ""
          } en ${etiquetaMes(mes)}.`}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cambiarCategoria(TODAS_LAS_CATEGORIAS)}
          >
            Quitar filtro
          </Button>
        </EmptyState>
      )}

      {!isLoading && movimientos?.length === 0 && !categoriaFiltro && (
        <EmptyState
          Icono={Receipt}
          titulo={
            esMesActual ? "Todavía no hay movimientos" : `Sin movimientos en ${etiquetaMes(mes)}`
          }
          descripcion={
            !hayCuentas
              ? "Crea primero una cuenta; los movimientos siempre pertenecen a una."
              : esMesActual
                ? "Registra el primer gasto o ingreso para empezar."
                : "Ese mes no quedó ningún movimiento registrado."
          }
        >
          {hayCuentas && (
            <FormularioMovimiento cuentas={cuentas!}>
              <Button size="sm" className="mt-1">
                <Plus data-icon="inline-start" />
                Registrar movimiento
              </Button>
            </FormularioMovimiento>
          )}
        </EmptyState>
      )}

      {!isLoading && gruposConTransferencias.length > 0 && (
        <div className="flex flex-col gap-4">
          {gruposConTransferencias.map((grupo) => (
            <div key={grupo.etiqueta} className="flex flex-col gap-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {grupo.etiqueta}
              </h2>
              <div className="flex flex-col divide-y divide-border">
                {grupo.items.map((item) =>
                  esTransferencia(item) ? (
                    <TransferenciaItem
                      key={item.transferGroupId}
                      par={item}
                      cuentaOrigen={cuentasPorId.get(item.salida.accountId)}
                      cuentaDestino={cuentasPorId.get(item.entrada.accountId)}
                    />
                  ) : (
                    <MovimientoItem
                      key={item.id}
                      movimiento={item}
                      cuenta={cuentasPorId.get(item.accountId)}
                      categoria={item.categoryId ? categoriasPorId.get(item.categoryId) : undefined}
                      mostrarCuenta={cuentaFiltro === TODAS_LAS_CUENTAS}
                      onSolicitarAnular={setMovimientoAConfirmar}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Al final del historial: o se puede traer la página siguiente, o ya
          se llegó al primer movimiento de todos. */}
      {!isLoading &&
        movimientos &&
        movimientos.length > 0 &&
        (hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            className="self-center"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Cargando…" : "Cargar más"}
          </Button>
        ) : (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Ese es el primer movimiento.
          </p>
        ))}

      <ConfirmarAnulacion
        movimiento={movimientoAConfirmar}
        procesando={anularMovimiento.isPending}
        onConfirmar={confirmarAnulacion}
        onCancelar={() => setMovimientoAConfirmar(null)}
      />
    </div>
  );
}

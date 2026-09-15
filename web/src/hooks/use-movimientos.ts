"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createTransaction,
  fetchTransactions,
  reverseTransaction,
  updateTransactionCategory,
} from "@/lib/api/transactions";
import type { FiltrosMovimientos, NuevoMovimiento } from "@/lib/api/types";
import { clavesCuentas } from "@/hooks/use-cuentas";
import { clavesReportes } from "@/hooks/use-reportes";

export const clavesMovimientos = {
  todas: () => ["movimientos"] as const,
  lista: (filtros: FiltrosMovimientos) => [...clavesMovimientos.todas(), filtros] as const,
};

/**
 * El historial, por páginas. La API pagina con cursor; aquí se van pidiendo y
 * acumulando, y `select` las aplana en una sola lista para que la pantalla no
 * tenga que saber de páginas. `hasNextPage` y `fetchNextPage` quedan para el
 * botón "Cargar más".
 */
export function useMovimientos(filtros: FiltrosMovimientos = {}) {
  return useInfiniteQuery({
    queryKey: clavesMovimientos.lista(filtros),
    queryFn: ({ pageParam }) => fetchTransactions({ ...filtros, cursor: pageParam ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.nextCursor ?? undefined,
    select: (resultado) => resultado.pages.flatMap((pagina) => pagina.data),
  });
}

function invalidarTrasEscritura(queryClient: ReturnType<typeof useQueryClient>) {
  // Un movimiento nuevo (o su anulación) cambia el saldo de la cuenta y lo que
  // muestra el dashboard: invalidamos los tres catálogos.
  queryClient.invalidateQueries({ queryKey: clavesMovimientos.todas() });
  queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
  queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
}

export function useCrearMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevoMovimiento) => createTransaction(input),
    onSuccess: () => invalidarTrasEscritura(queryClient),
  });
}

export function useAnularMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reverseTransaction(id),
    onSuccess: () => invalidarTrasEscritura(queryClient),
  });
}

export function useActualizarCategoriaMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      updateTransactionCategory(id, categoryId),
    onSuccess: () => {
      // No cambia el saldo, pero sí el desglose por categoría del dashboard.
      queryClient.invalidateQueries({ queryKey: clavesMovimientos.todas() });
      queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
    },
  });
}

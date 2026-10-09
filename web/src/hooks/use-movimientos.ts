"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createTransaction,
  createSplitPayment,
  createTransfer,
  fetchTransactions,
  reverseSplitPayment,
  reverseTransaction,
  updateTransactionBudgetItem,
  updateTransactionCategory,
} from "@/lib/api/transactions";
import type {
  FiltrosMovimientos,
  NuevaTransferencia,
  NuevoMovimiento,
  NuevoPagoDividido,
} from "@/lib/api/types";
import { clavesCuentas } from "@/hooks/use-cuentas";
import { clavesPresupuesto } from "@/hooks/use-presupuesto";
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
  // Un movimiento nuevo (o su anulación) cambia el saldo de la cuenta, lo que
  // muestra el dashboard y el progreso del checklist de presupuesto: se
  // invalidan los cuatro catálogos.
  queryClient.invalidateQueries({ queryKey: clavesMovimientos.todas() });
  queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
  queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
  queryClient.invalidateQueries({ queryKey: clavesPresupuesto.todas() });
}

export function useCrearMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevoMovimiento) => createTransaction(input),
    onSuccess: () => invalidarTrasEscritura(queryClient),
  });
}

export function useCrearTransferencia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevaTransferencia) => createTransfer(input),
    // Cambia el saldo de las dos cuentas a la vez: se invalida igual que un
    // movimiento normal.
    onSuccess: () => invalidarTrasEscritura(queryClient),
  });
}

export function useCrearPagoDividido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevoPagoDividido) => createSplitPayment(input),
    // Cambia el saldo de las dos cuentas y cuenta la compra entera en el
    // presupuesto: se invalida igual que un movimiento normal.
    onSuccess: () => invalidarTrasEscritura(queryClient),
  });
}

/** Anula las dos partes de una compra pagada con dos cuentas, juntas. */
export function useAnularPagoDividido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentGroupId: string) => reverseSplitPayment(paymentGroupId),
    // También si falla: un 409 ("ya está anulada", p. ej. desde otro aparato)
    // deja la fila desactualizada hasta recargar, y es justo lo que hay que
    // refrescar.
    onSettled: () => invalidarTrasEscritura(queryClient),
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
      // No cambia el saldo, pero sí el desglose por categoría del dashboard y
      // el progreso de un ítem del checklist que apunte a esa categoría.
      queryClient.invalidateQueries({ queryKey: clavesMovimientos.todas() });
      queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
      queryClient.invalidateQueries({ queryKey: clavesPresupuesto.todas() });
    },
  });
}

export function useActualizarItemMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, budgetItemId }: { id: string; budgetItemId: string | null }) =>
      updateTransactionBudgetItem(id, budgetItemId),
    onSuccess: () => {
      // No cambia saldos ni categorías: solo a qué item del checklist cuenta
      // el movimiento. Se refrescan la lista y las consultas de presupuesto.
      queryClient.invalidateQueries({ queryKey: clavesMovimientos.todas() });
      queryClient.invalidateQueries({ queryKey: clavesPresupuesto.todas() });
    },
  });
}

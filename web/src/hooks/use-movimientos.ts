"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTransaction, fetchTransactions, reverseTransaction } from "@/lib/api/transactions";
import type { FiltrosMovimientos, NuevoMovimiento } from "@/lib/api/types";
import { clavesCuentas } from "@/hooks/use-cuentas";

export const clavesMovimientos = {
  todas: () => ["movimientos"] as const,
  lista: (filtros: FiltrosMovimientos) => [...clavesMovimientos.todas(), filtros] as const,
};

export function useMovimientos(filtros: FiltrosMovimientos = {}) {
  return useQuery({
    queryKey: clavesMovimientos.lista(filtros),
    queryFn: () => fetchTransactions(filtros),
    select: (respuesta) => respuesta.data,
  });
}

function invalidarTrasEscritura(queryClient: ReturnType<typeof useQueryClient>) {
  // Un movimiento nuevo (o su anulación) cambia el saldo de la cuenta:
  // invalidamos ambos catálogos.
  queryClient.invalidateQueries({ queryKey: clavesMovimientos.todas() });
  queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
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

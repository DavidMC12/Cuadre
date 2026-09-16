"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createAccount, fetchAccounts, updateAccountSavings } from "@/lib/api/accounts";
import type { NuevaCuenta } from "@/lib/api/types";
import { clavesReportes } from "@/hooks/use-reportes";

export const clavesCuentas = {
  todas: () => ["cuentas"] as const,
  lista: (includeArchived: boolean) => [...clavesCuentas.todas(), { includeArchived }] as const,
};

export function useCuentas(includeArchived = false) {
  return useQuery({
    queryKey: clavesCuentas.lista(includeArchived),
    queryFn: () => fetchAccounts(includeArchived),
    select: (respuesta) => respuesta.data,
  });
}

export function useCrearCuenta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevaCuenta) => createAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
    },
  });
}

export function useMarcarAhorro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isSavings }: { id: string; isSavings: boolean }) =>
      updateAccountSavings(id, isSavings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
      // Qué cuenta es de ahorro cambia la tendencia de ahorro del dashboard:
      // sin esto, el Resumen seguiría mostrando la gráfica vieja.
      queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
    },
  });
}

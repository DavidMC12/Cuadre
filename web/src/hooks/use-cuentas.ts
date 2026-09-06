"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createAccount, fetchAccounts } from "@/lib/api/accounts";
import type { NuevaCuenta } from "@/lib/api/types";

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

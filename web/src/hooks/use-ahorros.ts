"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createSavingsEntry, fetchSavingsEntries } from "@/lib/api/savings";
import type { NuevoRegistroAhorro } from "@/lib/api/types";
import { clavesCuentas } from "@/hooks/use-cuentas";
import { clavesPresupuesto } from "@/hooks/use-presupuesto";
import { clavesReportes } from "@/hooks/use-reportes";

export const clavesAhorro = {
  todas: () => ["ahorros"] as const,
  registros: (accountId: string, limit: number) =>
    [...clavesAhorro.todas(), "registros", { accountId, limit }] as const,
};

/**
 * Los últimos registros de ahorro de una cuenta, del más reciente al más
 * viejo. Con `accountId: null` no se pide nada: a ninguna cuenta no le
 * corresponden registros, y el cajón lo usa para no traer la lista de una
 * cuenta cerrada.
 */
export function useSavingsEntries(params: { accountId: string | null; limit?: number }) {
  const limit = params.limit ?? 50;
  return useQuery({
    queryKey: clavesAhorro.registros(params.accountId ?? "", limit),
    queryFn: () => fetchSavingsEntries({ accountId: params.accountId ?? "", limit }),
    select: (respuesta) => respuesta.data,
    enabled: Boolean(params.accountId),
  });
}

/**
 * Anotar ahorro explicito no mueve plata: el saldo de la cuenta queda igual
 * y los movimientos no cambian. Lo que sí cambia es lo AHORRADO de la
 * cuenta, el total mostrado, la tendencia de ahorro y los ítems de ahorro
 * del checklist del mes. Por eso aquí se releen las cuentas, los reportes,
 * el presupuesto y la propia lista de registros — y no los movimientos.
 */
export function useCrearRegistroAhorro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevoRegistroAhorro) => createSavingsEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
      queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
      queryClient.invalidateQueries({ queryKey: clavesPresupuesto.todas() });
      queryClient.invalidateQueries({ queryKey: clavesAhorro.todas() });
    },
  });
}

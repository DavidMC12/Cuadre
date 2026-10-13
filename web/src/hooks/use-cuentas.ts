"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  adjustAccountBalance,
  archiveAccount,
  createAccount,
  fetchAccounts,
  unarchiveAccount,
  updateAccount,
  updateAccountSavings,
} from "@/lib/api/accounts";
import type { CambiosDeCuenta, NuevaCuenta } from "@/lib/api/types";
import { clavesMovimientos } from "@/hooks/use-movimientos";
import { clavesPresupuesto } from "@/hooks/use-presupuesto";
import { clavesReportes } from "@/hooks/use-reportes";

export const clavesCuentas = {
  todas: () => ["cuentas"] as const,
  /**
   * La llave incluye el mes: las invalidaciones por prefijo
   * (`clavesCuentas.todas()`) alcanzan a todas las listas — la de hoy y las
   * de cualquier cierre — porque todas cuelgan de ["cuentas"].
   */
  lista: (includeArchived: boolean, mes?: string) =>
    [...clavesCuentas.todas(), { includeArchived, mes: mes ?? null }] as const,
};

/**
 * Sin `mes`: la lista de hoy, la misma consulta que comparten las demás
 * pantallas. Con `mes` ("YYYY-MM"): la lista cortada al cierre de ese mes —
 * una consulta aparte con su propia caché, porque el saldo de otro mes NO
 * sirve de sustituto del de este.
 */
export function useCuentas(includeArchived = false, mes?: string) {
  return useQuery({
    queryKey: clavesCuentas.lista(includeArchived, mes),
    queryFn: () => fetchAccounts(includeArchived, mes),
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

/**
 * Editar una cuenta: nombre, cupo y cuenta vinculada. El saldo nunca entra
 * aquí — se deriva de los movimientos, y el servidor ni siquiera lo acepta.
 */
export function useActualizarCuenta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: CambiosDeCuenta }) =>
      updateAccount(id, cambios),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
    },
  });
}

/**
 * Archivar es el "eliminar" seguro: la cuenta se esconde, deja de recibir
 * movimientos nuevos y su historia sigue contando en los reportes del pasado.
 * Nunca se borra. Cambia qué cuentas están activas, así que se releen los
 * catálogos que las usan (cuentas, reportes y presupuesto).
 */
function invalidarTrasArchivar(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
  queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
  queryClient.invalidateQueries({ queryKey: clavesPresupuesto.todas() });
}

export function useArchivarCuenta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveAccount(id),
    onSuccess: () => invalidarTrasArchivar(queryClient),
  });
}

export function useDesarchivarCuenta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveAccount(id),
    onSuccess: () => invalidarTrasArchivar(queryClient),
  });
}

/**
 * Ajustar el saldo (o la deuda, en una tarjeta) no "edita" el saldo — que no
 * se guarda, se calcula —: registra el movimiento kind "adjustment" que lo
 * empareja con la realidad del banco. Un ajuste no cuenta como gasto ni
 * ingreso (lo garantiza el servidor), así que el presupuesto queda intacto;
 * sí cambian el saldo de la cuenta, el historial y el Resumen.
 */
export function useAjustarSaldo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, balance }: { id: string; balance: string }) =>
      adjustAccountBalance(id, balance),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clavesCuentas.todas() });
      queryClient.invalidateQueries({ queryKey: clavesMovimientos.todas() });
      queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
    },
  });
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveBudgetItem,
  createBudgetItem,
  fetchBudgetChecklist,
  fetchBudgetItems,
  unarchiveBudgetItem,
  updateBudgetItemLabel,
  updateBudgetItemTarget,
} from "@/lib/api/budgets";
import type { NuevoItemPresupuesto } from "@/lib/api/types";
export const clavesPresupuesto = {
  todas: () => ["presupuesto"] as const,
  lista: (includeArchived: boolean) =>
    [...clavesPresupuesto.todas(), "items", { includeArchived }] as const,
  checklist: (params: { month: string; currency: string }) =>
    [...clavesPresupuesto.todas(), "checklist", params] as const,
};

export function usePresupuestoItems(includeArchived = false) {
  return useQuery({
    queryKey: clavesPresupuesto.lista(includeArchived),
    queryFn: () => fetchBudgetItems(includeArchived),
    select: (respuesta) => respuesta.data,
  });
}

export function useChecklistDelMes(params: { month: string; currency: string }) {
  return useQuery({
    queryKey: clavesPresupuesto.checklist(params),
    queryFn: () => fetchBudgetChecklist(params),
    select: (respuesta) => respuesta.data,
    enabled: Boolean(params.currency),
  });
}

function invalidarPresupuesto(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: clavesPresupuesto.todas() });
}

export function useCrearItemPresupuesto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevoItemPresupuesto) => createBudgetItem(input),
    onSuccess: () => invalidarPresupuesto(queryClient),
  });
}

export function useFijarMontoDelMes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, month }: { id: string; amount: string; month: string }) =>
      updateBudgetItemTarget(id, amount, month),
    // Fijar un mes toca lo menos dos: ESE mes y el siguiente, que parte
    // anclado con el monto anterior. Invalidar el checklist completo (todos
    // los meses) deja ver fresco cualquier mes que algo de esto toque.
    onSuccess: () => invalidarPresupuesto(queryClient),
  });
}

export function useEditarEtiquetaItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string | null }) =>
      updateBudgetItemLabel(id, label),
    onSuccess: () => invalidarPresupuesto(queryClient),
  });
}

export function useArchivarItemPresupuesto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveBudgetItem(id),
    onSuccess: () => invalidarPresupuesto(queryClient),
  });
}

export function useDesarchivarItemPresupuesto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveBudgetItem(id),
    onSuccess: () => invalidarPresupuesto(queryClient),
  });
}

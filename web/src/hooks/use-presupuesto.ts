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

export function useCambiarObjetivo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      updateBudgetItemTarget(id, amount),
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

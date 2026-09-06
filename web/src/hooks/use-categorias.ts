"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveCategory,
  createCategory,
  fetchCategories,
  renameCategory,
  unarchiveCategory,
} from "@/lib/api/categories";
import type { NuevaCategoria } from "@/lib/api/types";
import { clavesReportes } from "@/hooks/use-reportes";

export const clavesCategorias = {
  todas: () => ["categorias"] as const,
  lista: (includeArchived: boolean) => [...clavesCategorias.todas(), { includeArchived }] as const,
};

export function useCategorias(includeArchived = false) {
  return useQuery({
    queryKey: clavesCategorias.lista(includeArchived),
    queryFn: () => fetchCategories(includeArchived),
    select: (respuesta) => respuesta.data,
  });
}

function invalidarCategorias(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: clavesCategorias.todas() });
  // Un nombre nuevo o una categoría que se archiva cambian lo que muestra el
  // desglose del dashboard.
  queryClient.invalidateQueries({ queryKey: clavesReportes.todas() });
}

export function useCrearCategoria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NuevaCategoria) => createCategory(input),
    onSuccess: () => invalidarCategorias(queryClient),
  });
}

export function useRenombrarCategoria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCategory(id, name),
    onSuccess: () => invalidarCategorias(queryClient),
  });
}

export function useArchivarCategoria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveCategory(id),
    onSuccess: () => invalidarCategorias(queryClient),
  });
}

export function useDesarchivarCategoria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveCategory(id),
    onSuccess: () => invalidarCategorias(queryClient),
  });
}

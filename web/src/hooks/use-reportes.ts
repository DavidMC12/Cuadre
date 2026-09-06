"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchByCategory, fetchCurrencies, fetchSummary, fetchTrend } from "@/lib/api/reports";
import type { TipoCategoria } from "@/lib/api/types";

export const clavesReportes = {
  todas: () => ["reportes"] as const,
  monedas: () => [...clavesReportes.todas(), "monedas"] as const,
  resumen: (params: { month: string; currency: string }) =>
    [...clavesReportes.todas(), "resumen", params] as const,
  porCategoria: (params: { month: string; currency: string; kind: TipoCategoria }) =>
    [...clavesReportes.todas(), "por-categoria", params] as const,
  tendencia: (params: { months: number; currency: string }) =>
    [...clavesReportes.todas(), "tendencia", params] as const,
};

/** Solo se muestra un selector de moneda si el usuario tiene más de una. */
export function useMonedas() {
  return useQuery({
    queryKey: clavesReportes.monedas(),
    queryFn: () => fetchCurrencies(),
    select: (respuesta) => respuesta.data,
  });
}

export function useResumenMes(params: { month: string; currency: string }) {
  return useQuery({
    queryKey: clavesReportes.resumen(params),
    queryFn: () => fetchSummary(params),
    select: (respuesta) => respuesta.data,
    enabled: Boolean(params.currency),
  });
}

export function usePorCategoria(params: { month: string; currency: string; kind: TipoCategoria }) {
  return useQuery({
    queryKey: clavesReportes.porCategoria(params),
    queryFn: () => fetchByCategory(params),
    select: (respuesta) => respuesta.data,
    enabled: Boolean(params.currency),
  });
}

export function useTendencia(params: { months?: number; currency: string }) {
  const months = params.months ?? 6;
  return useQuery({
    queryKey: clavesReportes.tendencia({ months, currency: params.currency }),
    queryFn: () => fetchTrend({ months, currency: params.currency }),
    select: (respuesta) => respuesta.data,
    enabled: Boolean(params.currency),
  });
}

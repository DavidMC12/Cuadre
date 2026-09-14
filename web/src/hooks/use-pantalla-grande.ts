"use client";

import { useSyncExternalStore } from "react";

import { CONSULTA_TRAMO_LG } from "@/lib/layout";

function suscribir(alCambiar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_TRAMO_LG);
  consulta.addEventListener("change", alCambiar);
  return () => consulta.removeEventListener("change", alCambiar);
}

function valorActual(): boolean {
  return window.matchMedia(CONSULTA_TRAMO_LG).matches;
}

/**
 * `true` cuando la pantalla está en el tramo `lg` (1024px) o más ancha.
 *
 * Hay cosas que una clase de Tailwind no puede decidir —por ejemplo, si el
 * formulario de registrar se monta como cajón inferior o como diálogo— y
 * para esas está este hook. En el servidor y en el primer pintado vale
 * `false` (celular), y al despertar React se corrige solo si hace falta: el
 * HTML nunca llega con el contenedor equivocado.
 */
export function usePantallaGrande(): boolean {
  return useSyncExternalStore(suscribir, valorActual, () => false);
}

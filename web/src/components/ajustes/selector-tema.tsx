"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const TEMAS = [
  { valor: "light", etiqueta: "Claro" },
  { valor: "dark", etiqueta: "Oscuro" },
  { valor: "system", etiqueta: "Automático" },
] as const;

/** Nunca cambia, así que no hay a qué suscribirse. */
const noEscuchar = () => () => {};

/**
 * `false` mientras la pantalla la arma el servidor, `true` cuando el navegador
 * ya tomó el control.
 *
 * El tema vive en este aparato, así que el servidor no puede saber cuál está
 * elegido. Si se pintara uno a ciegas, al llegar el navegador cambiaría solo y
 * se vería el salto.
 */
function useYaEnElNavegador(): boolean {
  return useSyncExternalStore(
    noEscuchar,
    () => true,
    () => false
  );
}

export function SelectorTema() {
  const { theme, setTheme } = useTheme();
  const yaEnElNavegador = useYaEnElNavegador();

  if (!yaEnElNavegador) return <Skeleton className="h-9 w-full rounded-lg" />;

  return (
    <ToggleGroup
      value={[theme ?? "system"]}
      onValueChange={(valores) => {
        if (valores.length > 0) setTheme(valores[0]!);
      }}
      variant="outline"
      className="w-full"
    >
      {TEMAS.map(({ valor, etiqueta }) => (
        <ToggleGroupItem key={valor} value={valor} className="flex-1">
          {etiqueta}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

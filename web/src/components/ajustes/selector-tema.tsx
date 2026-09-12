"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const TEMAS = [
  { valor: "light", etiqueta: "Claro" },
  { valor: "dark", etiqueta: "Oscuro" },
  { valor: "system", etiqueta: "Automático" },
] as const;

export function SelectorTema() {
  const { theme, setTheme } = useTheme();

  // En el servidor no se sabe qué tema tiene este aparato, así que hasta que el
  // navegador no despierta no se puede pintar cuál está elegido. Sin esta
  // espera, React pinta uno y luego lo cambia, y se ve el salto.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  if (!montado) return <Skeleton className="h-9 w-full rounded-lg" />;

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

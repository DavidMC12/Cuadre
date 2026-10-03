"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { etiquetaMes, mesActual, sumarMeses } from "@/lib/fecha";

export function SelectorMes({
  mes,
  onCambiar,
}: {
  mes: string;
  onCambiar: (mes: string) => void;
}) {
  const esMesActual = mes === mesActual();

  return (
    <div className="flex items-center justify-between">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        // Piso de toque de 44px (el icono sigue en 28px de dibujo): la
        // flecha es un control que se toca con el dedo.
        className="min-h-11 min-w-11"
        onClick={() => onCambiar(sumarMeses(mes, -1))}
        aria-label="Mes anterior"
      >
        <ChevronLeft />
      </Button>
      <span className="text-sm font-medium">{etiquetaMes(mes)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="min-h-11 min-w-11"
        onClick={() => onCambiar(sumarMeses(mes, 1))}
        disabled={esMesActual}
        aria-label="Mes siguiente"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

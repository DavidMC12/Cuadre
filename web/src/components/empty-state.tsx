import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  Icono,
  titulo,
  descripcion,
  children,
  className,
  tituloComo,
}: {
  Icono: LucideIcon;
  titulo: string;
  descripcion: string;
  children?: React.ReactNode;
  className?: string;
  /** Con qué elemento se pinta el título del estado vacío. Por defecto queda
   * `<p>` (como siempre); cuando el título es el encabezado real de la sección
   * o la lista que quedó vacía, se pasa `tituloComo="h2"` (o el nivel que
   * toque) para que un lector de pantalla lo navegue. Las clases son las
   * mismas en ambos casos: nada cambia a la vista. */
  tituloComo?: "h2" | "h3" | "h4";
}) {
  const Titulo = tituloComo ?? "p";
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icono className="size-6 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <Titulo className="text-sm font-medium">{titulo}</Titulo>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {children}
    </div>
  );
}

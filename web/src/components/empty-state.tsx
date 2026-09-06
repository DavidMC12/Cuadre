import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  Icono,
  titulo,
  descripcion,
  children,
  className,
}: {
  Icono: LucideIcon;
  titulo: string;
  descripcion: string;
  children?: React.ReactNode;
  className?: string;
}) {
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
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {children}
    </div>
  );
}

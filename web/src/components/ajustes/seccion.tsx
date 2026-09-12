import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Un grupo de ajustes con su título. Toda la pantalla se arma con esto y con
 * `Fila`, para que dos ajustes distintos nunca se vean distinto sin motivo.
 */
export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h2>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {children}
      </div>
    </section>
  );
}

interface FilaProps {
  etiqueta: string;
  /** Una línea corta debajo del nombre. Solo cuando de verdad aclara algo. */
  ayuda?: string;
  /** El control de la derecha: un botón, un interruptor, un texto. */
  children?: React.ReactNode;
  /** Cuando el control es ancho, se baja a su propio renglón. */
  apilado?: boolean;
}

export function Fila({ etiqueta, ayuda, children, apilado = false }: FilaProps) {
  return (
    <div
      className={cn(
        "flex gap-3 px-3 py-3",
        apilado ? "flex-col items-stretch" : "items-center justify-between"
      )}
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{etiqueta}</span>
        {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
      </div>
      {children}
    </div>
  );
}

/** Una fila que lleva a otra pantalla. */
export function FilaEnlace({
  etiqueta,
  ayuda,
  href,
}: {
  etiqueta: string;
  ayuda?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-accent"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{etiqueta}</span>
        {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** El valor de un ajuste que no se puede cambiar desde aquí. */
export function ValorFijo({ children }: { children: React.ReactNode }) {
  return <span className="truncate text-sm text-muted-foreground">{children}</span>;
}

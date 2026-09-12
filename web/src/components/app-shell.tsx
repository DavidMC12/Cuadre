"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, ChartPie, Settings, Wallet } from "lucide-react";

import { BannerSuplantacion } from "@/components/admin/banner-suplantacion";
import { ANCHO_CONTENIDO } from "@/lib/layout";
import { cn } from "@/lib/utils";

const ELEMENTOS_NAV = [
  { href: "/", etiqueta: "Resumen", Icono: ChartPie, hijas: [] },
  { href: "/cuentas", etiqueta: "Cuentas", Icono: Wallet, hijas: [] },
  { href: "/movimientos", etiqueta: "Movimientos", Icono: ArrowLeftRight, hijas: [] },
  // Categorías y el panel de administración se abren desde Ajustes, así que
  // estando ahí el menú tiene que seguir diciendo dónde está uno.
  { href: "/ajustes", etiqueta: "Ajustes", Icono: Settings, hijas: ["/categorias", "/admin"] },
] as const;

const RUTAS_SIN_SESION = ["/entrar", "/registrarse"];

function estaActivo(pathname: string | null, href: string, hijas: readonly string[]): boolean {
  if (!pathname) return false;
  return [href, ...hijas].some((ruta) =>
    ruta === "/" ? pathname === "/" : pathname === ruta || pathname.startsWith(`${ruta}/`)
  );
}

/**
 * Un solo armazón para los dos tamaños.
 *
 * En el celular: encabezado arriba y menú abajo, al alcance del pulgar. En
 * escritorio (desde el tramo `md`): menú a la izquierda y contenido más
 * ancho. Los estilos base son los del celular y los tramos solo suman hacia
 * arriba, así que en una pantalla chica todo queda exactamente como estaba.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sinSesion = RUTAS_SIN_SESION.includes(pathname ?? "");

  if (sinSesion) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="mx-auto flex h-12 w-full max-w-md items-center px-4">
            <span className="font-heading text-base font-semibold">Cuadre</span>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4 pb-4">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        aria-label="Navegación principal"
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-border bg-background px-3 py-5 md:flex lg:w-60"
      >
        <span className="px-3 pb-5 font-heading text-lg font-semibold">Cuadre</span>
        {ELEMENTOS_NAV.map(({ href, etiqueta, Icono, hijas }) => {
          const activo = estaActivo(pathname, href, hijas);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activo
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
              aria-current={activo ? "page" : undefined}
            >
              <Icono
                className={cn("size-4.5", activo && "text-primary")}
                strokeWidth={activo ? 2.5 : 2}
              />
              {etiqueta}
            </Link>
          );
        })}
      </aside>

      {/* El aviso de suplantación va dentro de esta columna y no encima de todo:
          así en escritorio no tapa el menú lateral al hacer scroll. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <BannerSuplantacion />

        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
          <div className="mx-auto flex h-12 w-full max-w-md items-center px-4">
            <span className="font-heading text-base font-semibold">Cuadre</span>
          </div>
        </header>

        <main
          className={cn(
            "mx-auto w-full flex-1 px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-10",
            ANCHO_CONTENIDO
          )}
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="mx-auto flex h-16 w-full max-w-md items-stretch">
          {ELEMENTOS_NAV.map(({ href, etiqueta, Icono, hijas }) => {
            const activo = estaActivo(pathname, href, hijas);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  activo ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={activo ? "page" : undefined}
              >
                <Icono
                  className={cn("size-5", activo && "text-primary")}
                  strokeWidth={activo ? 2.5 : 2}
                />
                {etiqueta}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

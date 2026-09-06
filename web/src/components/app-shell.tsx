"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

const ELEMENTOS_NAV = [
  { href: "/cuentas", etiqueta: "Cuentas", Icono: Wallet },
  { href: "/movimientos", etiqueta: "Movimientos", Icono: ArrowLeftRight },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex h-12 w-full max-w-md items-center px-4">
          <span className="font-heading text-base font-semibold">Cuadre</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-24">{children}</main>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex h-16 w-full max-w-md items-stretch">
          {ELEMENTOS_NAV.map(({ href, etiqueta, Icono }) => {
            const activo = pathname === href || pathname?.startsWith(`${href}/`);
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
                <Icono className={cn("size-5", activo && "text-primary")} strokeWidth={activo ? 2.5 : 2} />
                {etiqueta}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

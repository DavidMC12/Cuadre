"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function BotonSalir() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function manejarClic() {
    setSaliendo(true);
    try {
      await authClient.signOut();
    } catch {
      // Si la llamada falla, igual se manda a /entrar: la sesión local ya
      // se limpió y, si en el servidor sigue viva, esa pantalla misma
      // redirige de vuelta al tablero.
    } finally {
      router.push("/entrar");
      router.refresh();
    }
  }

  return (
    <Button
      variant="outline"
      onClick={manejarClic}
      disabled={saliendo}
      className="w-full text-destructive"
    >
      <LogOut data-icon="inline-start" />
      {saliendo ? "Saliendo…" : "Cerrar sesión"}
    </Button>
  );
}

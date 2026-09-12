"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGuardarPerfil, useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";

export function EditarNombre({
  nombreActual,
  children,
}: {
  nombreActual: string;
  children: React.ReactNode;
}) {
  const soloMirar = useSoloMirar();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(nombreActual);
  const [error, setError] = useState<string | null>(null);

  const guardar = useGuardarPerfil();

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const limpio = nombre.trim();
    if (!limpio) {
      setError("Escribe cómo quieres que te llamemos.");
      return;
    }

    setError(null);
    guardar.mutate(
      { displayName: limpio },
      {
        onSuccess: () => {
          toast.success("Listo, ya te llamamos así.");
          setAbierto(false);
        },
        onError: (fallo) => {
          toast.error(
            fallo instanceof ApiError
              ? fallo.message
              : "No se pudo guardar el nombre. Intenta de nuevo."
          );
        },
      }
    );
  }

  // El nombre de otra persona no se le cambia desde su propia cuenta.
  if (soloMirar) return <span className="text-sm text-muted-foreground">{nombreActual}</span>;

  return (
    <Drawer
      open={abierto}
      onOpenChange={(valor) => {
        setAbierto(valor);
        // Al cerrar sin guardar, el campo vuelve a lo que de verdad está
        // guardado: si no, la próxima vez se abriría con el texto a medias.
        if (!valor) {
          setNombre(nombreActual);
          setError(null);
        }
      }}
    >
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <form onSubmit={manejarEnvio} className="flex min-h-0 flex-1 flex-col">
          <DrawerHeader>
            <DrawerTitle>Tu nombre</DrawerTitle>
            <DrawerDescription>Es como te saluda la app. Nadie más lo ve.</DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-1.5 px-4 py-4">
            <Label htmlFor="nombre-perfil">Nombre</Label>
            <Input
              id="nombre-perfil"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              aria-invalid={Boolean(error)}
              maxLength={100}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

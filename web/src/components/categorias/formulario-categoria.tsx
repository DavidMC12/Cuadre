"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCrearCategoria } from "@/hooks/use-categorias";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { TipoCategoria } from "@/lib/api/types";
import { ETIQUETA_TIPO_CATEGORIA } from "@/lib/labels";

const TIPOS: TipoCategoria[] = ["expense", "income"];

export function FormularioCategoria({ children }: { children: React.ReactNode }) {
  const soloMirar = useSoloMirar();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCategoria>("expense");
  const [error, setError] = useState<string | undefined>(undefined);

  const crearCategoria = useCrearCategoria();

  function reiniciar() {
    setNombre("");
    setTipo("expense");
    setError(undefined);
  }

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (!nombre.trim()) {
      setError("Ponle un nombre a la categoría.");
      return;
    }
    setError(undefined);

    crearCategoria.mutate(
      { name: nombre.trim(), kind: tipo },
      {
        onSuccess: () => {
          toast.success("Categoría creada.");
          setAbierto(false);
          reiniciar();
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            setError(error.message);
          } else {
            toast.error("No se pudo crear la categoría. Intenta de nuevo.");
          }
        },
      }
    );
  }

  // Quien está mirando la cuenta de otra persona no ve el botón siquiera: el
  // servidor rechazaría la escritura de todos modos.
  if (soloMirar) return null;

  return (
    <Drawer
      open={abierto}
      onOpenChange={(valor) => {
        setAbierto(valor);
        if (!valor) reiniciar();
      }}
    >
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <form onSubmit={manejarEnvio} className="flex min-h-0 flex-1 flex-col">
          <DrawerHeader>
            <DrawerTitle>Nueva categoría</DrawerTitle>
            <DrawerDescription>Para clasificar tus gastos o tus ingresos.</DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nombre-categoria">Nombre</Label>
              <Input
                id="nombre-categoria"
                placeholder="Ej. Mercado"
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                aria-invalid={Boolean(error)}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <ToggleGroup
                value={[tipo]}
                onValueChange={(valores) => {
                  if (valores.length > 0) setTipo(valores[0] as TipoCategoria);
                }}
                variant="outline"
                className="w-full"
              >
                {TIPOS.map((valor) => (
                  <ToggleGroupItem key={valor} value={valor} className="flex-1">
                    {ETIQUETA_TIPO_CATEGORIA[valor]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                No se puede cambiar después: si te equivocas, archívala y crea otra.
              </p>
            </div>
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={crearCategoria.isPending}>
              {crearCategoria.isPending ? "Creando…" : "Crear categoría"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

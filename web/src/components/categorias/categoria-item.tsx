"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";

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
import {
  useArchivarCategoria,
  useDesarchivarCategoria,
  useRenombrarCategoria,
} from "@/hooks/use-categorias";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Categoria } from "@/lib/api/types";

function RenombrarCategoria({
  categoria,
  children,
}: {
  categoria: Categoria;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(categoria.name);
  const [error, setError] = useState<string | undefined>(undefined);

  const renombrarCategoria = useRenombrarCategoria();

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (!nombre.trim()) {
      setError("Ponle un nombre a la categoría.");
      return;
    }
    setError(undefined);

    if (nombre.trim() === categoria.name) {
      setAbierto(false);
      return;
    }

    renombrarCategoria.mutate(
      { id: categoria.id, name: nombre.trim() },
      {
        onSuccess: () => {
          toast.success("Categoría renombrada.");
          setAbierto(false);
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            setError(error.message);
          } else {
            toast.error("No se pudo renombrar. Intenta de nuevo.");
          }
        },
      }
    );
  }

  return (
    <Drawer
      open={abierto}
      onOpenChange={(valor) => {
        setAbierto(valor);
        if (valor) {
          setNombre(categoria.name);
          setError(undefined);
        }
      }}
    >
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <form onSubmit={manejarEnvio} className="flex min-h-0 flex-1 flex-col">
          <DrawerHeader>
            <DrawerTitle>Renombrar categoría</DrawerTitle>
            <DrawerDescription>El tipo (gasto o ingreso) no se puede cambiar.</DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-1.5 px-4 py-4">
            <Label htmlFor="nombre-categoria-editar">Nombre</Label>
            <Input
              id="nombre-categoria-editar"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              aria-invalid={Boolean(error)}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={renombrarCategoria.isPending}>
              {renombrarCategoria.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function CategoriaItem({ categoria }: { categoria: Categoria }) {
  const soloMirar = useSoloMirar();
  const archivada = categoria.archivedAt !== null;

  const archivarCategoria = useArchivarCategoria();
  const desarchivarCategoria = useDesarchivarCategoria();
  const enProceso = archivarCategoria.isPending || desarchivarCategoria.isPending;

  function alternarArchivo() {
    const mutacion = archivada ? desarchivarCategoria : archivarCategoria;
    mutacion.mutate(categoria.id, {
      onSuccess: () => {
        toast.success(archivada ? "Categoría restaurada." : "Categoría archivada.");
      },
      onError: (error) => {
        toast.error(error instanceof ApiError ? error.message : "No se pudo actualizar.");
      },
    });
  }

  // Desde la cuenta de otra persona, la categoría se lee y nada más: renombrar
  // y archivar escriben, y el servidor los rechazaría.
  if (soloMirar) {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="min-w-0 flex-1 truncate text-sm">{categoria.name}</span>
        {archivada && <span className="text-xs text-muted-foreground">Archivada</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 py-2">
      <RenombrarCategoria categoria={categoria}>
        {/* El lápiz es lo que dice "esto se toca para renombrar": el nombre
            solo, sin ningún ícono ni subrayado, no se leía como un control. */}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-muted-foreground hover:text-foreground"
        >
          <span className="truncate text-foreground">{categoria.name}</span>
          <Pencil className="size-3 shrink-0 opacity-60" />
        </button>
      </RenombrarCategoria>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        // Más grande y más lejos del nombre que se toca para renombrar: era
        // fácil archivar por error al querer renombrar (o al revés).
        className="h-10 shrink-0 px-3"
        onClick={alternarArchivo}
        disabled={enProceso}
      >
        {archivada ? (
          <ArchiveRestore data-icon="inline-start" />
        ) : (
          <Archive data-icon="inline-start" />
        )}
        {archivada ? "Restaurar" : "Archivar"}
      </Button>
    </div>
  );
}

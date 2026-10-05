"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { UsuarioDelSistema } from "@/hooks/use-admin";

/**
 * Confirmación antes de entrar a la cuenta de otra persona.
 *
 * Entrar a la cuenta de alguien es una acción de peso: desde ahí solo se
 * mira, y la entrada queda registrada. Un toque accidental en una lista
 * densa era plausible, así que la acción no corre hasta que se confirma
 * (el mismo patrón de "Sí, anular": título con la pregunta, la consecuencia
 * en palabras sencillas, Cancelar y Sí, entrar).
 */
export function ConfirmarEntrar({
  persona,
  procesando,
  onConfirmar,
  onCancelar,
}: {
  persona: UsuarioDelSistema | null;
  procesando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog
      open={persona !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCancelar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {persona ? `¿Entrar a la cuenta de ${persona.name ?? persona.email}?` : "¿Entrar a la cuenta?"}
          </DialogTitle>
          <DialogDescription>
            Vas a ver lo mismo que su dueño ve: sus movimientos y sus saldos.
            Desde ahí no se puede cambiar nada, solo se mira. La entrada queda
            registrada.
          </DialogDescription>
        </DialogHeader>

        {persona && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="truncate text-sm text-muted-foreground">{persona.email}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button className="min-h-11" onClick={onConfirmar} disabled={procesando}>
            {procesando ? "Entrando…" : "Sí, entrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

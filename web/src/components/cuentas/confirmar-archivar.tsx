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
import { Monto } from "@/components/monto";
import type { Cuenta } from "@/lib/api/types";
import { esCero } from "@/lib/money";

/**
 * Confirmación antes de archivar una cuenta.
 *
 * Archivar es el "eliminar" seguro: nunca se borra y la historia queda. Por
 * eso el diálogo no asusta con rojo; solo dice, en palabras sencillas, qué
 * pasa. Si la cuenta todavía tiene saldo (en una tarjeta, deuda) lo avisa con
 * la cifra, porque mientras esté archivada ese saldo no se suma en los
 * totales. Mismo patrón de "Sí, anular": título con la pregunta, la
 * consecuencia, Cancelar y Sí, archivar.
 */
export function ConfirmarArchivar({
  cuenta,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}: {
  cuenta: Cuenta | null;
  procesando: boolean;
  error: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const tieneSaldo = cuenta ? !esCero(cuenta.balance) : false;
  const esDeuda = cuenta ? cuenta.type === "card" && cuenta.balance.startsWith("-") : false;

  return (
    <Dialog
      open={cuenta !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCancelar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {cuenta ? `¿Archivar ${cuenta.name}?` : "¿Archivar esta cuenta?"}
          </DialogTitle>
          <DialogDescription>
            La cuenta se esconde: deja de aparecer y no recibe movimientos
            nuevos. Su historia sigue contando en los reportes del pasado.
            Puedes desarchivarla cuando quieras.
          </DialogDescription>
        </DialogHeader>

        {cuenta && tieneSaldo && (
          <div className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {esDeuda ? "Todavía tiene una deuda de" : "Todavía tiene un saldo de"}
            </span>
            <Monto
              valor={cuenta.balance}
              moneda={cuenta.currency}
              signo="negativo"
              className="text-base"
            />
            <span className="text-xs text-muted-foreground">
              Mientras esté archivada no se suma en tus totales.
            </span>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button className="min-h-11" onClick={onConfirmar} disabled={procesando}>
            {procesando ? "Archivando…" : "Sí, archivar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

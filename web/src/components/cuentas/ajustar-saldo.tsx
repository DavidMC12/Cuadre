"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { CampoMonto } from "@/components/campo-monto";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { leerAjuste } from "@/lib/ajuste-de-saldo";
import type { Cuenta } from "@/lib/api/types";

/**
 * El diálogo de AJUSTAR SALDO / AJUSTAR DEUDA, con el patrón de confirmación
 * de archivar: título con la pregunta, la consecuencia en palabras, Cancelar
 * y Sí, ajustar.
 *
 * Toda la cuenta (leer lo escrito, convertir la deuda a saldo con signo,
 * calcular la diferencia exacta y armar la vista previa) vive en
 * `lib/ajuste-de-saldo.ts`; este componente solo la conecta a la pantalla.
 * Toma el texto escrito por props (el cajón lo guarda y lo reinicia) porque
 * la decisión de enviar no es del diálogo: es de quien escribe y revisa la
 * vista previa.
 *
 * Un rechazo del servidor se muestra aquí tal cual, sin cerrar: quien lo ve
 * tiene que poder leer por qué el ajuste no se registró (por ejemplo, si la
 * cuenta ya tenía ese saldo). Mientras la petición viaja el diálogo tampoco
 * se puede descartar, igual que "Sí, anular".
 */
export function AjustarSaldo({
  cuenta,
  saldoEscrito,
  procesando,
  error,
  onCambiarSaldo,
  onConfirmar,
  onCancelar,
}: {
  /** Nulo = cerrado. */
  cuenta: Cuenta | null;
  saldoEscrito: string;
  procesando: boolean;
  error: string | null;
  onCambiarSaldo: (texto: string) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const idMonto = useId();

  const esTarjeta = cuenta?.type === "card";
  const lectura = cuenta ? leerAjuste(saldoEscrito, cuenta) : null;
  const errorEscrito = lectura !== null && "error" in lectura;

  return (
    <Dialog
      open={cuenta !== null}
      onOpenChange={(abierto) => {
        // Igual que archivar: mientras la petición viaja no se descarta, si el
        // servidor rechaza el motivo tiene que poder leerse.
        if (!abierto && !procesando) onCancelar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {cuenta
              ? `${esTarjeta ? "Ajustar deuda" : "Ajustar saldo"} de ${cuenta.name}`
              : "Ajustar saldo"}
          </DialogTitle>
          <DialogDescription>
            Esto no cuenta como gasto ni ingreso. Si te equivocas, haces otro
            ajuste.
          </DialogDescription>
        </DialogHeader>

        {cuenta && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idMonto}>
              {esTarjeta
                ? "¿Cuánto debes hoy según tu banco?"
                : "¿Cuánto hay hoy en esta cuenta?"}
            </Label>
            <CampoMonto
              id={idMonto}
              className="min-h-11"
              moneda={cuenta.currency}
              value={saldoEscrito}
              onChange={onCambiarSaldo}
              // En una tarjeta la deuda se dice en positivo; en las demás la
              // persona sí puede escribir el menos (un sobregiro).
              permiteSigno={!esTarjeta}
              placeholder="0"
              autoFocus
              aria-invalid={errorEscrito || Boolean(error)}
              disabled={procesando}
            />
            {lectura !== null && "error" in lectura && (
              <p className="text-xs text-destructive">{lectura.error}</p>
            )}
          </div>
        )}

        {lectura !== null && !errorEscrito && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2"
          >
            <span className="text-sm">{lectura.vistaPrevia}</span>
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
          <Button
            className="min-h-11"
            onClick={onConfirmar}
            disabled={procesando || !lectura || errorEscrito || lectura.coincide}
          >
            {procesando ? "Ajustando…" : "Sí, ajustar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

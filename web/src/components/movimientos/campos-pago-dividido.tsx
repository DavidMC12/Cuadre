"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampoMonto } from "@/components/campo-monto";
import type { Cuenta } from "@/lib/api/types";
import { textoMonto } from "@/lib/money";
import { completarLaOtraParte, cuentasParaLaParte, leerReparto } from "@/lib/pago-dividido";

/** Lo que el formulario guarda del modo "Pagar con dos cuentas". */
export interface PagoDivididoEnEdicion {
  cuenta1Id: string;
  cuenta2Id: string;
  /** El texto de cada campo de monto, tal como lo escribe (o lo completa) la pantalla. */
  texto1: string;
  texto2: string;
}

/**
 * "Pagar con dos cuentas": reemplaza al campo "Cuenta" cuando la compra se paga
 * mitad con una cuenta (la tarjeta) y mitad con otra (la plata disponible). Es
 * un componente de pantalla puro: el estado vive en el formulario y aquí solo
 * se pinta y se avisa qué cambió.
 *
 * - Cada parte lleva su cuenta y su monto.
 * - Al editar el monto de una parte, la otra se completa sola para sumar el
 *   total (el reparto inicial es la mitad cada una).
 * - La línea de abajo dice, en palabras, si ya cuadra con el total o cuánto
 *   falta o sobra; "Registrar" lo decide el formulario con `leerReparto`.
 */
export function CamposPagoDividido({
  valor,
  onChange,
  onVolver,
  total,
  moneda,
  cuentas,
}: {
  valor: PagoDivididoEnEdicion;
  onChange: (siguiente: PagoDivididoEnEdicion) => void;
  onVolver: () => void;
  /** El monto grande del formulario, ya leído y positivo; `null` si aún no hay uno válido. */
  total: string | null;
  moneda: string;
  /** Todas las cuentas del formulario: aquí se filtran las que sirven. */
  cuentas: readonly Cuenta[];
}) {
  const reparto = leerReparto(total, valor.texto1, valor.texto2, moneda);

  // Los montos pueden cuadrar sin que esté elegida la segunda cuenta: ahí no
  // hay nada que celebrar (Registrar sigue apagado) y hay que decir qué falta.
  const faltaCuenta = !valor.cuenta1Id || !valor.cuenta2Id;
  const textoDeEstado = !reparto.cuadra
    ? (reparto.motivo ?? "")
    : faltaCuenta
      ? `Elige la cuenta ${valor.cuenta1Id ? 2 : 1} para registrar.`
      : total
        ? `✓ Suma ${textoMonto(total, moneda)}`
        : "";

  // Ni una cuenta repetida, ni de otra moneda, ni archivada.
  const opcionesDeLa1 = cuentasParaLaParte(cuentas, moneda, valor.cuenta2Id || null);
  const opcionesDeLa2 = cuentasParaLaParte(cuentas, moneda, valor.cuenta1Id || null);

  function editarMonto(cual: 1 | 2, texto: string) {
    const otro = total ? completarLaOtraParte(total, texto, moneda) : null;
    if (cual === 1) {
      onChange({ ...valor, texto1: texto, texto2: otro ?? valor.texto2 });
    } else {
      onChange({ ...valor, texto2: texto, texto1: otro ?? valor.texto1 });
    }
  }

  function fila(cual: 1 | 2) {
    const cuentaId = cual === 1 ? valor.cuenta1Id : valor.cuenta2Id;
    const texto = cual === 1 ? valor.texto1 : valor.texto2;
    const opciones = cual === 1 ? opcionesDeLa1 : opcionesDeLa2;

    return (
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
        <div className="flex flex-col gap-1.5 sm:flex-1">
          <Label htmlFor={`cuenta-pago-${cual}`}>Cuenta {cual}</Label>
          <Select
            value={cuentaId || undefined}
            onValueChange={(nueva) =>
              onChange(
                cual === 1
                  ? { ...valor, cuenta1Id: nueva ?? "" }
                  : { ...valor, cuenta2Id: nueva ?? "" }
              )
            }
          >
            <SelectTrigger id={`cuenta-pago-${cual}`} className="min-h-11 w-full">
              {/* El popup vive en un portal que no está montado mientras el
                  selector está cerrado: el nombre se resuelve a mano. */}
              <SelectValue placeholder="Elige una cuenta">
                {(id: string) => cuentas.find((cuenta) => cuenta.id === id)?.name ?? id}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {opciones.map((cuenta) => (
                <SelectItem key={cuenta.id} value={cuenta.id}>
                  {cuenta.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 sm:w-44">
          <Label htmlFor={`monto-pago-${cual}`} className="sm:sr-only">
            Monto en la cuenta {cual}
          </Label>
          <CampoMonto
            id={`monto-pago-${cual}`}
            moneda={moneda}
            value={texto}
            onChange={(nuevo) => editarMonto(cual, nuevo)}
            placeholder="Monto"
            className="min-h-11"
            aria-describedby="estado-pago-dividido"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby="pago-dividido-titulo">
      <div className="flex items-center justify-between gap-2">
        <span id="pago-dividido-titulo" className="text-sm font-medium">
          Pagar con dos cuentas
        </span>
        <button
          type="button"
          onClick={onVolver}
          className="flex min-h-11 items-center px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
        >
          Volver a una cuenta
        </button>
      </div>

      {fila(1)}
      {fila(2)}

      <p
        id="estado-pago-dividido"
        aria-live="polite"
        className={
          reparto.cuadra && !faltaCuenta
            ? "text-xs text-emerald-600 dark:text-emerald-400"
            : "text-xs text-muted-foreground"
        }
      >
        {textoDeEstado}
      </p>
    </div>
  );
}

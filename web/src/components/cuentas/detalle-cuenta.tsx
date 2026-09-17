"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { CampoMonto } from "@/components/campo-monto";
import { FormularioMovimiento } from "@/components/movimientos/formulario-movimiento";
import {
  useActualizarCuenta,
  useCuentas,
  useMarcarAhorro,
} from "@/hooks/use-cuentas";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { AYUDA_CUENTA_AHORRO, ETIQUETA_TIPO_CUENTA } from "@/lib/labels";
import { Monto } from "@/components/monto";
import {
  aUnidadesMinimas,
  normalizarMontoIngresado,
  restar,
  sumarMontos,
  textoEditable,
  textoMonto,
} from "@/lib/money";
import { cn } from "@/lib/utils";

/** El componente Select no acepta un value vacío; este valor marca "ninguna". */
const SIN_VINCULADA = "__sin_vinculada__";

/**
 * Qué tan lleno va el cupo de la tarjeta, en porcentaje para el CSS. La
 * cuenta es con enteros grandes y el número solo aparece aquí — es un ancho
 * de barra, no un monto de dinero.
 */
function porcentajeUsado(usado: string, cupo: string): number {
  const gastado = aUnidadesMinimas(usado);
  const limite = aUnidadesMinimas(cupo);

  if (limite <= 0n) return 0;
  if (gastado <= 0n) return 0;
  if (gastado >= limite) return 100;

  // Puntos básicos: (usado / cupo) * 10000, con enteros exactos.
  return Number((gastado * 10000n) / limite) / 100;
}

/**
 * Lo de una cuenta, un toque adentro de la lista.
 *
 * Lo que se puede editar desde aquí es lo descriptivo — nombre, y en una
 * tarjeta el cupo y la cuenta desde la que se paga—. El saldo no está en la
 * lista a propósito: es la suma de los movimientos, y el servidor ni siquiera
 * lo acepta como edición.
 *
 * En una tarjeta, en lugar del interruptor de ahorro (que no aplica) se ve el
 * cupo con cuánto va usado y cuánto queda disponible — calculado aquí con el
 * cupo y el saldo, no pedido al servidor — y el botón de pagarla, que abre el
 * formulario de transferencia ya apuntando a esta tarjeta.
 *
 * El interruptor de ahorro escribe al instante, sin botón de guardar: no
 * rompe nada y se deshace con otro toque, igual que archivar. Desde la cuenta
 * de otra persona se ve todo, pero nada se edita.
 */
export function DetalleCuenta({ cuenta, children }: { cuenta: Cuenta; children: React.ReactNode }) {
  const soloMirar = useSoloMirar();
  const marcarAhorro = useMarcarAhorro();
  const actualizar = useActualizarCuenta();
  // Con los archivados también: la cuenta vinculada puede estar archivada y
  // hay que poder verla (y desvincularla) igual.
  const { data: cuentas } = useCuentas(true);

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(cuenta.name);
  const [cupo, setCupo] = useState(
    cuenta.creditLimit ? textoEditable(cuenta.creditLimit, cuenta.currency) : ""
  );
  const [errorCupo, setErrorCupo] = useState<string | null>(null);

  // Cada tarjeta monta su propio detalle, así que los ids de los controles no
  // pueden ser fijos: varios a la vez harían que la etiqueta apunte al de
  // otra cuenta.
  const idAhorro = useId();
  const idNombre = useId();
  const idCupo = useId();

  const esTarjeta = cuenta.type === "card";

  // Disponible y usado NUNCA se piden al servidor: se derivan aquí del cupo
  // y del saldo, con la aritmética exacta de money.ts. El saldo de una
  // tarjeta es negativo cuando debe, así que cupo + saldo es lo que queda.
  const cupoActual = cuenta.creditLimit;
  const disponible = cupoActual ? sumarMontos([cupoActual, cuenta.balance]) : null;
  const usado = cupoActual && disponible ? restar(cupoActual, disponible) : null;
  const porcentaje = cupoActual && usado ? porcentajeUsado(usado, cupoActual) : 0;

  const errorDeApi = (error: unknown, respaldo: string): string =>
    error instanceof ApiError ? error.message : respaldo;

  function guardarNombre() {
    const limpio = nombre.trim();
    if (!limpio || limpio === cuenta.name) return;

    actualizar.mutate(
      { id: cuenta.id, cambios: { name: limpio } },
      {
        onSuccess: () => toast.success("Nombre actualizado."),
        onError: (error) => toast.error(errorDeApi(error, "No se pudo guardar. Intenta de nuevo.")),
      }
    );
  }

  function guardarCupo() {
    const normalizado = normalizarMontoIngresado(cupo, cuenta.currency);
    if ("error" in normalizado) {
      setErrorCupo(normalizado.error);
      return;
    }
    setErrorCupo(null);
    actualizar.mutate(
      { id: cuenta.id, cambios: { creditLimit: normalizado.monto } },
      {
        onSuccess: () => toast.success("Cupo actualizado."),
        onError: (error) => toast.error(errorDeApi(error, "No se pudo guardar. Intenta de nuevo.")),
      }
    );
  }

  function cambiarVinculada(valor: string | null) {
    actualizar.mutate(
      { id: cuenta.id, cambios: { linkedAccountId: valor } },
      {
        onSuccess: () => toast.success("Cuenta vinculada actualizada."),
        onError: (error) => toast.error(errorDeApi(error, "No se pudo guardar. Intenta de nuevo.")),
      }
    );
  }

  function cambiarAhorro(valor: boolean) {
    marcarAhorro.mutate(
      { id: cuenta.id, isSavings: valor },
      {
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message);
          } else {
            toast.error("No se pudo cambiar el ahorro. Intenta de nuevo.");
          }
        },
      }
    );
  }

  return (
    <Drawer open={abierto} onOpenChange={setAbierto}>
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{cuenta.name}</DrawerTitle>
          <DrawerDescription>
            {ETIQUETA_TIPO_CUENTA[cuenta.type]} · {cuenta.currency}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col items-center gap-0.5 py-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {esTarjeta ? "Debes" : "Saldo"}
            </span>
            <MontoSaldo cuenta={cuenta} />
          </div>

          {/* El cupo dice cuánto de la deuda cabe: sin él, "te queda" no
              significa nada y mejor no fingir que sí. */}
          {esTarjeta && cupoActual && disponible && usado && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Usado</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {textoMonto(usado, cuenta.currency)} de{" "}
                  {textoMonto(cupoActual, cuenta.currency)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(porcentaje)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Cupo de ${cuenta.name}: usado ${textoMonto(usado, cuenta.currency)} de ${textoMonto(cupoActual, cuenta.currency)}`}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    porcentaje >= 100 ? "bg-destructive" : "bg-foreground/60"
                  )}
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Disponible:{" "}
                <span className="font-mono tabular-nums">
                  {textoMonto(disponible, cuenta.currency)}
                </span>
              </p>
            </div>
          )}

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idNombre}>Nombre</Label>
            {soloMirar ? (
              <p className="text-sm">{cuenta.name}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  id={idNombre}
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                  disabled={actualizar.isPending}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter") {
                      evento.preventDefault();
                      guardarNombre();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={guardarNombre}
                  disabled={actualizar.isPending || !nombre.trim() || nombre.trim() === cuenta.name}
                >
                  Guardar
                </Button>
              </div>
            )}
          </div>

          {esTarjeta && (
            <>
              {soloMirar ? (
                cupoActual && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Cupo</span>
                    <span className="font-mono text-sm tabular-nums">
                      {textoMonto(cupoActual, cuenta.currency)}
                    </span>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={idCupo}>Cupo</Label>
                  <div className="flex items-center gap-2">
                    <CampoMonto
                      id={idCupo}
                      moneda={cuenta.currency}
                      value={cupo}
                      onChange={setCupo}
                      // El cupo es lo máximo que puede deberse: siempre positivo.
                      permiteSigno={false}
                      placeholder="0"
                      aria-invalid={Boolean(errorCupo)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={guardarCupo}
                      disabled={actualizar.isPending || cupo.trim() === ""}
                    >
                      Guardar
                    </Button>
                  </div>
                  {errorCupo ? (
                    <p className="text-xs text-destructive">{errorCupo}</p>
                  ) : (
                    !cupoActual && (
                      <p className="text-xs text-muted-foreground">
                        Pon un cupo para ver cuánto te queda disponible.
                      </p>
                    )
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cuenta-vinculada">Cuenta desde la que pagas</Label>
                {soloMirar ? (
                  <p className="text-sm text-muted-foreground">
                    {(cuentas ?? []).find((c) => c.id === cuenta.linkedAccountId)?.name ??
                      "Ninguna"}
                  </p>
                ) : (
                  <Select
                    value={cuenta.linkedAccountId ?? SIN_VINCULADA}
                    onValueChange={(valor) =>
                      cambiarVinculada(valor === SIN_VINCULADA || valor == null ? null : valor)
                    }
                    disabled={actualizar.isPending}
                  >
                    <SelectTrigger id="cuenta-vinculada" className="w-full">
                      <SelectValue placeholder="Elige una cuenta">
                        {(valor: string) =>
                          (cuentas ?? []).find((c) => c.id === valor)?.name ??
                          (valor === SIN_VINCULADA ? "Ninguna" : valor)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VINCULADA}>Ninguna</SelectItem>
                      {(cuentas ?? [])
                        .filter(
                          (c) => c.type !== "card" && c.currency === cuenta.currency && !c.archivedAt
                        )
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Precarga de dónde sale la plata cuando pagas esta tarjeta.
                </p>
              </div>
            </>
          )}

          {/* El interruptor de ahorro solo existe para lo que no es tarjeta:
              en una la pregunta no tiene sentido y la base lo rechaza. */}
          {!esTarjeta && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={idAhorro}>Cuenta de ahorro</Label>
                <Switch
                  id={idAhorro}
                  checked={cuenta.isSavings}
                  disabled={soloMirar || marcarAhorro.isPending}
                  onCheckedChange={cambiarAhorro}
                />
              </div>
              <p className="text-xs text-muted-foreground">{AYUDA_CUENTA_AHORRO}</p>
            </div>
          )}

          {esTarjeta && !soloMirar && (
            <>
              <Separator />
              <FormularioMovimiento
                cuentas={(cuentas ?? []).filter((c) => !c.archivedAt)}
                cuentaIdPorDefecto={cuenta.linkedAccountId ?? undefined}
                tipoInicial="transferencia"
                transferenciaInicial={{
                  origen: cuenta.linkedAccountId ?? undefined,
                  destino: cuenta.id,
                }}
              >
                <Button>
                  <CreditCard />
                  Pagar tarjeta
                </Button>
              </FormularioMovimiento>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function MontoSaldo({ cuenta }: { cuenta: Cuenta }) {
  return (
    <Monto
      valor={cuenta.balance}
      moneda={cuenta.currency}
      signo="negativo"
      className="text-2xl"
    />
  );
}

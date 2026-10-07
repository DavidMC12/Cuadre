"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CreditCard, Loader2 } from "lucide-react";

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
import { AjustarSaldo } from "@/components/cuentas/ajustar-saldo";
import { ConfirmarArchivar } from "@/components/cuentas/confirmar-archivar";
import { FormularioMovimiento } from "@/components/movimientos/formulario-movimiento";
import {
  useActualizarCuenta,
  useAjustarSaldo,
  useArchivarCuenta,
  useCuentas,
  useMarcarAhorro,
} from "@/hooks/use-cuentas";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { AYUDA_CUENTA_AHORRO, ETIQUETA_TIPO_CUENTA } from "@/lib/labels";
import { Monto } from "@/components/monto";
import {
  cambióElCupo,
  cupoNormalizado,
  estadoCupo,
  etiquetaSaldo,
  hayCambiosSinGuardar,
  tonoBarraCupo,
} from "@/lib/detalle-de-cuenta";
import { leerAjuste, textoDeExito } from "@/lib/ajuste-de-saldo";
import { aUnidadesMinimas, textoEditable, textoMonto } from "@/lib/money";
import { cn } from "@/lib/utils";

/** El componente Select no acepta un value vacío; este valor marca "ninguna". */
const SIN_VINCULADA = "__sin_vinculada__";

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
 * UNA sola gramática de guardado: todo se guarda al cambiar. El nombre y el
 * cupo al salir del campo (o con Enter); el selector y el interruptor, al
 * cambiarlos. Un indicador breve dice "Guardando…"/"Guardado", y no hay
 * botón aparte por campo. Si al cerrar queda texto sin guardar —por ejemplo
 * porque se pulsó Escape con el campo enfocado, o el monto no era válido— se
 * avisa antes de descartarlo. Desde la cuenta de otra persona se ve todo,
 * pero nada se edita.
 */
export function DetalleCuenta({ cuenta, children }: { cuenta: Cuenta; children: React.ReactNode }) {
  const soloMirar = useSoloMirar();
  const marcarAhorro = useMarcarAhorro();
  const actualizar = useActualizarCuenta();
  const archivar = useArchivarCuenta();
  const ajustar = useAjustarSaldo();
  // Con los archivados también: así el detalle puede mostrar el nombre de una
  // cuenta vinculada que ya se archivó (las opciones del selector solo
  // ofrecen las activas, pero la elegida tiene que seguir mostrándose).
  const { data: cuentas } = useCuentas(true);

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(cuenta.name);
  const [cupo, setCupo] = useState(
    cuenta.creditLimit ? textoEditable(cuenta.creditLimit, cuenta.currency) : ""
  );
  const [errorCupo, setErrorCupo] = useState<string | null>(null);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [recienGuardado, setRecienGuardado] = useState(false);
  const [avisoCierre, setAvisoCierre] = useState(false);
  const [confirmandoArchivar, setConfirmandoArchivar] = useState(false);
  const [errorArchivar, setErrorArchivar] = useState<string | null>(null);
  const [confirmandoAjuste, setConfirmandoAjuste] = useState(false);
  const [saldoEscrito, setSaldoEscrito] = useState("");
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null);

  // Cada tarjeta monta su propio detalle, así que los ids de los controles no
  // pueden ser fijos: varios a la vez harían que la etiqueta apunte al de
  // otra cuenta.
  const idAhorro = useId();
  const idNombre = useId();
  const idCupo = useId();
  const idVinculada = useId();

  // Cerrar es un pedido del Drawer que a veces negamos (para avisar). Esta
  // bandera evita interceptar dos veces el mismo pedido: el que hacemos
  // nosotros desde `cerrar()` y el que el Drawer pudiera devolver.
  const cierreForzado = useRef(false);

  // Línea base de lo último guardado: contra esto se compara lo escrito, sin
  // depender de que la prop `cuenta` ya haya vuelto del servidor (mientras el
  // guardado viaja, la prop todavía trae el valor viejo).
  const nombreGuardado = useRef(cuenta.name);
  const cupoGuardado = useRef(
    cuenta.creditLimit ? textoEditable(cuenta.creditLimit, cuenta.currency) : ""
  );

  const esTarjeta = cuenta.type === "card";
  const guardando = actualizar.isPending || marcarAhorro.isPending;

  // Disponible, usado y porcentaje NUNCA se piden al servidor: se derivan del
  // cupo y del saldo, con la aritmética exacta de money.ts.
  const cupoActual = cuenta.creditLimit;
  const estadoDeCupo = esTarjeta ? estadoCupo(cupoActual, cuenta.balance) : null;
  const saldoEtiqueta = etiquetaSaldo(cuenta);

  // "Guardado" es breve a propósito: se va solo, sin pedir que nadie lo cierre.
  useEffect(() => {
    if (!recienGuardado) return;
    const temporizador = setTimeout(() => setRecienGuardado(false), 2000);
    return () => clearTimeout(temporizador);
  }, [recienGuardado]);

  const errorDeApi = (error: unknown, respaldo: string): string =>
    error instanceof ApiError ? error.message : respaldo;

  // Cerrar descarta lo que quedó a medias: reabrir tiene que mostrar lo que
  // hay en el servidor, no una edición a medias.
  function reiniciarEdicion() {
    const cupoBase = cuenta.creditLimit
      ? textoEditable(cuenta.creditLimit, cuenta.currency)
      : "";
    setNombre(cuenta.name);
    setCupo(cupoBase);
    setErrorCupo(null);
    setErrorNombre(null);
    setRecienGuardado(false);
    setAvisoCierre(false);
    // El diálogo de ajuste vuelve a abrirse limpio: sin cifra vieja que
    // parezca ya elegida.
    setConfirmandoAjuste(false);
    setSaldoEscrito("");
    setErrorAjuste(null);
    nombreGuardado.current = cuenta.name;
    cupoGuardado.current = cupoBase;
  }

  /** Cierre definitivo: no había nada pendiente, o se confirmó descartar. */
  function cerrar() {
    cierreForzado.current = true;
    setAbierto(false);
    setAvisoCierre(false);
  }

  function manejarApertura(valor: boolean) {
    if (valor) {
      cierreForzado.current = false;
      reiniciarEdicion();
      setAbierto(true);
      return;
    }
    // El propio `cerrar()` ya resolvió: no volver a interceptar.
    if (cierreForzado.current) {
      cierreForzado.current = false;
      return;
    }

    // Cualquier texto pendiente se avisa antes de perderlo: el guardado es al
    // salir del campo, así que lo que siga aquí sin guardar —válido o no— se
    // perdería al cerrar. No se guarda al cerrar a propósito: si la red falla
    // justo en ese momento, lo escrito se perdería sin que nadie lo note.
    const pendiente = hayCambiosSinGuardar({
      nombre,
      cupo,
      nombreGuardado: nombreGuardado.current,
      cupoGuardado: cupoGuardado.current,
      esTarjeta,
      moneda: cuenta.currency,
    });

    if (pendiente) {
      setAvisoCierre(true);
      return;
    }

    cerrar();
  }

  function guardarNombre() {
    // Mientras se está descartando no se guarda nada: "Descartar" descarta.
    if (avisoCierre || cierreForzado.current) return;

    const limpio = nombre.trim();
    if (limpio === "") {
      setErrorNombre("Ponle un nombre a la cuenta.");
      return;
    }
    setErrorNombre(null);
    if (limpio === nombreGuardado.current) return;

    const previo = nombreGuardado.current;
    nombreGuardado.current = limpio;
    setRecienGuardado(false);

    actualizar.mutate(
      { id: cuenta.id, cambios: { name: limpio } },
      {
        onSuccess: (respuesta) => {
          nombreGuardado.current = respuesta.data.name;
          setNombre(respuesta.data.name);
          setRecienGuardado(true);
        },
        onError: (error) => {
          nombreGuardado.current = previo;
          toast.error(errorDeApi(error, "No se pudo guardar. Intenta de nuevo."));
        },
      }
    );
  }

  function guardarCupo() {
    // Mientras se está descartando no se guarda nada: "Descartar" descarta.
    if (avisoCierre || cierreForzado.current) return;

    const lectura = cupoNormalizado(cupo, cuenta.currency);
    if (lectura && "error" in lectura) {
      setErrorCupo(lectura.error);
      return;
    }
    if (lectura && aUnidadesMinimas(lectura.monto) <= 0n) {
      setErrorCupo("El cupo tiene que ser mayor que cero.");
      return;
    }
    // Guardar sin cambios era un viaje de ida y vuelta que no cambiaba nada.
    if (!cambióElCupo(cupo, cupoGuardado.current, cuenta.currency)) return;

    const previo = cupoGuardado.current;
    cupoGuardado.current = cupo;
    setErrorCupo(null);
    setRecienGuardado(false);

    actualizar.mutate(
      { id: cuenta.id, cambios: { creditLimit: lectura ? lectura.monto : null } },
      {
        onSuccess: (respuesta) => {
          const guardado = respuesta.data.creditLimit
            ? textoEditable(respuesta.data.creditLimit, cuenta.currency)
            : "";
          cupoGuardado.current = guardado;
          setCupo(guardado);
          setRecienGuardado(true);
        },
        onError: (error) => {
          cupoGuardado.current = previo;
          toast.error(errorDeApi(error, "No se pudo guardar. Intenta de nuevo."));
        },
      }
    );
  }

  function cambiarVinculada(valor: string | null) {
    setRecienGuardado(false);
    actualizar.mutate(
      { id: cuenta.id, cambios: { linkedAccountId: valor } },
      {
        onSuccess: () => setRecienGuardado(true),
        onError: (error) => toast.error(errorDeApi(error, "No se pudo guardar. Intenta de nuevo.")),
      }
    );
  }

  function cambiarAhorro(valor: boolean) {
    setRecienGuardado(false);
    marcarAhorro.mutate(
      { id: cuenta.id, isSavings: valor },
      {
        onSuccess: () => setRecienGuardado(true),
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

  function confirmarArchivar() {
    setErrorArchivar(null);
    archivar.mutate(cuenta.id, {
      onSuccess: () => {
        toast.success("Cuenta archivada.");
        setConfirmandoArchivar(false);
        cerrar();
      },
      // Un rechazo del servidor se muestra tal cual y no cierra nada: quien lo
      // ve tiene que poder leer por qué no se pudo (por ejemplo, si ya estaba
      // archivada). El cajón no se cierra y la confirmación sigue abierta.
      onError: (error) => {
        setErrorArchivar(errorDeApi(error, "No se pudo archivar la cuenta. Intenta de nuevo."));
      },
    });
  }

  /**
   * El ajuste que se registraría ya viene leído y revisado en la vista
   * previa; aquí solo se manda. Si el servidor rechaza —cuenta archivada,
   * diferencia cero que se le coló, sesión de solo mirar vencida—, el error
   * queda dentro del diálogo y no se cierra nada.
   */
  function confirmarAjuste() {
    const lectura = leerAjuste(saldoEscrito, cuenta);
    if (lectura === null) {
      setErrorAjuste("Escribe el monto.");
      return;
    }
    if ("error" in lectura) {
      setErrorAjuste(lectura.error);
      return;
    }
    if (lectura.coincide) return; // el botón principal está apagado; por si acaso.

    setErrorAjuste(null);
    ajustar.mutate(
      { id: cuenta.id, balance: lectura.balance },
      {
        onSuccess: () => {
          // El saldo ya es el que el banco dice. El toast habla como la
          // pantalla: en una tarjeta, de deuda en positivo.
          toast.success(textoDeExito(lectura.balance, cuenta));
          setConfirmandoAjuste(false);
          setSaldoEscrito("");
        },
        onError: (error) => setErrorAjuste(errorDeApi(error, "No se pudo ajustar. Intenta de nuevo.")),
      }
    );
  }

  return (
    <Drawer open={abierto} onOpenChange={manejarApertura}>
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{cuenta.name}</DrawerTitle>
          <DrawerDescription>
            {ETIQUETA_TIPO_CUENTA[cuenta.type]} · {cuenta.currency}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          {!soloMirar && (
            /* Montado siempre (aunque esté vacío): un `role="status"` que
               aparece con el texto ya puesto no siempre se anuncia. */
            <p
              role="status"
              aria-live="polite"
              className="flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground"
            >
              {guardando ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : recienGuardado ? (
                <>
                  <Check className="size-3.5" aria-hidden />
                  Guardado
                </>
              ) : null}
            </p>
          )}

          {avisoCierre && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3"
            >
              <p className="text-sm">
                Tienes cambios sin guardar. Si cierras ahora, se pierden.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAvisoCierre(false)}>
                  Seguir editando
                </Button>
                {/* No hace falta impedir el blur: con el aviso visible los
                    guardados están en pausa, así que "Descartar" descarta de
                    verdad con mouse, tacto o teclado. */}
                <Button variant="outline" size="sm" className="min-h-11" onClick={cerrar}>
                  Descartar
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-0.5 py-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              {saldoEtiqueta}
            </span>
            <MontoSaldo cuenta={cuenta} />
          </div>

          {/* El cupo dice cuánto de la deuda cabe: sin él, "te queda" no
              significa nada y mejor no fingir que sí. */}
          {esTarjeta && estadoDeCupo && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Usado</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {textoMonto(estadoDeCupo.usado, cuenta.currency)} de{" "}
                  {textoMonto(cupoActual!, cuenta.currency)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.round(estadoDeCupo.porcentaje)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Cupo de ${cuenta.name}: usado ${textoMonto(estadoDeCupo.usado, cuenta.currency)} de ${textoMonto(cupoActual!, cuenta.currency)}`}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    tonoBarraCupo(estadoDeCupo.porcentaje)
                  )}
                  style={{ width: `${estadoDeCupo.porcentaje}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Disponible:{" "}
                <span className="font-mono tabular-nums">
                  {textoMonto(estadoDeCupo.disponible, cuenta.currency)}
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
              <>
                <Input
                  id={idNombre}
                  className="min-h-11"
                  value={nombre}
                  onChange={(evento) => {
                    setNombre(evento.target.value);
                    setErrorNombre(null);
                    setRecienGuardado(false);
                  }}
                  onBlur={guardarNombre}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter") {
                      evento.preventDefault();
                      guardarNombre();
                    }
                  }}
                  disabled={actualizar.isPending}
                  aria-invalid={Boolean(errorNombre)}
                />
                {errorNombre && <p className="text-xs text-destructive">{errorNombre}</p>}
              </>
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
                  <CampoMonto
                    id={idCupo}
                    className="min-h-11"
                    moneda={cuenta.currency}
                    value={cupo}
                    onChange={(valor) => {
                      setCupo(valor);
                      setRecienGuardado(false);
                    }}
                    onBlur={guardarCupo}
                    onKeyDown={(evento) => {
                      if (evento.key === "Enter") {
                        evento.preventDefault();
                        guardarCupo();
                      }
                    }}
                    // El cupo es lo máximo que puede deberse: siempre positivo.
                    permiteSigno={false}
                    placeholder="0"
                    aria-invalid={Boolean(errorCupo)}
                    disabled={actualizar.isPending}
                  />
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
                <Label htmlFor={idVinculada}>Cuenta desde la que pagas</Label>
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
                    <SelectTrigger id={idVinculada} className="min-h-11 w-full">
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
                  // El interruptor dibuja 18.4px; su área táctil (el ::after
                  // transparente) se estira a ~44px sin agrandar la píldora.
                  className="after:-inset-y-[13px]"
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
                <Button className="min-h-11">
                  <CreditCard />
                  Pagar tarjeta
                </Button>
              </FormularioMovimiento>
            </>
          )}

          {/* Ajustar el saldo (o la deuda, en una tarjeta) es registrar un
              movimiento kind "adjustment" por la diferencia: discreto, outline,
              apagado en solo mirar y sin existir en una archivada — el
              servidor también lo rechazaría. */}
          {!cuenta.archivedAt && (
            <>
              <Separator />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={soloMirar}
                onClick={() => {
                  setErrorAjuste(null);
                  setSaldoEscrito("");
                  setConfirmandoAjuste(true);
                }}
              >
                {esTarjeta ? "Ajustar deuda" : "Ajustar saldo"}
              </Button>
            </>
          )}

          {/* Archivar es el "eliminar" seguro: al final y discreto, nunca
              rojo. Desde la cuenta de otra persona el botón se ve apagado. */}
          <Separator />
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={soloMirar}
            onClick={() => {
              setErrorArchivar(null);
              setConfirmandoArchivar(true);
            }}
          >
            Archivar cuenta
          </Button>
        </div>

        <ConfirmarArchivar
          cuenta={confirmandoArchivar ? cuenta : null}
          procesando={archivar.isPending}
          error={errorArchivar}
          onConfirmar={confirmarArchivar}
          onCancelar={() => {
            setConfirmandoArchivar(false);
            setErrorArchivar(null);
          }}
        />

        <AjustarSaldo
          cuenta={confirmandoAjuste ? cuenta : null}
          saldoEscrito={saldoEscrito}
          procesando={ajustar.isPending}
          error={errorAjuste}
          onCambiarSaldo={(texto) => {
            setSaldoEscrito(texto);
            // El rechazo del servidor habla de la cifra anterior; en cuanto
            // se edita de nuevo ya no dice nada útil — y queda contradiciendo
            // la vista previa que sí reacciona. Se va al primer toque.
            setErrorAjuste(null);
          }}
          onConfirmar={confirmarAjuste}
          onCancelar={() => {
            setConfirmandoAjuste(false);
            setErrorAjuste(null);
          }}
        />
      </DrawerContent>
    </Drawer>
  );
}

export function MontoSaldo({ cuenta }: { cuenta: Cuenta }) {
  return (
    <Monto
      valor={cuenta.balance}
      moneda={cuenta.currency}
      signo="negativo"
      className="text-2xl"
    />
  );
}

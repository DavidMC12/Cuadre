"use client";

import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CampoMonto } from "@/components/campo-monto";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCrearRegistroAhorro } from "@/hooks/use-ahorros";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { fechaParaInput, inputAIso } from "@/lib/fecha";
import {
  montoConSigno,
  textoDeExito,
  textoDeVistaPrevia,
  type TipoRegistroAhorro,
} from "@/lib/ahorros";
import { aUnidadesMinimas, normalizarMontoIngresado } from "@/lib/money";

/**
 * El diálogo de "Registrar ahorro": anota que apartaste (o retiraste) plata
 * para ahorro, sin mover saldo de ninguna cuenta.
 *
 * Solo entran cuentas de ahorro ACTIVAS — las que se le pasan ya vienen así;
 * una cuenta normal ni aparece —. Con exactamente una, esa va preseleccionada;
 * con varias, eligen. El signo lo pone la interfaz con el toggle Aparte/Retire:
 * nadie teclea un menos. La cifra se escribe sin signo, siempre positiva, y el
 * monto rechaza el cero.
 *
 * Un rechazo del servidor se muestra aquí tal cual, sin cerrar: quien lo ve
 * tiene que poder leer por qué el registro no se anotó (por ejemplo, si la
 * cuenta ya no es de ahorro activa). Mientras la petición viaja el diálogo
 * tampoco se descarta.
 *
 * La corrección no existe como edición: un registro de ahorro es inmutable;
 * lo que se anotó mal se arregla anotando otro de signo contrario.
 */
export function FormularioAhorro({
  cuentas,
  cuentaIdPorDefecto,
  children,
}: {
  /** Solo cuentas de ahorro activas, de la moneda que se está viendo. */
  cuentas: Cuenta[];
  /** Preselección (p. ej. desde la cuenta misma); se propone, no se impone. */
  cuentaIdPorDefecto?: string;
  /** El botón que abre el diálogo. */
  children?: React.ReactNode;
}) {
  const soloMirar = useSoloMirar();
  const idBase = useId();
  const idTipo = `${idBase}-tipo`;
  const idCuenta = `${idBase}-cuenta`;
  const idMonto = `${idBase}-monto`;
  const idFecha = `${idBase}-fecha`;
  const idDescripcion = `${idBase}-descripcion`;
  const idErrorMonto = `${idBase}-error-monto`;

  const hoyInput = () => fechaParaInput(new Date().toISOString());

  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoRegistroAhorro>("aparte");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyInput);
  const [descripcion, setDescripcion] = useState("");
  const [cuentaAMano, setCuentaAMano] = useState<string | null>(cuentaIdPorDefecto ?? null);
  const [errores, setErrores] = useState<{ monto?: string; cuenta?: string }>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  // La cuenta: la elegida a mano si sigue existiendo; si no, la preselección
  // (que puede llegar tarde, cuando las cuentas acaban de cargar); si no, la
  // única de la lista. Con varias y sin elección se le pide elegir: la
  // propuesta "por descarte" ya no es la amiga de una cifra de dinero.
  const cuentaId =
    cuentaAMano && cuentas.some((cuenta) => cuenta.id === cuentaAMano)
      ? cuentaAMano
      : cuentaIdPorDefecto && cuentas.some((cuenta) => cuenta.id === cuentaIdPorDefecto)
        ? cuentaIdPorDefecto
        : cuentas.length === 1
          ? cuentas[0].id
          : "";
  const cuentaElegida = cuentas.find((cuenta) => cuenta.id === cuentaId);

  // Lo escrito se lee con la moneda de la cuenta elegida: en pesos "25.000"
  // son veinticinco mil. El monto SIEMPRE va sin signo en pantalla.
  const lectura = cuentaElegida
    ? normalizarMontoIngresado(monto, cuentaElegida.currency)
    : null;
  const errorEscrito = lectura !== null && "error" in lectura;
  const montoValido =
    lectura !== null && !errorEscrito && aUnidadesMinimas(lectura.monto) > 0n;

  // El texto de error del monto: primero el del campo (mal escrito), y si
  // está bien escrito pero vale cero, el del cero. El error DEL SERVIDOR va
  // aparte: la cifra puede estar bien redactada y aun así el servidor
  // rechazarla por lo que significa, no por cómo quedó escrita.
  const errorDelMonto = errorEscrito
    ? (lectura as { error: string }).error
    : (errores.monto ?? (lectura !== null && !errorEscrito
        ? aUnidadesMinimas(lectura.monto) <= 0n
          ? "El monto tiene que ser mayor que cero."
          : undefined
        : undefined));

  const registrar = useCrearRegistroAhorro();
  const procesando = registrar.isPending;

  function reiniciar() {
    setTipo("aparte");
    setMonto("");
    setFecha(hoyInput());
    setDescripcion("");
    setCuentaAMano(cuentaIdPorDefecto ?? null);
    setErrores({});
    setErrorServidor(null);
  }

  function manejarCambioAbierto(valor: boolean) {
    // Igual que en ajustar-saldo: mientras la petición viaja no se descarta,
    // si el servidor rechaza el motivo tiene que poder leerse.
    if (!valor && procesando) return;
    setAbierto(valor);
    if (!valor) reiniciar();
  }

  function anotar() {
    const lecturaDeEnvio = cuentaElegida
      ? normalizarMontoIngresado(monto, cuentaElegida.currency)
      : null;

    const nuevosErrores: { monto?: string; cuenta?: string } = {};
    if (!cuentaElegida) nuevosErrores.cuenta = "Elige una cuenta de ahorro.";
    if (lecturaDeEnvio && "error" in lecturaDeEnvio) {
      nuevosErrores.monto = lecturaDeEnvio.error;
    } else if (lecturaDeEnvio && aUnidadesMinimas(lecturaDeEnvio.monto) <= 0n) {
      // El cero no se aparta: un "0 apartado" no dice nada y el servidor lo
      // rechazaría. Se avisa antes de que viaje.
      nuevosErrores.monto = "El monto tiene que ser mayor que cero.";
    }
    setErrores(nuevosErrores);
    if (!cuentaElegida || !lecturaDeEnvio || "error" in lecturaDeEnvio) return;
    if (aUnidadesMinimas(lecturaDeEnvio.monto) <= 0n) return;

    setErrorServidor(null);
    registrar.mutate(
      {
        accountId: cuentaElegida.id,
        // El signo es del toggle, nunca del tecleo: positivo aparta.
        amount: montoConSigno(tipo, lecturaDeEnvio.monto),
        occurredAt: fecha ? inputAIso(fecha) : inputAIso(hoyInput()),
        description: descripcion.trim() || undefined,
      },
      {
        onSuccess: ({ data: guardado }) => {
          // El aviso repite lo que respondió el servidor, no lo que se
          // escribió: confirma el registro que ya no se puede editar.
          toast.success(textoDeExito(guardado, cuentaElegida.name));
          setAbierto(false);
          reiniciar();
        },
        onError: (error) => {
          // El mensaje ya viene en español y listo para la persona: se
          // muestra tal cual, nunca reescrito por la pantalla.
          setErrorServidor(
            error instanceof ApiError
              ? error.message
              : "No se pudo anotar el ahorro. Intenta de nuevo."
          );
        },
      }
    );
  }

  // Quien está mirando la cuenta de otra persona no ve el botón siquiera: el
  // servidor rechazaría la escritura de todos modos.
  if (soloMirar) return null;

  return (
    <Dialog open={abierto} onOpenChange={manejarCambioAbierto}>
      {children ? <DialogTrigger render={children as React.ReactElement} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar ahorro</DialogTitle>
          <DialogDescription>
            Esto no mueve plata de ninguna cuenta: solo anota lo que apartaste.
          </DialogDescription>
        </DialogHeader>

        {cuentas.length === 0 ? (
          // Defensivo: nadie debería abrir esto sin una cuenta de ahorro
          // activa — la tarjeta que lo ofrece esconde el botón cuando no hay —
          // pero si ocurriera, decirlo en vez de pintar un formulario muerto.
          <p className="text-sm text-muted-foreground">
            Primero marca una cuenta como de ahorro para anotar en ella.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idCuenta}>Cuenta de ahorro</Label>
              <Select
                value={cuentaId || undefined}
                onValueChange={(valor) => {
                  if (valor) setCuentaAMano(valor);
                  // La moneda con la que se lee el monto puede cambiar de
                  // cuenta en cuenta: el error escrito deja de ser válido.
                  setErrores({});
                }}
              >
                <SelectTrigger id={idCuenta} className="min-h-11 w-full">
                  {/* El popup de opciones vive en un portal que no está
                      montado mientras el selector está cerrado: hay que
                      resolver el nombre a mano, igual que en el resto. */}
                  <SelectValue placeholder="Elige una cuenta">
                    {(valor: string) =>
                      cuentas.find((cuenta) => cuenta.id === valor)?.name ?? valor
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map((cuenta) => (
                    <SelectItem key={cuenta.id} value={cuenta.id}>
                      {cuenta.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores.cuenta && (
                <p className="text-xs text-destructive">{errores.cuenta}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label id={idTipo}>Tipo</Label>
              <ToggleGroup
                aria-labelledby={idTipo}
                value={[tipo]}
                onValueChange={(valores) => {
                  if (valores.length > 0) setTipo(valores[0] as TipoRegistroAhorro);
                }}
                variant="outline"
                size="tap"
                className="w-full"
              >
                <ToggleGroupItem value="aparte" className="flex-1">
                  Aparte
                </ToggleGroupItem>
                <ToggleGroupItem value="retire" className="flex-1">
                  Retire
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idMonto}>Monto</Label>
              <CampoMonto
                id={idMonto}
                className="min-h-11"
                moneda={cuentaElegida?.currency ?? ""}
                value={monto}
                onChange={(valor) => {
                  setMonto(valor);
                  // El rechazo de antes ya no dice nada útil sobre lo
                  // recién escrito; y mientras se edita, el error de envío
                  // de este campo tampoco.
                  setErrores({});
                  setErrorServidor(null);
                }}
                // Siempre positivo en pantalla: el signo lo pone el tipo,
                // no el texto. Un "-" escrito a mano cae en el error de
                // abajo, igual que en cualquier monto sin signo.
                permiteSigno={false}
                placeholder="0"
                autoFocus
                aria-invalid={Boolean(errorDelMonto)}
                aria-describedby={errorDelMonto ? idErrorMonto : undefined}
                disabled={procesando}
              />
              {errorDelMonto && (
                <p id={idErrorMonto} className="text-xs text-destructive">
                  {errorDelMonto}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idFecha}>Fecha</Label>
              <Input
                id={idFecha}
                type="date"
                value={fecha}
                max={hoyInput()}
                onChange={(evento) => setFecha(evento.target.value)}
                className="min-h-11"
                disabled={procesando}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idDescripcion}>Descripción (opcional)</Label>
              <Input
                id={idDescripcion}
                placeholder="Ej. Ahorro de la prima"
                value={descripcion}
                onChange={(evento) => setDescripcion(evento.target.value)}
                className="min-h-11"
                disabled={procesando}
              />
            </div>

            {cuentaElegida && montoValido && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2"
              >
                <span className="text-sm">
                  {textoDeVistaPrevia(
                    tipo,
                    (lectura as { monto: string }).monto,
                    cuentaElegida.currency
                  )}
                </span>
              </div>
            )}

            {errorServidor && (
              <p role="alert" className="text-sm text-destructive">
                {errorServidor}
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => manejarCambioAbierto(false)}
                disabled={procesando}
              >
                Cancelar
              </Button>
              <Button
                className="min-h-11"
                onClick={anotar}
                // El "Sí, anotar" espera una cuenta y una cifra bien
                // escrita y mayor que cero: nada que el servidor tenga que
                // corregir de mitad de camino.
                disabled={procesando || !cuentaElegida || !montoValido}
              >
                {procesando ? "Anotando…" : "Sí, anotar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

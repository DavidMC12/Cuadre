"use client";

import { useId, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CampoMonto } from "@/components/campo-monto";
import { useCrearCuenta, useCuentas } from "@/hooks/use-cuentas";
import { usePerfil, useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { TipoCuenta } from "@/lib/api/types";
import { ETIQUETA_TIPO_CUENTA, AYUDA_CUENTA_AHORRO, MONEDAS } from "@/lib/labels";
import { normalizarMontoConSigno, normalizarMontoIngresado } from "@/lib/money";

const TIPOS: TipoCuenta[] = ["bank", "card", "cash"];

export function FormularioCuenta({ children }: { children: React.ReactNode }) {
  const soloMirar = useSoloMirar();
  const { data: perfil } = usePerfil();
  const { data: cuentas } = useCuentas();

  // La preferencia de los ajustes decide cuál viene marcada. Si no hay ninguna
  // elegida —o el perfil todavía no llega— manda la primera de la lista.
  const monedaPreferida = perfil?.defaultCurrency ?? MONEDAS[0];

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>("bank");
  const [moneda, setMoneda] = useState<string | null>(null);
  const [saldoInicial, setSaldoInicial] = useState("");
  const [esAhorro, setEsAhorro] = useState(false);
  const [cupo, setCupo] = useState("");
  const [cuentaVinculada, setCuentaVinculada] = useState<string | undefined>(undefined);
  const [errores, setErrores] = useState<{ nombre?: string; saldoInicial?: string; cupo?: string }>(
    {}
  );

  const crearCuenta = useCrearCuenta();
  const idAhorro = useId();

  // Null significa "no la he tocado": así, si el perfil llega después de que se
  // abrió el formulario, la marcada se corrige sola, pero una moneda ya elegida
  // a mano no se pisa.
  const monedaElegida = moneda ?? monedaPreferida;

  // Solo importa cuando es una tarjeta: de dónde puede salir la plata para
  // pagarla. De la misma moneda, y nunca otra tarjeta — una tarjeta no paga
  // con otra tarjeta.
  const cuentasParaVincular = (cuentas ?? []).filter(
    (cuenta) => cuenta.type !== "card" && cuenta.currency === monedaElegida && !cuenta.archivedAt
  );

  const monedasOfrecidas: string[] = (MONEDAS as readonly string[]).includes(monedaPreferida)
    ? [...MONEDAS]
    : [...MONEDAS, monedaPreferida];

  function reiniciar() {
    setNombre("");
    setTipo("bank");
    setMoneda(null);
    setSaldoInicial("");
    setEsAhorro(false);
    setCupo("");
    setCuentaVinculada(undefined);
    setErrores({});
  }

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const nuevosErrores: typeof errores = {};
    if (!nombre.trim()) {
      nuevosErrores.nombre = "Ponle un nombre a la cuenta.";
    }

    let saldoNormalizado: string | undefined;
    if (saldoInicial.trim() !== "") {
      // Se lee con la moneda marcada ahora mismo: "2.000.000" en pesos son dos
      // millones, y en dólares el punto también es de miles.
      const lectura = normalizarMontoConSigno(saldoInicial, monedaElegida);
      if ("error" in lectura) {
        nuevosErrores.saldoInicial = lectura.error;
      } else {
        saldoNormalizado = lectura.monto;
      }
    }

    let cupoNormalizado: string | undefined;
    if (tipo === "card" && cupo.trim() !== "") {
      const lectura = normalizarMontoIngresado(cupo, monedaElegida);
      if ("error" in lectura) {
        nuevosErrores.cupo = lectura.error;
      } else {
        cupoNormalizado = lectura.monto;
      }
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    crearCuenta.mutate(
      {
        name: nombre.trim(),
        type: tipo,
        currency: monedaElegida,
        openingBalance: saldoNormalizado,
        // Una tarjeta no puede ser de ahorro; en su lugar se manda el cupo
        // si lo pusieron, y de dónde se paga si eligieron una.
        isSavings: tipo === "card" ? false : esAhorro,
        creditLimit: tipo === "card" ? cupoNormalizado : undefined,
        linkedAccountId: tipo === "card" ? cuentaVinculada : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Cuenta creada.");
          setAbierto(false);
          reiniciar();
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message);
          } else {
            toast.error("No se pudo crear la cuenta. Intenta de nuevo.");
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
            <DrawerTitle>Nueva cuenta</DrawerTitle>
            <DrawerDescription>
              Un banco, una tarjeta o el efectivo que manejas a mano.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nombre-cuenta">Nombre</Label>
              <Input
                id="nombre-cuenta"
                placeholder="Ej. Bancolombia"
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                aria-invalid={Boolean(errores.nombre)}
                autoFocus
              />
              {errores.nombre && <p className="text-xs text-destructive">{errores.nombre}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <ToggleGroup
                value={[tipo]}
                onValueChange={(valores) => {
                  if (valores.length > 0) setTipo(valores[0] as TipoCuenta);
                }}
                variant="outline"
                className="w-full"
              >
                {TIPOS.map((valor) => (
                  <ToggleGroupItem key={valor} value={valor} className="flex-1">
                    {ETIQUETA_TIPO_CUENTA[valor]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Moneda</Label>
              <ToggleGroup
                value={[monedaElegida]}
                onValueChange={(valores) => {
                  if (valores.length > 0) {
                    setMoneda(valores[0]!);
                    // La cuenta vinculada tiene que ser de la misma moneda: al
                    // cambiarla, la que estaba elegida deja de servir.
                    setCuentaVinculada(undefined);
                  }
                }}
                variant="outline"
                className="w-full"
              >
                {monedasOfrecidas.map((valor) => (
                  <ToggleGroupItem key={valor} value={valor} className="flex-1">
                    {valor}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {/* El interruptor de ahorro solo existe para lo que no es tarjeta:
                no se deja apagado ni deshabilitado, se quita — en una tarjeta
                la pregunta no tiene sentido y responderla confunde. */}
            {tipo !== "card" && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={idAhorro}>Cuenta de ahorro</Label>
                  <Switch
                    id={idAhorro}
                    checked={esAhorro}
                    onCheckedChange={(valor) => setEsAhorro(valor)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{AYUDA_CUENTA_AHORRO}</p>
              </div>
            )}

            {tipo === "card" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cupo">Cupo (opcional)</Label>
                  <CampoMonto
                    id="cupo"
                    moneda={monedaElegida}
                    value={cupo}
                    onChange={setCupo}
                    // El cupo es lo máximo que puede deberse: siempre positivo.
                    permiteSigno={false}
                    placeholder="0"
                    aria-invalid={Boolean(errores.cupo)}
                  />
                  {errores.cupo ? (
                    <p className="text-xs text-destructive">{errores.cupo}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Cuánto puedes deber como máximo. Con esto la tarjeta muestra cuánto te queda
                      disponible.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cuenta-vinculada">Cuenta desde la que pagas (opcional)</Label>
                  {cuentasParaVincular.length > 0 ? (
                    <Select
                      value={cuentaVinculada}
                      onValueChange={(valor) =>
                        setCuentaVinculada(valor === null ? undefined : valor)
                      }
                    >
                      <SelectTrigger id="cuenta-vinculada" className="w-full">
                        <SelectValue placeholder="Elige una cuenta">
                          {(valor: string) =>
                            cuentasParaVincular.find((cuenta) => cuenta.id === valor)?.name ?? valor
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {cuentasParaVincular.map((cuenta) => (
                          <SelectItem key={cuenta.id} value={cuenta.id}>
                            {cuenta.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      Primero crea una cuenta en {monedaElegida} para vincularla: desde ahí se
                      pagará esta tarjeta. Puedes vincularla después.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Se usa para precargar el botón de pagar tarjeta. La puedes cambiar cuando
                    quieras.
                  </p>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saldo-inicial">Saldo inicial (opcional)</Label>
              <CampoMonto
                id="saldo-inicial"
                moneda={monedaElegida}
                value={saldoInicial}
                onChange={setSaldoInicial}
                // Una cuenta puede arrancar en deuda (ej. una tarjeta), así
                // que el signo menos adelante sí vale.
                permiteSigno={true}
                placeholder="0"
                aria-invalid={Boolean(errores.saldoInicial)}
              />
              {errores.saldoInicial ? (
                <p className="text-xs text-destructive">{errores.saldoInicial}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {tipo === "card"
                    ? "Cuánto debes hoy en esta tarjeta. Deuda nueva, escríbelo con signo menos."
                    : "Lo que ya tienes hoy en esta cuenta. Si es una deuda, escríbelo con signo menos."}
                </p>
              )}
            </div>
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={crearCuenta.isPending}>
              {crearCuenta.isPending ? "Creando…" : "Crear cuenta"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

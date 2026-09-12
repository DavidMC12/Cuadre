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
import { useCrearCuenta } from "@/hooks/use-cuentas";
import { usePerfil } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { TipoCuenta } from "@/lib/api/types";
import { ETIQUETA_TIPO_CUENTA, MONEDAS } from "@/lib/labels";
import { normalizarMontoConSigno } from "@/lib/money";

const TIPOS: TipoCuenta[] = ["bank", "card", "cash"];

export function FormularioCuenta({ children }: { children: React.ReactNode }) {
  const { data: perfil } = usePerfil();

  // La preferencia de los ajustes decide cuál viene marcada. Si no hay ninguna
  // elegida —o el perfil todavía no llega— manda la primera de la lista.
  const monedaPreferida = perfil?.defaultCurrency ?? MONEDAS[0];

  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>("bank");
  const [moneda, setMoneda] = useState<string | null>(null);
  const [saldoInicial, setSaldoInicial] = useState("");
  const [errores, setErrores] = useState<{ nombre?: string; saldoInicial?: string }>({});

  const crearCuenta = useCrearCuenta();

  // Null significa "no la he tocado": así, si el perfil llega después de que se
  // abrió el formulario, la marcada se corrige sola, pero una moneda ya elegida
  // a mano no se pisa.
  const monedaElegida = moneda ?? monedaPreferida;

  const monedasOfrecidas: string[] = MONEDAS.includes(monedaPreferida as (typeof MONEDAS)[number])
    ? [...MONEDAS]
    : [...MONEDAS, monedaPreferida];

  function reiniciar() {
    setNombre("");
    setTipo("bank");
    setMoneda(null);
    setSaldoInicial("");
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
      const normalizado = normalizarMontoConSigno(saldoInicial);
      if (normalizado === null) {
        nuevosErrores.saldoInicial = "Escribe solo números, con hasta 4 decimales.";
      } else {
        saldoNormalizado = normalizado;
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
                  if (valores.length > 0) setMoneda(valores[0]!);
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saldo-inicial">Saldo inicial (opcional)</Label>
              <Input
                id="saldo-inicial"
                inputMode="decimal"
                placeholder="0"
                value={saldoInicial}
                onChange={(evento) => setSaldoInicial(evento.target.value)}
                aria-invalid={Boolean(errores.saldoInicial)}
              />
              {errores.saldoInicial ? (
                <p className="text-xs text-destructive">{errores.saldoInicial}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Lo que ya tienes hoy en esta cuenta. Si es una deuda, escríbelo con signo menos.
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

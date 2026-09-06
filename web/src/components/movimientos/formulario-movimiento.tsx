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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SelectorCategoria } from "@/components/movimientos/selector-categoria";
import { useCrearMovimiento } from "@/hooks/use-movimientos";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { fechaParaInput, inputAIso } from "@/lib/fecha";
import { normalizarMontoIngresado } from "@/lib/money";

type TipoMonto = "gasto" | "ingreso";

export function FormularioMovimiento({
  cuentas,
  cuentaIdPorDefecto,
  children,
}: {
  cuentas: Cuenta[];
  cuentaIdPorDefecto?: string;
  children: React.ReactNode;
}) {
  const hoyInput = () => fechaParaInput(new Date().toISOString());

  const [abierto, setAbierto] = useState(false);
  const [cuentaId, setCuentaId] = useState(cuentaIdPorDefecto ?? cuentas[0]?.id ?? "");
  const [tipoMonto, setTipoMonto] = useState<TipoMonto>("gasto");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyInput);
  const [descripcion, setDescripcion] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [errores, setErrores] = useState<{ cuenta?: string; monto?: string }>({});

  const crearMovimiento = useCrearMovimiento();
  const hayCuentas = cuentas.length > 0;

  function reiniciar() {
    setCuentaId(cuentaIdPorDefecto ?? cuentas[0]?.id ?? "");
    setTipoMonto("gasto");
    setMonto("");
    setFecha(hoyInput());
    setDescripcion("");
    setCategoryId(undefined);
    setErrores({});
  }

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const nuevosErrores: typeof errores = {};
    if (!cuentaId) nuevosErrores.cuenta = "Elige una cuenta.";

    const montoNormalizado = normalizarMontoIngresado(monto);
    if (montoNormalizado === null) {
      nuevosErrores.monto = "Escribe solo números, con hasta 4 decimales.";
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || montoNormalizado === null) return;

    const montoConSigno = tipoMonto === "gasto" ? `-${montoNormalizado}` : montoNormalizado;

    crearMovimiento.mutate(
      {
        accountId: cuentaId,
        amount: montoConSigno,
        occurredAt: inputAIso(fecha),
        description: descripcion.trim() || undefined,
        categoryId,
      },
      {
        onSuccess: () => {
          toast.success("Movimiento registrado.");
          setAbierto(false);
          reiniciar();
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message);
          } else {
            toast.error("No se pudo registrar el movimiento. Intenta de nuevo.");
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
        if (!valor) {
          reiniciar();
        } else if (!cuentaId) {
          // Si el drawer se montó antes de que `cuentas` terminara de cargar,
          // la cuenta por defecto se quedó vacía; al abrir ya hay datos.
          setCuentaId(cuentaIdPorDefecto ?? cuentas[0]?.id ?? "");
        }
      }}
    >
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>
        {!hayCuentas ? (
          <>
            <DrawerHeader>
              <DrawerTitle>Nuevo movimiento</DrawerTitle>
              <DrawerDescription>
                Primero crea una cuenta: un movimiento siempre pertenece a una.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button variant="outline" onClick={() => setAbierto(false)}>
                Entendido
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <form onSubmit={manejarEnvio} className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader>
              <DrawerTitle>Nuevo movimiento</DrawerTitle>
              <DrawerDescription>Registra un gasto o un ingreso.</DrawerDescription>
            </DrawerHeader>

            <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cuenta-movimiento">Cuenta</Label>
                <Select value={cuentaId} onValueChange={(valor) => setCuentaId(valor ?? "")}>
                  <SelectTrigger
                    id="cuenta-movimiento"
                    className="w-full"
                    aria-invalid={Boolean(errores.cuenta)}
                  >
                    {/* El popup de opciones vive en un portal que no está
                        montado mientras el selector está cerrado: hay que
                        resolver el nombre a mano, no asumir que lo encuentra solo. */}
                    <SelectValue placeholder="Elige una cuenta">
                      {(valor: string) => cuentas.find((cuenta) => cuenta.id === valor)?.name ?? valor}
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
                {errores.cuenta && <p className="text-xs text-destructive">{errores.cuenta}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <ToggleGroup
                  value={[tipoMonto]}
                  onValueChange={(valores) => {
                    if (valores.length > 0) {
                      setTipoMonto(valores[0] as TipoMonto);
                      // Gasto e ingreso tienen categorías distintas: la que
                      // estaba elegida ya no aplica.
                      setCategoryId(undefined);
                    }
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <ToggleGroupItem value="gasto" className="flex-1">
                    Gasto
                  </ToggleGroupItem>
                  <ToggleGroupItem value="ingreso" className="flex-1">
                    Ingreso
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monto-movimiento">Monto</Label>
                <Input
                  id="monto-movimiento"
                  inputMode="decimal"
                  placeholder="0"
                  value={monto}
                  onChange={(evento) => setMonto(evento.target.value)}
                  aria-invalid={Boolean(errores.monto)}
                  autoFocus
                />
                {errores.monto && <p className="text-xs text-destructive">{errores.monto}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha-movimiento">Fecha</Label>
                <Input
                  id="fecha-movimiento"
                  type="date"
                  value={fecha}
                  max={hoyInput()}
                  onChange={(evento) => setFecha(evento.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="descripcion-movimiento">Descripción (opcional)</Label>
                <Input
                  id="descripcion-movimiento"
                  placeholder="Ej. Mercado de la semana"
                  value={descripcion}
                  onChange={(evento) => setDescripcion(evento.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoria-movimiento">Categoría (opcional)</Label>
                <SelectorCategoria
                  id="categoria-movimiento"
                  kind={tipoMonto === "gasto" ? "expense" : "income"}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </div>
            </div>

            <DrawerFooter>
              <Button type="submit" disabled={crearMovimiento.isPending}>
                {crearMovimiento.isPending ? "Registrando…" : "Registrar"}
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}

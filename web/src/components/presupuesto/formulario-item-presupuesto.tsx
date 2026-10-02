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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CampoMonto } from "@/components/campo-monto";
import {
  useArchivarItemPresupuesto,
  useCrearItemPresupuesto,
  useDesarchivarItemPresupuesto,
  useEditarEtiquetaItem,
  useFijarMontoDelMes,
} from "@/hooks/use-presupuesto";
import { useCategorias } from "@/hooks/use-categorias";
import { useCuentas } from "@/hooks/use-cuentas";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { ItemPresupuesto } from "@/lib/api/types";
import { nombreDelMes, mesActual } from "@/lib/fecha";
import { aUnidadesMinimas, normalizarMontoIngresado, textoEditable } from "@/lib/money";

/** El componente Select no acepta un value vacío; este valor marca "ninguna". */
const NINGUNO = "__sin_elegir__";

/**
 * Crear o editar un ítem del checklist.
 *
 * Sin `item` crea uno nuevo: se elige si es un tope de gasto en una categoría
 * o una meta para una cuenta de ahorro, y después el monto. La moneda de un
 * ítem de categoría es la del checklist que lo pide, y la de uno de ahorro es
 * la de la cuenta — por eso el formulario no pregunta moneda.
 *
 * Con `item` edita: fija el monto del MES QUE SE ESTÁ VIENDO (`mes`), la
 * etiqueta, y archivar o restaurar. Cada mes lleva su propio monto, así que
 * editar un mes pasado ya es cosa normal, sin historial de versiones a la
 * vista. Desde la cuenta de otra persona no se abre nada: el servidor
 * rechazaría la escritura de todos modos.
 */
export function FormularioItemPresupuesto({
  item,
  moneda,
  mes,
  children,
}: {
  item?: ItemPresupuesto;
  moneda: string;
  /** El mes que se está viendo ("YYYY-MM"): donde nacen o se cambian los montos. */
  mes?: string;
  children: React.ReactNode;
}) {
  const soloMirar = useSoloMirar();
  const { data: categorias } = useCategorias();
  const { data: cuentas } = useCuentas();

  // El mes del formulario: el que la pantalla está viendo, o el actual si
  // nadie lo dijo (el panel actual todavía no lo pasa; el servidor hace lo
  // mismo por defecto).
  const mesVisto = mes ?? mesActual();

  const categoriasDeGasto = (categorias ?? []).filter(
    (categoria) => categoria.kind === "expense" && !categoria.archivedAt
  );
  const cuentasDeAhorro = (cuentas ?? []).filter(
    (cuenta) => cuenta.isSavings && !cuenta.archivedAt
  );

  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"category" | "savings">(item ? item.kind : "category");
  const [categoriaId, setCategoriaId] = useState<string | undefined>(item?.categoryId ?? undefined);
  const [cuentaId, setCuentaId] = useState<string | undefined>(item?.accountId ?? undefined);
  const [monto, setMonto] = useState(
    item?.currentAmount ? textoEditable(item.currentAmount, item.currency) : ""
  );
  const [etiqueta, setEtiqueta] = useState(item?.label ?? "");
  const [errorMonto, setErrorMonto] = useState<string | null>(null);

  const crear = useCrearItemPresupuesto();
  const fijarMonto = useFijarMontoDelMes();
  const editarEtiqueta = useEditarEtiquetaItem();
  const archivar = useArchivarItemPresupuesto();
  const desarchivar = useDesarchivarItemPresupuesto();

  const seleccionada = cuentasDeAhorro.find((cuenta) => cuenta.id === cuentaId) ?? null;

  // La moneda con la que se lee lo escrito: la de la cuenta de ahorro elegida,
  // o la del checklist para un ítem de categoría.
  const monedaDelMonto = seleccionada?.currency ?? moneda;

  function etiquetaNueva(): string | null {
    const limpia = etiqueta.trim();
    return limpia === "" ? null : limpia;
  }

  function reiniciar() {
    setTipo(item ? item.kind : "category");
    setCategoriaId(item?.categoryId ?? undefined);
    setCuentaId(item?.accountId ?? undefined);
    setMonto(item?.currentAmount ? textoEditable(item.currentAmount, item.currency) : "");
    setEtiqueta(item?.label ?? "");
    setErrorMonto(null);
  }

  function cerrarYReiniciar() {
    setAbierto(false);
    reiniciar();
  }

  function errorDeApi(error: unknown, respaldo: string): string {
    return error instanceof ApiError ? error.message : respaldo;
  }

  async function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const lectura = normalizarMontoIngresado(monto, monedaDelMonto);
    if ("error" in lectura) {
      setErrorMonto(lectura.error);
      return;
    }
    setErrorMonto(null);

    try {
      if (item) {
        // El monto solo se manda si cambió de verdad respecto a lo que muestra
        // el ítem HOY — esa comparación solo es correcta cuando lo que se
        // edita es el mes actual; en otro mes no sabemos el monto que tenía
        // desde el cliente, así que se manda tal cual y la base lo fija.
        // Cada fijación es una fila nueva e inmutable en la base: guardar la
        // misma cifra dos veces dejaría una fila idéntica que no cuenta nada.
        const esElMesActual = mesVisto === mesActual();
        const montoCambio =
          !esElMesActual ||
          !item.currentAmount ||
          aUnidadesMinimas(lectura.monto) !== aUnidadesMinimas(item.currentAmount);

        if (montoCambio) {
          await fijarMonto.mutateAsync({ id: item.id, amount: lectura.monto, month: mesVisto });
        }

        // La etiqueta solo se manda si cambió de verdad: null significa
        // "usa el nombre de la categoría o cuenta otra vez".
        if (etiquetaNueva() !== item.label) {
          await editarEtiqueta.mutateAsync({ id: item.id, label: etiquetaNueva() });
        }

        toast.success("Cambios guardados.");
      } else {
        const etiquetaFinal = etiquetaNueva() ?? undefined;
        if (tipo === "category") {
          if (!categoriaId) {
            setErrorMonto("Elige una categoría.");
            return;
          }
          await crear.mutateAsync({
            kind: "category",
            categoryId: categoriaId,
            currency: moneda,
            amount: lectura.monto,
            label: etiquetaFinal,
            month: mesVisto,
          });
        } else {
          if (!cuentaId) {
            setErrorMonto("Elige una cuenta de ahorro.");
            return;
          }
          await crear.mutateAsync({
            kind: "savings",
            accountId: cuentaId,
            amount: lectura.monto,
            label: etiquetaFinal,
            month: mesVisto,
          });
        }
        toast.success("Ítem agregado al presupuesto.");
      }

      cerrarYReiniciar();
    } catch (error) {
      toast.error(errorDeApi(error, "No se pudo guardar. Intenta de nuevo."));
    }
  }

  async function archivarOrestaurar() {
    if (!item) return;

    try {
      if (item.archivedAt) {
        await desarchivar.mutateAsync(item.id);
        toast.success("Ítem restaurado.");
      } else {
        await archivar.mutateAsync(item.id);
        toast.success("Ítem archivado.");
      }
      cerrarYReiniciar();
    } catch (error) {
      toast.error(errorDeApi(error, "No se pudo completar. Intenta de nuevo."));
    }
  }

  if (soloMirar) return <>{children}</>;

  const guardando = crear.isPending || fijarMonto.isPending || editarEtiqueta.isPending;

  const sinOpciones =
    !item && (tipo === "category" ? categoriasDeGasto : cuentasDeAhorro).length === 0;

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
            <DrawerTitle>{item ? "Editar ítem" : "Agregar al presupuesto"}</DrawerTitle>
            <DrawerDescription>
              {item
                ? `Este monto aplica solo a ${nombreDelMes(mesVisto)}. Cada mes lleva el suyo.`
                : `Cuánto esperas gastar en una categoría, o aportar a una cuenta de ahorro, en ${nombreDelMes(mesVisto)}.`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {!item && (
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <ToggleGroup
                  value={[tipo]}
                  onValueChange={(valores) => {
                    if (valores.length > 0) setTipo(valores[0] as "category" | "savings");
                  }}
                  variant="outline"
                  size="tap"
                  className="w-full"
                >
                  <ToggleGroupItem value="category" className="flex-1">
                    Categoría
                  </ToggleGroupItem>
                  <ToggleGroupItem value="savings" className="flex-1">
                    Ahorro
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            {!item && tipo === "category" && (
              <div className="flex flex-col gap-1.5">
                <Label>Categoría</Label>
                <Select
                  value={categoriaId ?? NINGUNO}
                  onValueChange={(valor) =>
                    setCategoriaId(valor === NINGUNO || valor == null ? undefined : valor)
                  }
                  disabled={categoriasDeGasto.length === 0}
                >
                  <SelectTrigger className="w-full" aria-invalid={Boolean(errorMonto)}>
                    {/* El popup con las opciones vive en un portal que no está
                        montado mientras el selector está cerrado, así que el
                        nombre del elegido se resuelve a mano (ver
                        selector-categoria.tsx). */}
                    <SelectValue placeholder="Elige una categoría">
                      {(valor: string) => {
                        const elegida = categoriasDeGasto.find(
                          (categoria) => categoria.id === valor
                        );
                        return (
                          elegida?.name ??
                          (categoriasDeGasto.length === 0
                            ? "No tienes categorías de gasto"
                            : "Elige una categoría")
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasDeGasto.map((categoria) => (
                      <SelectItem key={categoria.id} value={categoria.id}>
                        {categoria.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!item && tipo === "savings" && (
              <div className="flex flex-col gap-1.5">
                <Label>Cuenta de ahorro</Label>
                <Select
                  value={cuentaId ?? NINGUNO}
                  onValueChange={(valor) =>
                    setCuentaId(valor === NINGUNO || valor == null ? undefined : valor)
                  }
                  disabled={cuentasDeAhorro.length === 0}
                >
                  <SelectTrigger className="w-full" aria-invalid={Boolean(errorMonto)}>
                    <SelectValue placeholder="Elige una cuenta">
                      {(valor: string) => {
                        const elegida = cuentasDeAhorro.find((cuenta) => cuenta.id === valor);
                        return (
                          (elegida ? `${elegida.name} · ${elegida.currency}` : undefined) ??
                          (cuentasDeAhorro.length === 0
                            ? "No tienes cuentas de ahorro"
                            : "Elige una cuenta")
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {cuentasDeAhorro.map((cuenta) => (
                      <SelectItem key={cuenta.id} value={cuenta.id}>
                        {cuenta.name} · {cuenta.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="monto-item">Monto</Label>
              <CampoMonto
                id="monto-item"
                moneda={monedaDelMonto}
                value={monto}
                onChange={setMonto}
                // El checklist espera montos siempre positivos.
                permiteSigno={false}
                placeholder="0"
                aria-invalid={Boolean(errorMonto)}
              />
              {errorMonto && <p className="text-xs text-destructive">{errorMonto}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="etiqueta-item">Etiqueta (opcional)</Label>
              <Input
                id="etiqueta-item"
                placeholder={tipo === "category" ? "Ej. Mercado del mes" : "Ej. Apartado viaje"}
                value={etiqueta}
                onChange={(evento) => setEtiqueta(evento.target.value)}
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                Si no pones una, se usa el nombre de la categoría o de la cuenta.
              </p>
            </div>

            {item && (
              <Button
                type="button"
                variant="outline"
                onClick={archivarOrestaurar}
                disabled={archivar.isPending || desarchivar.isPending}
              >
                {item.archivedAt ? "Restaurar" : "Archivar"}
              </Button>
            )}
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={guardando || sinOpciones}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

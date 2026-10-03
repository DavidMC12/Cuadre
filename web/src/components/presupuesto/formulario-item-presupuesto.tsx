'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CampoMonto } from '@/components/campo-monto';
import {
  useArchivarItemPresupuesto,
  useCrearItemPresupuesto,
  useDesarchivarItemPresupuesto,
  useEditarEtiquetaItem,
  useFijarMontoDelMes,
} from '@/hooks/use-presupuesto';
import { useCategorias } from '@/hooks/use-categorias';
import { useCuentas } from '@/hooks/use-cuentas';
import { useSoloMirar } from '@/hooks/use-perfil';
import { ApiError } from '@/lib/api/client';
import type { ItemPresupuesto } from '@/lib/api/types';
import { nombreDelMes, mesActual } from '@/lib/fecha';
import { aUnidadesMinimas, normalizarMontoIngresado, textoEditable } from '@/lib/money';

/** El componente Select no acepta un value vacío; este valor marca "ninguna". */
const NINGUNO = '__sin_elegir__';

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
 *
 * `montoDelMes` es el monto que el ítem tenía en ese mes visto (el `target`
 * del renglón del checklist): sirve tanto para prellenar el campo al editar
 * como para no mandar el servidor cuando el monto no cambió. Si no llega
 * porque nadie lo pasó, el formulario usa el monto vigente HOY, que solo es
 * el correcto cuando el mes visto es el actual.
 */
export function FormularioItemPresupuesto({
  item,
  moneda,
  mes,
  montoDelMes,
  children,
}: {
  item?: ItemPresupuesto;
  moneda: string;
  /** El mes que se está viendo ("YYYY-MM"): donde nacen o se cambian los montos. */
  mes?: string;
  /**
   * El monto del ítem en `mes` ("124.0000"), o `null` si el ítem no existía
   * aún en ese mes. Distinto de no pasar nada: `undefined` dice "usa el
   * monto vigente hoy" (comportamiento antiguo, mes actual).
   */
  montoDelMes?: string | null;
  children: React.ReactNode;
}) {
  const soloMirar = useSoloMirar();
  const { data: categorias } = useCategorias();
  const { data: cuentas } = useCuentas();

  // El mes del formulario: el que la pantalla está viendo. Si nadie lo pasa
  // (el panel ya lo pasa), cae al actual, igual que el servidor por defecto.
  const mesVisto = mes ?? mesActual();

  // El monto que importa: el del mes visto cuando se dijo, o el de hoy. Del
  // que sale el prellenado y la comparación de "¿cambió de verdad?".
  const montoDeReferencia = montoDelMes === undefined ? (item?.currentAmount ?? null) : montoDelMes;

  const todasLasCategorias = (categorias ?? []).filter((categoria) => !categoria.archivedAt);
  const categoriasDeGasto = todasLasCategorias.filter((categoria) => categoria.kind === 'expense');
  const categoriasDeIngreso = todasLasCategorias.filter((categoria) => categoria.kind === 'income');
  const cuentasDeAhorro = (cuentas ?? []).filter(
    (cuenta) => cuenta.isSavings && !cuenta.archivedAt,
  );

  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<'category' | 'savings'>(item ? item.kind : 'category');
  const [categoriaId, setCategoriaId] = useState<string | undefined>(item?.categoryId ?? undefined);
  const [cuentaId, setCuentaId] = useState<string | undefined>(item?.accountId ?? undefined);

  const seleccionada = cuentasDeAhorro.find((cuenta) => cuenta.id === cuentaId) ?? null;

  // La moneda con la que se lee lo escrito: la de la cuenta de ahorro elegida,
  // o la del checklist para un ítem de categoría.
  const monedaDelMonto = seleccionada?.currency ?? moneda;

  // Qué dice el campo de monto: en una categoría de INGRESO se espera
  // recibir; en una de gasto, gastar; en una cuenta de ahorro, aportar.
  // La categoría elegida manda; en modo edición, si la categoría ya está
  // archivada y no aparece en la lista, dice el tipo que el ítem lleva
  // copiado (categoryKind) — nunca el default de gasto por descarte.
  const categoriaElegida = todasLasCategorias.find(
    (categoria) =>
      categoria.id === (categoriaId ?? (item?.kind === 'category' ? item.categoryId : undefined)),
  );
  const verboDelMonto =
    tipo === 'savings'
      ? 'aportar'
      : (categoriaElegida?.kind ?? (item?.kind === 'category' ? item.categoryKind : undefined)) ===
          'income'
        ? 'recibir'
        : 'gastar';

  const [monto, setMonto] = useState(() =>
    montoDeReferencia ? textoEditable(montoDeReferencia, monedaDelMonto) : '',
  );
  const [etiqueta, setEtiqueta] = useState(item?.label ?? '');
  const [errorMonto, setErrorMonto] = useState<string | null>(null);

  const crear = useCrearItemPresupuesto();
  const fijarMonto = useFijarMontoDelMes();
  const editarEtiqueta = useEditarEtiquetaItem();
  const archivar = useArchivarItemPresupuesto();
  const desarchivar = useDesarchivarItemPresupuesto();

  // Todo lo que define qué hay en el campo: si cambia con el formulario
  // montado (cambió el mes que se ve, o llegó el monto fresco de una
  // recarga), el estado queda pisado con la respuesta del mes anterior y
  // un 'Guardar' sin tocar escribiría la cifra equivocada. Al detectar el
  // cambio (incluido el abrir del cajón), el estado vuelve a nacer de los
  // props. Escribe lo que tengas pendiente no lo toca: las dependencias no
  // incluyen lo tecleado.
  // ¿Hay texto que la persona tecleó y aún no se guardó? Un ref, no estado:
  // no dibuja nada, solo alimenta la decisión del efecto de abajo. Se enciende
  // con cada tecleo (monto o etiqueta) y se apaga al reiniciar (cerrar,
  // guardar bien o llamar a reiniciar), que es cuando el texto pendiente deja
  // de existir de verdad.
  const hayTextoPendiente = useRef(false);

  const claveDelContexto = `${abierto}|${mesVisto}|${montoDeReferencia ?? ''}|${item?.id ?? ''}|${item?.label ?? ''}`;
  const claveVista = useRef(claveDelContexto);
  const mesVistoAnterior = useRef(mesVisto);
  useEffect(() => {
    const cambioDeMes = mesVistoAnterior.current !== mesVisto;
    mesVistoAnterior.current = mesVisto;
    if (claveVista.current !== claveDelContexto) {
      claveVista.current = claveDelContexto;
      // Distinguir "llegó dato fresco" de "hay texto sin guardar": la clave
      // del contexto incluye el monto de referencia, así que un refetch que
      // ve data nueva (por ejemplo, el monto que sí se guardó mientras la
      // etiqueta fallaba) dispara este efecto con el formulario ABIERTO y
      // texto en los campos. Reiniciar aquí borraría lo tecleado, aunque el
      // guardado no terminó — exactamente lo que el toast de error promete
      // que se conserva. Si hay texto pendiente, el dato fresco no lo pisa.
      //
      // El cambio de MES es distinto: el texto tecleado describe un monto
      // del mes que se veía antes, así que ya no aplica y el reinicio sigue
      // aunque haya texto pendiente (hoy el cajón es modal y no deja tocar
      // el selector, pero la regla no depende de eso).
      if (!hayTextoPendiente.current || cambioDeMes) {
        reiniciar();
      }
    }
    // El guard (claveVista) hace que solo se reinicie cuando el contexto de
    // los props cambió; reiniciar solo lee props, nunca el texto tecleado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDelContexto]);

  function etiquetaNueva(): string | null {
    const limpia = etiqueta.trim();
    return limpia === '' ? null : limpia;
  }

  function reiniciar() {
    setTipo(item ? item.kind : 'category');
    setCategoriaId(item?.categoryId ?? undefined);
    setCuentaId(item?.accountId ?? undefined);
    setMonto(montoDeReferencia ? textoEditable(montoDeReferencia, monedaDelMonto) : '');
    setEtiqueta(item?.label ?? '');
    setErrorMonto(null);
    hayTextoPendiente.current = false;
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
    if ('error' in lectura) {
      setErrorMonto(lectura.error);
      return;
    }
    setErrorMonto(null);

    try {
      if (item) {
        // El monto solo se manda si cambió de verdad respecto al monto del
        // mes visto (`montoDeReferencia`). Si el mes visto no tiene monto
        // aún (`null`, el ítem no existía ese mes) o ningún monto de
        // referencia llegó, siempre se manda. Cada fijación es una fila
        // nueva e inmutable en la base: guardar la misma cifra dos veces
        // dejaría una fila idéntica que no cuenta nada.
        const montoCambio =
          !montoDeReferencia ||
          aUnidadesMinimas(lectura.monto) !== aUnidadesMinimas(montoDeReferencia);

        if (montoCambio) {
          await fijarMonto.mutateAsync({ id: item.id, amount: lectura.monto, month: mesVisto });
        }

        // La etiqueta solo se manda si cambió de verdad: null significa
        // "usa el nombre de la categoría o cuenta otra vez".
        if (etiquetaNueva() !== item.label) {
          await editarEtiqueta.mutateAsync({ id: item.id, label: etiquetaNueva() });
        }

        toast.success('Cambios guardados.');
      } else {
        const etiquetaFinal = etiquetaNueva() ?? undefined;
        if (tipo === 'category') {
          if (!categoriaId) {
            setErrorMonto('Elige una categoría.');
            return;
          }
          await crear.mutateAsync({
            kind: 'category',
            categoryId: categoriaId,
            currency: moneda,
            amount: lectura.monto,
            label: etiquetaFinal,
            month: mesVisto,
          });
        } else {
          if (!cuentaId) {
            setErrorMonto('Elige una cuenta de ahorro.');
            return;
          }
          await crear.mutateAsync({
            kind: 'savings',
            accountId: cuentaId,
            amount: lectura.monto,
            label: etiquetaFinal,
            month: mesVisto,
          });
        }
        toast.success('Ítem agregado al presupuesto.');
      }

      cerrarYReiniciar();
    } catch (error) {
      toast.error(errorDeApi(error, 'No se pudo guardar. Intenta de nuevo.'));
    }
  }

  async function archivarOrestaurar() {
    if (!item) return;

    try {
      if (item.archivedAt) {
        await desarchivar.mutateAsync(item.id);
        toast.success('Ítem restaurado.');
      } else {
        await archivar.mutateAsync(item.id);
        toast.success('Ítem archivado.');
      }
      cerrarYReiniciar();
    } catch (error) {
      toast.error(errorDeApi(error, 'No se pudo completar. Intenta de nuevo.'));
    }
  }

  if (soloMirar) return <>{children}</>;

  const guardando = crear.isPending || fijarMonto.isPending || editarEtiqueta.isPending;

  const sinOpciones =
    !item && (tipo === 'category' ? todasLasCategorias.length === 0 : cuentasDeAhorro.length === 0);

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
            <DrawerTitle>{item ? 'Editar ítem' : 'Agregar al presupuesto'}</DrawerTitle>
            <DrawerDescription>
              {item
                ? `Este es el monto de ${nombreDelMes(mesVisto)}. Los meses que ya pasaron no cambian; los que aún no llegan lo heredan hasta que les pongas el suyo.`
                : `El ítem rige desde ${nombreDelMes(mesVisto)}. Cuánto esperas ${
                    tipo === 'savings' ? 'aportar a la cuenta' : `${verboDelMonto} en la categoría`
                  }.`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {!item && (
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <ToggleGroup
                  value={[tipo]}
                  onValueChange={(valores) => {
                    if (valores.length > 0) setTipo(valores[0] as 'category' | 'savings');
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

            {!item && tipo === 'category' && (
              <div className="flex flex-col gap-1.5">
                <Label>Categoría</Label>
                <Select
                  value={categoriaId ?? NINGUNO}
                  onValueChange={(valor) =>
                    setCategoriaId(valor === NINGUNO || valor == null ? undefined : valor)
                  }
                  disabled={todasLasCategorias.length === 0}
                >
                  <SelectTrigger className="w-full" aria-invalid={Boolean(errorMonto)}>
                    {/* El popup con las opciones vive en un portal que no está
                        montado mientras el selector está cerrado, así que el
                        nombre del elegido se resuelve a mano (ver
                        selector-categoria.tsx). */}
                    <SelectValue placeholder="Elige una categoría">
                      {(valor: string) => {
                        const elegida = todasLasCategorias.find(
                          (categoria) => categoria.id === valor,
                        );
                        return (
                          elegida?.name ??
                          (todasLasCategorias.length === 0
                            ? 'No tienes categorías'
                            : 'Elige una categoría')
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Los dos lados conviven en el presupuesto: hay que ver en
                        qué grupo cae cada categoría para saber si el monto es
                        lo que se espera gastar o recibir. */}
                    {categoriasDeGasto.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Gastos</SelectLabel>
                        {categoriasDeGasto.map((categoria) => (
                          <SelectItem key={categoria.id} value={categoria.id}>
                            {categoria.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {categoriasDeIngreso.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Ingresos</SelectLabel>
                        {categoriasDeIngreso.map((categoria) => (
                          <SelectItem key={categoria.id} value={categoria.id}>
                            {categoria.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!item && tipo === 'savings' && (
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
                            ? 'No tienes cuentas de ahorro'
                            : 'Elige una cuenta')
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
                onChange={(valor) => {
                  hayTextoPendiente.current = true;
                  setMonto(valor);
                }}
                // El checklist espera montos siempre positivos.
                permiteSigno={false}
                placeholder="0"
                aria-invalid={Boolean(errorMonto)}
              />
              {errorMonto && <p className="text-xs text-destructive">{errorMonto}</p>}
              {/* El verbo manda: lo que se espera gastar (categoría de gasto),
                  recibir (categoría de ingreso) o aportar (ahorro). */}
              {!errorMonto && (
                <p className="text-xs text-muted-foreground">Cuánto esperas {verboDelMonto}.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="etiqueta-item">Etiqueta (opcional)</Label>
              <Input
                id="etiqueta-item"
                placeholder={tipo === 'category' ? 'Ej. Mercado del mes' : 'Ej. Apartado viaje'}
                value={etiqueta}
                onChange={(evento) => {
                  hayTextoPendiente.current = true;
                  setEtiqueta(evento.target.value);
                }}
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
                {item.archivedAt ? 'Restaurar' : 'Archivar'}
              </Button>
            )}
          </div>

          <DrawerFooter>
            <Button type="submit" disabled={guardando || sinOpciones}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

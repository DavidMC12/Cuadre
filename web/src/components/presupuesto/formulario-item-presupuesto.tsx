'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
import { aUnidadesMinimas, esCero, normalizarMontoIngresado, textoEditable } from '@/lib/money';

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
 * vista. Ese mes también puede quedar "este mes no aplica": la acción
 * secundaria lo fija en 0 (reversible, sin confirmación), el cajón muestra
 * el estado y "Poner monto" repone un monto positivo. El campo de monto
 * normal SIEMPRE rechaza el cero — el 0 solo entra por esa acción.
 *
 * Desde la cuenta de otra persona no se abre nada: el servidor
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
  const idBase = useId();
  const idTipo = `${idBase}-tipo`;
  const idCategoria = `${idBase}-categoria`;
  const idCuenta = `${idBase}-cuenta`;
  const idMonto = `${idBase}-monto`;
  const idEtiqueta = `${idBase}-etiqueta`;
  // Cada campo describe su propio error: el mensaje vive en el contenedor
  // del campo que lo dice, y el control enlaza a ESE mensaje con
  // `aria-describedby` (antes un solo `idError` compartido hacía que el
  // error de Categoría/Cuenta se pintara bajo el Monto).
  const idErrorMonto = `${idBase}-error-monto`;
  const idErrorCategoria = `${idBase}-error-categoria`;
  const idErrorCuenta = `${idBase}-error-cuenta`;
  const { data: categorias } = useCategorias();
  const { data: cuentas } = useCuentas();

  // El mes del formulario: el que la pantalla está viendo. Si nadie lo pasa
  // (el panel ya lo pasa), cae al actual, igual que el servidor por defecto.
  const mesVisto = mes ?? mesActual();

  // El monto que importa: el del mes visto cuando se dijo, o el de hoy. Del
  // que sale el prellenado y la comparación de "¿cambió de verdad?".
  const montoDeReferencia = montoDelMes === undefined ? (item?.currentAmount ?? null) : montoDelMes;

  // "Este mes no aplica": el monto de referencia del mes visto existe y es
  // cero. Cuando `montoDelMes` no llega, la referencia ES el
  // `currentAmount` del ítem (el contrato del modo antiguo: vale solo
  // sobre el mes actual), así que se lee del MISMO sitio que el prellenado
  // y `reiniciar()` — que el estado, el campo y el botón vean la misma
  // realidad. Distinto de `montoDelMes` null (el ítem no existía ese mes:
  // "sin monto", no "sin presupuesto"). Y `'0.0000'` es truthy: el cero se
  // lee con `esCero`, nunca con la verdad/falsedad del string.
  const mesNoAplica = Boolean(
    item && montoDeReferencia && esCero(montoDeReferencia),
  );

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
    // El cero del mes no prede el campo: "no aplica" es ausencia de monto,
    // no un monto por guardar. Con el cajón abierto sobre un mes en cero el
    // campo queda vacío, listo para un monto nuevo.
    montoDeReferencia && !esCero(montoDeReferencia)
      ? textoEditable(montoDeReferencia, monedaDelMonto)
      : '',
  );
  const [etiqueta, setEtiqueta] = useState(item?.label ?? '');
  // Un error por campo editable, para que `aria-invalid`/`aria-describedby`
  // apunten al control que de verdad falló y no se cruce el del monto.
  const [errores, setErrores] = useState<{
    monto?: string;
    categoria?: string;
    cuenta?: string;
  }>({});

  const crear = useCrearItemPresupuesto();
  const fijarMonto = useFijarMontoDelMes();
  const editarEtiqueta = useEditarEtiquetaItem();
  const archivar = useArchivarItemPresupuesto();
  const desarchivar = useDesarchivarItemPresupuesto();

  // El contexto del formulario: si cambia con el cajón montado (cambió el
  // mes que se ve, cambió el ítem, o llegó el dato fresco de una recarga),
  // el estado quedaría pisado con la respuesta del contexto anterior y un
  // 'Guardar' sin tocar escribiría valores equivocados. El efecto de abajo
  // lo detecta (incluido el abrir del cajón) y decide entre reiniciar el
  // estado a la precarga o conservar lo editado que está pendiente de
  // guardar.

  // Qué campos editables ha tocado la persona desde el último reinicio: no
  // solo lo tecleado en monto y etiqueta (que fue el error por el que vive
  // esto), sino también el tipo, la categoría o la cuenta de ahorro
  // elegidas, que son decisiones aún no guardadas. Cada setter que responde
  // a un gesto de la persona marca su campo aquí; `reiniciar()` lo vacía,
  // que es el único momento en que el estado vuelve a nacer de los props.
  // Un ref y no un estado derivado por comparación contra la precarga:
  // distingue "la persona lo tocó" de "llegó una precarga tardía", que
  // cambiaría el valor de referencia sin que nadie editara nada.
  const camposTocados = useRef(new Set<string>());
  function marcarTocado(campo: string): void {
    camposTocados.current.add(campo);
  }

  const claveDelContexto = `${abierto}|${mesVisto}|${montoDeReferencia ?? ''}|${item?.id ?? ''}|${item?.label ?? ''}`;
  const claveVista = useRef(claveDelContexto);
  const mesVistoAnterior = useRef(mesVisto);
  const itemAnterior = useRef(item?.id);
  useEffect(() => {
    // Dos cambios que SÍ justifican reiniciar aun habiendo textos pendientes:
    // - El MES: lo tecleado describe un monto del mes que se veía antes y
    //   ya no aplica. (Hoy el cajón es modal y no deja tocar el selector,
    //   pero la regla no depende de eso.)
    // - El ÍTEM: los campos describen el ítem anterior, no el nuevo; un
    //   Guardar escribiría lo de A sobre B.
    const cambioDeMes = mesVistoAnterior.current !== mesVisto;
    const cambioDeItem = itemAnterior.current !== item?.id;
    mesVistoAnterior.current = mesVisto;
    itemAnterior.current = item?.id;
    if (claveVista.current !== claveDelContexto) {
      claveVista.current = claveDelContexto;
      // Distinguir "llegó dato fresco" de "hay algo sin guardar": la clave
      // del contexto incluye el monto de referencia, así que un refetch que
      // ve data nueva (por ejemplo, el monto que sí se guardó mientras la
      // etiqueta fallaba) dispara este efecto con el formulario ABIERTO y
      // campos editados. Reiniciar aquí borraría lo que la persona puso,
      // aunque el toast de error promete que se conserva. Con algo pendiente
      // y sin cambio de mes ni de ítem, el dato fresco no pisa.
      //
      // Un matiz: si la persona escribió y luego volvió el texto a como
      // estaba, el campo queda marcado aunque iguala la precarga. No pasa
      // nada: el reinicio que se salta es exactamente el que la
      // devolvería al mismo valor, así que no hay nada perdido; el estado
      // se sincroniza al cerrar, al guardar o al cambiar el mes o el ítem.
      // (Ver la prueba de revertir abajo.)
      if (camposTocados.current.size === 0 || cambioDeMes || cambioDeItem) {
        reiniciar();
      }
    }
    // El guard (claveVista) hace que solo se reinicie cuando el contexto de
    // los props cambió; reiniciar solo lee props y estado fresco del
    // render, nunca esconde el texto tecleado.
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
    // El mismo criterio del prellenado: el cero del mes es ausencia, no un
    // texto por escribir de vuelta.
    setMonto(montoDeReferencia && !esCero(montoDeReferencia) ? textoEditable(montoDeReferencia, monedaDelMonto) : '');
    setEtiqueta(item?.label ?? '');
    setErrores({});
    camposTocados.current = new Set();
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
      setErrores({ monto: lectura.error });
      return;
    }
    // El campo normal SIEMPRE pide un monto positivo — al guardar un monto
    // nuevo y también al reponerlo sobre un "no aplica". El cero solo entra
    // por su propio camino: el botón "Este mes no aplica". Si no, decir
    // "no paga este mes" exigiría teclear un 0 en un campo que todo el
    // resto del formulario llama cantidad esperada.
    if (esCero(lectura.monto)) {
      setErrores({ monto: 'El monto debe ser mayor que cero.' });
      return;
    }
    setErrores({});

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
            setErrores({ categoria: 'Elige una categoría.' });
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
            setErrores({ cuenta: 'Elige una cuenta de ahorro.' });
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

  /**
   * Fija el monto del mes que se está viendo en cero — y solo ESE mes.
   *
   * No hay confirmación a propósito: es reversible con un toque (el panel
   * mismo abre el cajón para volver a poner monto), no como archivar. El
   * servidor recibe el 0 en el mismo endpoint de siempre (el monto mínimo
   * cero solo existe para fijar UN mes); crear un ítem sigue exigiendo
   * positivo, y eso no lo cambia nada de acá.
   */
  // Doble toque rápido: el `disabled` de `isPending` salta una render
  // después, y dos PATCH idénticos colarían por esa ventana. El ref cierra.
  const marcandoNoAplica = useRef(false);
  async function marcarNoAplica() {
    if (!item || marcandoNoAplica.current) return;
    marcandoNoAplica.current = true;
    try {
      await fijarMonto.mutateAsync({ id: item.id, amount: '0', month: mesVisto });
      toast.success('Este mes no aplica. Los demás meses siguen igual.');
      cerrarYReiniciar();
    } catch (error) {
      toast.error(errorDeApi(error, 'No se pudo guardar. Intenta de nuevo.'));
    } finally {
      marcandoNoAplica.current = false;
    }
  }

  if (soloMirar) return <>{children}</>;

  const guardando = crear.isPending || fijarMonto.isPending || editarEtiqueta.isPending;

  const sinOpciones =
    !item && (tipo === 'category' ? todasLasCategorias.length === 0 : cuentasDeAhorro.length === 0);

  // Cada error se pinta dentro del contenedor de su campo (ver los ids de
  // arriba), para que "Elige una categoría." aparezca bajo Categoría y no
  // bajo el Monto.

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
                ? mesNoAplica
                  ? `${nombreDelMes(mesVisto)} quedó sin monto: este mes no aplica. Si vuelve a aplicar, escribe el nuevo abajo y toca "Poner monto".`
                  : `Este es el monto de ${nombreDelMes(mesVisto)}. Los meses que ya pasaron no cambian; los que aún no llegan lo heredan hasta que les pongas el suyo.`
                : `El ítem rige desde ${nombreDelMes(mesVisto)}. Cuánto esperas ${
                    tipo === 'savings' ? 'aportar a la cuenta' : `${verboDelMonto} en la categoría`
                  }.`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {/* El estado en palabras: el mes que se mira no tiene monto y
                nadie lo metió de rincón — está dicho arriba, con la misma
                frase de la acción que lo causa. Lo reversible ni se esconde:
                el campo de abajo y "Poner monto" son el camino de vuelta. */}
            {item && mesNoAplica && (
              <div className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2.5">
                <p className="text-sm font-medium">Este mes no aplica</p>
                <p className="text-xs text-muted-foreground">
                  Solo este mes. Los demás meses siguen igual.
                </p>
              </div>
            )}

            {!item && (
              <div className="flex flex-col gap-1.5">
                <Label id={idTipo}>Tipo</Label>
                <ToggleGroup
                  aria-labelledby={idTipo}
                  value={[tipo]}
                  onValueChange={(valores) => {
                    if (valores.length > 0) {
                      marcarTocado('tipo');
                      setTipo(valores[0] as 'category' | 'savings');
                    }
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
                <Label htmlFor={idCategoria}>Categoría</Label>
                <Select
                  value={categoriaId ?? NINGUNO}
                  onValueChange={(valor) => {
                    marcarTocado('categoriaId');
                    setCategoriaId(valor === NINGUNO || valor == null ? undefined : valor);
                  }}
                  disabled={todasLasCategorias.length === 0}
                >
                  <SelectTrigger
                    id={idCategoria}
                    className="min-h-11 w-full"
                    aria-invalid={Boolean(errores.categoria)}
                    aria-describedby={errores.categoria ? idErrorCategoria : undefined}
                  >
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
                {errores.categoria && (
                  <p id={idErrorCategoria} className="text-xs text-destructive">
                    {errores.categoria}
                  </p>
                )}
              </div>
            )}

            {!item && tipo === 'savings' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={idCuenta}>Cuenta de ahorro</Label>
                <Select
                  value={cuentaId ?? NINGUNO}
                  onValueChange={(valor) => {
                    marcarTocado('cuentaId');
                    setCuentaId(valor === NINGUNO || valor == null ? undefined : valor);
                  }}
                  disabled={cuentasDeAhorro.length === 0}
                >
                  <SelectTrigger
                    id={idCuenta}
                    className="min-h-11 w-full"
                    aria-invalid={Boolean(errores.cuenta)}
                    aria-describedby={errores.cuenta ? idErrorCuenta : undefined}
                  >
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
                {errores.cuenta && (
                  <p id={idErrorCuenta} className="text-xs text-destructive">
                    {errores.cuenta}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idMonto}>Monto</Label>
              <CampoMonto
                id={idMonto}
                className="min-h-11"
                moneda={monedaDelMonto}
                value={monto}
                onChange={(valor) => {
                  marcarTocado('monto');
                  setMonto(valor);
                }}
                // El checklist espera montos siempre positivos.
                permiteSigno={false}
                placeholder="0"
                aria-invalid={Boolean(errores.monto)}
                aria-describedby={errores.monto ? idErrorMonto : undefined}
              />
              {errores.monto ? (
                <p id={idErrorMonto} className="text-xs text-destructive">
                  {errores.monto}
                </p>
              ) : (
                // El verbo manda: lo que se espera gastar (categoría de gasto),
                // recibir (categoría de ingreso) o aportar (ahorro).
                <p className="text-xs text-muted-foreground">Cuánto esperas {verboDelMonto}.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idEtiqueta}>Etiqueta (opcional)</Label>
              <Input
                id={idEtiqueta}
                className="min-h-11"
                placeholder={tipo === 'category' ? 'Ej. Mercado del mes' : 'Ej. Apartado viaje'}
                value={etiqueta}
                onChange={(evento) => {
                  marcarTocado('etiqueta');
                  setEtiqueta(evento.target.value);
                }}
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                Si no pones una, se usa el nombre de la categoría o de la cuenta.
              </p>
            </div>

            {item && !mesNoAplica && (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  // El monto individual es dinero: mientras el cajón existe,
                  // solo el dueño lo toca. Bajo suplantación el cajón ni se
                  // monta (el panel lo corta), pero la política se dice en
                  // el propio control.
                  disabled={soloMirar || fijarMonto.isPending}
                  onClick={marcarNoAplica}
                >
                  Este mes no aplica
                </Button>
                {/* La consecuencia en palabras, del lado de la acción que
                    la verdad: sin esto, "no aplica" podría leerse como
                    archivar el ítem o ponerlo a cero para siempre. */}
                <p className="text-xs text-muted-foreground">
                  Solo este mes. Los demás meses siguen igual.
                </p>
              </div>
            )}

            {item && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={archivarOrestaurar}
                disabled={archivar.isPending || desarchivar.isPending}
              >
                {item.archivedAt ? 'Restaurar' : 'Archivar'}
              </Button>
            )}
          </div>

          <DrawerFooter>
            {/* En un mes "no aplica" el botón dice lo que va a hacer de
                verdad: reponer el monto positivo que le falta. Nunca "Poner
                monto" puede mandar un 0: el campo validador lo rechaza. */}
            <Button type="submit" className="min-h-11" disabled={guardando || sinOpciones}>
              {guardando ? 'Guardando…' : item && mesNoAplica ? 'Poner monto' : 'Guardar'}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

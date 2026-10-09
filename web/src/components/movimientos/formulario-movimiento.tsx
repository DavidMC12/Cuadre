"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { CampoMonto } from "@/components/campo-monto";
import {
  CamposPagoDividido,
  type PagoDivididoEnEdicion,
} from "@/components/movimientos/campos-pago-dividido";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCategorias } from "@/hooks/use-categorias";
import { useChecklistDelMes } from "@/hooks/use-presupuesto";
import {
  useCrearMovimiento,
  useCrearPagoDividido,
  useCrearTransferencia,
} from "@/hooks/use-movimientos";
import { usePantallaGrande } from "@/hooks/use-pantalla-grande";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { fechaParaInput, inputAIso } from "@/lib/fecha";
import {
  PREFIJO_CATEGORIA,
  PREFIJO_ITEM,
  PREFIJO_OTRO,
  SIN_CATEGORIA_EN_QUE_FUE,
  leerEleccion,
  opcionesDeEnQueFue,
  textoCerradoDeEnQueFue,
} from "@/lib/desplegable-en-que-fue";
import { agruparItemsDePago, SIN_ITEM, textoDeOpcion } from "@/lib/item-presupuesto";
import { cn } from "@/lib/utils";
import { esCero, normalizarMontoIngresado, textoMonto } from "@/lib/money";
import { cuentasParaLaParte, leerReparto, repartoInicial } from "@/lib/pago-dividido";
import { cuentasDeDestino } from "@/lib/transferencias";

type TipoMonto = "gasto" | "ingreso" | "transferencia";

/**
 * Los valores con los que puede abrir el formulario cuando lo invoca otra
 * pantalla, no un botón visible: hoy, "corregir" un movimiento anulado. Se
 * leen una sola vez, al montar; el que lo invoca lo desmonta al cerrar (con
 * `key` distinta si cambia de movimiento), así que no hace falta reaccionar a
 * cambios posteriores.
 *
 * La compuerta de "Registrar" en corrección compara estos siete campos: tipo,
 * monto, cuenta, categoría, item del presupuesto, fecha y descripción. No
 * precargue una transferencia — "Desde" y "Hacia" quedan fuera de esa
 * comparación, y un reenvío podría irse con las patas del respaldo en vez de
 * las precargadas.
 */
interface ValoresInicialesMovimiento {
  /** Monto ya listo para el campo (mismo formato que `textoEditable`). */
  monto?: string;
  cuentaId?: string;
  categoriaId?: string;
  /** El item del presupuesto al que contaba: `null` = no contaba para ninguno. */
  itemDelPresupuesto?: string | null;
  /** YYYY-MM-DD, como lo espera un `<input type="date">`. */
  fecha?: string;
  descripcion?: string;
  tipo?: TipoMonto;
}

/** El valor del selector que marca "no cuenta para ningún ítem" y la opción
 * con su texto (lo que falta, o el logro) viven en `lib/item-presupuesto.ts`,
 * para que el formulario y el cajón del detalle digan lo mismo. */

/** Dónde se recuerda la última cuenta usada: una comodidad de este aparato,
 * no un dato que haga falta guardar en el servidor. */
const CLAVE_ULTIMA_CUENTA = "cuadre:ultima-cuenta";

function leerUltimaCuenta(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMA_CUENTA);
  } catch {
    // Modo privado, almacenamiento bloqueado: no pasa nada, se usa la primera.
    return null;
  }
}

function recordarCuenta(cuentaId: string): void {
  try {
    localStorage.setItem(CLAVE_ULTIMA_CUENTA, cuentaId);
  } catch {
    // Igual: si no se puede guardar, la próxima vez propone la primera cuenta.
  }
}

/** La cuenta con la que abre el formulario: la que pide quien lo invoca, o si
 * no la última que se usó, o si no la primera de la lista. */
function cuentaPorDefecto(cuentaIdPorDefecto: string | undefined, cuentas: Cuenta[]): string {
  if (cuentaIdPorDefecto) return cuentaIdPorDefecto;
  const recordada = leerUltimaCuenta();
  if (recordada && cuentas.some((cuenta) => cuenta.id === recordada)) return recordada;
  return cuentas[0]?.id ?? "";
}

/** ¿El reparto de dos cuentas es el mismo que traía la precarga? Se comparan
 * las dos cuentas y los dos textos de monto: cambiar el reparto (no solo el
 * total) tiene que habilitar "Registrar" al corregir una compra dividida. */
function mismoReparto(
  actual: PagoDivididoEnEdicion | null,
  inicial: PagoDivididoEnEdicion | null
): boolean {
  if (actual === null || inicial === null) return actual === inicial;
  return (
    actual.cuenta1Id === inicial.cuenta1Id &&
    actual.cuenta2Id === inicial.cuenta2Id &&
    actual.texto1 === inicial.texto1 &&
    actual.texto2 === inicial.texto2
  );
}

export function FormularioMovimiento({
  cuentas,
  cargandoCuentas = false,
  cuentaIdPorDefecto,
  tipoInicial,
  transferenciaInicial,
  valoresIniciales,
  pagoDivididoInicial,
  abierto,
  onAbiertoChange,
  children,
  tituloCabecera,
  descripcionCabecera,
}: {
  cuentas: Cuenta[];
  /** Si `cuentas` todavía se está pidiendo. Sin esto, abrir el formulario
   * antes de que carguen diría "no tienes cuentas" aunque sí tengas. */
  cargandoCuentas?: boolean;
  cuentaIdPorDefecto?: string;
  /** El tipo con el que abre el formulario ("transferencia" para pagar una
   * tarjeta). Cada quien que lo abre monta su propia instancia, así que la
   * precarga de uno no le pisa a la del botón de registrar. */
  tipoInicial?: TipoMonto;
  /** Cuentas precargadas de "Entre cuentas": de dónde sale la plata y a dónde
   * va. Solo se proponen; la persona puede cambiarlas antes de guardar. */
  transferenciaInicial?: { origen?: string; destino?: string };
  /** Valores con los que abre el formulario cuando lo invoca otra pantalla
   * (corregir un movimiento). Se leen al montar. */
  valoresIniciales?: ValoresInicialesMovimiento;
  /**
   * Si la corrección es de una compra pagada con dos cuentas: abre YA en modo
   * "Pagar con dos cuentas" con las dos cuentas y sus dos montos. `null` (lo
   * de siempre) abre corregiendo un movimiento de una sola cuenta. Solo la
   * corrección de una compra dividida lo trae: un registro nuevo o un
   * movimiento simple no.
   */
  pagoDivididoInicial?: PagoDivididoEnEdicion;
  /** Abre el formulario desde afuera, sin disparador visible. Si se pasa, el
   * componente deja de manejar su propio estado de abierto y obedece a quien
   * lo invoca. */
  abierto?: boolean;
  /** Avisa que el formulario se cerró, para que quien lo controla lo
   * desmonte. */
  onAbiertoChange?: (abierto: boolean) => void;
  /** El disparador visible. Opcional cuando el formulario se abre controlado,
   * como al corregir un movimiento: ahí no hay botón que lo abra. */
  children?: React.ReactNode;
  /** Título y descripción de la cabecera. En un registro nuevo solo los
   * anuncia un lector de pantalla — el monto héroe es el encabezado visible.
   * Al corregir un movimiento la cabecera se ve, y estos textos son los que
   * encuadran el paso: "Corregir movimiento", no "Nuevo movimiento" justo
   * después de anular. */
  tituloCabecera?: string;
  descripcionCabecera?: string;
}) {
  const hoyInput = () => fechaParaInput(new Date().toISOString());

  const soloMirar = useSoloMirar();
  // En pantalla grande el cajón inferior se cambia por un diálogo centrado:
  // un cajón pegado al borde de abajo de un monitor desperdicia el espacio.
  const pantallaGrande = usePantallaGrande();
  // Si viene `abierto`, manda quien lo invoca (corregir un movimiento). Si no,
  // el formulario se abre y se cierra solo con su disparador.
  const controlado = abierto !== undefined;
  const [abiertoInterno, setAbiertoInterno] = useState(false);
  const estaAbierto = controlado ? abierto : abiertoInterno;

  const [tipoMonto, setTipoMonto] = useState<TipoMonto>(
    valoresIniciales?.tipo ?? tipoInicial ?? "gasto"
  );
  const [monto, setMonto] = useState(valoresIniciales?.monto ?? "");
  // Una corrección llega con fecha, descripción o categoría: se abren ya, para
  // que se vean y se puedan ajustar sin un toque extra.
  const [masDetalles, setMasDetalles] = useState(Boolean(valoresIniciales));
  const [fecha, setFecha] = useState(valoresIniciales?.fecha ?? hoyInput);
  const [descripcion, setDescripcion] = useState(valoresIniciales?.descripcion ?? "");
  const [categoryId, setCategoryId] = useState<string | undefined>(
    valoresIniciales?.categoriaId
  );
  const [errores, setErrores] = useState<{
    cuenta?: string;
    origen?: string;
    destino?: string;
    monto?: string;
  }>({});

  // La cuenta elegida no es un dato que haya que recordar entre renders por su
  // cuenta: solo hace falta guardar si la persona ELIGIÓ una a mano, y todo lo
  // demás sale de recalcular en cada render. Así, si el botón de registrar se
  // toca antes de que `cuentas` termine de cargar (vive en el armazón, puede
  // pasar en cualquier pantalla), en cuanto los datos llegan la cuenta correcta
  // aparece sola, sin depender de un efecto que reaccione después.
  const [cuentaElegidaAMano, setCuentaElegidaAMano] = useState<string | null>(
    valoresIniciales?.cuentaId ?? null
  );
  const cuentaId =
    cuentaElegidaAMano && cuentas.some((cuenta) => cuenta.id === cuentaElegidaAMano)
      ? cuentaElegidaAMano
      : cuentaPorDefecto(cuentaIdPorDefecto, cuentas);
  const cuentaElegida = cuentas.find((cuenta) => cuenta.id === cuentaId);

  // Lo mismo que arriba, pero para "Entre cuentas": dos cuentas en vez de una,
  // y la de destino nunca puede quedar igual a la de origen (si la persona no
  // ha elegido una a mano, o si cambió el origen y la que tenía elegida quedó
  // repetida, se propone la primera cuenta distinta que haya).
  const [origenElegidoAMano, setOrigenElegidoAMano] = useState<string | null>(
    transferenciaInicial?.origen ?? null
  );
  const [destinoElegidoAMano, setDestinoElegidoAMano] = useState<string | null>(
    transferenciaInicial?.destino ?? null
  );
  // La cuenta propuesta como origen nunca puede ser la de destino, y tiene
  // que ser de su misma moneda: al pagar una tarjeta desde "Pagar tarjeta"
  // sin cuenta vinculada, el origen caía en la última cuenta usada —que podía
  // ser la propia tarjeta o una de otra moneda— y el formulario abría la
  // transferencia al revés o apuntando a otra cuenta, y un movimiento no se
  // edita. Entre las candidatas, una cuenta normal va antes que otra tarjeta.
  const cuentaDestinoPrecargada = transferenciaInicial?.destino
    ? cuentas.find((cuenta) => cuenta.id === transferenciaInicial.destino)
    : undefined;
  const candidatasAOrigen = cuentaDestinoPrecargada
    ? cuentas
        .filter(
          (cuenta) =>
            cuenta.id !== cuentaDestinoPrecargada.id &&
            cuenta.currency === cuentaDestinoPrecargada.currency
        )
        .sort((a, b) => Number(a.type === "card") - Number(b.type === "card"))
    : cuentas;
  const cuentaOrigenId =
    origenElegidoAMano && cuentas.some((cuenta) => cuenta.id === origenElegidoAMano)
      ? origenElegidoAMano
      : cuentaPorDefecto(cuentaIdPorDefecto, candidatasAOrigen);
  const cuentaOrigen = cuentas.find((cuenta) => cuenta.id === cuentaOrigenId);

  // A dónde puede ir la plata: solo a otra cuenta de la misma moneda. Si no hay
  // ninguna, abajo se dice por qué en vez de dejar el selector vacío.
  const destinosPosibles = cuentasDeDestino(cuentas, cuentaOrigenId);
  const cuentaDestinoId =
    destinoElegidoAMano && destinosPosibles.some((cuenta) => cuenta.id === destinoElegidoAMano)
      ? destinoElegidoAMano
      : (destinosPosibles[0]?.id ?? "");
  const hayDestinoPosible = destinosPosibles.length > 0;
  const cuentaDestino = cuentas.find((cuenta) => cuenta.id === cuentaDestinoId);

  // El checklist del mes de la FECHA (no el de hoy: un movimiento retrasado
  // cuenta para el mes en que ocurrió) y en la moneda de la cuenta que mueve
  // la plata: la elegida, o la de origen en una transferencia.
  const mesDelPresupuesto = fecha.slice(0, 7);
  const monedaDelPresupuesto =
    (tipoMonto === "transferencia" ? cuentaOrigen?.currency : cuentaElegida?.currency) ?? "";
  const { data: checklist } = useChecklistDelMes({
    month: mesDelPresupuesto,
    currency: monedaDelPresupuesto || "",
  });

  // El item del presupuesto que la persona eligió en el desplegable de "¿En
  // qué fue?": `null` = no cuenta para ningún item. Elegir un item fija la
  // categoría a la vez; elegir "Otro de ..." o una categoría de "Otras
  // categorías" fija solo la categoría.
  const [itemElegido, setItemElegido] = useState<string | null>(
    valoresIniciales?.itemDelPresupuesto ?? null
  );

  // Los items que el desplegable ofrece: del checklist del MES de la fecha, en
  // la moneda de la cuenta, y solo de categorías del tipo del movimiento (los
  // de ahorro quedan fuera solos: no tienen categoría). Si cambia el mes, la
  // cuenta o la moneda y el item elegido deja de estar en la lista, la
  // elección REAL cae a "Otro de <su categoría>" — nunca se manda un item que
  // el menú no ofrece; si sigue ofrecido, se conserva.
  const tipoCategoria = tipoMonto === "gasto" ? "expense" : "income";
  const itemsOfrecidos =
    tipoMonto === "transferencia"
      ? []
      : (checklist?.items ?? []).filter(
          (renglon) =>
            renglon.categoryId !== null &&
            renglon.categoryKind === tipoCategoria &&
            renglon.kind !== "savings"
        );
  const itemDelMovimiento =
    itemElegido && itemsOfrecidos.some((renglon) => renglon.id === itemElegido)
      ? itemElegido
      : null;

  // Pagar una tarjeta es apagar una deuda del presupuesto: si el destino lo
  // es, el formulario lo pregunta con una opción opcional. Nunca se
  // preselecciona: "Sin asignar" hasta que la persona elija.
  const destinoEsTarjeta = tipoMonto === "transferencia" && cuentaDestino?.type === "card";
  const itemsDePago = destinoEsTarjeta
    ? (checklist?.items ?? []).filter(
        (renglon) => renglon.categoryId !== null && renglon.categoryKind === "expense"
      )
    : [];
  const [itemDePagoAMano, setItemDePagoAMano] = useState<string | null>(null);

  // Los items de pago agrupados por categoría (alfabético), para que a la
  // hora de elegir una deuda frente a otra se lean juntas. Con un solo
  // grupo no hay rótulo: el grupo entero se muestra plano.
  const gruposDePago = agruparItemsDePago(itemsDePago);

  // La cuenta que decide cómo se lee el monto escrito: la única elegida, o la
  // de origen cuando es una transferencia.
  const cuentaParaMonto = tipoMonto === "transferencia" ? cuentaOrigen : cuentaElegida;

  const crearMovimiento = useCrearMovimiento();
  const crearTransferencia = useCrearTransferencia();
  const crearPagoDividido = useCrearPagoDividido();
  const registrando =
    crearMovimiento.isPending || crearTransferencia.isPending || crearPagoDividido.isPending;

  // "Pagar con dos cuentas": la compra se reparte entre dos cuentas de la misma
  // moneda (la mitad con la tarjeta, la mitad con plata disponible). `null` =
  // modo de una sola cuenta, el de siempre.
  const [pagoDividido, setPagoDividido] = useState<PagoDivididoEnEdicion | null>(
    pagoDivididoInicial ?? null
  );
  const hayCuentas = cuentas.length > 0;
  // "Entre cuentas" no tiene sentido con una sola cuenta: no habría hacia
  // dónde transferir, y ofrecer una opción que nunca puede completarse es
  // peor que no ofrecerla. Con dos cuentas de monedas distintas sí se ofrece y
  // "Hacia" explica por qué no hay destino: esconderla no enseñaría la regla.
  const puedeTransferir = cuentas.length >= 2;

  // ¿Abrió como corrección de un movimiento anulado? Es el único camino que
  // llega con `valoresIniciales`, y el único que necesita el encuadre visible
  // y la compuerta de abajo.
  const enCorreccion = Boolean(valoresIniciales);

  // ¿Algo cambió respecto de lo precargado? En un registro nuevo la respuesta
  // es siempre sí — no hay precarga con qué comparar, el formulario abre
  // vacío y "Registrar" trabaja desde el primer toque. En una corrección, en
  // cambio, enviar tal cual recrearía el movimiento que se acaba de anular:
  // una escritura irreversible que la persona no pidió. Por eso ahí "Registrar"
  // queda apagado hasta el primer cambio, y el pie dice por qué.
  //
  // La comparación mira lo que la persona controla, no lo resuelto: la cuenta
  // es `cuentaElegidaAMano` (su elección), no `cuentaId` (que puede caer a
  // otra cuenta si la original no está en la lista).
  const cambioAlgo =
    !enCorreccion ||
    tipoMonto !== (valoresIniciales?.tipo ?? tipoInicial ?? "gasto") ||
    monto !== (valoresIniciales?.monto ?? "") ||
    cuentaElegidaAMano !== (valoresIniciales?.cuentaId ?? null) ||
    categoryId !== valoresIniciales?.categoriaId ||
    (itemDelMovimiento ?? null) !== (valoresIniciales?.itemDelPresupuesto ?? null) ||
    fecha !== (valoresIniciales?.fecha ?? hoyInput()) ||
    descripcion !== (valoresIniciales?.descripcion ?? "") ||
    // El reparto entre las dos cuentas también es un cambio: dos compras que
    // suman lo mismo pero se reparten distinto son correcciones distintas.
    !mismoReparto(pagoDividido, pagoDivididoInicial ?? null);

  const { data: categorias } = useCategorias(false);

  // El monto grande, leído y positivo, o `null` si aún no es un monto válido:
  // es el TOTAL de la compra que se reparte.
  const totalLeido = (() => {
    if (!cuentaElegida) return null;
    const lectura = normalizarMontoIngresado(monto, cuentaElegida.currency);
    return "monto" in lectura && !esCero(lectura.monto) ? lectura.monto : null;
  })();

  // ¿Se puede ofrecer pagar con dos cuentas? En un registro nuevo de gasto o
  // ingreso; y al corregir, SOLO cuando lo corregido era una compra pagada con
  // dos cuentas (así se puede volver a repartir si se salió del modo). Nunca
  // en "Entre cuentas" ni al corregir un movimiento simple. Hace falta, además,
  // otra cuenta activa de la misma moneda con quién repartir.
  const puedeDividirElPago =
    (!enCorreccion || pagoDivididoInicial !== undefined) &&
    tipoMonto !== "transferencia" &&
    cuentaElegida !== undefined &&
    cuentasParaLaParte(cuentas, cuentaElegida.currency, cuentaId).length > 0;

  const repartoDelPago =
    pagoDividido && cuentaElegida
      ? leerReparto(totalLeido, pagoDividido.texto1, pagoDividido.texto2, cuentaElegida.currency)
      : null;
  const pagoDivididoListo = Boolean(
    pagoDividido?.cuenta1Id && pagoDividido.cuenta2Id && repartoDelPago?.cuadra
  );

  function activarPagoDividido() {
    if (!cuentaElegida) return;
    const [texto1, texto2] = totalLeido
      ? repartoInicial(totalLeido, cuentaElegida.currency)
      : ["", ""];
    setPagoDividido({ cuenta1Id: cuentaId, cuenta2Id: "", texto1, texto2 });
  }

  // Cambiar el total de la compra vuelve a repartirla a la mitad: lo que se
  // había ajustado a mano ya no sumaba el total nuevo.
  function cambiarMonto(nuevo: string) {
    setMonto(nuevo);
    if (!pagoDividido || !cuentaElegida) return;
    const lectura = normalizarMontoIngresado(nuevo, cuentaElegida.currency);
    const [texto1, texto2] =
      "monto" in lectura && !esCero(lectura.monto)
        ? repartoInicial(lectura.monto, cuentaElegida.currency)
        : ["", ""];
    setPagoDividido({ ...pagoDividido, texto1, texto2 });
  }

  // Los grupos del desplegable "¿En qué fue?" / "¿De dónde viene?": los items
  // agrupados por su categoría del mes, y al final las categorías sin items
  // este mes ("Otras categorías"). Solo tipos del movimiento en cuestión y
  // categorías activas.
  const gruposDesplegable = opcionesDeEnQueFue({
    categorias: categorias ?? [],
    items: itemsOfrecidos,
    tipo: tipoCategoria,
  });
  // El value que este desplegable tiene elegido, y el texto del campo cerrado
  // (el popup vive en un portal que no está montado mientras está cerrado:
  // el texto se resuelve a mano, como en los demás selectores).
  const valorDesplegable = !categoryId
    ? SIN_CATEGORIA_EN_QUE_FUE
    : itemDelMovimiento
      ? `${PREFIJO_ITEM}${itemDelMovimiento}`
      : itemsOfrecidos.some((renglon) => renglon.categoryId === categoryId)
        ? `${PREFIJO_OTRO}${categoryId}`
        : `${PREFIJO_CATEGORIA}${categoryId}`;
  const textoCerrado = textoCerradoDeEnQueFue({
    categoriaId: categoryId,
    itemId: itemDelMovimiento,
    items: itemsOfrecidos,
    categorias: categorias ?? [],
  });

  function elegirDelDesplegable(valor: string | null) {
    if (!valor || valor === SIN_CATEGORIA_EN_QUE_FUE) {
      setCategoryId(undefined);
      setItemElegido(null);
      return;
    }
    const eleccion = valor ? leerEleccion(valor) : null;
    if (!eleccion) return;
    if (eleccion.tipo === "item") {
      // Un item trae su categoría: se fija a la vez, a que el envío siempre
      // lleve la pareja consistente.
      const item = itemsOfrecidos.find((renglon) => renglon.id === eleccion.id);
      if (!item?.categoryId) return;
      setCategoryId(item.categoryId);
      setItemElegido(item.id);
      return;
    }
    // "Otro de <categoría>" o una categoría bajo "Otras categorías": solo
    // cuenta la categoría, sin item.
    setCategoryId(eleccion.id);
    setItemElegido(null);
  }

  function reiniciar() {
    setCuentaElegidaAMano(valoresIniciales?.cuentaId ?? null);
    // La precarga vuelve a proponerla: cerrar y reabrir el formulario debe
    // abrirlo precargado otra vez, no con lo último que se tocó a mano.
    setOrigenElegidoAMano(transferenciaInicial?.origen ?? null);
    setDestinoElegidoAMano(transferenciaInicial?.destino ?? null);
    setTipoMonto(valoresIniciales?.tipo ?? tipoInicial ?? "gasto");
    setMonto(valoresIniciales?.monto ?? "");
    setMasDetalles(Boolean(valoresIniciales));
    setFecha(valoresIniciales?.fecha ?? hoyInput());
    setDescripcion(valoresIniciales?.descripcion ?? "");
    setCategoryId(valoresIniciales?.categoriaId);
    setItemElegido(valoresIniciales?.itemDelPresupuesto ?? null);
    setItemDePagoAMano(null);
    setPagoDividido(pagoDivididoInicial ?? null);
    setErrores({});
  }

  function manejarEnvioTransferencia() {
    const nuevosErrores: typeof errores = {};
    if (!cuentaOrigen) nuevosErrores.origen = "Elige la cuenta de origen.";
    // Sin destino posible el aviso de "Hacia" ya dice por qué; además no hay
    // que dejar un error escondido que reaparezca bajo un selector ya válido.
    if (!cuentaDestino && hayDestinoPosible) {
      nuevosErrores.destino = "Elige la cuenta de destino.";
    } else if (cuentaOrigen && cuentaDestino && cuentaDestino.id === cuentaOrigen.id) {
      // Defensivo: el selector de destino ya excluye la cuenta de origen, así
      // que esto solo pasaría si las dos cuentas cambiaran entre un render y
      // el siguiente. Igual se revisa antes de mandar nada al servidor.
      nuevosErrores.destino = "Elige una cuenta distinta de la de origen.";
    }

    // Se lee con la moneda de la cuenta de origen: es ella la que pierde la
    // plata, y sus pesos o sus dólares son los que hay que interpretar.
    const lectura = cuentaOrigen ? normalizarMontoIngresado(monto, cuentaOrigen.currency) : null;
    if (lectura && "error" in lectura) nuevosErrores.monto = lectura.error;

    setErrores(nuevosErrores);
    if (!cuentaOrigen || !cuentaDestino || cuentaOrigen.id === cuentaDestino.id) return;
    if (!lectura || "error" in lectura) return;

    crearTransferencia.mutate(
      {
        fromAccountId: cuentaOrigen.id,
        toAccountId: cuentaDestino.id,
        amount: lectura.monto,
        occurredAt: inputAIso(fecha),
        description: descripcion.trim() || undefined,
        budgetItemId: destinoEsTarjeta ? (itemDePagoAMano ?? null) : undefined,
      },
      {
        onSuccess: ({ data: guardada }) => {
          recordarCuenta(cuentaOrigen.id);
          // Igual que al registrar un movimiento normal: el aviso repite lo
          // que respondió el servidor, no lo que se escribió.
          const entrada = guardada.legs.find((pata) => !pata.amount.trim().startsWith("-"));
          const cifra = entrada ? textoMonto(entrada.amount, entrada.currency) : "";
          toast.success(
            `Transferencia de ${cifra} de ${cuentaOrigen.name} a ${cuentaDestino.name} registrada.`
          );
          manejarCambioAbierto(false);
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            toast.error(error.message);
          } else {
            toast.error("No se pudo registrar la transferencia. Intenta de nuevo.");
          }
        },
      }
    );
  }

  function manejarEnvioPagoDividido() {
    if (!pagoDividido || !cuentaElegida || !repartoDelPago?.montos || !pagoDivididoListo) return;

    const [monto1, monto2] = repartoDelPago.montos;
    const signo = tipoMonto === "gasto" ? "-" : "";
    const cuenta1 = cuentas.find((cuenta) => cuenta.id === pagoDividido.cuenta1Id);
    const cuenta2 = cuentas.find((cuenta) => cuenta.id === pagoDividido.cuenta2Id);

    crearPagoDividido.mutate(
      {
        payments: [
          { accountId: pagoDividido.cuenta1Id, amount: `${signo}${monto1}` },
          { accountId: pagoDividido.cuenta2Id, amount: `${signo}${monto2}` },
        ],
        occurredAt: inputAIso(fecha),
        description: descripcion.trim() || undefined,
        categoryId,
        budgetItemId: categoryId ? (itemDelMovimiento ?? null) : undefined,
      },
      {
        onSuccess: () => {
          recordarCuenta(pagoDividido.cuenta1Id);
          toast.success(
            `Compra registrada en dos cuentas: ${cuenta1?.name ?? "cuenta 1"} y ${cuenta2?.name ?? "cuenta 2"}.`
          );
          manejarCambioAbierto(false);
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "No se pudo registrar la compra. Intenta de nuevo."
          );
        },
      }
    );
  }

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (tipoMonto === "transferencia") {
      manejarEnvioTransferencia();
      return;
    }

    if (pagoDividido) {
      manejarEnvioPagoDividido();
      return;
    }

    const nuevosErrores: typeof errores = {};
    if (!cuentaElegida) nuevosErrores.cuenta = "Elige una cuenta.";

    // Cómo se lee lo escrito depende de la moneda de la cuenta: en pesos
    // "25.000" son veinticinco mil. Sin cuenta no hay moneda con qué leerlo, y
    // el error de arriba ya dice qué falta.
    const lectura = cuentaElegida ? normalizarMontoIngresado(monto, cuentaElegida.currency) : null;
    if (lectura && "error" in lectura) nuevosErrores.monto = lectura.error;

    setErrores(nuevosErrores);
    if (!cuentaElegida || !lectura || "error" in lectura) return;

    const montoConSigno = tipoMonto === "gasto" ? `-${lectura.monto}` : lectura.monto;

    crearMovimiento.mutate(
      {
        accountId: cuentaId,
        amount: montoConSigno,
        occurredAt: inputAIso(fecha),
        description: descripcion.trim() || undefined,
        categoryId,
        // Solo con categoría hay item: sin ella lo mandamos fuera y el
        // movimiento queda sin asignar, que es lo correcto.
        budgetItemId: categoryId ? (itemDelMovimiento ?? null) : undefined,
      },
      {
        onSuccess: ({ data: guardado }) => {
          recordarCuenta(cuentaId);
          // El aviso repite lo que respondió el servidor, no lo que se escribió:
          // así se confirma de un vistazo el monto que de verdad quedó en el
          // libro, que después ya no se puede editar.
          const tipo = guardado.amount.startsWith("-") ? "Gasto" : "Ingreso";
          const cifra = textoMonto(guardado.amount.replace(/^-/, ""), guardado.currency);
          toast.success(`${tipo} de ${cifra} registrado en ${cuentaElegida.name}.`);
          manejarCambioAbierto(false);
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

  // Quien está mirando la cuenta de otra persona no ve el botón siquiera: el
  // servidor rechazaría la escritura de todos modos.
  if (soloMirar) return null;

  // Abre o cierra: si el formulario es controlado, además se lo dice a quien
  // lo invoca para que lo monte o lo desmonte.
  function establecerAbierto(valor: boolean) {
    if (!controlado) setAbiertoInterno(valor);
    onAbiertoChange?.(valor);
  }

  function manejarCambioAbierto(valor: boolean) {
    establecerAbierto(valor);
    if (!valor) reiniciar();
  }

  // Título y descripción son los únicos pedazos atados a la primitiva: cada
  // contenedor los conecta con su propio `aria` para los lectores de pantalla.
  // El encabezado y el pie del cajón son divs de maquetación, así que el
  // diálogo los reusa tal cual y el contenido es literalmente el mismo.
  const Titulo = pantallaGrande ? DialogTitle : DrawerTitle;
  const Descripcion = pantallaGrande ? DialogDescription : DrawerDescription;

  const contenido = cargandoCuentas ? (
    // Distinto de "no tienes cuentas": el botón de registrar vive en el
    // armazón y puede abrirse antes de que `cuentas` termine de cargar.
    // Sin este estado, ese instante diría "primero crea una cuenta"
    // aunque la persona ya tenga varias.
    <DrawerHeader>
      <Titulo>Un momento…</Titulo>
      <Descripcion>Cargando tus cuentas.</Descripcion>
    </DrawerHeader>
  ) : !hayCuentas ? (
    <>
      <DrawerHeader>
        <Titulo>Nuevo movimiento</Titulo>
        <Descripcion>Primero crea una cuenta: un movimiento siempre pertenece a una.</Descripcion>
      </DrawerHeader>
      <DrawerFooter>
        <Button variant="outline" className="min-h-11" onClick={() => manejarCambioAbierto(false)}>
          Entendido
        </Button>
      </DrawerFooter>
    </>
  ) : (
    <form onSubmit={manejarEnvio} className="flex min-h-0 flex-1 flex-col">
      {/* En un registro nuevo el monto héroe ES el encabezado: el título vive
          sr-only para los lectores de pantalla. En una corrección, en cambio,
          la orientación tiene que verse — la persona llega de anular algo, y
          "Corregir movimiento" con la explicación del original anulado es lo
          único que dice en qué paso está. Escondido de la vista, el cajón se
          leía como un registro más. */}
      <DrawerHeader className={enCorreccion ? undefined : "sr-only"}>
        <Titulo>{tituloCabecera ?? "Nuevo movimiento"}</Titulo>
        <Descripcion>
          {descripcionCabecera ?? "Registra un gasto, un ingreso, o pasa plata entre tus cuentas."}
        </Descripcion>
      </DrawerHeader>

      <div className="flex flex-col gap-5 overflow-y-auto px-4 pt-2 pb-4">
        {/* El monto manda: es lo primero que se ve y lo más grande de
                  todo el formulario. Se tiñe del color del tipo elegido, para
                  que quede claro de un vistazo si es un gasto o un ingreso
                  antes de leer ninguna etiqueta. */}
        <div className="flex flex-col items-center gap-1 pt-2">
          {/* Igual que en todos los demás campos: un `Label` de verdad,
                    no solo `aria-label`. Aquí va oculto a la vista porque la
                    moneda ya cumple ese rol visualmente, pero un lector de
                    pantalla lo sigue anunciando igual que a "Cuenta" o
                    "Fecha", en vez de depender de un atributo aparte que se
                    pierde si el campo cambia de forma más adelante. */}
          <Label htmlFor="monto-movimiento" className="sr-only">
            Monto
          </Label>
          <span aria-hidden className="text-xs text-muted-foreground">
            {cuentaParaMonto?.currency ?? ""}
          </span>
          <div
            className={cn(
              "flex items-center gap-0.5 font-mono text-4xl tabular-nums",
              tipoMonto === "ingreso" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
            )}
          >
            {/* Una transferencia no lleva signo: no es plata que entra ni que
                sale, es la misma plata cambiando de cuenta. */}
            {tipoMonto !== "transferencia" && (
              <span aria-hidden className="opacity-60">
                {tipoMonto === "ingreso" ? "+" : "−"}
              </span>
            )}
            <CampoMonto
              id="monto-movimiento"
              moneda={cuentaParaMonto?.currency ?? ""}
              placeholder="0"
              value={monto}
              onChange={cambiarMonto}
              aria-invalid={Boolean(errores.monto)}
              autoFocus
              className="min-h-11 h-auto w-40 border-none bg-transparent p-0 text-center font-mono text-4xl tabular-nums text-inherit shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          {errores.monto && <p className="text-xs text-destructive">{errores.monto}</p>}
        </div>

        <ToggleGroup
          value={[tipoMonto]}
          onValueChange={(valores) => {
            if (valores.length > 0) {
              setTipoMonto(valores[0] as TipoMonto);
              // Una transferencia no se reparte entre dos cuentas.
              if (valores[0] === "transferencia") setPagoDividido(null);
              // Gasto e ingreso tienen categorías distintas: la elección
              // entera del desplegable (categoría e item) ya no aplica.
              setCategoryId(undefined);
              setItemElegido(null);
              // La pregunta del pago igual se apaga al salir de la
              // transferencia: no sobrevive un pago elegido.
              setItemDePagoAMano(null);
            }
          }}
          variant="outline"
          size="tap"
          className="w-full"
        >
          <ToggleGroupItem
            value="gasto"
            className="flex-1 aria-pressed:bg-foreground/[0.06] aria-pressed:font-semibold aria-pressed:text-foreground"
          >
            Gasto
          </ToggleGroupItem>
          <ToggleGroupItem
            value="ingreso"
            className="flex-1 aria-pressed:bg-emerald-600/10 aria-pressed:font-semibold aria-pressed:text-emerald-600 dark:aria-pressed:text-emerald-400"
          >
            Ingreso
          </ToggleGroupItem>
          {puedeTransferir && (
            <ToggleGroupItem
              value="transferencia"
              className="flex-1 aria-pressed:bg-foreground/[0.06] aria-pressed:font-semibold aria-pressed:text-foreground"
            >
              Entre cuentas
            </ToggleGroupItem>
          )}
        </ToggleGroup>

        {tipoMonto === "transferencia" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="origen-transferencia">Desde</Label>
              <Select
                value={cuentaOrigenId}
                onValueChange={(valor) => {
                  setOrigenElegidoAMano(valor ?? null);
                  // Otra cuenta puede ser otra moneda: los items que se
                  // ofrecían (o el que estaba a mano) son de otra lista.
                  setItemDePagoAMano(null);
                }}
              >
                <SelectTrigger
                  id="origen-transferencia"
                  className="min-h-11 w-full"
                  aria-invalid={Boolean(errores.origen)}
                >
                  {/* El popup de opciones vive en un portal que no está
                      montado mientras el selector está cerrado: hay que
                      resolver el nombre a mano, no asumir que lo encuentra solo. */}
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
              {errores.origen && <p className="text-xs text-destructive">{errores.origen}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={hayDestinoPosible ? "destino-transferencia" : undefined}>Hacia</Label>
              {hayDestinoPosible ? (
                <Select
                  value={cuentaDestinoId}
                  onValueChange={(valor) => {
                    setDestinoElegidoAMano(valor ?? null);
                    setItemDePagoAMano(null);
                  }}
                >
                  <SelectTrigger
                    id="destino-transferencia"
                    className="min-h-11 w-full"
                    aria-invalid={Boolean(errores.destino)}
                  >
                    {/* El popup de opciones vive en un portal que no está
                        montado mientras el selector está cerrado: hay que
                        resolver el nombre a mano, no asumir que lo encuentra solo. */}
                    <SelectValue placeholder="Elige una cuenta">
                      {(valor: string) =>
                        cuentas.find((cuenta) => cuenta.id === valor)?.name ?? valor
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Solo otra cuenta y de la misma moneda: a sí misma no
                        tiene sentido, y a otra moneda el servidor no lo
                        acepta. */}
                    {destinosPosibles.map((cuenta) => (
                      <SelectItem key={cuenta.id} value={cuenta.id}>
                        {cuenta.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // Sin destino posible el selector quedaría vacío y sin
                // explicación: mejor decir por qué y qué se puede hacer.
                <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  No hay otra cuenta en {cuentaOrigen?.currency ?? "esa moneda"} a la que pasarle
                  plata. Solo se puede transferir entre cuentas de la misma moneda.
                </p>
              )}
              {hayDestinoPosible && errores.destino && (
                <p className="text-xs text-destructive">{errores.destino}</p>
              )}
            </div>

            {/* Pagar la tarjeta puede ser apagar una de sus deudas: la
                pregunta aparece solo si hay items de gasto este mes en esta
                moneda, y nadie viene preseleccionado. Varios items de la
                misma categoría viajan juntos, agrupados por categoría. */}
            {destinoEsTarjeta && itemsDePago.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pago-presupuesto-transferencia">
                  ¿Qué pago del presupuesto es? (opcional)
                </Label>
                <Select
                  value={itemDePagoAMano ?? SIN_ITEM}
                  onValueChange={(valor) =>
                    setItemDePagoAMano(valor && valor !== SIN_ITEM ? valor : null)
                  }
                >
                  <SelectTrigger id="pago-presupuesto-transferencia" className="min-h-11 w-full">
                    <SelectValue placeholder="Sin asignar">
                      {(valor: string) => {
                        const elegido =
                          valor && valor !== SIN_ITEM
                            ? itemsDePago.find((renglon) => renglon.id === valor)
                            : undefined;
                        return elegido ? textoDeOpcion(elegido) : "Sin asignar";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_ITEM}>Sin asignar</SelectItem>
                    {gruposDePago.map((grupo) =>
                      grupo.items.length > 1 ? (
                        <SelectGroup key={grupo.categoryId}>
                          <SelectLabel>{grupo.categoryName}</SelectLabel>
                          {grupo.items.map((renglon) => (
                            <SelectItem key={renglon.id} value={renglon.id}>
                              {textoDeOpcion(renglon)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : (
                        grupo.items.map((renglon) => (
                          <SelectItem key={renglon.id} value={renglon.id}>
                            {textoDeOpcion(renglon)}
                          </SelectItem>
                        ))
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        ) : (
          <>
            {pagoDividido && cuentaElegida ? (
              <CamposPagoDividido
                valor={pagoDividido}
                onChange={(siguiente) => {
                  setPagoDividido(siguiente);
                  // La Cuenta 1 es la cuenta del formulario: de ella salen la
                  // moneda y el mes de los ítems.
                  if (siguiente.cuenta1Id) setCuentaElegidaAMano(siguiente.cuenta1Id);
                }}
                onVolver={() => setPagoDividido(null)}
                total={totalLeido}
                moneda={cuentaElegida.currency}
                cuentas={cuentas}
              />
            ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cuenta-movimiento">Cuenta</Label>
              <Select
                value={cuentaId}
                onValueChange={(valor) => {
                  setCuentaElegidaAMano(valor ?? null);
                  // Igual que al cambiar el mes: otra cuenta puede ser otra
                  // moneda. Si la lista de items cambia y el elegido ya no se
                  // ofrece, la elección cae sola a "Otro de <su categoría>".
                }}
              >
                <SelectTrigger
                  id="cuenta-movimiento"
                  className="min-h-11 w-full"
                  aria-invalid={Boolean(errores.cuenta)}
                  aria-describedby={cuentaElegida?.archivedAt ? "cuenta-archivada-aviso" : undefined}
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
              {/* Corregir un movimiento de una cuenta ya retirada no es un
                  error: la cuenta original se conserva seleccionada. Pero se
                  dice que está archivada y que hay que desarchivarla: el
                  servidor rechaza registrar en cuentas archivadas (la misma
                  regla que aplica al anular), así que prometer que la corrección
                  "quedará en ella" sería mentir. Hoy el camino normal ni
                  siquiera llega aquí —anular ya falla si la cuenta está
                  archivada—, pero esto cubre que la archive mientras se
                  corrige. */}
              {cuentaElegida?.archivedAt && (
                <p id="cuenta-archivada-aviso" className="text-xs text-muted-foreground">
                  Esta cuenta está archivada: desarchívala para poder registrar la corrección.
                </p>
              )}
              {errores.cuenta && <p className="text-xs text-destructive">{errores.cuenta}</p>}
            </div>
            )}
            {!pagoDividido && puedeDividirElPago && (
              <button
                type="button"
                onClick={activarPagoDividido}
                className="-mt-1 flex min-h-11 items-center self-start px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85"
              >
                Pagar con dos cuentas
              </button>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="en-que-fue-movimiento">
                {tipoMonto === "gasto" ? "¿En qué fue?" : "¿De dónde viene?"}
              </Label>
              <Select value={valorDesplegable} onValueChange={elegirDelDesplegable}>
                <SelectTrigger id="en-que-fue-movimiento" className="min-h-11 w-full">
                  {/* El popup vive en un portal que no está montado mientras el
                      selector está cerrado: el texto del renglón cerrado se
                      resuelve a mano, como en los demás selectores. */}
                  <SelectValue placeholder="Sin categoría">{() => textoCerrado}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {gruposDesplegable.map((grupo) =>
                    grupo.etiqueta === null ? (
                      grupo.opciones.map((opcion) => (
                        <SelectItem key={opcion.value} value={opcion.value}>
                          {opcion.texto}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectGroup key={grupo.etiqueta}>
                        <SelectLabel>{grupo.etiqueta}</SelectLabel>
                        {grupo.opciones.map((opcion) => (
                          <SelectItem key={opcion.value} value={opcion.value}>
                            {opcion.texto}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setMasDetalles((valor) => !valor)}
          className="flex min-h-11 items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={masDetalles}
        >
          Más detalles (fecha, descripción)
          <ChevronDown
            className={cn("size-3.5 transition-transform", masDetalles && "rotate-180")}
          />
        </button>

        {masDetalles && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha-movimiento">Fecha</Label>
              <Input
                id="fecha-movimiento"
                type="date"
                value={fecha}
                max={hoyInput()}
                onChange={(evento) => {
                  const nueva = evento.target.value;
                  setFecha(nueva);
                  // Los items del presupuesto son los del mes de la fecha. Si
                  // el mes cambia y el item elegido ya no se ofrece en el
                  // checklist nuevo, la decisión de arriba resuelve sola: la
                  // elección REAL cae a "Otro de <su categoría>" y nunca se
                  // manda un item que ya no está en la lista. (Con la fecha
                  // vacía no hay mes nuevo del que hablar: no se tira.)
                  setItemDePagoAMano(null);
                }}
                className="min-h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="descripcion-movimiento">Descripción (opcional)</Label>
              <Input
                id="descripcion-movimiento"
                placeholder="Ej. Mercado de la semana"
                value={descripcion}
                onChange={(evento) => setDescripcion(evento.target.value)}
                className="min-h-11"
              />
            </div>
          </div>
        )}
      </div>

      <DrawerFooter>
        {/* Sin destino posible no hay nada que registrar: en vez de un botón
            que no hace nada, queda apagado mientras "Hacia" explica por qué.
            En una corrección queda apagado hasta el primer cambio: reenviar
            tal cual recrearía lo recién anulado. */}
        <Button
          type="submit"
          className="min-h-11"
          disabled={
            registrando ||
            !cambioAlgo ||
            (tipoMonto === "transferencia" && !hayDestinoPosible) ||
            (pagoDividido !== null && !pagoDivididoListo)
          }
          // El botón apagado se explica al oído también: `describedby` solo se
          // lee al enfocar o inspeccionar el botón, no anuncia por su cuenta.
          aria-describedby={
            enCorreccion && !cambioAlgo ? "por-que-registrar-apagado" : undefined
          }
        >
          {registrando ? "Registrando…" : "Registrar"}
        </Button>
        {enCorreccion && !cambioAlgo && (
          <p id="por-que-registrar-apagado" className="text-center text-xs text-muted-foreground">
            Ajusta lo que estaba mal para habilitar Registrar.
          </p>
        )}
      </DrawerFooter>
    </form>
  );

  if (pantallaGrande) {
    return (
      <Dialog open={estaAbierto} onOpenChange={manejarCambioAbierto}>
        {children ? <DialogTrigger render={children as React.ReactElement} /> : null}
        {/* El mismo ancho con tope que tenía el cajón en escritorio, y columna
            flexible con alto máximo: si el formulario crece, el cuerpo hace
            scroll dentro y el botón Registrar queda siempre a la vista. */}
        <DialogContent className="flex max-h-[calc(100dvh-4rem)] flex-col gap-0 p-0 sm:max-w-lg">
          {contenido}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={estaAbierto} onOpenChange={manejarCambioAbierto}>
      {children ? <DrawerTrigger render={children as React.ReactElement} /> : null}
      <DrawerContent>{contenido}</DrawerContent>
    </Drawer>
  );
}

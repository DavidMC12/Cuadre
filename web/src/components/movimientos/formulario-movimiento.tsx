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
import { SelectorCategoria } from "@/components/movimientos/selector-categoria";
import { useCategorias } from "@/hooks/use-categorias";
import { useCrearMovimiento, useCrearTransferencia } from "@/hooks/use-movimientos";
import { usePantallaGrande } from "@/hooks/use-pantalla-grande";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { fechaParaInput, inputAIso } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { normalizarMontoIngresado, textoMonto } from "@/lib/money";
import { cuentasDeDestino } from "@/lib/transferencias";

type TipoMonto = "gasto" | "ingreso" | "transferencia";

/**
 * Cuántas categorías se ofrecen como chip antes de "Más detalles".
 *
 * El catálogo no lleva cuenta de qué tan seguido se usa cada categoría (eso
 * pediría guardar esa cuenta en el servidor), así que esto no es "las más
 * usadas": son las primeras del catálogo, en el mismo orden alfabético que ya
 * usa el resto de la app. Sigue resolviendo el problema real —hoy la
 * categoría vive detrás de un enlace de 12px— sin inventar una función nueva
 * de estadísticas.
 *
 * Son tres, no más, y con su propio rótulo: al registrar de pie y con prisa,
 * el primer vistazo ya tiene el tipo (Gasto / Ingreso / Entre cuentas) y estos
 * chips, y ocho opciones sueltas se leían como un solo grupo. El resto del
 * catálogo sigue a un toque en "Más detalles".
 */
const CANTIDAD_CHIPS_RAPIDOS = 3;

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

export function FormularioMovimiento({
  cuentas,
  cargandoCuentas = false,
  cuentaIdPorDefecto,
  tipoInicial,
  transferenciaInicial,
  children,
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
  children: React.ReactNode;
}) {
  const hoyInput = () => fechaParaInput(new Date().toISOString());

  const soloMirar = useSoloMirar();
  // En pantalla grande el cajón inferior se cambia por un diálogo centrado:
  // un cajón pegado al borde de abajo de un monitor desperdicia el espacio.
  const pantallaGrande = usePantallaGrande();
  const [abierto, setAbierto] = useState(false);
  const [tipoMonto, setTipoMonto] = useState<TipoMonto>(tipoInicial ?? "gasto");
  const [monto, setMonto] = useState("");
  const [masDetalles, setMasDetalles] = useState(false);
  const [fecha, setFecha] = useState(hoyInput);
  const [descripcion, setDescripcion] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
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
  const [cuentaElegidaAMano, setCuentaElegidaAMano] = useState<string | null>(null);
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
  const cuentaOrigenId =
    origenElegidoAMano && cuentas.some((cuenta) => cuenta.id === origenElegidoAMano)
      ? origenElegidoAMano
      : cuentaPorDefecto(cuentaIdPorDefecto, cuentas);
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

  // La cuenta que decide cómo se lee el monto escrito: la única elegida, o la
  // de origen cuando es una transferencia.
  const cuentaParaMonto = tipoMonto === "transferencia" ? cuentaOrigen : cuentaElegida;

  const crearMovimiento = useCrearMovimiento();
  const crearTransferencia = useCrearTransferencia();
  const registrando = crearMovimiento.isPending || crearTransferencia.isPending;
  const hayCuentas = cuentas.length > 0;
  // "Entre cuentas" no tiene sentido con una sola cuenta: no habría hacia
  // dónde transferir, y ofrecer una opción que nunca puede completarse es
  // peor que no ofrecerla. Con dos cuentas de monedas distintas sí se ofrece y
  // "Hacia" explica por qué no hay destino: esconderla no enseñaría la regla.
  const puedeTransferir = cuentas.length >= 2;

  const { data: categorias } = useCategorias(false);
  // Una transferencia no lleva categoría: no hay chips que ofrecer ahí.
  const chipsDeCategoria =
    tipoMonto === "transferencia"
      ? []
      : (categorias ?? [])
          .filter((categoria) => categoria.kind === (tipoMonto === "gasto" ? "expense" : "income"))
          .slice(0, CANTIDAD_CHIPS_RAPIDOS);

  function reiniciar() {
    setCuentaElegidaAMano(null);
    // La precarga vuelve a proponerla: cerrar y reabrir el formulario debe
    // abrirlo precargado otra vez, no con lo último que se tocó a mano.
    setOrigenElegidoAMano(transferenciaInicial?.origen ?? null);
    setDestinoElegidoAMano(transferenciaInicial?.destino ?? null);
    setTipoMonto(tipoInicial ?? "gasto");
    setMonto("");
    setMasDetalles(false);
    setFecha(hoyInput());
    setDescripcion("");
    setCategoryId(undefined);
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
          setAbierto(false);
          reiniciar();
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

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (tipoMonto === "transferencia") {
      manejarEnvioTransferencia();
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

  // Quien está mirando la cuenta de otra persona no ve el botón siquiera: el
  // servidor rechazaría la escritura de todos modos.
  if (soloMirar) return null;

  function manejarCambioAbierto(valor: boolean) {
    setAbierto(valor);
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
        <Button variant="outline" onClick={() => setAbierto(false)}>
          Entendido
        </Button>
      </DrawerFooter>
    </>
  ) : (
    <form onSubmit={manejarEnvio} className="flex min-h-0 flex-1 flex-col">
      <DrawerHeader className="sr-only">
        <Titulo>Nuevo movimiento</Titulo>
        <Descripcion>Registra un gasto, un ingreso, o pasa plata entre tus cuentas.</Descripcion>
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
              onChange={setMonto}
              aria-invalid={Boolean(errores.monto)}
              autoFocus
              className="h-auto w-40 border-none bg-transparent p-0 text-center font-mono text-4xl tabular-nums text-inherit shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          {errores.monto && <p className="text-xs text-destructive">{errores.monto}</p>}
        </div>

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

        {chipsDeCategoria.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span
              id="categorias-rapidas-etiqueta"
              className="text-xs font-medium text-muted-foreground"
            >
              Categoría
            </span>
            <div
              role="group"
              aria-labelledby="categorias-rapidas-etiqueta"
              className="flex flex-wrap gap-1.5"
            >
              {chipsDeCategoria.map((categoria) => {
                const elegida = categoryId === categoria.id;
                return (
                  <button
                    key={categoria.id}
                    type="button"
                    aria-pressed={elegida}
                    // Un chip elegido se puede volver a tocar para quitar la
                    // categoría: no hace falta abrir "Más detalles" para eso.
                    onClick={() => setCategoryId(elegida ? undefined : categoria.id)}
                    className={cn(
                      "rounded-full border px-3.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/85",
                      elegida
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    )}
                  >
                    {categoria.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tipoMonto === "transferencia" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="origen-transferencia">Desde</Label>
              <Select
                value={cuentaOrigenId}
                onValueChange={(valor) => setOrigenElegidoAMano(valor ?? null)}
              >
                <SelectTrigger
                  id="origen-transferencia"
                  className="w-full"
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
                  onValueChange={(valor) => setDestinoElegidoAMano(valor ?? null)}
                >
                  <SelectTrigger
                    id="destino-transferencia"
                    className="w-full"
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
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cuenta-movimiento">Cuenta</Label>
            <Select
              value={cuentaId}
              onValueChange={(valor) => setCuentaElegidaAMano(valor ?? null)}
            >
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
        )}

        <button
          type="button"
          onClick={() => setMasDetalles((valor) => !valor)}
          className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={masDetalles}
        >
          {tipoMonto === "transferencia"
            ? "Más detalles (fecha, descripción)"
            : "Más detalles (fecha, descripción, categoría)"}
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

            {/* Pasar plata entre cuentas propias no es un gasto ni un
                ingreso, así que no lleva categoría. */}
            {tipoMonto !== "transferencia" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoria-movimiento">Categoría (opcional)</Label>
                <SelectorCategoria
                  id="categoria-movimiento"
                  kind={tipoMonto === "gasto" ? "expense" : "income"}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <DrawerFooter>
        {/* Sin destino posible no hay nada que registrar: en vez de un botón
            que no hace nada, queda apagado mientras "Hacia" explica por qué. */}
        <Button
          type="submit"
          disabled={registrando || (tipoMonto === "transferencia" && !hayDestinoPosible)}
        >
          {registrando ? "Registrando…" : "Registrar"}
        </Button>
      </DrawerFooter>
    </form>
  );

  if (pantallaGrande) {
    return (
      <Dialog open={abierto} onOpenChange={manejarCambioAbierto}>
        <DialogTrigger render={children as React.ReactElement} />
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
    <Drawer open={abierto} onOpenChange={manejarCambioAbierto}>
      <DrawerTrigger render={children as React.ReactElement} />
      <DrawerContent>{contenido}</DrawerContent>
    </Drawer>
  );
}

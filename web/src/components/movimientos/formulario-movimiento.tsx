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
import { useCrearMovimiento } from "@/hooks/use-movimientos";
import { usePantallaGrande } from "@/hooks/use-pantalla-grande";
import { useSoloMirar } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api/client";
import type { Cuenta } from "@/lib/api/types";
import { fechaParaInput, inputAIso } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { normalizarMontoIngresado } from "@/lib/money";

type TipoMonto = "gasto" | "ingreso";

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
  children,
}: {
  cuentas: Cuenta[];
  /** Si `cuentas` todavía se está pidiendo. Sin esto, abrir el formulario
   * antes de que carguen diría "no tienes cuentas" aunque sí tengas. */
  cargandoCuentas?: boolean;
  cuentaIdPorDefecto?: string;
  children: React.ReactNode;
}) {
  const hoyInput = () => fechaParaInput(new Date().toISOString());

  const soloMirar = useSoloMirar();
  // En pantalla grande el cajón inferior se cambia por un diálogo centrado:
  // un cajón pegado al borde de abajo de un monitor desperdicia el espacio.
  const pantallaGrande = usePantallaGrande();
  const [abierto, setAbierto] = useState(false);
  const [tipoMonto, setTipoMonto] = useState<TipoMonto>("gasto");
  const [monto, setMonto] = useState("");
  const [masDetalles, setMasDetalles] = useState(false);
  const [fecha, setFecha] = useState(hoyInput);
  const [descripcion, setDescripcion] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [errores, setErrores] = useState<{ cuenta?: string; monto?: string }>({});

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

  const crearMovimiento = useCrearMovimiento();
  const hayCuentas = cuentas.length > 0;

  function reiniciar() {
    setCuentaElegidaAMano(null);
    setTipoMonto("gasto");
    setMonto("");
    setMasDetalles(false);
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
          recordarCuenta(cuentaId);
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
        <Descripcion>Registra un gasto o un ingreso.</Descripcion>
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
            {cuentas.find((cuenta) => cuenta.id === cuentaId)?.currency ?? ""}
          </span>
          <div
            className={cn(
              "flex items-center gap-0.5 font-mono text-4xl tabular-nums",
              tipoMonto === "ingreso" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
            )}
          >
            <span aria-hidden className="opacity-60">
              {tipoMonto === "ingreso" ? "+" : "−"}
            </span>
            <Input
              id="monto-movimiento"
              inputMode="decimal"
              placeholder="0"
              value={monto}
              onChange={(evento) => setMonto(evento.target.value)}
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
        </ToggleGroup>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cuenta-movimiento">Cuenta</Label>
          <Select value={cuentaId} onValueChange={(valor) => setCuentaElegidaAMano(valor ?? null)}>
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

        <button
          type="button"
          onClick={() => setMasDetalles((valor) => !valor)}
          className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={masDetalles}
        >
          Más detalles (fecha, descripción, categoría)
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
        )}
      </div>

      <DrawerFooter>
        <Button type="submit" disabled={crearMovimiento.isPending}>
          {crearMovimiento.isPending ? "Registrando…" : "Registrar"}
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

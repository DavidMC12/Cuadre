/**
 * Lógica pura del detalle de una cuenta: cómo se lee su saldo, cómo va el
 * cupo de una tarjeta y si hay texto sin guardar en el cajón.
 *
 * Vive aparte del componente para poder probarla sin montar el cajón ni la
 * API. Aquí no entra nada de React: solo comparaciones exactas de dinero con
 * `money.ts`, igual que el resto de la app.
 */
import type { Cuenta } from "@/lib/api/types";
import {
  aUnidadesMinimas,
  esCero,
  normalizarMontoIngresado,
  restar,
  sumarMontos,
} from "@/lib/money";

/** A partir de qué porcentaje de cupo usado se avisa antes de llegar al tope. */
export const UMBRAL_AVISO_CUPO = 80;

/**
 * Qué tan lleno va el cupo, en porcentaje para el CSS. La cuenta es con
 * enteros grandes y el número solo aparece aquí — es un ancho de barra, no un
 * monto de dinero.
 */
export function porcentajeUsado(usado: string, cupo: string): number {
  const gastado = aUnidadesMinimas(usado);
  const limite = aUnidadesMinimas(cupo);

  if (limite <= 0n) return 0;
  if (gastado <= 0n) return 0;
  if (gastado >= limite) return 100;

  // Puntos básicos: (usado / cupo) * 10000, con enteros exactos.
  return Number((gastado * 10000n) / limite) / 100;
}

/**
 * El tono de la barra del cupo. Neutro mientras hay margen, ámbar de aviso al
 * acercarse al tope (para que 95% no se vea igual que 5%) y rojo al pasarlo.
 * El ámbar es el token `warning` de DESIGN.md, la única excepción a "el único
 * color es el verde del ingreso"; el verde no se usa aquí.
 */
export function tonoBarraCupo(porcentaje: number): string {
  if (porcentaje >= 100) return "bg-destructive";
  if (porcentaje >= UMBRAL_AVISO_CUPO) return "bg-warning";
  return "bg-foreground/60";
}

/**
 * Disponible, usado y porcentaje de una tarjeta, derivados del cupo y del
 * saldo (nunca guardados). Una tarjeta sobrepagada tiene saldo a favor: no
 * debe nada, así que "usado" no puede quedar negativo — leería
 * "−$50.000 de cupo" y no significa nada.
 */
export function estadoCupo(
  creditLimit: string | null,
  balance: string
): { disponible: string; usado: string; porcentaje: number } | null {
  if (!creditLimit) return null;

  const disponible = sumarMontos([creditLimit, balance]);
  const usadoBruto = restar(creditLimit, disponible);
  const usado = aUnidadesMinimas(usadoBruto) > 0n ? usadoBruto : "0";

  return { disponible, usado, porcentaje: porcentajeUsado(usado, creditLimit) };
}

/**
 * La etiqueta del saldo principal. En una tarjeta el signo no dice "Debes"
 * siempre: un saldo a favor es plata tuya, no deuda. En las demás cuentas es
 * un saldo a secas.
 */
export function etiquetaSaldo(cuenta: Pick<Cuenta, "type" | "balance">): string {
  if (cuenta.type !== "card") return "Saldo";
  if (esCero(cuenta.balance)) return "Sin deuda";
  return aUnidadesMinimas(cuenta.balance) < 0n ? "Debes" : "A favor";
}

/**
 * Lee el cupo escrito como un monto. `null` es "está vacío": no es un error,
 * es la forma de quitar el cupo.
 */
export function cupoNormalizado(
  texto: string,
  moneda: string
): { monto: string } | { error: string } | null {
  const limpio = texto.trim();
  return limpio === "" ? null : normalizarMontoIngresado(limpio, moneda);
}

/**
 * ¿El cupo escrito difiere del último guardado? Se compara por valor, no por
 * texto, para que "100000" y "100.000" sean lo mismo; un monto inválido
 * cuenta como cambio porque no se pudo guardar.
 */
export function cambióElCupo(actual: string, guardado: string, moneda: string): boolean {
  const ahora = cupoNormalizado(actual, moneda);
  const antes = cupoNormalizado(guardado, moneda);

  if (ahora === null && antes === null) return false;
  if (ahora === null || antes === null) return true;
  if ("error" in ahora || "error" in antes) return true;

  return aUnidadesMinimas(ahora.monto) !== aUnidadesMinimas(antes.monto);
}

/**
 * ¿Queda texto escrito en el cajón que todavía no está en el servidor? Se usa
 * para no perder lo que la persona escribió al cerrar. La comparación es
 * contra lo último guardado (una línea base local), no contra la cuenta que
 * llega por props: mientras el guardado viaja, esa prop todavía trae el valor
 * viejo y avisaría en falso.
 */
export function hayCambiosSinGuardar(datos: {
  nombre: string;
  cupo: string;
  nombreGuardado: string;
  cupoGuardado: string;
  esTarjeta: boolean;
  moneda: string;
}): boolean {
  const { nombre, cupo, nombreGuardado, cupoGuardado, esTarjeta, moneda } = datos;

  if (nombre.trim() !== nombreGuardado) return true;
  if (!esTarjeta) return false;
  return cambióElCupo(cupo, cupoGuardado, moneda);
}

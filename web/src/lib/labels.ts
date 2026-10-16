import type { TipoCategoria, TipoCuenta, TipoMovimiento } from "@/lib/api/types";

export const ETIQUETA_TIPO_CUENTA: Record<TipoCuenta, string> = {
  bank: "Banco",
  card: "Tarjeta",
  cash: "Efectivo",
};

export const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  opening: "Saldo inicial",
  standard: "Movimiento",
  transfer: "Transferencia",
  adjustment: "Ajuste de saldo",
};

export const ETIQUETA_TIPO_CATEGORIA: Record<TipoCategoria, string> = {
  expense: "Gasto",
  income: "Ingreso",
};

/** "Sin categoría": el balde que usan los reportes cuando `categoryId` es null. */
export const SIN_CATEGORIA = "Sin categoría";

/** "Sin asignar": un movimiento que no cuenta para ningún ítem del presupuesto. */
export const SIN_ASIGNAR = "Sin asignar";

/** Un ítem del presupuesto que el catálogo no pudo nombrar: el movimiento SÍ
 * tiene ítem, solo que no se alcanzó a resolver su nombre. Frase neutra y
 * honesta para que el detalle nunca pinte el id crudo, ni invente un nombre. */
export const ITEM_SIN_NOMBRE = "Ítem del presupuesto";

/** Una categoría que la lista no cubre (por ejemplo, ya archivada): el
 * movimiento SÍ tiene categoría, pero tampoco hay nombre a la mano. Mismo
 * acuerdo que `ITEM_SIN_NOMBRE`: nada de ids crudos en pantalla. La frase
 * evita repetir la palabra "Categoría" sola, que ya usa la etiqueta del
 * control donde aparece. */
export const CATEGORIA_SIN_NOMBRE = "Categoría sin nombre";

/**
 * El mismo texto de ayuda donde quiera que se toque el ahorro de una cuenta,
 * para que el interruptor, la lista y el detalle no digan cosas distintas: es
 * la regla entera del ahorro explicito en una frase.
 */
export const AYUDA_CUENTA_AHORRO =
  "Marcar una cuenta como de ahorro no cuenta su saldo: solo cuenta lo que le pases o anotes.";

/**
 * Las monedas que ofrecen las pantallas. La API acepta cualquier código de tres
 * letras; esta lista corta es la que se muestra, y vive aquí para que el
 * formulario de cuentas y los ajustes no puedan ofrecer cosas distintas.
 */
export const MONEDAS = ["COP", "USD"] as const;

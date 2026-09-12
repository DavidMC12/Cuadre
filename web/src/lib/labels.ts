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
};

export const ETIQUETA_TIPO_CATEGORIA: Record<TipoCategoria, string> = {
  expense: "Gasto",
  income: "Ingreso",
};

/** "Sin categoría": el balde que usan los reportes cuando `categoryId` es null. */
export const SIN_CATEGORIA = "Sin categoría";

/**
 * Las monedas que ofrecen las pantallas. La API acepta cualquier código de tres
 * letras; esta lista corta es la que se muestra, y vive aquí para que el
 * formulario de cuentas y los ajustes no puedan ofrecer cosas distintas.
 */
export const MONEDAS = ["COP", "USD"] as const;

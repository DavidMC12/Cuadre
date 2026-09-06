import type { TipoCuenta, TipoMovimiento } from "@/lib/api/types";

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

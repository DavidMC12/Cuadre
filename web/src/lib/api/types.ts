/**
 * Tipos del contrato real de la API (Fase 1a). Se definen aquí, aislados de
 * cómo se obtienen los datos, para que el día que se conecte la API de
 * verdad no cambie ni un campo: solo cambia qué función los llena.
 */

export type TipoCuenta = "bank" | "card" | "cash";

export interface Cuenta {
  id: string;
  name: string;
  type: TipoCuenta;
  currency: string;
  /** Nunca convertir a number: es texto exacto, ej. "1250.7500". */
  balance: string;
  movementCount: number;
  lastMovementAt: string | null;
  archivedAt: string | null;
}

export interface NuevaCuenta {
  name: string;
  type: TipoCuenta;
  currency: string;
  /** Opcional. Texto exacto, nunca number. */
  openingBalance?: string;
}

export type TipoMovimiento = "opening" | "standard" | "transfer";

export interface Movimiento {
  id: string;
  accountId: string;
  categoryId: string | null;
  kind: TipoMovimiento;
  /** Con signo. Texto exacto, ej. "-1250.7500". Nunca number. */
  amount: string;
  currency: string;
  occurredAt: string;
  description: string | null;
  transferGroupId: string | null;
  /** Si no es null, esta fila anula a la que tiene ese id. */
  reversesTransactionId: string | null;
  /** Si no es null, a esta fila la anuló la que tiene ese id. */
  reversedByTransactionId: string | null;
}

export interface NuevoMovimiento {
  accountId: string;
  /** Con signo, ya decidido por la interfaz (gasto = negativo). Texto exacto. */
  amount: string;
  occurredAt: string;
  description?: string;
  categoryId?: string;
}

export interface FiltrosMovimientos {
  accountId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface PaginaMovimientos {
  data: Movimiento[];
  nextCursor: string | null;
}

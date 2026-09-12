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

export type TipoCategoria = "income" | "expense";

export interface Categoria {
  id: string;
  name: string;
  kind: TipoCategoria;
  archivedAt: string | null;
}

export interface NuevaCategoria {
  name: string;
  kind: TipoCategoria;
}

/** Resumen de ingresos/gastos de un mes, en una sola moneda. */
export interface ResumenMes {
  month: string;
  currency: string;
  /** Siempre positivo. */
  income: string;
  /** Siempre positivo, aunque en la base los gastos sean negativos. */
  expense: string;
  net: string;
}

/** Un renglón del desglose por categoría. `categoryId: null` es "sin categoría". */
export interface CategoriaTotal {
  categoryId: string | null;
  categoryName: string | null;
  /** Siempre positivo. */
  total: string;
}

export interface TendenciaMes {
  month: string;
  income: string;
  expense: string;
}

/** Las tres pantallas del menú de abajo, que son las que pueden abrir la app. */
export type PantallaDeInicio = "resumen" | "cuentas" | "movimientos";

export interface Perfil {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  /** Null si no ha elegido ninguna: entonces se deduce de las cuentas. */
  defaultCurrency: string | null;
  startPage: PantallaDeInicio;
  /**
   * Si administra el sistema. Viene de la sesión, no de la tabla. Mientras un
   * administrador ve la app como otra persona, esto es `false`: la sesión es
   * la de ella.
   */
  isAdmin: boolean;
}

/** Una fila del registro de quién entró a la cuenta de quién. */
export interface Suplantacion {
  id: string;
  targetAuthSubject: string;
  targetEmail: string;
  startedAt: string;
}

/** Solo lo que se puede cambiar. El correo lo manda el proveedor de identidad. */
export interface CambiosDePerfil {
  displayName?: string;
  defaultCurrency?: string | null;
  startPage?: PantallaDeInicio;
}

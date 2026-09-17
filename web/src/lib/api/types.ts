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
  /**
   * Si esta cuenta cuenta como ahorro. Es solo una etiqueta: no cambia el
   * comportamiento de nada más, sirve para que el Resumen sepa cuánta plata
   * está apartada. Una tarjeta nunca puede marcarse.
   */
  isSavings: boolean;
  /** Solo en tarjetas: el cupo. Texto exacto, nunca number. Nulo si no hay. */
  creditLimit: string | null;
  /** Solo en tarjetas: la cuenta desde la que normalmente se paga. */
  linkedAccountId: string | null;
}

export interface NuevaCuenta {
  name: string;
  type: TipoCuenta;
  currency: string;
  /** Opcional. Texto exacto, nunca number. */
  openingBalance?: string;
  /** Opcional al crear; si no viene, la cuenta no es de ahorro. */
  isSavings?: boolean;
  /** Solo para tarjetas. Opcional; texto exacto, siempre positivo. */
  creditLimit?: string;
  /** Solo para tarjetas: de qué cuenta sale la plata cuando se paga. */
  linkedAccountId?: string;
}

/**
 * Lo que se puede editar de una cuenta ya creada: nombre, cupo y cuenta
 * vinculada — nunca el saldo (se deriva, no se guarda) ni el tipo ni la
 * moneda, que son "de qué está hecha" la cuenta, no datos editables.
 * `null` en creditLimit/linkedAccountId borra el valor; omitirlos lo deja.
 */
export interface CambiosDeCuenta {
  name?: string;
  creditLimit?: string | null;
  linkedAccountId?: string | null;
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

/**
 * Pasar plata entre dos cuentas propias. Sin signo: la dirección la dan las
 * cuentas (`fromAccountId` sale, `toAccountId` entra), no el monto. Sin
 * categoría: no es un gasto ni un ingreso.
 */
export interface NuevaTransferencia {
  fromAccountId: string;
  toAccountId: string;
  /** Siempre positivo. Texto exacto. */
  amount: string;
  occurredAt: string;
  description?: string;
}

/** Las dos patas que deja una transferencia, recién registrada. */
export interface Transferencia {
  transferGroupId: string;
  legs: Movimiento[];
}

export interface FiltrosMovimientos {
  accountId?: string;
  categoryId?: string;
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

/**
 * Cuánto entró menos cuánto salió de las cuentas de ahorro en un mes. A
 * diferencia del resumen de ingresos/gastos, este puede ser negativo: si ese
 * mes se sacó más de lo que se metió, el monto viene con signo menos.
 */
export interface AhorroMes {
  month: string;
  /** Texto exacto, con signo. Ej. "150000.0000" o "-25000.0000". */
  amount: string;
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
  /**
   * Si un administrador está viendo esta cuenta ahora mismo. Viene junto al
   * perfil, y no en una consulta aparte, para que el aviso de la pantalla y el
   * correo que muestra salgan siempre del mismo dato.
   */
  isImpersonated: boolean;
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

/** Las dos clases de ítem del checklist: un tope de gasto o un aporte a ahorro. */
export type TipoItemPresupuesto = "category" | "savings";

/** Un ítem ya guardado, tal como se muestra en la pantalla de gestión. */
export interface ItemPresupuesto {
  id: string;
  kind: TipoItemPresupuesto;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  label: string | null;
  /** El monto vigente hoy. Texto exacto, nunca number, igual que `balance`. */
  currentAmount: string | null;
  archivedAt: string | null;
}

/**
 * Un ítem de categoría: un tope de gasto o un recordatorio de pago. La moneda
 * hay que decirla, porque una categoría por sí sola no tiene una.
 */
export interface NuevoItemDeCategoria {
  kind: "category";
  categoryId: string;
  currency: string;
  /** Texto exacto, nunca number. */
  amount: string;
  label?: string;
}

/**
 * Un ítem de ahorro: cuánto se espera aportarle este mes a una cuenta ya
 * marcada como de ahorro. La moneda no se pide: es la de la cuenta.
 */
export interface NuevoItemDeAhorro {
  kind: "savings";
  accountId: string;
  /** Texto exacto, nunca number. */
  amount: string;
  label?: string;
}

/** Un ítem nuevo, discriminado por `kind` igual que en el backend. */
export type NuevoItemPresupuesto = NuevoItemDeCategoria | NuevoItemDeAhorro;

/** Una fila del checklist de un mes. */
export interface ItemDelChecklist {
  id: string;
  kind: TipoItemPresupuesto;
  currency: string;
  /** El nombre a mostrar, ya resuelto: nunca queda vacío. */
  label: string;
  /** Nulo si el ítem se creó después de ese mes: no aplica todavía. */
  target: string | null;
  /** Texto exacto, nunca number. */
  progress: string;
  checked: boolean;
}

/** El checklist completo de un mes, en una sola moneda. */
export interface ChecklistDelMes {
  month: string;
  currency: string;
  items: ItemDelChecklist[];
}

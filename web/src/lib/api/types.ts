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
   * comportamiento de nada más. Una tarjeta nunca puede marcarse.
   */
  isSavings: boolean;
  /**
   * Lo AHORRADO en esta cuenta: las transferencias que le pasaron más lo que
   * se anotó a mano, NO su saldo. Texto exacto con signo posible, ej.
   * "150000.0000" o "-25000.0000". En una cuenta que no es de ahorro trae
   * "0.0000": el ahorro no se le aplica ni se le aplica por accidente.
   */
  saved: string;
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

/**
 * `adjustment` es el movimiento del ajuste de saldo: no es un gasto ni un
 * ingreso, solo la fila que empareja el saldo con la realidad del banco. No
 * se anula ni se recategoriza; si quedó mal, se registra otro ajuste.
 */
export type TipoMovimiento = "opening" | "standard" | "transfer" | "adjustment";

export interface Movimiento {
  id: string;
  accountId: string;
  categoryId: string | null;
  /**
   * El item del presupuesto al que cuenta este movimiento (`null` = no cuenta
   * para ninguno: quedó "sin asignar" dentro de su categoria). Solo lo llevan
   * los movimientos con categoria y las transferencias; un saldo inicial y un
   * ajuste nunca tienen item.
   */
  budgetItemId: string | null;
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
  /**
   * El item del presupuesto al que cuenta (opcional). Solo vale si lleva
   * categoria y el item es de esa categoria y de la moneda de la cuenta.
   */
  budgetItemId?: string | null;
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
  /**
   * El pago del presupuesto que representa (opcional). Solo vale si la cuenta
   * destino es una tarjeta y el item es de una categoria de gasto. El item
   * queda en la pata de salida; el id de cualquiera de las dos patas sirve
   * para cambiarlo después.
   */
  budgetItemId?: string | null;
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
 * Cuánto se apartó para ahorro en un mes (transferencias + lo anotado a
 * mano), menos cuánto se sacó. A diferencia del resumen de ingresos/gastos,
 * este puede ser negativo: si ese mes se retiró más de lo que se apartó, el
 * monto viene con signo menos.
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

/**
 * Lo que se envía al anotar explicitamente ahorro: una cantidad apartada
 * (positiva) o retirada (negativa) en una cuenta de ahorro, sin mover plata
 * de ninguna cuenta. El signo no lo teclea la persona: lo decide la
 * interfaz con su toggle Aparte/Retire; por eso aquí siempre llega
 * decidido. `amount` es texto exacto y nunca "0" (un cero no se aparta).
 */
export interface NuevoRegistroAhorro {
  accountId: string;
  /** Con signo, ya decidido por la interfaz. Texto exacto, nunca number. */
  amount: string;
  /** Opcional: una fecha ISO; si falta, queda el instante actual. */
  occurredAt?: string;
  /** Opcional; `null` y omitirlo son lo mismo: sin descripción. */
  description?: string | null;
}

/**
 * Un registro de ahorro ya guardado. Es una anotación, no un movimiento:
 * no se puede editar ni anular — la corrección es anotar otro de signo
 * contrario —, así que no expone reversa ni anulaciones.
 */
export interface RegistroDeAhorro {
  id: string;
  accountId: string;
  currency: string;
  /** Con signo: positivo es lo apartado, negativo lo retirado. Texto exacto. */
  amount: string;
  /** Fecha ISO del instante en que se apartó (o se dijo que se apartó). */
  occurredAt: string;
  description: string | null;
}

/** El tipo de categoría detrás de un ítem de categoría del checklist. */
export type TipoCategoriaItem = "expense" | "income";

/** Un ítem ya guardado, tal como se muestra en la pantalla de gestión. */
export interface ItemPresupuesto {
  id: string;
  kind: TipoItemPresupuesto;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  /** 'income' = se espera recibir; 'expense' = se espera gastar; nulo en ahorro. */
  categoryKind: TipoCategoriaItem | null;
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
  /**
   * El mes del primer monto ("YYYY-MM"). Opcional: si no llega, es el actual.
   * Sirve para empezar el presupuesto contando un mes que ya pasó.
   */
  month?: string;
}

/**
 * Un ítem de ahorro: cuánto se espera aportarle a una cuenta ya marcada como
 * de ahorro. La moneda no se pide: es la de la cuenta.
 */
export interface NuevoItemDeAhorro {
  kind: "savings";
  accountId: string;
  /** Texto exacto, nunca number. */
  amount: string;
  label?: string;
  /** Igual que en el ítem de categoría: el mes del primer monto. */
  month?: string;
}

/** Un ítem nuevo, discriminado por `kind` igual que en el backend. */
export type NuevoItemPresupuesto = NuevoItemDeCategoria | NuevoItemDeAhorro;

/** Los estados en los que puede estar un item del checklist de un mes. */
export type EstadoItemChecklist =
  | "none" // no aplica ese mes: monto nulo o cero
  | "pending" // nada todavía
  | "partial" // algo, pero menos del objetivo
  | "paid" // objetivo alcanzado (en gasto, exacto; en ingreso/ahorro, ya)
  | "exceeded"; // en un gasto, se pasó del tope

/** Una fila del checklist de un mes. */
export interface ItemDelChecklist {
  id: string;
  kind: TipoItemPresupuesto;
  currency: string;
  /** El nombre a mostrar, ya resuelto: nunca queda vacío. */
  label: string;
  /** 'income' = se espera recibir; 'expense' = tope de gasto; nulo en ahorro. */
  categoryKind: TipoCategoriaItem | null;
  /** La categoria detrás del item; `null` en ahorro (no se asignan movimientos). */
  categoryId: string | null;
  categoryName: string | null;
  /** Nulo si el ítem se creó después de ese mes: no aplica todavía. */
  target: string | null;
  /** Texto exacto, nunca number. */
  progress: string;
  /**
   * La meta se alcanzó: `progress` llegó o pasó de `target`. Puede ser
   * `true` en una meta de ahorro (llegar es el logro) y en un renglón de
   * ingresos (recibir lo esperado es el logro); en un tope de gasto siempre
   * es `false`, porque un tope no se "cumple" gastando. Siempre `false` si
   * `target` es nulo.
   */
  checked: boolean;
  /**
   * El tope se pasó: `progress` superó `target`. Solo puede ser `true` en un
   * tope de gasto (es la señal para avisar, no para celebrar); en una meta
   * de ahorro y en un renglón de ingresos siempre es `false` — recibir de
   * más es bueno, no algo que avisar en rojo. Siempre `false` si `target`
   * es nulo.
   */
  exceeded: boolean;
  /** El estado del item en el mes, en una sola palabra de datos. */
  status: EstadoItemChecklist;
}

/** Lo movido SIN item dentro de una categoria que tiene items: fruta sin repartir. */
export interface SinAsignar {
  categoryId: string;
  categoryName: string | null;
  categoryKind: TipoCategoriaItem;
  /** Texto exacto, siempre positivo. */
  amount: string;
}

/** El checklist completo de un mes, en una sola moneda. */
export interface ChecklistDelMes {
  month: string;
  currency: string;
  items: ItemDelChecklist[];
  /** Lo gastado o recibido sin item en cada categoria con items (solo si no es cero). */
  unassigned: SinAsignar[];
}

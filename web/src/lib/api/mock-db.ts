/**
 * Base de datos falsa, en memoria, solo para la Fase 1a.
 *
 * Imita lo que haría el backend real: guarda cuentas y movimientos, deriva
 * el saldo sumando movimientos (nunca lo guarda como un valor fijo) y aplica
 * las mismas reglas de negocio que ya existen en la base de datos real:
 * una cuenta archivada no acepta movimientos nuevos, el saldo inicial no se
 * anula, un movimiento anulado no se puede volver a anular.
 *
 * Este archivo se borra completo cuando se conecte la API real: nada de acá
 * debería sobrevivir. `accounts.ts` y `transactions.ts` son la única frontera;
 * ellos son los que hay que tocar para apuntar a `fetch` de verdad.
 */

import { ApiError } from "./client";
import type {
  Cuenta,
  FiltrosMovimientos,
  Movimiento,
  NuevaCuenta,
  NuevoMovimiento,
  PaginaMovimientos,
  TipoCuenta,
} from "./types";

// ---------------------------------------------------------------------------
// Aritmética exacta solo para mantener consistentes los datos falsos.
// Igual que en la base real (NUMERIC(19,4)): todo en enteros escalados por
// 10 000, nunca en coma flotante.
// ---------------------------------------------------------------------------

const ESCALA = 10000n;

function aEnteroEscalado(monto: string): bigint {
  const texto = monto.trim();
  const negativo = texto.startsWith("-");
  const sinSigno = texto.replace(/^[-+]/, "");
  const [parteEntera = "0", parteDecimalCruda = ""] = sinSigno.split(".");
  const parteDecimal = (parteDecimalCruda + "0000").slice(0, 4);
  const valor = BigInt(parteEntera || "0") * ESCALA + BigInt(parteDecimal || "0");
  return negativo ? -valor : valor;
}

function deEnteroEscalado(valor: bigint): string {
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const entero = absoluto / ESCALA;
  const decimal = absoluto % ESCALA;
  return `${negativo ? "-" : ""}${entero.toString()}.${decimal.toString().padStart(4, "0")}`;
}

function sumarMontos(a: string, b: string): string {
  return deEnteroEscalado(aEnteroEscalado(a) + aEnteroEscalado(b));
}

/** Invierte el signo de un monto sin tocarlo numéricamente: pura cirugía de texto. */
function negarMonto(monto: string): string {
  const texto = monto.trim();
  if (texto.startsWith("-")) return texto.slice(1);
  if (texto.startsWith("+")) return `-${texto.slice(1)}`;
  return `-${texto}`;
}

const PATRON_MONTO = /^-?\d+(\.\d{1,4})?$/;

// ---------------------------------------------------------------------------
// Identificadores e IDs
// ---------------------------------------------------------------------------

let contadorId = 1000;
function generarId(prefijo: string): string {
  contadorId += 1;
  return `${prefijo}_${contadorId.toString(36)}`;
}

function haceDias(dias: number, hora = 12, minuto = 0): string {
  const fecha = new Date();
  fecha.setHours(hora, minuto, 0, 0);
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString();
}

// ---------------------------------------------------------------------------
// Datos de arranque
// ---------------------------------------------------------------------------

const cuentas: Cuenta[] = [
  {
    id: "cta_bancolombia",
    name: "Bancolombia",
    type: "bank",
    currency: "COP",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
  },
  {
    id: "cta_nu",
    name: "Nu",
    type: "card",
    currency: "COP",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
  },
  {
    id: "cta_efectivo",
    name: "Efectivo",
    type: "cash",
    currency: "COP",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
  },
  {
    id: "cta_ahorros_usd",
    name: "Ahorros dólares",
    type: "bank",
    currency: "USD",
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
  },
];

const movimientos: Movimiento[] = [];

/** Aplica un movimiento ya validado: lo agrega y actualiza la cuenta dueña. */
function aplicarMovimiento(movimiento: Movimiento): void {
  movimientos.push(movimiento);
  const cuenta = cuentas.find((c) => c.id === movimiento.accountId);
  if (!cuenta) return;
  cuenta.balance = sumarMontos(cuenta.balance, movimiento.amount);
  cuenta.movementCount += 1;
  if (!cuenta.lastMovementAt || movimiento.occurredAt > cuenta.lastMovementAt) {
    cuenta.lastMovementAt = movimiento.occurredAt;
  }
}

function sembrarDatos(): void {
  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_bancolombia",
    categoryId: null,
    kind: "opening",
    amount: "2450000.0000",
    currency: "COP",
    occurredAt: haceDias(20, 9, 0),
    description: "Saldo inicial",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });
  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_nu",
    categoryId: null,
    kind: "opening",
    amount: "-180000.0000",
    currency: "COP",
    occurredAt: haceDias(20, 9, 0),
    description: "Saldo inicial",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });
  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_efectivo",
    categoryId: null,
    kind: "opening",
    amount: "120000.0000",
    currency: "COP",
    occurredAt: haceDias(20, 9, 0),
    description: "Saldo inicial",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });
  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_ahorros_usd",
    categoryId: null,
    kind: "opening",
    amount: "300.0000",
    currency: "USD",
    occurredAt: haceDias(20, 9, 0),
    description: "Saldo inicial",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });

  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_bancolombia",
    categoryId: null,
    kind: "standard",
    amount: "-85000.0000",
    currency: "COP",
    occurredAt: haceDias(6, 13, 20),
    description: "Mercado de la semana",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });

  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_nu",
    categoryId: null,
    kind: "standard",
    amount: "-64900.0000",
    currency: "COP",
    occurredAt: haceDias(4, 19, 5),
    description: "Suscripciones",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });

  // Un movimiento con el monto mal digitado, anulado, y su corrección.
  const malDigitado: Movimiento = {
    id: generarId("mov"),
    accountId: "cta_efectivo",
    categoryId: null,
    kind: "standard",
    amount: "-500000.0000",
    currency: "COP",
    occurredAt: haceDias(2, 10, 0),
    description: "Almuerzo",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  };
  aplicarMovimiento(malDigitado);

  const anulacion: Movimiento = {
    id: generarId("mov"),
    accountId: "cta_efectivo",
    categoryId: null,
    kind: "standard",
    amount: negarMonto(malDigitado.amount),
    currency: "COP",
    occurredAt: haceDias(2, 10, 5),
    description: "Anula: Almuerzo",
    transferGroupId: null,
    reversesTransactionId: malDigitado.id,
    reversedByTransactionId: null,
  };
  aplicarMovimiento(anulacion);
  malDigitado.reversedByTransactionId = anulacion.id;

  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_efectivo",
    categoryId: null,
    kind: "standard",
    amount: "-15000.0000",
    currency: "COP",
    occurredAt: haceDias(2, 10, 6),
    description: "Almuerzo",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });

  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_bancolombia",
    categoryId: null,
    kind: "standard",
    amount: "3200000.0000",
    currency: "COP",
    occurredAt: haceDias(1, 8, 30),
    description: "Pago quincena",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });

  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_nu",
    categoryId: null,
    kind: "standard",
    amount: "-32500.0000",
    currency: "COP",
    occurredAt: haceDias(0, 9, 15),
    description: "Domicilio",
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });

  aplicarMovimiento({
    id: generarId("mov"),
    accountId: "cta_efectivo",
    categoryId: null,
    kind: "standard",
    amount: "-9800.0000",
    currency: "COP",
    occurredAt: haceDias(0, 17, 40),
    description: null,
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  });
}

sembrarDatos();

// ---------------------------------------------------------------------------
// Validación (imita la que hace Zod en el backend real)
// ---------------------------------------------------------------------------

interface ProblemaCampo {
  campo: string;
  problema: string;
}

function lanzarSiHayProblemas(problemas: ProblemaCampo[], mensaje: string): void {
  if (problemas.length > 0) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: mensaje, details: problemas });
  }
}

const TIPOS_CUENTA_VALIDOS: TipoCuenta[] = ["bank", "card", "cash"];

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

export function listarCuentas(includeArchived: boolean): Cuenta[] {
  return cuentas
    .filter((cuenta) => includeArchived || cuenta.archivedAt === null)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function obtenerCuenta(id: string): Cuenta {
  const cuenta = cuentas.find((c) => c.id === id);
  if (!cuenta) {
    throw new ApiError({ code: "NOT_FOUND", message: "No encontramos esa cuenta." });
  }
  return cuenta;
}

export function crearCuenta(input: NuevaCuenta): Cuenta {
  const problemas: ProblemaCampo[] = [];

  if (!input.name || !input.name.trim()) {
    problemas.push({ campo: "name", problema: "El nombre no puede estar vacío." });
  }
  if (!TIPOS_CUENTA_VALIDOS.includes(input.type)) {
    problemas.push({ campo: "type", problema: "El tipo de cuenta no es válido." });
  }
  if (!input.currency || !input.currency.trim()) {
    problemas.push({ campo: "currency", problema: "La moneda no puede estar vacía." });
  }
  if (input.openingBalance !== undefined && !PATRON_MONTO.test(input.openingBalance.trim())) {
    problemas.push({ campo: "openingBalance", problema: "El saldo inicial no tiene un formato válido." });
  }
  lanzarSiHayProblemas(problemas, "Revisa los datos de la cuenta.");

  const nombreDuplicado = cuentas.some(
    (c) => c.archivedAt === null && c.name.trim().toLowerCase() === input.name.trim().toLowerCase()
  );
  if (nombreDuplicado) {
    throw new ApiError({ code: "CONFLICT", message: "Ya tienes una cuenta con ese nombre." });
  }

  const cuenta: Cuenta = {
    id: generarId("cta"),
    name: input.name.trim(),
    type: input.type,
    currency: input.currency.trim().toUpperCase(),
    balance: "0.0000",
    movementCount: 0,
    lastMovementAt: null,
    archivedAt: null,
  };
  cuentas.push(cuenta);

  if (input.openingBalance !== undefined && input.openingBalance.trim() !== "") {
    aplicarMovimiento({
      id: generarId("mov"),
      accountId: cuenta.id,
      categoryId: null,
      kind: "opening",
      amount: aEnteroEscalado(input.openingBalance) === 0n ? "0.0000" : input.openingBalance.trim(),
      currency: cuenta.currency,
      occurredAt: new Date().toISOString(),
      description: "Saldo inicial",
      transferGroupId: null,
      reversesTransactionId: null,
      reversedByTransactionId: null,
    });
  }

  return cuenta;
}

export function archivarCuenta(id: string): Cuenta {
  const cuenta = obtenerCuenta(id);
  cuenta.archivedAt = new Date().toISOString();
  return cuenta;
}

export function desarchivarCuenta(id: string): Cuenta {
  const cuenta = obtenerCuenta(id);
  cuenta.archivedAt = null;
  return cuenta;
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export function listarMovimientos(filtros: FiltrosMovimientos): PaginaMovimientos {
  let resultado = movimientos.slice();

  if (filtros.accountId) {
    resultado = resultado.filter((m) => m.accountId === filtros.accountId);
  }
  if (filtros.from) {
    resultado = resultado.filter((m) => m.occurredAt >= filtros.from!);
  }
  if (filtros.to) {
    resultado = resultado.filter((m) => m.occurredAt <= filtros.to!);
  }

  resultado.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

  // Paginación simplificada: no hace falta cursor real con este volumen de
  // datos falsos, pero se respeta la forma de la respuesta.
  const limite = filtros.limit ?? resultado.length;
  const pagina = resultado.slice(0, limite);

  return { data: pagina, nextCursor: null };
}

export function crearMovimiento(input: NuevoMovimiento): Movimiento {
  const problemas: ProblemaCampo[] = [];

  if (!input.accountId) {
    problemas.push({ campo: "accountId", problema: "Falta la cuenta." });
  }
  if (!input.amount || !PATRON_MONTO.test(input.amount.trim())) {
    problemas.push({ campo: "amount", problema: "El monto no tiene un formato válido." });
  }
  if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) {
    problemas.push({ campo: "occurredAt", problema: "La fecha no es válida." });
  }
  lanzarSiHayProblemas(problemas, "Revisa los datos del movimiento.");

  const cuenta = obtenerCuenta(input.accountId);
  if (cuenta.archivedAt !== null) {
    throw new ApiError({
      code: "RULE_VIOLATION",
      message: "Esta cuenta está archivada y no acepta movimientos nuevos.",
    });
  }

  const movimiento: Movimiento = {
    id: generarId("mov"),
    accountId: cuenta.id,
    categoryId: input.categoryId ?? null,
    kind: "standard",
    amount: input.amount.trim(),
    currency: cuenta.currency,
    occurredAt: new Date(input.occurredAt).toISOString(),
    description: input.description?.trim() || null,
    transferGroupId: null,
    reversesTransactionId: null,
    reversedByTransactionId: null,
  };
  aplicarMovimiento(movimiento);
  return movimiento;
}

export function anularMovimiento(id: string): Movimiento {
  const original = movimientos.find((m) => m.id === id);
  if (!original) {
    throw new ApiError({ code: "NOT_FOUND", message: "No encontramos ese movimiento." });
  }
  if (original.reversedByTransactionId) {
    throw new ApiError({ code: "CONFLICT", message: "Ese movimiento ya está anulado." });
  }
  if (original.kind === "opening") {
    throw new ApiError({
      code: "RULE_VIOLATION",
      message:
        "El saldo inicial no se anula. Si quedó mal, registra un movimiento de ajuste por la diferencia.",
    });
  }

  const anulacion: Movimiento = {
    id: generarId("mov"),
    accountId: original.accountId,
    categoryId: original.categoryId,
    kind: original.kind,
    amount: negarMonto(original.amount),
    currency: original.currency,
    occurredAt: new Date().toISOString(),
    description: `Anula: ${original.description ?? "movimiento sin descripción"}`,
    transferGroupId: null,
    reversesTransactionId: original.id,
    reversedByTransactionId: null,
  };
  aplicarMovimiento(anulacion);
  original.reversedByTransactionId = anulacion.id;
  return anulacion;
}

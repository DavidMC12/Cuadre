/**
 * Reglas de negocio del libro de movimientos. No sabe nada de HTTP.
 *
 * La base de datos ya impide lo que es imposible (editar un movimiento, una
 * anulación que no cuadra, una transferencia que no suma cero). Lo que se hace
 * aquí es distinto: dar el error entendible ANTES de que Postgres lo rechace,
 * para que la persona lea "el saldo inicial no se anula" y no un mensaje de
 * base de datos.
 */
import { sql } from 'drizzle-orm';
import type { Ejecutor } from '../../db/client.js';
import { db } from '../../db/client.js';
import { conflicto, ErrorDeApp, noEncontrado, reglaViolada } from '../../http/errores.js';
import { isNegative, negate } from '../../shared/money.js';
import { ZONA_HORARIA } from '../../shared/zona-horaria.js';
import * as presupuestoService from '../budgets/service.js';
import { armarCsv } from './csv.js';
import * as repositorio from './repository.js';
import type { FilaParaExportar } from './repository.js';
import type {
  CrearTransferencia,
  ListarMovimientos,
  Movimiento,
  RegistrarMovimiento,
} from './schemas.js';

// -----------------------------------------------------------------------------
// Paginación

function codificarCursor(movimiento: Movimiento): string {
  return Buffer.from(`${movimiento.occurredAt}|${movimiento.id}`, 'utf8').toString('base64url');
}

function decodificarCursor(cursor: string): { ocurrioEn: string; id: string } {
  const partes = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const [ocurrioEn, id] = partes;

  if (partes.length !== 2 || !ocurrioEn || !id || Number.isNaN(Date.parse(ocurrioEn))) {
    throw new ErrorDeApp('VALIDATION_ERROR', 'El cursor de paginación no es válido.', 400);
  }

  return { ocurrioEn, id };
}

// -----------------------------------------------------------------------------
// El ítem del presupuesto

/**
 * Revisa que un ítem del presupuesto sirva para un movimiento con categoría, y
 * lo explica en lenguaje llano ANTES de escribir. La base igual lo exige con
 * llaves foráneas compuestas, pero su error hablaría de restricciones.
 *
 * Se pregunta al SERVICE del presupuesto, nunca a su repository: un módulo no
 * toca las tablas de otro.
 */
async function exigirItemDeCategoria(
  usuarioId: string,
  itemId: string,
  categoriaId: string,
  moneda: string | undefined,
): Promise<void> {
  // Si el ítem no existe (o es de otra persona), `obtenerItem` responde 404.
  const item = await presupuestoService.obtenerItem(usuarioId, itemId);

  if (item.archivedAt) {
    throw reglaViolada('Ese ítem del presupuesto está archivado.');
  }
  if (item.kind !== 'category') {
    throw reglaViolada('Un ítem de ahorro no se asigna a un movimiento: el ahorro se mide por su cuenta.');
  }
  if (item.categoryId !== categoriaId) {
    throw reglaViolada('Ese ítem del presupuesto es de otra categoría.');
  }
  // Si la cuenta no aparece en el mapa, la escritura de abajo fallará sola con
  // "esa cuenta no existe": aquí no hay moneda con qué comparar.
  if (moneda !== undefined && item.currency !== moneda) {
    throw reglaViolada('Ese ítem del presupuesto es de otra moneda.');
  }
}

/**
 * Revisa que un ítem del presupuesto sirva como pago de una tarjeta: solo una
 * categoría de GASTO puede "pagarse", y en la moneda de la transferencia.
 */
async function exigirItemDePagoDeTarjeta(
  usuarioId: string,
  itemId: string,
  moneda: string | undefined,
): Promise<void> {
  const item = await presupuestoService.obtenerItem(usuarioId, itemId);

  if (item.archivedAt) {
    throw reglaViolada('Ese ítem del presupuesto está archivado.');
  }
  if (item.kind !== 'category' || item.categoryKind !== 'expense') {
    throw reglaViolada(
      'El pago a una tarjeta solo puede pagar un ítem del presupuesto de una categoría de gastos.',
    );
  }
  if (moneda !== undefined && item.currency !== moneda) {
    throw reglaViolada('Ese ítem del presupuesto es de otra moneda.');
  }
}

// -----------------------------------------------------------------------------

export async function registrarMovimiento(
  usuarioId: string,
  datos: RegistrarMovimiento,
): Promise<Movimiento> {
  // El ítem es una etiqueta dentro de una categoría: sin categoría no hay
  // dónde colgarlo. Se revisa antes de escribir para dar un mensaje llano.
  if (datos.budgetItemId) {
    if (!datos.categoryId) {
      throw reglaViolada('Para asignar un ítem, el movimiento necesita categoría.');
    }
    const monedas = await repositorio.obtenerMonedasDeCuentas(db, usuarioId, [datos.accountId]);
    await exigirItemDeCategoria(
      usuarioId,
      datos.budgetItemId,
      datos.categoryId,
      monedas.get(datos.accountId),
    );
  }

  const movimiento = await repositorio.registrar(db, usuarioId, {
    cuentaId: datos.accountId,
    monto: datos.amount,
    ocurrioEn: datos.occurredAt,
    descripcion: datos.description ?? null,
    categoriaId: datos.categoryId ?? null,
    itemId: datos.budgetItemId ?? null,
  });

  if (!movimiento) {
    throw noEncontrado('Esa cuenta no existe o está archivada.');
  }

  return movimiento;
}

export async function listarMovimientos(
  usuarioId: string,
  filtros: ListarMovimientos,
): Promise<{ data: Movimiento[]; nextCursor: string | null }> {
  const { movimientos, hayMas } = await repositorio.listar(usuarioId, {
    cuentaId: filtros.accountId,
    categoriaId: filtros.categoryId,
    desde: filtros.from,
    hasta: filtros.to,
    limite: filtros.limit,
    cursor: filtros.cursor ? decodificarCursor(filtros.cursor) : undefined,
  });

  const ultimo = movimientos[movimientos.length - 1];

  return {
    data: movimientos,
    nextCursor: hayMas && ultimo ? codificarCursor(ultimo) : null,
  };
}

export async function obtenerMovimiento(
  usuarioId: string,
  movimientoId: string,
): Promise<Movimiento> {
  const movimiento = await repositorio.obtener(db, usuarioId, movimientoId);
  if (!movimiento) throw noEncontrado('Ese movimiento no existe.');
  return movimiento;
}

/**
 * Anular no es borrar: registra un movimiento opuesto que deja el saldo como
 * estaba, y el original sigue visible en el historial.
 *
 * La anulación lleva la MISMA fecha del movimiento anulado, no la de hoy. Si un
 * gasto de enero estaba mal, en enero no pasó nada: que los reportes de enero
 * cuadren importa más que registrar cuándo se dio cuenta la persona. Cuándo se
 * corrigió queda igual guardado, en `created_at`.
 */
export async function anularMovimiento(
  usuarioId: string,
  movimientoId: string,
): Promise<Movimiento> {
  return db.transaction(async (tx) => {
    const original = await repositorio.obtener(tx, usuarioId, movimientoId);
    if (!original) throw noEncontrado('Ese movimiento no existe.');

    if (original.kind === 'opening') {
      throw reglaViolada(
        'El saldo inicial no se anula. Si quedó mal, registra un movimiento de ajuste por la diferencia.',
      );
    }

    if (original.kind === 'adjustment') {
      throw reglaViolada(
        'Un ajuste de saldo no se anula. Si quedó mal, haz otro ajuste con el saldo correcto.',
      );
    }

    if (original.reversesTransactionId) {
      throw reglaViolada(
        'Ese movimiento ya es una anulación, y una anulación no se anula. Registra un movimiento nuevo.',
      );
    }

    if (original.reversedByTransactionId) {
      throw conflicto('Ese movimiento ya está anulado.');
    }

    if (original.kind === 'transfer') {
      throw reglaViolada(
        'Ese movimiento es parte de una transferencia. Anula la transferencia completa, no una de sus mitades.',
      );
    }

    const anulacion = await repositorio.registrar(tx, usuarioId, {
      cuentaId: original.accountId,
      monto: negate(original.amount),
      ocurrioEn: original.occurredAt,
      categoriaId: original.categoryId,
      itemId: original.budgetItemId,
      descripcion: original.description ? `Anulación de: ${original.description}` : 'Anulación',
      tipo: original.kind,
      anula: original.id,
    });

    if (!anulacion) {
      throw reglaViolada(
        'La cuenta de ese movimiento está archivada. Desarchívala para poder corregir su historial.',
      );
    }

    return anulacion;
  });
}

// -----------------------------------------------------------------------------

export async function crearTransferencia(
  usuarioId: string,
  datos: CrearTransferencia,
): Promise<{ transferGroupId: string; legs: Movimiento[] }> {
  // Se revisa antes de escribir para dar un mensaje en lenguaje llano. La base
  // de datos igual lo exige (el disparador de la transferencia no deja pasar
  // dos monedas distintas), pero su mensaje habla de "patas" y de un id de
  // grupo interno: esto evita que la persona lo vea.
  const monedas = await repositorio.obtenerMonedasDeCuentas(db, usuarioId, [
    datos.fromAccountId,
    datos.toAccountId,
  ]);
  const monedaOrigen = monedas.get(datos.fromAccountId);
  const monedaDestino = monedas.get(datos.toAccountId);

  // Si alguna de las dos cuentas no aparece (no existe, o no es de esta
  // persona), no hay nada que comparar todavía: el intento de escritura de
  // abajo va a fallar solo, con el mensaje de "no existe o está archivada".
  if (monedaOrigen && monedaDestino && monedaOrigen !== monedaDestino) {
    throw reglaViolada('Las dos cuentas deben ser de la misma moneda para transferir entre ellas.');
  }

  // Un ítem solo tiene sentido si la transferencia es el pago de una tarjeta:
  // es lo único que "paga" un ítem del checklist sin ser un gasto del mes.
  if (datos.budgetItemId) {
    const tipos = await repositorio.obtenerTiposDeCuentas(db, usuarioId, [
      datos.fromAccountId,
      datos.toAccountId,
    ]);
    const tipoDestino = tipos.get(datos.toAccountId);

    // Si la cuenta de destino no aparece, la escritura de abajo dará el 404.
    if (tipoDestino !== undefined) {
      if (tipoDestino !== 'card') {
        throw reglaViolada('Solo el pago a una tarjeta puede llevar un ítem del presupuesto.');
      }
      await exigirItemDePagoDeTarjeta(
        usuarioId,
        datos.budgetItemId,
        monedaDestino ?? monedaOrigen,
      );
    }
  }

  const resultado = await repositorio.registrarTransferencia(usuarioId, {
    origenId: datos.fromAccountId,
    destinoId: datos.toAccountId,
    monto: datos.amount,
    ocurrioEn: datos.occurredAt,
    descripcion: datos.description ?? null,
    itemId: datos.budgetItemId ?? null,
  });

  if (!resultado) {
    throw noEncontrado('Alguna de las dos cuentas no existe o está archivada.');
  }

  return { transferGroupId: resultado.grupoId, legs: resultado.patas };
}

/**
 * Deshacer una transferencia son dos anulaciones que entran juntas y forman su
 * propia transferencia en sentido contrario. Si solo se anulara una mitad, el
 * grupo quedaría descuadrado y la base rechazaría la operación completa.
 */
export async function anularTransferencia(
  usuarioId: string,
  grupoId: string,
): Promise<{ transferGroupId: string; legs: Movimiento[] }> {
  return db.transaction(async (tx) => {
    const patas = await repositorio.obtenerPatasDeTransferencia(tx, usuarioId, grupoId);

    if (patas.length === 0) throw noEncontrado('Esa transferencia no existe.');
    if (patas.some((pata) => pata.reversesTransactionId)) {
      throw reglaViolada('Esa transferencia ya es la anulación de otra.');
    }
    if (patas.some((pata) => pata.reversedByTransactionId)) {
      throw conflicto('Esa transferencia ya está anulada.');
    }

    const grupoNuevo = crypto.randomUUID();
    const anulaciones: Movimiento[] = [];

    for (const pata of patas) {
      const anulacion = await repositorio.registrar(tx, usuarioId, {
        cuentaId: pata.accountId,
        monto: negate(pata.amount),
        ocurrioEn: pata.occurredAt,
        categoriaId: pata.categoryId,
        itemId: pata.budgetItemId,
        descripcion: pata.description ? `Anulación de: ${pata.description}` : 'Anulación',
        tipo: 'transfer',
        grupoDeTransferencia: grupoNuevo,
        anula: pata.id,
      });

      if (!anulacion) {
        throw reglaViolada(
          'Alguna de las cuentas de esa transferencia está archivada. Desarchívala para poder corregir su historial.',
        );
      }

      anulaciones.push(anulacion);
    }

    // El disparador que exige que la transferencia cuadre corre al confirmar. Se
    // adelanta para que, si algo no cuadra, el error salga aqui y no al cerrar.
    await tx.execute(sql`set constraints all immediate`);

    return { transferGroupId: grupoNuevo, legs: anulaciones };
  });
}

// -----------------------------------------------------------------------------
// Exportación

const ENCABEZADOS = [
  'Fecha',
  'Cuenta',
  'Moneda',
  'Tipo',
  'Categoría',
  'Item de presupuesto',
  'Descripción',
  'Monto',
  'Estado',
  'Id',
  'Anula a',
  'Transferencia',
] as const;

/**
 * El `kind` de la base dicho en palabras. Un movimiento normal no sabe si es
 * gasto o ingreso: lo dice el signo del monto, que es justamente lo que hace
 * que el saldo sea la suma de los movimientos.
 */
function tipoEnPalabras(fila: FilaParaExportar): string {
  if (fila.tipo === 'opening') return 'Saldo inicial';
  if (fila.tipo === 'transfer') return 'Transferencia';
  if (fila.tipo === 'adjustment') return 'Ajuste de saldo';
  return isNegative(fila.monto) ? 'Gasto' : 'Ingreso';
}

/**
 * Un movimiento y su anulación aparecen los dos en el archivo, marcados. Sacar
 * el par escondería que hubo una corrección, y el archivo tiene que contar la
 * historia completa, errores incluidos.
 */
function estadoEnPalabras(fila: FilaParaExportar): string {
  if (fila.anula) return 'Anula otro movimiento';
  if (fila.anuladoPor) return 'Anulado';
  return '';
}

function hoyEnBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
}

export async function exportarMovimientos(
  usuarioId: string,
): Promise<{ nombreDeArchivo: string; contenido: string }> {
  const filas = await repositorio.listarParaExportar(usuarioId);

  const contenido = armarCsv(
    ENCABEZADOS,
    filas.map((fila) => [
      fila.fecha,
      fila.cuenta,
      fila.moneda,
      tipoEnPalabras(fila),
      fila.categoria,
      fila.item,
      fila.descripcion,
      fila.monto,
      estadoEnPalabras(fila),
      fila.id,
      fila.anula,
      fila.grupoDeTransferencia,
    ]),
  );

  return { nombreDeArchivo: `cuadre-movimientos-${hoyEnBogota()}.csv`, contenido };
}

// -----------------------------------------------------------------------------

/**
 * El saldo con el que arranca una cuenta.
 *
 * Lo llama el modulo de cuentas pasandole SU transaccion, para que la cuenta y
 * su apertura entren juntas. Vive aqui, y no alla, porque escribir en el libro
 * de movimientos es responsabilidad de este modulo y de ningun otro.
 */
export async function registrarApertura(
  ejecutor: Ejecutor,
  usuarioId: string,
  datos: { cuentaId: string; monto: string; ocurrioEn?: string },
): Promise<Movimiento> {
  const apertura = await repositorio.registrar(ejecutor, usuarioId, {
    cuentaId: datos.cuentaId,
    monto: datos.monto,
    ocurrioEn: datos.ocurrioEn ?? new Date().toISOString(),
    descripcion: 'Saldo inicial',
    tipo: 'opening',
  });

  if (!apertura) throw noEncontrado('Esa cuenta no existe o esta archivada.');
  return apertura;
}

// -----------------------------------------------------------------------------

/**
 * Deja una cuenta en el saldo que de verdad tiene (el del banco), escribiendo
 * un movimiento de ajuste por la diferencia. Es la forma de "editar" un saldo
 * o una deuda sin reescribir la historia: el saldo se calcula sumando
 * movimientos y los movimientos no se tocan.
 *
 * Lo llama el modulo de cuentas pasandole SU transaccion (donde ya bloqueo la
 * fila de la cuenta), igual que `registrarApertura`. Devuelve null si no hay
 * nada que ajustar: cuenta inexistente, archivada, o que ya tiene ese saldo.
 */
export async function ajustarASaldo(
  ejecutor: Ejecutor,
  usuarioId: string,
  datos: { cuentaId: string; saldoDeseado: string },
): Promise<Movimiento | null> {
  return repositorio.registrarAjusteASaldo(ejecutor, usuarioId, {
    cuentaId: datos.cuentaId,
    saldoDeseado: datos.saldoDeseado,
    descripcion: 'Ajuste de saldo',
  });
}

/**
 * Cambiar la categoria es la unica correccion que admite un movimiento.
 *
 * El monto, la fecha y la cuenta son historia y no se reescriben. La categoria
 * no: es una etiqueta que le ponemos encima para poder decir "esto fue
 * comida". Equivocarse ahi no descuadra ninguna cuenta, y obligar a anular y
 * recrear por un error de dedo dejaria tres filas de basura cada vez.
 *
 * Si el movimiento ya estaba anulado, su anulacion se mueve con el. Si no, la
 * pareja quedaria repartida entre dos categorias: -100 en la nueva y +100 en la
 * vieja, y las dos graficas mentirian a la vez.
 */
export async function recategorizarMovimiento(
  usuarioId: string,
  movimientoId: string,
  categoriaId: string | null,
): Promise<Movimiento> {
  return db.transaction(async (tx) => {
    const original = await repositorio.obtener(tx, usuarioId, movimientoId);
    if (!original) throw noEncontrado('Ese movimiento no existe.');

    if (original.kind === 'opening') {
      throw reglaViolada(
        'El saldo inicial no lleva categoria: no es un gasto ni un ingreso, es la plata con la que arranco la cuenta.',
      );
    }

    if (original.kind === 'transfer') {
      throw reglaViolada(
        'Una transferencia no lleva categoria: mover plata entre tus cuentas no es gastar ni recibir.',
      );
    }

    if (original.kind === 'adjustment') {
      throw reglaViolada(
        'Un ajuste de saldo no lleva categoria: no es un gasto ni un ingreso, solo corrige el saldo.',
      );
    }

    if (original.reversesTransactionId) {
      throw reglaViolada(
        'Ese movimiento es una anulacion. Cambia la categoria del movimiento original y la anulacion lo sigue sola.',
      );
    }

    const aMover = [original.id];
    if (original.reversedByTransactionId) aMover.push(original.reversedByTransactionId);

    for (const id of aMover) {
      const movido = await repositorio.recategorizar(tx, usuarioId, id, categoriaId);
      if (!movido) throw noEncontrado('Ese movimiento no existe.');
    }

    const actualizado = await repositorio.obtener(tx, usuarioId, movimientoId);
    if (!actualizado) throw noEncontrado('Ese movimiento no existe.');
    return actualizado;
  });
}

/**
 * El ítem de una transferencia (el pago a una tarjeta) vive SOLO en la pata de
 * SALIDA, la del monto negativo. Se acepta el id de cualquiera de las dos
 * patas, pero se escribe en la salida y la entrada se deja sin ítem: si
 * quedara en las dos, el pago contaría doble.
 */
async function asignarItemATransferencia(
  tx: Ejecutor,
  usuarioId: string,
  movimiento: Movimiento,
  itemId: string | null,
): Promise<void> {
  const grupoId = movimiento.transferGroupId;
  if (!grupoId) throw reglaViolada('Ese movimiento no es una transferencia.');

  const patas = await repositorio.obtenerPatasDeTransferencia(tx, usuarioId, grupoId);
  if (patas.length === 0) throw noEncontrado('Esa transferencia no existe.');
  if (patas.some((pata) => pata.reversesTransactionId)) {
    throw reglaViolada('Esa transferencia ya es la anulación de otra.');
  }
  if (patas.some((pata) => pata.reversedByTransactionId)) {
    throw conflicto('Esa transferencia ya está anulada.');
  }

  const salida = patas.find((pata) => isNegative(pata.amount));
  const entrada = patas.find((pata) => !isNegative(pata.amount));
  if (!salida || !entrada) {
    throw reglaViolada('Esa transferencia no tiene sus dos patas.');
  }

  if (itemId) {
    // La pata de salida sale de la cuenta de origen; la de entrada cae en la
    // cuenta de destino. Solo si esa cuenta es una tarjeta tiene sentido el
    // pago de un ítem.
    const tipos = await repositorio.obtenerTiposDeCuentas(tx, usuarioId, [entrada.accountId]);
    if (tipos.get(entrada.accountId) !== 'card') {
      throw reglaViolada('Solo el pago a una tarjeta puede llevar un ítem del presupuesto.');
    }
    await exigirItemDePagoDeTarjeta(usuarioId, itemId, salida.currency);
  }

  const pusoSalida = await repositorio.asignarItem(tx, usuarioId, salida.id, itemId);
  if (!pusoSalida) throw noEncontrado('Esa transferencia no existe.');

  const limpioEntrada = await repositorio.asignarItem(tx, usuarioId, entrada.id, null);
  if (!limpioEntrada) throw noEncontrado('Esa transferencia no existe.');
}

/**
 * Cambiar el ítem del presupuesto de un movimiento: es la otra etiqueta
 * corregible, junto con la categoría. No mueve dinero, así que no hay que
 * anular y recrear por haberse equivocado de ítem.
 *
 * Un saldo inicial y un ajuste no lo llevan (no son gasto ni ingreso). Una
 * anulación no se toca sola: se cambia el ítem de su original y la anulación lo
 * sigue. En una transferencia (el pago a una tarjeta) el ítem vive en la pata
 * de salida, y se actualiza el original junto con su anulación si la tiene,
 * igual que al recategorizar.
 */
export async function asignarItemAMovimiento(
  usuarioId: string,
  movimientoId: string,
  itemId: string | null,
): Promise<Movimiento> {
  return db.transaction(async (tx) => {
    const original = await repositorio.obtener(tx, usuarioId, movimientoId);
    if (!original) throw noEncontrado('Ese movimiento no existe.');

    if (original.kind === 'opening') {
      throw reglaViolada(
        'El saldo inicial no lleva ítem de presupuesto: no es un gasto ni un ingreso, es la plata con la que arrancó la cuenta.',
      );
    }

    if (original.kind === 'adjustment') {
      throw reglaViolada(
        'Un ajuste de saldo no lleva ítem de presupuesto: no es un gasto ni un ingreso, solo corrige el saldo.',
      );
    }

    if (original.reversesTransactionId) {
      throw reglaViolada(
        'Ese movimiento es una anulación. Cambia el ítem del movimiento original y la anulación lo sigue sola.',
      );
    }

    if (original.kind === 'transfer') {
      await asignarItemATransferencia(tx, usuarioId, original, itemId);
    } else {
      if (!original.categoryId) {
        throw reglaViolada('Para asignar un ítem, el movimiento necesita categoría.');
      }

      if (itemId) {
        const monedas = await repositorio.obtenerMonedasDeCuentas(tx, usuarioId, [
          original.accountId,
        ]);
        await exigirItemDeCategoria(
          usuarioId,
          itemId,
          original.categoryId,
          monedas.get(original.accountId),
        );
      }

      // El original y su anulación (si la tiene) se mueven juntos: si no, la
      // pareja quedaría repartida entre dos ítems y los dos renglones mentirían.
      const aMover = [original.id];
      if (original.reversedByTransactionId) aMover.push(original.reversedByTransactionId);

      for (const id of aMover) {
        const movido = await repositorio.asignarItem(tx, usuarioId, id, itemId);
        if (!movido) throw noEncontrado('Ese movimiento no existe.');
      }
    }

    const actualizado = await repositorio.obtener(tx, usuarioId, movimientoId);
    if (!actualizado) throw noEncontrado('Ese movimiento no existe.');
    return actualizado;
  });
}

/**
 * Reglas de negocio del checklist de presupuesto. No sabe nada de HTTP.
 *
 * El progreso de cada ítem (cuánto se gastó en la categoría, cuánto se apartó en
 * la cuenta de ahorro) lo calcula el service de `reports`: leer movimientos es su
 * trabajo. Aquí solo se compara ese progreso contra el objetivo del mes, y la
 * comparación es con `shared/money.ts` — enteros grandes, nunca `parseFloat`—
 * porque esto decide si un renglón del checklist se marca como cumplido.
 */
import { conflicto, noEncontrado, reglaViolada } from '../../http/errores.js';
import { compare } from '../../shared/money.js';
import {
  esCero,
  MesSchema,
  MontoNoNegativoSchema,
  MontoPositivoSchema,
} from '../../shared/schemas.js';
import * as cuentasService from '../accounts/service.js';
import * as categoriasService from '../categories/service.js';
import * as reportsService from '../reports/service.js';
import * as repositorio from './repository.js';
import {
  type CrearItem,
  type EstadoDelItem,
  type ItemDePresupuesto,
  type ItemDelChecklist,
  type SinAsignar,
} from './schemas.js';

/**
 * La única puerta por la que un mes y un monto entran a este service: un
 * mes como "YYYY-MM" y un monto en texto (positivo; no negativo si se
 * permite cero), con la MISMA definición
 * de `shared/schemas.ts` que ya aplican las rutas por Zod.
 *
 * El RANGO del mes (año 2000-2100; "0000" rompe a Postgres) vive en
 * `MesSchema` compartido — lo impone Zod en el borde de cada ruta, con un
 * 400 de VALIDATION_ERROR; ninguna migración lo frena en la base. Aquí no
 * se duplica la regla ad hoc: se reusa el mismo schema porque el service
 * también se llama directo (sin HTTP, como en las pruebas) y no puede
 * asumir que la ruta pasara por Zod. La única voz distinta es el código:
 * en una llamada directa la regla sale como RULE_VIOLATION (422) del
 * service, en la ruta como VALIDATION_ERROR (400) del borde, que es la
 * convención del proyecto.
 *
 * Devuelve el mes a usar: el que llegó, o el actual si no llegó ninguno.
 */
async function validarMesYMonto(
  month: string | undefined,
  amount: string,
  permitirCero = false,
): Promise<string> {
  let mes: string;
  if (month === undefined) {
    mes = await repositorio.mesActual();
  } else {
    const leido = MesSchema.safeParse(month);
    if (!leido.success) {
      throw reglaViolada(leido.error.issues[0]?.message ?? 'El mes no es válido.');
    }
    mes = month;
  }

  // Cero solo vale al fijar el monto de un mes ("este mes no aplica"); un
  // ítem nuevo siempre nace con un monto positivo.
  const leidoMonto = (permitirCero ? MontoNoNegativoSchema : MontoPositivoSchema).safeParse(amount);
  if (!leidoMonto.success) {
    throw reglaViolada(
      leidoMonto.error.issues[0]?.message ??
        (permitirCero ? 'El monto no es válido.' : 'El monto no es un monto positivo.'),
    );
  }

  return mes;
}

export async function listarItems(
  usuarioId: string,
  incluirArchivados: boolean,
): Promise<{ data: ItemDePresupuesto[] }> {
  return {
    data: await repositorio.listar(usuarioId, await repositorio.mesActual(), incluirArchivados),
  };
}

export async function obtenerItem(usuarioId: string, itemId: string): Promise<ItemDePresupuesto> {
  const item = await repositorio.obtener(usuarioId, itemId, await repositorio.mesActual());
  if (!item) throw noEncontrado('Ese ítem del presupuesto no existe.');
  return item;
}

export async function crearItem(usuarioId: string, datos: CrearItem): Promise<ItemDePresupuesto> {
  let currency: string;
  let categoryId: string | null = null;
  /** El tipo real de la categoría, que el repository copia para revalidarlo en la base. */
  let categoryKind: 'expense' | 'income' | null = null;
  let accountId: string | null = null;

  if (datos.kind === 'category') {
    const categoria = await categoriasService.obtenerCategoria(usuarioId, datos.categoryId);
    // El presupuesto ya admite gastos E ingresos: en una categoría de gasto se
    // espera gastar, en una de ingreso, recibir. El tipo real lo copia el
    // repository (categoryKind) para que la llave foránea de la base lo
    // revalide: la categoría tiene que existir y ser de este usuario, y su
    // tipo solo puede ser uno de esos dos.
    if (categoria.kind !== 'expense' && categoria.kind !== 'income') {
      throw reglaViolada(
        'Esa categoría no es de gastos ni de ingresos: el checklist de presupuesto no la entiende.',
      );
    }
    currency = datos.currency;
    categoryId = datos.categoryId;
    categoryKind = categoria.kind;
  } else {
    // La moneda es la de la cuenta, no la que llegue en el cuerpo: el schema de
    // ahorro ni siquiera la pide, pero la regla queda dicho aquí porque es una
    // decisión de negocio, no de validación.
    const cuenta = await cuentasService.obtenerCuenta(usuarioId, datos.accountId);
    if (!cuenta.isSavings) {
      throw reglaViolada('Esa cuenta no está marcada como de ahorro.');
    }
    currency = cuenta.currency;
    accountId = datos.accountId;
  }

  const mes = await validarMesYMonto(datos.month, datos.amount);

  const item = {
    kind: datos.kind,
    currency,
    categoryId,
    categoryKind,
    accountId,
    label: datos.label ?? null,
    amount: datos.amount,
    // El primer monto es del mes que se esté viendo, no siempre el actual:
    // quien empieza su presupuesto en marzo contando enero no lo dice "hoy".
    mesEfectivoDesde: mes,
  };
  const itemId = await repositorio.crear(usuarioId, item);

  return obtenerItem(usuarioId, itemId);
}

/**
 * Fija el monto de UN mes dado, pasado o futuro, sin mover ningún otro: cada
 * mes tiene el suyo (ver `budget_item_targets` y `fijarObjetivoDelMes` en el
 * repository, que ancla el mes siguiente ya empezado para que la herencia no
 * lo arrastre).
 *
 * Un monto de cero significa "este mes no aplica" (no pagaré agua este mes):
 * rige solo ese mes, y el repository ancla siempre el siguiente aunque sea
 * futuro, para que un mes sin agua no apague el renglón para siempre.
 */
export async function fijarObjetivoDelMes(
  usuarioId: string,
  itemId: string,
  month: string,
  amount: string,
): Promise<ItemDePresupuesto> {
  const mes = await validarMesYMonto(month, amount, true);

  const fijado = await repositorio.fijarObjetivoDelMes(usuarioId, itemId, mes, amount);
  if (!fijado) throw noEncontrado('Ese ítem del presupuesto no existe.');
  return obtenerItem(usuarioId, itemId);
}

export async function editarEtiqueta(
  usuarioId: string,
  itemId: string,
  label: string | null,
): Promise<ItemDePresupuesto> {
  const editada = await repositorio.editarEtiqueta(usuarioId, itemId, label);
  if (!editada) throw noEncontrado('Ese ítem del presupuesto no existe.');
  return obtenerItem(usuarioId, itemId);
}

export async function archivarItem(usuarioId: string, itemId: string): Promise<ItemDePresupuesto> {
  const seArchivo = await repositorio.archivar(usuarioId, itemId);

  if (!seArchivo) {
    const item = await repositorio.obtener(usuarioId, itemId, await repositorio.mesActual());
    if (!item) throw noEncontrado('Ese ítem del presupuesto no existe.');
    throw conflicto('Ese ítem ya está archivado.');
  }

  return obtenerItem(usuarioId, itemId);
}

export async function desarchivarItem(
  usuarioId: string,
  itemId: string,
): Promise<ItemDePresupuesto> {
  const existe = await repositorio.desarchivar(usuarioId, itemId);
  if (!existe) throw noEncontrado('Ese ítem del presupuesto no existe.');
  return obtenerItem(usuarioId, itemId);
}

/**
 * Cómo va un renglón del checklist, a partir de su meta y su progreso. Es una
 * función pura (sin base ni HTTP) para poder probarla como una tabla de casos.
 *
 * La comparación es exacta y en enteros: comparar los strings con `<`/`>` de
 * JavaScript ordenaría como texto, y "100000" < "20000" sería verdad leído así
 * — de ahí el `compare` de `shared/money.ts`.
 */
export function estadoDelItem(
  item: { kind: 'category' | 'savings'; categoryKind: 'expense' | 'income' | null },
  target: string | null,
  progress: string,
): EstadoDelItem {
  // Sin meta no hay estado que dar: el ítem no existía ese mes.
  if (target === null) return 'none';

  const esTopeDeGasto = item.kind === 'category' && item.categoryKind === 'expense';

  // Un objetivo de cero es "este mes no aplica": en ingreso y ahorro no hay
  // nada que reportar (recibir o ahorrar cuando no había meta no es un logro
  // ni una falta). En un tope de gasto sí es un exceso gastar algo cuando se
  // dijo que no se gastaría nada, y así el estado coincide con `exceeded`.
  if (esCero(target)) {
    return esTopeDeGasto && compare(progress, '0') > 0 ? 'exceeded' : 'none';
  }

  if (esTopeDeGasto) {
    const contraLaMeta = compare(progress, target);
    if (contraLaMeta > 0) return 'exceeded';
    if (contraLaMeta === 0) return 'paid';
    return compare(progress, '0') > 0 ? 'partial' : 'pending';
  }

  // Ingreso o ahorro: llegar o pasar es el logro, y recibir/ahorrar de más
  // nunca es un exceso.
  if (compare(progress, target) >= 0) return 'paid';
  return compare(progress, '0') > 0 ? 'partial' : 'pending';
}

/**
 * Las categorías del checklist que tienen plata sin ítem asignado, con el
 * nombre y la clase de categoría. Solo aparecen las categorías que tienen al
 * menos un ítem en el checklist de ese mes y moneda, y solo si el monto no es
 * cero: lo que no se gastó no hay que asignarlo.
 */
async function sinAsignarDelChecklist(
  usuarioId: string,
  mes: string,
  moneda: string,
  objetivos: repositorio.ObjetivoDelMes[],
): Promise<SinAsignar[]> {
  const categorias = new Map<
    string,
    { categoryName: string | null; categoryKind: 'expense' | 'income' }
  >();

  for (const objetivo of objetivos) {
    if (objetivo.kind !== 'category' || objetivo.categoryId === null) continue;
    if (categorias.has(objetivo.categoryId)) continue;

    categorias.set(objetivo.categoryId, {
      categoryName: objetivo.categoryName,
      categoryKind: objetivo.categoryKind === 'income' ? 'income' : 'expense',
    });
  }

  // Sin categorías con ítem no hay nada que cruzar: ninguno puede aparecer.
  if (categorias.size === 0) return [];

  const filas = await reportsService.sinAsignarPorCategoria(usuarioId, mes, moneda);
  const porCategoria = new Map(filas.map((fila) => [fila.categoryId, fila]));

  const resultado: SinAsignar[] = [];
  for (const [categoryId, categoria] of categorias) {
    const fila = porCategoria.get(categoryId);
    if (!fila) continue;

    const amount = categoria.categoryKind === 'income' ? fila.recibido : fila.gastado;
    if (compare(amount, '0') === 0) continue;

    resultado.push({
      categoryId,
      categoryName: categoria.categoryName,
      categoryKind: categoria.categoryKind,
      amount,
    });
  }

  return resultado;
}

/**
 * El checklist de un mes: qué había que revisar y cómo va cada renglón.
 *
 * El progreso de TODOS los ítems se pide en una sola consulta
 * (`progresoPorItem`): un movimiento cuenta solo para el ítem al que apunta, y
 * lo que no apunta a ninguno sale aparte, en `unassigned`, dentro de su
 * categoría. Un ítem sin movimientos vale cero. El ahorro sigue midiéndose por
 * la cuenta, no por un ítem de movimiento.
 *
 * El estado (`status`) es la lectura de la pantalla —pendiente, parcial,
 * pagado, excedido— y `checked`/`exceeded` se conservan tal como estaban.
 */
export async function checklistDelMes(
  usuarioId: string,
  filtros: { month: string; currency: string },
): Promise<{
  data: {
    month: string;
    currency: string;
    items: ItemDelChecklist[];
    unassigned: SinAsignar[];
  };
}> {
  const objetivos = await repositorio.objetivosDelMes(usuarioId, filtros.month, filtros.currency);

  const progreso = await reportsService.progresoPorItem(usuarioId, filtros.month, filtros.currency);
  const progresoPorItemId = new Map(progreso.map((fila) => [fila.itemId, fila]));

  const items: ItemDelChecklist[] = await Promise.all(
    objetivos.map(async (objetivo) => {
      let progress: string;
      if (objetivo.kind === 'category') {
        const suyo = progresoPorItemId.get(objetivo.id);
        // Un renglón de ingresos se mide por lo RECIBIDO en su ítem; uno de
        // gastos, por lo gastado. Sin fila no se movió nada: cero.
        progress =
          objetivo.categoryKind === 'income'
            ? (suyo?.recibido ?? '0.0000')
            : (suyo?.gastado ?? '0.0000');
      } else {
        progress = await reportsService.ahorroDeUnaCuentaEnElMes(
          usuarioId,
          filtros.month,
          objetivo.accountId as string,
        );
      }

      // Tres clases de renglón, cada una con su lectura:
      //
      // - Tope de gasto: pasarse es lo que hay que avisar. `checked` nunca
      //   se enciende (un tope no se "cumple" gastando) y solo `exceeded`
      //   avisa en rojo.
      // - Renglón de ingresos: recibir lo esperado es el logro — `checked`
      //   al llegar o pasar el objetivo. Recibir de MÁS es bueno, así que
      //   `exceeded` nunca avisa: no hay "te pasaste" en rojo por ganar más
      //   de lo presupuestado. Recibir menos es la falta, o sea `checked`
      //   en `false`, sin exceso que avisar.
      // - Meta de ahorro: llegar o pasar el objetivo es un logro; ahorrar de
      //   más tampoco es un problema.
      //
      // Nulo significa que el ítem todavía no existía ese mes: no aplica, y
      // un "no aplica" no es ni logro ni exceso.
      //
      // Un objetivo de cero es "este mes no aplica": no hay meta que llegar,
      // así que nunca marca logro. Si aun así se gasta en un tope de cero, sí
      // es un exceso (superó lo que se dijo que gastaría: nada).
      const llegoAlObjetivo =
        objetivo.target !== null &&
        compare(objetivo.target, '0') > 0 &&
        compare(progress, objetivo.target) >= 0;
      const pasoElTope = objetivo.target !== null && compare(progress, objetivo.target) > 0;

      const checked =
        objetivo.kind === 'savings' ||
        (objetivo.kind === 'category' && objetivo.categoryKind === 'income')
          ? llegoAlObjetivo
          : false;
      const exceeded =
        objetivo.kind === 'category' && objetivo.categoryKind !== 'income' && pasoElTope;

      const label =
        objetivo.label ?? objetivo.categoryName ?? objetivo.accountName ?? 'Ítem de presupuesto';

      return {
        id: objetivo.id,
        kind: objetivo.kind,
        currency: objetivo.currency,
        categoryId: objetivo.categoryId,
        categoryName: objetivo.categoryName,
        label,
        categoryKind: objetivo.categoryKind,
        target: objetivo.target,
        progress,
        status: estadoDelItem(objetivo, objetivo.target, progress),
        checked,
        exceeded,
      };
    }),
  );

  const unassigned = await sinAsignarDelChecklist(
    usuarioId,
    filtros.month,
    filtros.currency,
    objetivos,
  );

  return { data: { month: filtros.month, currency: filtros.currency, items, unassigned } };
}

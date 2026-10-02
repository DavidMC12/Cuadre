/**
 * Reglas de negocio del checklist de presupuesto. No sabe nada de HTTP.
 *
 * El progreso de cada ítem (cuánto se gastó en la categoría, cuánto entró a la
 * cuenta de ahorro) lo calcula el service de `reports`: leer movimientos es su
 * trabajo. Aquí solo se compara ese progreso contra el objetivo del mes, y la
 * comparación es con `shared/money.ts` — enteros grandes, nunca `parseFloat`—
 * porque esto decide si un renglón del checklist se marca como cumplido.
 */
import { conflicto, noEncontrado, reglaViolada } from '../../http/errores.js';
import { compare, toMinorUnits } from '../../shared/money.js';
import * as cuentasService from '../accounts/service.js';
import * as categoriasService from '../categories/service.js';
import * as reportsService from '../reports/service.js';
import * as repositorio from './repository.js';
import { MesSchema, type CrearItem, type ItemDePresupuesto, type ItemDelChecklist } from './schemas.js';

/**
 * El mes en el que nace un monto: el que pidieron, o el actual si no pidieron
 * ninguno. Entrada de servicio, no de HTTP: aquí la validación no depende de
 * que la ruta haya pasado antes por Zod.
 */
async function resolverMes(month: string | undefined): Promise<string> {
  if (month === undefined) return repositorio.mesActual();
  const leido = MesSchema.safeParse(month);
  if (!leido.success) throw reglaViolada('El mes debe tener la forma "YYYY-MM", como "2026-01".');
  return month;
}

/**
 * Un monto de presupuesto es texto que la base guarda como NUMERIC(19,4).
 * Se valida aquí y no solo en la ruta: se parte a enteros (nunca float) y se
 * exige mayor que cero — "0.00" es tan presupuesto como no ponerlo.
 */
function validarMontoPositivo(amount: string): void {
  let minor: bigint;
  try {
    minor = toMinorUnits(amount);
  } catch (error) {
    throw reglaViolada(
      error instanceof RangeError
        ? `El monto no es válido: ${error.message}`
        : 'El monto no es válido.',
    );
  }
  if (minor === 0n) throw reglaViolada('El monto no puede ser cero.');
  if (minor < 0n) throw reglaViolada('El monto debe ser positivo.');
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
  let accountId: string | null = null;

  if (datos.kind === 'category') {
    const categoria = await categoriasService.obtenerCategoria(usuarioId, datos.categoryId);
    if (categoria.kind !== 'expense') {
      throw reglaViolada(
        'El checklist de presupuesto es de gastos: elige una categoría de gastos, no una de ingresos.',
      );
    }
    currency = datos.currency;
    categoryId = datos.categoryId;
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

  validarMontoPositivo(datos.amount);

  const item = {
    kind: datos.kind,
    currency,
    categoryId,
    accountId,
    label: datos.label ?? null,
    amount: datos.amount,
    // El primer monto es del mes que se esté viendo, no siempre el actual:
    // quien empieza su presupuesto en marzo contando enero no lo dice "hoy".
    mesEfectivoDesde: await resolverMes(datos.month),
  };
  const itemId = await repositorio.crear(usuarioId, item);

  return obtenerItem(usuarioId, itemId);
}

/**
 * Fija el monto de UN mes dado, pasado o futuro, sin mover ningún otro: cada
 * mes tiene el suyo (ver `budget_item_targets` y `fijarObjetivoDelMes` en el
 * repository, que ancla el mes siguiente para que la herencia no lo arrastre).
 */
export async function fijarObjetivoDelMes(
  usuarioId: string,
  itemId: string,
  month: string,
  amount: string,
): Promise<ItemDePresupuesto> {
  const mes = await resolverMes(month);
  validarMontoPositivo(amount);

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
 * El checklist de un mes: qué había que revisar y cómo va cada renglón.
 *
 * El progreso se pregunta renglón por renglón al service de reportes; son
 * tantas consultas como ítems tenga el checklist, que hoy son unos pocos por
 * persona. Si algún día esa lista creciera, se pensaría en una consulta que
 * las junte — pero no antes de que el uso lo pida.
 */
export async function checklistDelMes(
  usuarioId: string,
  filtros: { month: string; currency: string },
): Promise<{ data: { month: string; currency: string; items: ItemDelChecklist[] } }> {
  const objetivos = await repositorio.objetivosDelMes(usuarioId, filtros.month, filtros.currency);

  const items: ItemDelChecklist[] = await Promise.all(
    objetivos.map(async (objetivo) => {
      const progress =
        objetivo.kind === 'category'
          ? await reportsService.gastadoEnCategoria(
              usuarioId,
              filtros.month,
              filtros.currency,
              objetivo.categoryId as string,
            )
          : await reportsService.ahorroDeUnaCuentaEnElMes(
              usuarioId,
              filtros.month,
              objetivo.accountId as string,
            );

      // Un tope de gasto y una meta de ahorro no se leen igual: en una meta,
      // llegar o pasar el objetivo es un logro; en un tope, pasarse es lo que
      // hay que avisar. Por eso `checked` (logro) solo se enciende en ahorro y
      // `exceeded` (aviso) solo en un tope: nunca se pinta de verde a quien se
      // pasó del límite. Nulo significa que el ítem todavía no existía ese mes:
      // no aplica, y un "no aplica" no es ni logro ni exceso.
      //
      // La comparación es exacta y en enteros: comparar los strings con `<`/`>`
      // de JavaScript ordenaría como texto, y "100000" < "20000" sería verdad
      // leído así — de ahí el `compare`.
      const llegoAlObjetivo = objetivo.target !== null && compare(progress, objetivo.target) >= 0;
      const pasoElTope = objetivo.target !== null && compare(progress, objetivo.target) > 0;

      const checked = objetivo.kind === 'savings' && llegoAlObjetivo;
      const exceeded = objetivo.kind === 'category' && pasoElTope;

      const label =
        objetivo.label ?? objetivo.categoryName ?? objetivo.accountName ?? 'Ítem de presupuesto';

      return {
        id: objetivo.id,
        kind: objetivo.kind,
        currency: objetivo.currency,
        label,
        target: objetivo.target,
        progress,
        checked,
        exceeded,
      };
    }),
  );

  return { data: { month: filtros.month, currency: filtros.currency, items } };
}

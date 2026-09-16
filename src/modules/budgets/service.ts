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
import { compare } from '../../shared/money.js';
import * as cuentasService from '../accounts/service.js';
import * as categoriasService from '../categories/service.js';
import * as reportsService from '../reports/service.js';
import * as repositorio from './repository.js';
import type { CrearItem, ItemDePresupuesto, ItemDelChecklist } from './schemas.js';

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

  const item = {
    kind: datos.kind,
    currency,
    categoryId,
    accountId,
    label: datos.label ?? null,
    amount: datos.amount,
    mesEfectivoDesde: await repositorio.mesActual(),
  };
  const itemId = await repositorio.crear(usuarioId, item);

  return obtenerItem(usuarioId, itemId);
}

/**
 * Cambiar cuánto se espera mover desde ahora. Nunca pisa un mes que ya pasó:
 * el monto nuevo rige desde el mes actual en adelante, porque la tabla de
 * objetivos es versionada por mes (ver `budget_item_targets`).
 */
export async function actualizarObjetivo(
  usuarioId: string,
  itemId: string,
  amount: string,
): Promise<ItemDePresupuesto> {
  const agregado = await repositorio.agregarObjetivo(
    usuarioId,
    itemId,
    amount,
    await repositorio.mesActual(),
  );
  if (!agregado) throw noEncontrado('Ese ítem del presupuesto no existe.');
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

      // Nulo significa que el ítem todavía no existía ese mes: no aplica, y un
      // "no aplica" nunca está cumplido. La comparación es exacta y en
      // enteros: un string menor que otro en JavaScript ordenaría como texto,
      // y "100000" < "20000" es verdad leído así — ahí queda un check falso.
      const checked =
        objetivo.target !== null && compare(progress, objetivo.target) >= 0;

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
      };
    }),
  );

  return { data: { month: filtros.month, currency: filtros.currency, items } };
}

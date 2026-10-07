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
import { MesSchema, MontoNoNegativoSchema, MontoPositivoSchema } from '../../shared/schemas.js';
import * as cuentasService from '../accounts/service.js';
import * as categoriasService from '../categories/service.js';
import * as reportsService from '../reports/service.js';
import * as repositorio from './repository.js';
import { type CrearItem, type ItemDePresupuesto, type ItemDelChecklist } from './schemas.js';

/**
 * La única puerta por la que un mes y un monto entran a este service: un
 * mes como "YYYY-MM" y un monto positivo en texto, con la MISMA definición
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

  // El total de ingresos del mes se pide UNA vez para toda la tanda, y cada
  // renglón de ingreso busca su propia fila: pedirlo renglón por renglón
  // repetiría el mismo agregado completo tan pronto el checklist tuviera más
  // de un renglón de ingresos. Solo se pide si alguien lo va a usar.
  const hayRenglonDeIngresos = objetivos.some(
    (objetivo) => objetivo.kind === 'category' && objetivo.categoryKind === 'income',
  );
  const ingresos = hayRenglonDeIngresos
    ? (
        await reportsService.totalesPorCategoria(usuarioId, {
          month: filtros.month,
          currency: filtros.currency,
          kind: 'income',
        })
      ).data
    : [];

  const items: ItemDelChecklist[] = await Promise.all(
    objetivos.map(async (objetivo) => {
      let progress: string;
      if (objetivo.kind === 'category') {
        if (objetivo.categoryKind === 'income') {
          // Un renglón de ingresos se mide por lo RECIBIDO en la categoría, no
          // por lo gastado. El agregado ya se pidió una vez para toda la
          // tanda: solo se busca la categoría puntual. Reutiliza el service de
          // reportes, nunca su repository ni SQL propio.
          progress =
            ingresos.find((total) => total.categoryId === objetivo.categoryId)?.total ?? '0.0000';
        } else {
          progress = await reportsService.gastadoEnCategoria(
            usuarioId,
            filtros.month,
            filtros.currency,
            objetivo.categoryId as string,
          );
        }
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
      // La comparación es exacta y en enteros: comparar los strings con
      // `<`/`>` de JavaScript ordenaría como texto, y "100000" < "20000" sería
      // verdad leído así — de ahí el `compare` de `shared/money.ts`.
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
        categoryKind: objetivo.categoryKind,
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

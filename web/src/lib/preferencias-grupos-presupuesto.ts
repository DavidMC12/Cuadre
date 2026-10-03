/**
 * Preferencia de pantalla: qué grupos del panel de presupuesto quedaron
 * CERRADOS.
 *
 * Es una preferencia de navegador por persona, no dinero: vive en
 * `localStorage`, sin backend. Se comparte entre el Resumen (aside y cajón) y
 * la pantalla /presupuesto, y entre meses y monedas — la misma categoría queda
 * cerrada o abierta en todos lados.
 *
 * La clave del grupo es estable: el id de la categoría, o una de las claves
 * propias del panel (`ahorro`, `sin-categoria`). Un grupo nunca visto aparece
 * abierto.
 *
 * Robustez: toda lectura/escritura va envuelta en try/catch. Sin almacén (SSR),
 * en modo privado o con el almacenamiento bloqueado, o con un JSON corrupto,
 * se comporta como "todo abierto" sin romper.
 */

/** El cupo del navegador que este módulo usa. Se inyecta en las pruebas para
 * simular modo privado o un almacén que lanza. */
export interface AlmacenDeGrupos {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

/** Clave con prefijo del proyecto y versión, para poder evolucionar el
 * formato sin pisar datos viejos. */
export const CLAVE_ALMACEN_GRUPOS_CERRADOS = "cuadre:presupuesto:grupos-cerrados:v1";

/** Tope defensivo al leer: un valor corrupto enorme no infla la memoria. */
const MAXIMO_CLAVES = 200;

/** El `localStorage` del navegador, o `null` si no se puede acceder. */
export function almacenDelNavegador(): AlmacenDeGrupos | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Lee el conjunto de grupos cerrados. Cualquier problema (sin almacén, JSON
 * corrupto, permiso bloqueado, valor que no es lista de textos) da un conjunto
 * vacío: todo abierto, sin lanzar.
 */
export function leerGruposCerrados(
  almacen: AlmacenDeGrupos | null = almacenDelNavegador()
): Set<string> {
  if (!almacen) return new Set();
  try {
    const crudo = almacen.getItem(CLAVE_ALMACEN_GRUPOS_CERRADOS);
    if (!crudo) return new Set();
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos)) return new Set();
    return new Set(
      datos.filter((valor): valor is string => typeof valor === "string").slice(0, MAXIMO_CLAVES)
    );
  } catch {
    return new Set();
  }
}

/**
 * Guarda el conjunto de grupos cerrados. Devuelve `true` si quedó persistido
 * y `false` si no (sin almacén, bloqueado, lleno). Nunca lanza: quien llama
 * decide qué hacer si no se pudo guardar.
 */
export function guardarGruposCerrados(
  claves: Iterable<string>,
  almacen: AlmacenDeGrupos | null = almacenDelNavegador()
): boolean {
  if (!almacen) return false;
  try {
    almacen.setItem(CLAVE_ALMACEN_GRUPOS_CERRADOS, JSON.stringify([...claves].sort()));
    return true;
  } catch {
    // Modo privado, cuota llena o permiso bloqueado.
    return false;
  }
}

/**
 * Quita las claves que ya no corresponden a ninguna categoría (ni a una de las
 * claves propias), para no acumular basura.
 *
 * `clavesValidas` debe ser el catálogo COMPLETO (incluidas las categorías
 * archivadas) más las claves propias. No se poda contra los grupos del mes en
 * curso: una categoría sin ítems este mes sigue siendo una clave válida, y su
 * preferencia debe sobrevivir para cuando vuelva a tener ítems. Y no se llama
 * mientras el catálogo está cargando o falló.
 */
export function podarGruposCerrados(
  claves: ReadonlySet<string>,
  clavesValidas: ReadonlySet<string>
): Set<string> {
  const limpias = new Set<string>();
  for (const clave of claves) if (clavesValidas.has(clave)) limpias.add(clave);
  return limpias;
}

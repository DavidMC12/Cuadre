/**
 * Ramas efímeras de Neon para las pruebas de integración.
 *
 * Neon puede sacar una copia instantánea de la base —una "rama"— que comparte
 * el almacenamiento con la original hasta que alguien escribe. Cada tanda de
 * pruebas trabaja sobre una copia propia y la borra al terminar.
 *
 * Por qué esto y no Testcontainers: no hay que instalar Docker, y sobre todo,
 * se prueba contra el mismo PostgreSQL exacto que corre en producción, con sus
 * mismos disparadores y sus mismas versiones. Un Postgres local "parecido" no
 * es lo mismo.
 */

const API = 'https://console.neon.tech/api/v2';

/** Las ramas de prueba se reconocen por este prefijo; nada más se toca. */
const PREFIJO = 'pruebas-';

/** Una rama que lleve más de esto viva quedó de una tanda interrumpida. */
const VIDA_MAXIMA_MS = 2 * 60 * 60 * 1000;

export interface Credenciales {
  clave: string;
  proyectoId: string;
}

/** Devuelve las credenciales si están configuradas, o null si no. */
export function credencialesDeNeon(): Credenciales | null {
  const clave = process.env['NEON_API_KEY'];
  const proyectoId = process.env['NEON_PROJECT_ID'];
  return clave && proyectoId ? { clave, proyectoId } : null;
}

async function llamar(
  credenciales: Credenciales,
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
): Promise<any> {
  const respuesta = await fetch(`${API}/projects/${credenciales.proyectoId}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${credenciales.clave}`,
      'Content-Type': 'application/json',
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

  const texto = await respuesta.text();

  if (!respuesta.ok) {
    // Ojo: nunca incluir la clave en el mensaje.
    throw new Error(
      `Neon respondió ${respuesta.status} a ${metodo} ${ruta}: ${texto.slice(0, 300)}`,
    );
  }

  return texto ? JSON.parse(texto) : null;
}

export interface RamaEfimera {
  id: string;
  nombre: string;
  url: string;
}

/**
 * Crea una copia de la base y devuelve por dónde conectarse.
 *
 * La rama nace como copia exacta de la principal, así que ya trae el esquema y
 * los disparadores aplicados: no hay que migrar desde cero.
 */
export async function crearRamaDePruebas(credenciales: Credenciales): Promise<RamaEfimera> {
  const nombre = `${PREFIJO}${Date.now()}`;

  const respuesta = await llamar(credenciales, 'POST', '/branches', {
    branch: { name: nombre },
    endpoints: [{ type: 'read_write' }],
  });

  const url: string | undefined =
    respuesta?.connection_uris?.[0]?.connection_uri ?? respuesta?.connection_uri;

  if (!url) {
    throw new Error('Neon creó la rama pero no devolvió cadena de conexión.');
  }

  return { id: respuesta.branch.id, nombre, url };
}

export async function borrarRama(credenciales: Credenciales, ramaId: string): Promise<void> {
  await llamar(credenciales, 'DELETE', `/branches/${ramaId}`);
}

/**
 * Borra las ramas de prueba que quedaron colgando de tandas que se
 * interrumpieron. El plan gratuito tiene un tope de ramas, así que si nadie
 * limpia, tarde o temprano las pruebas dejan de poder crear la suya.
 */
export async function borrarRamasHuerfanas(credenciales: Credenciales): Promise<number> {
  const { branches } = await llamar(credenciales, 'GET', '/branches');
  const limite = Date.now() - VIDA_MAXIMA_MS;
  let borradas = 0;

  for (const rama of branches ?? []) {
    const esDePrueba = typeof rama.name === 'string' && rama.name.startsWith(PREFIJO);
    const esVieja = new Date(rama.created_at).getTime() < limite;

    if (esDePrueba && esVieja && !rama.default) {
      try {
        await borrarRama(credenciales, rama.id);
        borradas += 1;
      } catch {
        // Si otra tanda la borró primero, no pasa nada.
      }
    }
  }

  return borradas;
}

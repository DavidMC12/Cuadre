/**
 * Traduce los codigos de error que devuelve Neon Auth (Better Auth) a
 * mensajes en espanol que se le pueden mostrar a la persona tal cual.
 *
 * Dos alfabetos de códigos conviven aquí a propósito. `authClient` casi
 * siempre LANZA en vez de devolver `{ error }` (confirmado probando contra
 * el servidor real, no solo leyendo el tipo), y al lanzar, el cliente de
 * Neon Auth normaliza el código original de Better Auth (MAYÚSCULAS, ver
 * `PASSWORD_TOO_SHORT` más abajo) a su propia taxonomía en minúsculas
 * (`weak_password`). Las claves en MAYÚSCULAS quedan por si alguna vez SÍ
 * llega un `{ error }` devuelto (la forma en que están escritos los `if
 * (errorAuth)` de cada formulario, y la documentada en `llms.txt`); las
 * claves en minúsculas son las que de verdad se ven en la práctica.
 */
const MENSAJES_POR_CODIGO: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  INVALID_EMAIL: "Ese correo no es válido.",
  INVALID_PASSWORD: "Esa contraseña no es válida.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  PASSWORD_TOO_LONG: "Esa contraseña es demasiado larga.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Ya existe una cuenta con ese correo. Prueba entrar en vez de registrarte.",
  // A propósito NO se traduce USER_NOT_FOUND (ni su equivalente en minúsculas
  // más abajo): en /recuperar-contrasena, decir "no encontramos una cuenta
  // con ese correo" delataría quién tiene cuenta y quién no. Hoy ese
  // formulario nunca lo recibe (el servidor responde siempre 200, exista o
  // no el correo), pero mejor que el mensaje genérico se quede como red de
  // seguridad a que quede la trampa armada para el día que cambie algo.
  EMAIL_NOT_VERIFIED: "Todavía no verificaste tu correo.",
  // Del enlace para poner una contraseña nueva: ya se usó, o pasó más de una
  // hora desde que se pidió.
  INVALID_TOKEN: "Ese enlace ya no sirve. Puede que haya vencido o que ya lo hayas usado.",
  // Red de seguridad: el navegador ya valida el formulario antes de enviarlo,
  // pero el servidor es la última palabra (por ejemplo, un cliente sin
  // JavaScript, o una regla que el navegador no conoce).
  VALIDATION_ERROR: "Revisa los datos del formulario.",

  // -- Lo que de verdad llega, normalizado por el cliente de Neon Auth --
  invalid_credentials: "Correo o contraseña incorrectos.",
  email_address_invalid: "Ese correo no es válido.",
  // PASSWORD_TOO_SHORT y PASSWORD_TOO_LONG llegan aquí como el mismo código:
  // el cliente ya no distingue cuál de los dos fue.
  weak_password: "Esa contraseña no sirve: prueba con un largo distinto.",
  user_already_exists: "Ya existe una cuenta con ese correo.",
  email_not_confirmed: "Todavía no verificaste tu correo.",
  validation_failed: "Revisa los datos del formulario.",
  over_request_rate_limit: "Demasiadas peticiones. Espera un momento.",
  // bad_jwt NO tiene entrada aquí a propósito: es el código con el que el
  // cliente normaliza tanto "tu sesión venció" como "este enlace de
  // restablecer ya no sirve" (ver `mensajeErrorAuthLanzado`), y solo la
  // segunda tiene un mensaje que tenga sentido para quien lo lee. Cada
  // formulario decide el suyo con el parámetro `sobrescrituras`.
};

const MENSAJE_GENERICO = "Algo salió mal. Inténtalo de nuevo.";

/**
 * A qué campo de un formulario de auth pertenece un error, si a alguno.
 *
 * `null` es un error general —credenciales inválidas, que son de la pareja
 * correo+contraseña; un límite de peticiones; un fallo de red— y no marca un
 * campo puntual. El nombre solo entra por completitud: Neon Auth no tiene un
 * código propio para ese campo (el navegador lo valida antes de enviar).
 */
export type CampoDeAuth = "nombre" | "correo" | "contrasena";

/**
 * El campo que señala cada código de error. Solo entran los códigos que de
 * verdad apuntan a un campo; el resto queda `null`. Las claves siguen los dos
 * alfabetos de `MENSAJES_POR_CODIGO` (MAYÚSCULAS y minúsculas).
 */
const CAMPO_POR_CODIGO: Record<string, CampoDeAuth> = {
  INVALID_EMAIL: "correo",
  email_address_invalid: "correo",
  USER_ALREADY_EXISTS: "correo",
  user_already_exists: "correo",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "correo",
  EMAIL_NOT_VERIFIED: "correo",
  email_not_confirmed: "correo",
  INVALID_PASSWORD: "contrasena",
  PASSWORD_TOO_SHORT: "contrasena",
  PASSWORD_TOO_LONG: "contrasena",
  weak_password: "contrasena",
};

/** El mensaje en español de un error de auth, con el campo al que pertenece. */
export interface ErrorAuthInterpretado {
  mensaje: string;
  /** El campo señalado, o `null` si el error es general. */
  campo: CampoDeAuth | null;
}

type ErrorAuth = { code?: string | null; message?: string | null } | null | undefined;

/** Mensaje en espanol para un error de `authClient`. Nunca deja pasar un codigo en ingles. */
export function mensajeErrorAuth(error: ErrorAuth): string {
  if (error?.code && MENSAJES_POR_CODIGO[error.code]) {
    return MENSAJES_POR_CODIGO[error.code];
  }
  return MENSAJE_GENERICO;
}

/**
 * Igual que `mensajeErrorAuth`, pero para el otro camino por el que puede
 * fallar una llamada a `authClient`: lanzando una excepción en vez de
 * devolver `{ error }` (es, en la práctica, el camino habitual: se
 * comprobó contra el servidor real que cualquier respuesta que no sea
 * 2xx se lanza, no se devuelve). Si lo lanzado se parece a un error de
 * auth (trae `code`), se busca en `sobrescrituras` primero y en el
 * diccionario compartido después; si no se parece a nada, cae en el
 * mensaje genérico.
 *
 * `sobrescrituras` existe porque un mismo código puede significar cosas
 * distintas según la pantalla: `bad_jwt` es tanto "tu sesión venció" como
 * "este enlace ya no sirve", y solo quien llama sabe cuál de las dos es.
 */
/**
 * El código de auth que trae lo lanzado, o `null` si no se parece a un error
 * de auth. Un solo lugar extrae el código, para que el mensaje y el campo no
 * puedan divergir.
 */
function codigoDeErrorLanzado(excepcion: unknown): string | null {
  if (excepcion && typeof excepcion === "object" && "code" in excepcion) {
    const codigo = (excepcion as { code?: unknown }).code;
    if (typeof codigo === "string") return codigo;
  }
  return null;
}

export function mensajeErrorAuthLanzado(
  excepcion: unknown,
  sobrescrituras?: Record<string, string>
): string {
  const codigo = codigoDeErrorLanzado(excepcion);
  if (codigo === null) return mensajeErrorAuth(null);
  return sobrescrituras?.[codigo] || mensajeErrorAuth({ code: codigo });
}

/**
 * El mensaje Y el campo que señala un error devuelto por `authClient`. Es lo
 * que consumen los formularios: el mensaje para mostrar y el campo para poner
 * `aria-invalid`/`aria-describedby` solo donde corresponde.
 */
export function interpretarErrorAuth(error: ErrorAuth): ErrorAuthInterpretado {
  return {
    mensaje: mensajeErrorAuth(error),
    campo: error?.code ? CAMPO_POR_CODIGO[error.code] ?? null : null,
  };
}

/**
 * Igual que `interpretarErrorAuth`, para el camino que LANZA en vez de
 * devolver `{ error }` (el habitual, ver `mensajeErrorAuthLanzado`). El campo
 * no se deduce de la sobrescritura: es del código, no del texto.
 */
export function interpretarErrorAuthLanzado(
  excepcion: unknown,
  sobrescrituras?: Record<string, string>
): ErrorAuthInterpretado {
  const codigo = codigoDeErrorLanzado(excepcion);
  return {
    // El mensaje sale de UN solo lugar (con su regla de sobrescritura); el
    // campo, del código. Así los dos no pueden divergir.
    mensaje: mensajeErrorAuthLanzado(excepcion, sobrescrituras),
    campo: codigo === null ? null : CAMPO_POR_CODIGO[codigo] ?? null,
  };
}

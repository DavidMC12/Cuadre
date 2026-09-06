/**
 * Cliente HTTP contra la API de Cuadre.
 *
 * Un solo lugar sabe hablar con el servidor. Todo lo demás llama funciones con
 * nombre, sin enterarse de rutas ni de códigos de estado.
 */

const BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3001";

export type CodigoErrorApi =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RULE_VIOLATION"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "SIN_CONEXION";

export interface DetalleErrorApi {
  campo: string;
  problema: string;
}

export interface CuerpoErrorApi {
  code: CodigoErrorApi;
  message: string;
  details?: DetalleErrorApi[];
}

/**
 * Un error tal como lo devuelve la API: `{ error: { code, message, details? } }`.
 * El mensaje ya viene en español y listo para mostrárselo a la persona; no se
 * reescribe aquí.
 */
export class ApiError extends Error {
  code: CodigoErrorApi;
  details?: DetalleErrorApi[];

  constructor(body: CuerpoErrorApi) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.details = body.details;
  }
}

interface Opciones {
  metodo?: "GET" | "POST";
  cuerpo?: unknown;
  /** Parámetros de consulta; los `undefined` se omiten. */
  parametros?: Record<string, string | number | undefined>;
}

function construirUrl(ruta: string, parametros?: Opciones["parametros"]): string {
  const url = new URL(`${BASE}/api/v1${ruta}`);

  for (const [clave, valor] of Object.entries(parametros ?? {})) {
    if (valor !== undefined) url.searchParams.set(clave, String(valor));
  }

  return url.toString();
}

export async function pedir<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { metodo = "GET", cuerpo, parametros } = opciones;

  let respuesta: Response;
  try {
    respuesta = await fetch(construirUrl(ruta, parametros), {
      method: metodo,
      headers: cuerpo === undefined ? {} : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: "include",
    });
  } catch {
    throw new ApiError({
      code: "SIN_CONEXION",
      message: "No se pudo conectar con el servidor. Revisa que esté encendido.",
    });
  }

  const texto = await respuesta.text();

  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }

  if (!respuesta.ok) {
    const error = (json as { error?: CuerpoErrorApi } | null)?.error;
    throw new ApiError(
      error ?? {
        code: "INTERNAL",
        message: "El servidor respondió algo que no supimos entender.",
      },
    );
  }

  return json as T;
}

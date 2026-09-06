/**
 * Piezas compartidas por toda la capa de API: el formato de error del
 * contrato real y un pequeño simulador de latencia de red.
 *
 * Cuando se conecte la API de verdad, este archivo debería sobrevivir casi
 * intacto: `ApiError` y `retrasoDeRed` (o algo que la reemplace, como un
 * `fetch` real) siguen haciendo falta.
 */

export type CodigoErrorApi =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RULE_VIOLATION"
  | "RATE_LIMITED"
  | "INTERNAL";

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
 * Representa un error tal como lo devuelve la API en cualquier endpoint:
 * `{ error: { code, message, details? } }`. El mensaje ya viene listo para
 * mostrárselo a la persona tal cual, sin reescribirlo.
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

/**
 * Simula la latencia de una llamada real, para que la interfaz ya maneje
 * bien los estados de carga antes de que exista la API de verdad.
 */
export function retrasoDeRed(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

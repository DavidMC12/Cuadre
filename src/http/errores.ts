/**
 * Traducción de errores a respuestas HTTP.
 *
 * La base de datos rechaza lo que está mal con mensajes como
 * `transactions_amount_not_zero`. Eso no se le muestra a nadie: aquí cada
 * regla rota se convierte en una frase que una persona entiende.
 *
 * Regla de seguridad: ningún mensaje que salga de aquí lleva montos, tokens ni
 * datos de cuentas. Los mensajes de los disparadores de Postgres ya se
 * escribieron con esa restricción.
 */
import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export type CodigoError =
  'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'RULE_VIOLATION' | 'RATE_LIMITED' | 'INTERNAL';

export class ErrorDeApp extends Error {
  constructor(
    readonly codigo: CodigoError,
    message: string,
    readonly estado: number,
    readonly detalles?: unknown,
  ) {
    super(message);
    this.name = 'ErrorDeApp';
  }
}

export const noEncontrado = (mensaje: string): ErrorDeApp =>
  new ErrorDeApp('NOT_FOUND', mensaje, 404);

export const conflicto = (mensaje: string): ErrorDeApp => new ErrorDeApp('CONFLICT', mensaje, 409);

export const reglaViolada = (mensaje: string, detalles?: unknown): ErrorDeApp =>
  new ErrorDeApp('RULE_VIOLATION', mensaje, 422, detalles);

// -----------------------------------------------------------------------------

interface Traduccion {
  estado: number;
  codigo: CodigoError;
  mensaje: string;
}

/**
 * Cada restricción de la base, dicha en cristiano. Si algún día se agrega una
 * restricción nueva al esquema, se agrega también aquí; lo que falte cae en el
 * mensaje genérico y se ve feo, que es justo el recordatorio que hace falta.
 */
const POR_RESTRICCION: Record<string, Traduccion> = {
  // Movimientos
  transactions_amount_not_zero: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'El monto no puede ser cero.',
  },
  transactions_account_fk: {
    estado: 404,
    codigo: 'NOT_FOUND',
    mensaje: 'Esa cuenta no existe, o la moneda del movimiento no es la de la cuenta.',
  },
  transactions_category_fk: {
    estado: 404,
    codigo: 'NOT_FOUND',
    mensaje: 'Esa categoría no existe.',
  },
  transactions_reversal_unique: {
    estado: 409,
    codigo: 'CONFLICT',
    mensaje: 'Ese movimiento ya está anulado.',
  },
  transactions_one_opening_per_account: {
    estado: 409,
    codigo: 'CONFLICT',
    mensaje: 'Esa cuenta ya tiene un saldo inicial.',
  },
  transactions_transfer_has_no_category: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje:
      'Pasar plata entre cuentas propias no es un gasto ni un ingreso, así que no lleva categoría.',
  },
  transactions_transfer_group_consistent: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'Un movimiento de transferencia tiene que pertenecer a una transferencia.',
  },
  transactions_opening_is_bare: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'El saldo inicial no lleva categoría y no anula nada.',
  },
  transactions_description_not_blank: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'La descripción no puede quedar en blanco. Déjala vacía o escribe algo.',
  },
  transactions_currency_format: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'La moneda debe ser un código de tres letras en mayúsculas, como COP o USD.',
  },

  // Cuentas
  accounts_user_name_unique: {
    estado: 409,
    codigo: 'CONFLICT',
    mensaje: 'Ya tienes una cuenta con ese nombre.',
  },
  accounts_type_valid: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'Ese tipo de cuenta no existe. Puede ser banco, tarjeta o efectivo.',
  },
  accounts_currency_format: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'La moneda debe ser un código de tres letras en mayúsculas, como COP o USD.',
  },
  accounts_name_not_blank: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'La cuenta necesita un nombre.',
  },

  // Categorías
  categories_user_kind_name_unique: {
    estado: 409,
    codigo: 'CONFLICT',
    mensaje: 'Ya tienes una categoría con ese nombre.',
  },
  categories_parent_fk: {
    estado: 404,
    codigo: 'NOT_FOUND',
    mensaje: 'Esa categoría padre no existe.',
  },
  categories_kind_valid: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'Una categoría es de ingresos o de gastos.',
  },
  categories_name_not_blank: {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'La categoría necesita un nombre.',
  },

  // Usuarios
  users_email_unique: {
    estado: 409,
    codigo: 'CONFLICT',
    mensaje: 'Ese correo ya está registrado.',
  },
};

/** Códigos SQLSTATE que nos interesan. */
const VIOLACION_DE_RESTRICCION = new Set(['23502', '23503', '23505', '23514']);
const EXCEPCION_DE_DISPARADOR = 'P0001';

interface ErrorDePostgres {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  message?: string;
}

function esErrorDePostgres(error: unknown): error is ErrorDePostgres {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Convierte un error de Postgres en una respuesta con sentido, o devuelve null
 * si no lo reconoce (y entonces es un fallo de verdad, no una regla rota).
 */
export function traducirErrorDePostgres(error: unknown): Traduccion | null {
  if (!esErrorDePostgres(error) || typeof error.code !== 'string') return null;

  // Los disparadores de dinero ya lanzan mensajes en español, escritos para que
  // los lea una persona y sin cifras adentro. Se pasan tal cual.
  if (error.code === EXCEPCION_DE_DISPARADOR && error.message) {
    return { estado: 422, codigo: 'RULE_VIOLATION', mensaje: error.message };
  }

  if (!VIOLACION_DE_RESTRICCION.has(error.code)) return null;

  const restriccion = error.constraint_name ?? error.constraint;
  if (restriccion && POR_RESTRICCION[restriccion]) return POR_RESTRICCION[restriccion];

  return {
    estado: 422,
    codigo: 'RULE_VIOLATION',
    mensaje: 'Los datos no cumplen una regla del sistema.',
  };
}

// -----------------------------------------------------------------------------

export function registrarManejoDeErrores(app: FastifyInstance): void {
  app.setNotFoundHandler((peticion, respuesta) =>
    respuesta.code(404).send({
      error: { code: 'NOT_FOUND', message: `No existe ${peticion.method} ${peticion.url}.` },
    }),
  );

  app.setErrorHandler((error: unknown, peticion, respuesta) => {
    const fallo = error as { statusCode?: number; code?: string };

    // 1. La petición no cumple el esquema Zod de la ruta.
    if (hasZodFastifySchemaValidationErrors(error)) {
      return respuesta.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son válidos.',
          details: error.validation.map((v) => {
            const problema = v.params.issue as { path?: unknown[]; message?: string };
            return {
              campo: v.instancePath.replace(/^\//, '') || (problema.path ?? []).join('.'),
              problema: problema.message ?? 'valor inválido',
            };
          }),
        },
      });
    }

    // 2. Un error que nosotros mismos lanzamos a propósito.
    if (error instanceof ErrorDeApp) {
      return respuesta.code(error.estado).send({
        error: { code: error.codigo, message: error.message, details: error.detalles },
      });
    }

    // 3. Una regla del dinero que rechazó la base de datos.
    const traduccion = traducirErrorDePostgres(error);
    if (traduccion) {
      peticion.log.info(
        { restriccion: (error as ErrorDePostgres).constraint_name, sqlstate: fallo.code },
        'regla rechazada por la base',
      );
      return respuesta
        .code(traduccion.estado)
        .send({ error: { code: traduccion.codigo, message: traduccion.mensaje } });
    }

    // 4. Demasiadas peticiones.
    if (fallo.statusCode === 429) {
      return respuesta.code(429).send({
        error: { code: 'RATE_LIMITED', message: 'Demasiadas peticiones. Espera un momento.' },
      });
    }

    // 5. Cualquier otra cosa es un fallo nuestro: se registra completo en el
    //    servidor y hacia afuera no se cuenta nada.
    peticion.log.error({ err: error }, 'error no previsto');
    const estado = fallo.statusCode && fallo.statusCode < 500 ? fallo.statusCode : 500;
    return respuesta.code(estado).send({
      error: { code: 'INTERNAL', message: 'Algo falló de nuestro lado. Inténtalo otra vez.' },
    });
  });
}

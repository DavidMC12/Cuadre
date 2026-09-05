/**
 * Pruebas de consistencia contra la base de datos de verdad.
 *
 * Cada prueba corre dentro de una transaccion que SIEMPRE se deshace al final,
 * asi que no deja rastro. Hace falta porque los movimientos son inmutables: no
 * se pueden borrar despues, ni siquiera para limpiar.
 *
 * La idea de toda la suite es intentar romper las reglas del dinero a proposito
 * y comprobar que la base no lo permite.
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../env.js';
import { sum } from '../shared/money.js';

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });

afterAll(async () => {
  await sql.end();
});

/** Se lanza para forzar el deshacer; no es un error de verdad. */
class Deshacer extends Error {}

type Tx = postgres.TransactionSql<Record<string, unknown>>;

interface Semilla {
  usuarioA: string;
  usuarioB: string;
  /** Cuentas del usuario A. */
  bancoCop: string;
  efectivoCop: string;
  bancoUsd: string;
  /** Cuenta del usuario B. */
  bancoDeOtro: string;
  comida: string;
  categoriaDeOtro: string;
}

/**
 * Los identificadores se generan aqui y no con `returning`, para meter toda la
 * semilla en tres viajes a la base en vez de ocho. La base esta en Oregon y
 * cada viaje se paga en tiempo de reloj.
 */
async function sembrar(tx: Tx): Promise<Semilla> {
  const marca = randomUUID().slice(0, 8);

  const s: Semilla = {
    usuarioA: randomUUID(),
    usuarioB: randomUUID(),
    bancoCop: randomUUID(),
    efectivoCop: randomUUID(),
    bancoUsd: randomUUID(),
    bancoDeOtro: randomUUID(),
    comida: randomUUID(),
    categoriaDeOtro: randomUUID(),
  };

  await tx`
    insert into users (id, email, display_name) values
      (${s.usuarioA}, ${`a-${marca}@ejemplo.test`}, 'Usuario A'),
      (${s.usuarioB}, ${`b-${marca}@ejemplo.test`}, 'Usuario B')`;

  await tx`
    insert into accounts (id, user_id, name, type, currency) values
      (${s.bancoCop},     ${s.usuarioA}, 'Banco',     'bank', 'COP'),
      (${s.efectivoCop},  ${s.usuarioA}, 'Efectivo',  'cash', 'COP'),
      (${s.bancoUsd},     ${s.usuarioA}, 'Banco USD', 'bank', 'USD'),
      (${s.bancoDeOtro},  ${s.usuarioB}, 'Banco',     'bank', 'COP')`;

  await tx`
    insert into categories (id, user_id, name, kind) values
      (${s.comida},          ${s.usuarioA}, 'Comida', 'expense'),
      (${s.categoriaDeOtro}, ${s.usuarioB}, 'Comida', 'expense')`;

  return s;
}

/** Corre el cuerpo con datos frescos y deshace todo al terminar. */
async function conSemilla<T>(cuerpo: (tx: Tx, s: Semilla) => Promise<T>): Promise<T> {
  let resultado!: T;
  try {
    await sql.begin(async (tx) => {
      resultado = await cuerpo(tx, await sembrar(tx));
      throw new Deshacer();
    });
  } catch (error) {
    if (!(error instanceof Deshacer)) throw error;
  }
  return resultado;
}

interface Movimiento {
  cuenta: string;
  monto: string;
  categoria?: string | null;
  tipo?: 'opening' | 'standard' | 'transfer';
  grupo?: string | null;
  anula?: string | null;
  usuario?: string;
}

/** La moneda se toma de la cuenta, que es lo que hara el servicio en Fase 1. */
async function registrar(tx: Tx, usuario: string, m: Movimiento): Promise<string> {
  const [fila] = await tx`
    insert into transactions
      (user_id, account_id, category_id, kind, amount, currency, occurred_at,
       description, transfer_group_id, reverses_transaction_id)
    select ${m.usuario ?? usuario}, ${m.cuenta}, ${m.categoria ?? null}, ${m.tipo ?? 'standard'},
           ${m.monto}, a.currency, now(), 'prueba', ${m.grupo ?? null}, ${m.anula ?? null}
    from accounts a where a.id = ${m.cuenta}
    returning id`;
  return fila!['id'] as string;
}

async function saldo(tx: Tx, cuenta: string): Promise<string> {
  const [fila] = await tx`select balance from account_balances where account_id = ${cuenta}`;
  return fila!['balance'] as string;
}

/** Obliga a los disparadores diferidos a revisar ya, sin esperar al commit. */
async function forzarRevision(tx: Tx): Promise<unknown> {
  return tx`set constraints all immediate`;
}

// -----------------------------------------------------------------------------

describe('el libro de movimientos es inmutable', () => {
  it('no deja editar un movimiento', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const id = await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await tx`update transactions set amount = '-1' where id = ${id}`;
      }),
    ).rejects.toThrow(/inmutables/i);
  });

  it('no deja borrar un movimiento', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const id = await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await tx`delete from transactions where id = ${id}`;
      }),
    ).rejects.toThrow(/inmutables/i);
  });

  it('tampoco deja editar la descripcion, que parece inofensiva', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const id = await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await tx`update transactions set description = 'otra cosa' where id = ${id}`;
      }),
    ).rejects.toThrow(/inmutables/i);
  });
});

describe('nadie toca los datos de otro usuario', () => {
  it('no deja registrar un movimiento en la cuenta de otro', async () => {
    await expect(
      conSemilla(async (tx, s) =>
        registrar(tx, s.usuarioA, { cuenta: s.bancoDeOtro, monto: '-100', usuario: s.usuarioA }),
      ),
    ).rejects.toThrow(/transactions_account_fk/);
  });

  it('no deja usar la categoria de otro', async () => {
    await expect(
      conSemilla(async (tx, s) =>
        registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '-100',
          categoria: s.categoriaDeOtro,
        }),
      ),
    ).rejects.toThrow(/transactions_category_fk/);
  });

  it('no deja colgar una categoria de la de otro usuario', async () => {
    await expect(
      conSemilla(
        async (tx, s) => tx`
          insert into categories (user_id, name, kind, parent_id)
          values (${s.usuarioA}, 'Mercado', 'expense', ${s.categoriaDeOtro})`,
      ),
    ).rejects.toThrow(/categories_parent_fk/);
  });
});

describe('la moneda de un movimiento es la de su cuenta', () => {
  it('rechaza un movimiento en otra moneda', async () => {
    await expect(
      conSemilla(
        async (tx, s) => tx`
          insert into transactions (user_id, account_id, amount, currency, occurred_at)
          values (${s.usuarioA}, ${s.bancoCop}, '-100', 'USD', now())`,
      ),
    ).rejects.toThrow(/transactions_account_fk/);
  });

  it('no deja cambiarle la moneda a una cuenta que ya tiene movimientos', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await tx`update accounts set currency = 'USD' where id = ${s.bancoCop}`;
      }),
    ).rejects.toThrow(/transactions_account_fk|still referenced/i);
  });
});

describe('las correcciones cuadran', () => {
  it('exige el monto opuesto', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const original = await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '50', anula: original });
      }),
    ).rejects.toThrow(/monto opuesto/i);
  });

  it('exige la misma cuenta', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const original = await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await registrar(tx, s.usuarioA, { cuenta: s.efectivoCop, monto: '100', anula: original });
      }),
    ).rejects.toThrow(/misma cuenta/i);
  });

  it('no deja anular una anulacion', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const original = await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        const anulacion = await registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '100',
          anula: original,
        });
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100', anula: anulacion });
      }),
    ).rejects.toThrow(/anular una anulacion/i);
  });

  it('no deja anular dos veces el mismo movimiento', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const original = await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '100', anula: original });
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '100', anula: original });
      }),
    ).rejects.toThrow(/transactions_reversal_unique/);
  });

  it('no deja anular el saldo inicial', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const apertura = await registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '1000',
          tipo: 'opening',
        });
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-1000', anula: apertura });
      }),
    ).rejects.toThrow(/saldo inicial no se anula/i);
  });

  it('una anulacion valida deja el saldo como estaba', async () => {
    const resultado = await conSemilla(async (tx, s) => {
      await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '1000', tipo: 'opening' });
      const error = await registrar(tx, s.usuarioA, {
        cuenta: s.bancoCop,
        monto: '-250.50',
        categoria: s.comida,
      });
      const conError = await saldo(tx, s.bancoCop);
      await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '250.50', anula: error });
      return { conError, corregido: await saldo(tx, s.bancoCop) };
    });

    expect(resultado.conError).toBe('749.5000');
    expect(resultado.corregido).toBe('1000.0000');
  });
});

describe('las transferencias cuadran', () => {
  it('rechaza una transferencia que no suma cero', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const grupo = randomUUID();
        await registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '-100',
          tipo: 'transfer',
          grupo,
        });
        await registrar(tx, s.usuarioA, {
          cuenta: s.efectivoCop,
          monto: '90',
          tipo: 'transfer',
          grupo,
        });
        await forzarRevision(tx);
      }),
    ).rejects.toThrow(/sumar cero/i);
  });

  it('rechaza una transferencia con una sola pata', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        await registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '-100',
          tipo: 'transfer',
          grupo: randomUUID(),
        });
        await forzarRevision(tx);
      }),
    ).rejects.toThrow(/exactamente dos movimientos/i);
  });

  it('rechaza una transferencia entre monedas distintas', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const grupo = randomUUID();
        await registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '-100',
          tipo: 'transfer',
          grupo,
        });
        await registrar(tx, s.usuarioA, {
          cuenta: s.bancoUsd,
          monto: '100',
          tipo: 'transfer',
          grupo,
        });
        await forzarRevision(tx);
      }),
    ).rejects.toThrow(/misma moneda/i);
  });

  it('rechaza una transferencia que sale y entra en la misma cuenta', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        const grupo = randomUUID();
        await registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '-100',
          tipo: 'transfer',
          grupo,
        });
        await registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '100',
          tipo: 'transfer',
          grupo,
        });
        await forzarRevision(tx);
      }),
    ).rejects.toThrow(/dos cuentas distintas/i);
  });

  it('una transferencia no lleva categoria', async () => {
    await expect(
      conSemilla(async (tx, s) =>
        registrar(tx, s.usuarioA, {
          cuenta: s.bancoCop,
          monto: '-100',
          tipo: 'transfer',
          grupo: randomUUID(),
          categoria: s.comida,
        }),
      ),
    ).rejects.toThrow(/transactions_transfer_has_no_category/);
  });

  it('una transferencia valida mueve el saldo sin cambiar el total', async () => {
    const resultado = await conSemilla(async (tx, s) => {
      await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '1000', tipo: 'opening' });
      const grupo = randomUUID();
      await registrar(tx, s.usuarioA, {
        cuenta: s.bancoCop,
        monto: '-300',
        tipo: 'transfer',
        grupo,
      });
      await registrar(tx, s.usuarioA, {
        cuenta: s.efectivoCop,
        monto: '300',
        tipo: 'transfer',
        grupo,
      });
      await forzarRevision(tx);
      return { banco: await saldo(tx, s.bancoCop), efectivo: await saldo(tx, s.efectivoCop) };
    });

    expect(resultado.banco).toBe('700.0000');
    expect(resultado.efectivo).toBe('300.0000');
    expect(sum([resultado.banco, resultado.efectivo])).toBe('1000.0000');
  });
});

describe('el saldo es la suma de los movimientos', () => {
  it('una cuenta recien creada tiene saldo cero', async () => {
    const saldoInicial = await conSemilla(async (tx, s) => saldo(tx, s.bancoCop));
    expect(saldoInicial).toBe('0.0000');
  });

  it('la vista coincide con la suma calculada en codigo', async () => {
    const montos = ['1500000', '-249.99', '-1200.50', '0.0001', '-0.0002', '89999.9999', '-3.3333'];

    const resultado = await conSemilla(async (tx, s) => {
      await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: montos[0]!, tipo: 'opening' });
      for (const monto of montos.slice(1)) {
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto, categoria: s.comida });
      }
      return saldo(tx, s.bancoCop);
    });

    expect(resultado).toBe(sum(montos));
  });

  it('el saldo de un usuario no se contamina con el de otro', async () => {
    const resultado = await conSemilla(async (tx, s) => {
      await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '1000', tipo: 'opening' });
      await registrar(tx, s.usuarioB, {
        cuenta: s.bancoDeOtro,
        monto: '999999',
        tipo: 'opening',
        usuario: s.usuarioB,
      });
      return saldo(tx, s.bancoCop);
    });

    expect(resultado).toBe('1000.0000');
  });
});

describe('reglas basicas del libro', () => {
  it('no acepta un movimiento de monto cero', async () => {
    await expect(
      conSemilla(async (tx, s) => registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '0' })),
    ).rejects.toThrow(/transactions_amount_not_zero/);
  });

  it('no acepta dos saldos iniciales en la misma cuenta', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '1000', tipo: 'opening' });
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '500', tipo: 'opening' });
      }),
    ).rejects.toThrow(/transactions_one_opening_per_account/);
  });

  it('no acepta dos cuentas activas con el mismo nombre', async () => {
    await expect(
      conSemilla(
        async (tx, s) => tx`
          insert into accounts (user_id, name, type, currency)
          values (${s.usuarioA}, 'Banco', 'cash', 'COP')`,
      ),
    ).rejects.toThrow(/accounts_user_name_unique/);
  });

  it('no acepta un tipo de cuenta inventado', async () => {
    await expect(
      conSemilla(
        async (tx, s) => tx`
          insert into accounts (user_id, name, type, currency)
          values (${s.usuarioA}, 'Cripto', 'bitcoin', 'COP')`,
      ),
    ).rejects.toThrow(/accounts_type_valid/);
  });

  it('guarda el correo siempre en minusculas', async () => {
    await expect(
      conSemilla(
        async (tx) => tx`
          insert into users (email, display_name) values ('Mayus@Ejemplo.test', 'Prueba')`,
      ),
    ).rejects.toThrow(/users_email_lowercase/);
  });

  it('no deja borrar una cuenta que tiene movimientos', async () => {
    await expect(
      conSemilla(async (tx, s) => {
        await registrar(tx, s.usuarioA, { cuenta: s.bancoCop, monto: '-100' });
        await tx`delete from accounts where id = ${s.bancoCop}`;
      }),
    ).rejects.toThrow(/still referenced|transactions_account_fk/i);
  });
});

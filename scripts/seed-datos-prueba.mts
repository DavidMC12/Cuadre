/**
 * Llena una cuenta de prueba con un año de movimientos realistas, para hacer
 * pruebas funcionales manuales (filtros, gráficas, exportación, multi-moneda,
 * deudas, etc.) sin tener que registrar cada movimiento a mano.
 *
 *   npm run seed:prueba -- correo@ejemplo.com
 *
 * Usa las mismas funciones de servicio que usa la API (crearCuenta,
 * crearCategoria, registrarMovimiento, crearTransferencia,
 * sembrarCategoriasPorDefecto), así que todo lo que valida el negocio
 * (formato de moneda, transferencias solo entre cuentas de igual moneda,
 * montos como texto, etc.) se respeta igual que si viniera de la app.
 *
 * Siembra, en COP: cuenta bancaria, efectivo y una tarjeta de crédito (con
 * saldo inicial negativo, para simular deuda ya existente). En USD: una
 * cuenta y un ahorro, con transferencias entre ellas. Cuentas y categorías
 * son idempotentes (reusa las que ya existan con esos nombres), pero los
 * MOVIMIENTOS no: correrlo dos veces duplica el año completo de movimientos,
 * porque son inmutables y no queda otra forma de detectar "esto ya se
 * sembró".
 */
import { eq } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client.js';
import { users } from '../src/db/schema/users.js';
import * as cuentasService from '../src/modules/accounts/service.js';
import * as categoriasService from '../src/modules/categories/service.js';
import * as movimientosService from '../src/modules/transactions/service.js';

const correo = process.argv[2];
if (!correo) {
  console.error('Uso: npm run seed:prueba -- <correo>');
  process.exit(1);
}

const [usuario] = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(eq(users.email, correo.toLowerCase()))
  .limit(1);

if (!usuario) {
  console.error(
    `No existe ningún usuario de Cuadre con el correo ${correo}. Tiene que haber iniciado sesión al menos una vez.`,
  );
  process.exit(1);
}

const usuarioId = usuario.id;

// Igual que scripts/rol-admin.mts: decir a qué base se va a escribir ANTES de
// escribir, para no sembrar un año de movimientos en la base equivocada.
console.log(`Base: ${new URL(process.env['DATABASE_URL']!).host}`);
console.log(`Sembrando datos de prueba para ${usuario.email} (${usuarioId})`);

// Generador determinista: mismos datos si se corre dos veces, para poder
// comparar antes/después sin sorpresas.
function mulberry32(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = mulberry32(20260915);
const entre = (min: number, max: number) => Math.round(min + azar() * (max - min));
const elegir = <T,>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)]!;

// -----------------------------------------------------------------------------
// Categorías: el catálogo por defecto (idempotente) más unas cuantas propias,
// para que el filtro de categorías tenga de verdad algo que filtrar.

await categoriasService.sembrarCategoriasPorDefecto(db, usuarioId);

const CATEGORIAS_EXTRA: readonly { nombre: string; tipo: 'income' | 'expense' }[] = [
  { nombre: 'Tecnología', tipo: 'expense' },
  { nombre: 'Suscripciones', tipo: 'expense' },
  { nombre: 'Mascotas', tipo: 'expense' },
  { nombre: 'Seguros', tipo: 'expense' },
  { nombre: 'Viajes', tipo: 'expense' },
  { nombre: 'Freelance', tipo: 'income' },
];

for (const extra of CATEGORIAS_EXTRA) {
  const { data: existentes } = await categoriasService.listarCategorias(usuarioId, false);
  const yaExiste = existentes.some((c) => c.name === extra.nombre && c.kind === extra.tipo);
  if (!yaExiste) {
    await categoriasService.crearCategoria(usuarioId, { name: extra.nombre, kind: extra.tipo });
  }
}

const { data: categorias } = await categoriasService.listarCategorias(usuarioId, false);
const cat = (nombre: string, tipo: 'income' | 'expense') => {
  const encontrada = categorias.find((c) => c.name === nombre && c.kind === tipo);
  if (!encontrada) throw new Error(`Falta la categoría "${nombre}" (${tipo}) en el catálogo.`);
  return encontrada.id;
};

// -----------------------------------------------------------------------------
// Cuentas: reusa las que ya existan con ese nombre, o las crea.

async function cuentaOCrear(
  nombre: string,
  tipo: 'bank' | 'cash' | 'card',
  moneda: string,
  apertura: string,
) {
  const { data: existentes } = await cuentasService.listarCuentas(usuarioId, false);
  const existente = existentes.find((c) => c.name === nombre);
  if (existente) return existente.id;

  const creada = await cuentasService.crearCuenta(usuarioId, {
    name: nombre,
    type: tipo,
    currency: moneda,
    openingBalance: apertura,
  });
  return creada.id;
}

const HOY = new Date('2026-09-15T00:00:00Z');
const DIA_DE_HOY = HOY.getUTCDate();

function haceMeses(meses: number, dia: number): string {
  const fecha = new Date(HOY);
  fecha.setUTCMonth(fecha.getUTCMonth() - meses, dia);
  return fecha.toISOString().slice(0, 10);
}

/** Tope de día válido para el mes que se está generando: nunca en el futuro. */
function topeDelMes(mesesAtras: number): number {
  // 28 es seguro para cualquier mes, incluido febrero.
  return mesesAtras === 0 ? DIA_DE_HOY : 28;
}

/** Si un evento de día fijo (sueldo, servicios) todavía no ha pasado este mes, se omite. */
function yaPaso(mesesAtras: number, dia: number): boolean {
  return dia <= topeDelMes(mesesAtras);
}

const cuentaBanco = await cuentaOCrear('Cuenta bancaria', 'bank', 'COP', '1850000');
const cuentaEfectivo = await cuentaOCrear('Efectivo', 'cash', 'COP', '120000');
const cuentaTarjeta = await cuentaOCrear('Tarjeta de crédito', 'card', 'COP', '-650000');
const cuentaDolares = await cuentaOCrear('Cuenta en dólares', 'bank', 'USD', '500');
const cuentaAhorroUsd = await cuentaOCrear('Ahorros USD', 'bank', 'USD', '1000');

console.log(
  `Cuentas: banco=${cuentaBanco} efectivo=${cuentaEfectivo} tarjeta=${cuentaTarjeta} ` +
    `dolares=${cuentaDolares} ahorroUsd=${cuentaAhorroUsd}`,
);

// -----------------------------------------------------------------------------
// Saldos virtuales: cuentas que no deberían quedar en un lugar imposible.
// El efectivo y la cuenta en dólares son plata de verdad: no se gasta lo que
// no está. La tarjeta es al revés —está bien que quede negativa, es deuda—
// pero igual conviene no pagar más de lo que se debe.

function controladorDeSaldo(inicial: number) {
  let saldo = inicial;
  return {
    puedeGastar: (monto: number, colchon = 0) => saldo - monto >= colchon,
    resta: (monto: number) => {
      saldo -= monto;
    },
    suma: (monto: number) => {
      saldo += monto;
    },
    valor: () => saldo,
  };
}

const efectivoVirtual = controladorDeSaldo(120000);
const dolaresVirtual = controladorDeSaldo(500);
const tarjetaVirtual = controladorDeSaldo(-650000);

function cuentaConEfectivoSiAlcanza(monto: number, probabilidadEfectivo: number): string {
  if (azar() < probabilidadEfectivo && efectivoVirtual.puedeGastar(monto, 30000)) {
    efectivoVirtual.resta(monto);
    return cuentaEfectivo;
  }
  return cuentaBanco;
}

// -----------------------------------------------------------------------------

let creados = 0;

async function gasto(
  cuentaId: string,
  categoriaId: string,
  monto: number,
  fecha: string,
  descripcion: string,
) {
  await movimientosService.registrarMovimiento(usuarioId, {
    accountId: cuentaId,
    amount: `-${monto}`,
    occurredAt: fecha,
    description: descripcion,
    categoryId: categoriaId,
  });
  creados++;
}

async function ingreso(
  cuentaId: string,
  categoriaId: string,
  monto: number,
  fecha: string,
  descripcion: string,
) {
  await movimientosService.registrarMovimiento(usuarioId, {
    accountId: cuentaId,
    amount: `${monto}`,
    occurredAt: fecha,
    description: descripcion,
    categoryId: categoriaId,
  });
  creados++;
}

async function transferencia(
  desdeId: string,
  haciaId: string,
  monto: number,
  fecha: string,
  descripcion: string,
) {
  await movimientosService.crearTransferencia(usuarioId, {
    fromAccountId: desdeId,
    toAccountId: haciaId,
    amount: `${monto}`,
    occurredAt: fecha,
    description: descripcion,
  });
  creados += 2;
}

const MERCADOS = ['Éxito', 'Carulla', 'D1', 'Ara', 'Jumbo'];
const RESTAURANTES = ['Almuerzo corriente', 'Domicilio', 'Café', 'Cena con amigos'];
const TRANSPORTE = ['Uber', 'Gasolina', 'Parqueadero', 'Bus'];
const OCIO = ['Cine', 'Streaming', 'Salida el fin de semana', 'Bar'];
const TECNOLOGIA = ['Accesorio', 'Software', 'Reparación de laptop', 'Cargador'];
const MASCOTAS = ['Alimento para mascota', 'Veterinario', 'Peluquería canina'];
const VIAJES_COP = ['Tiquetes nacionales', 'Hospedaje', 'Excursión'];
const VIAJES_USD = ['Tiquetes internacionales', 'Hotel', 'Tour'];
const FREELANCE = ['Proyecto para cliente extranjero', 'Consultoría remota', 'Diseño freelance'];

for (let mesesAtras = 11; mesesAtras >= 0; mesesAtras--) {
  const tope = topeDelMes(mesesAtras);
  const diaAlAzar = () => entre(1, tope);

  // --- Cuenta bancaria y efectivo (COP) --------------------------------

  if (yaPaso(mesesAtras, 28)) {
    await ingreso(
      cuentaBanco,
      cat('Sueldo', 'income'),
      entre(2900000, 3400000),
      haceMeses(mesesAtras, 28),
      'Pago de nómina',
    );
  }

  if (yaPaso(mesesAtras, 5)) {
    await gasto(
      cuentaBanco,
      cat('Vivienda', 'expense'),
      950000,
      haceMeses(mesesAtras, 5),
      'Arriendo',
    );
  }

  if (yaPaso(mesesAtras, 12)) {
    await gasto(
      cuentaBanco,
      cat('Servicios', 'expense'),
      entre(90000, 190000),
      haceMeses(mesesAtras, 12),
      elegir(['Luz', 'Agua', 'Internet', 'Gas']),
    );
  }

  if (yaPaso(mesesAtras, 15)) {
    await gasto(
      cuentaBanco,
      cat('Seguros', 'expense'),
      entre(60000, 150000),
      haceMeses(mesesAtras, 15),
      'Seguro',
    );
  }

  // Retiro de efectivo un par de veces al mes: entra primero al saldo
  // virtual, así los gastos en efectivo de más abajo saben cuánto hay.
  for (const dia of [8, 22]) {
    if (yaPaso(mesesAtras, dia) && azar() < 0.8) {
      const monto = entre(200000, 450000);
      await transferencia(
        cuentaBanco,
        cuentaEfectivo,
        monto,
        haceMeses(mesesAtras, dia),
        'Retiro de efectivo',
      );
      efectivoVirtual.suma(monto);
    }
  }

  for (let i = 0; i < 4; i++) {
    const monto = entre(45000, 160000);
    await gasto(
      cuentaConEfectivoSiAlcanza(monto, 0.3),
      cat('Mercado', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(MERCADOS),
    );
  }

  for (let i = 0; i < entre(3, 5); i++) {
    const monto = entre(18000, 70000);
    await gasto(
      cuentaConEfectivoSiAlcanza(monto, 0.8),
      cat('Restaurantes', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(RESTAURANTES),
    );
  }

  for (let i = 0; i < entre(8, 14); i++) {
    const monto = entre(5000, 25000);
    await gasto(
      cuentaConEfectivoSiAlcanza(monto, 0.8),
      cat('Transporte', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(TRANSPORTE),
    );
  }

  for (let i = 0; i < entre(2, 3); i++) {
    const monto = entre(20000, 85000);
    await gasto(
      cuentaConEfectivoSiAlcanza(monto, 0.4),
      cat('Ocio', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(OCIO),
    );
  }

  if (azar() < 0.5) {
    await gasto(
      cuentaBanco,
      cat('Salud', 'expense'),
      entre(30000, 150000),
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(['Droguería', 'Consulta médica', 'Odontólogo']),
    );
  }

  if (mesesAtras % 3 === 0) {
    await gasto(
      cuentaBanco,
      cat('Educación', 'expense'),
      entre(100000, 300000),
      haceMeses(mesesAtras, diaAlAzar()),
      'Curso',
    );
  }

  if (azar() < 0.4) {
    await ingreso(
      cuentaBanco,
      cat('Ventas', 'income'),
      entre(100000, 450000),
      haceMeses(mesesAtras, diaAlAzar()),
      'Trabajo independiente',
    );
  }

  if (azar() < 0.2) {
    const monto = entre(50000, 200000);
    await ingreso(
      cuentaEfectivo,
      cat('Regalos', 'income'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      'Regalo',
    );
    efectivoVirtual.suma(monto);
  }

  // --- Mascotas, siempre en efectivo o banco, casi todos los meses -----

  if (azar() < 0.85) {
    const monto = entre(30000, 90000);
    await gasto(
      cuentaConEfectivoSiAlcanza(monto, 0.5),
      cat('Mascotas', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(MASCOTAS),
    );
  }

  // --- Tarjeta de crédito (COP): compras y pago mensual -----------------

  // Suscripción fija (gimnasio) todos los meses.
  {
    const monto = entre(40000, 55000);
    await gasto(
      cuentaTarjeta,
      cat('Suscripciones', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      'Gimnasio',
    );
    tarjetaVirtual.resta(monto);
  }

  // Tecnología, cada dos meses.
  if (mesesAtras % 2 === 0) {
    const monto = entre(80000, 350000);
    await gasto(
      cuentaTarjeta,
      cat('Tecnología', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(TECNOLOGIA),
    );
    tarjetaVirtual.resta(monto);
  }

  // Ropa, cada dos meses (compensa con la de tecnología para no juntarse siempre).
  if (mesesAtras % 2 === 1) {
    const monto = entre(80000, 240000);
    await gasto(
      cuentaTarjeta,
      cat('Ropa', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      'Ropa',
    );
    tarjetaVirtual.resta(monto);
  }

  // Viaje, un par de veces al año.
  if (mesesAtras === 9 || mesesAtras === 3) {
    const monto = entre(400000, 1200000);
    await gasto(
      cuentaTarjeta,
      cat('Viajes', 'expense'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(VIAJES_COP),
    );
    tarjetaVirtual.resta(monto);
  }

  // Pago de la tarjeta: nunca más de lo que se debe.
  {
    const deseado = entre(150000, 500000);
    const deuda = Math.max(0, -tarjetaVirtual.valor());
    const pago = Math.min(deseado, deuda);
    if (pago > 0) {
      await transferencia(
        cuentaBanco,
        cuentaTarjeta,
        pago,
        haceMeses(mesesAtras, 20),
        'Pago de tarjeta de crédito',
      );
      tarjetaVirtual.suma(pago);
    }
  }

  // --- Cuentas en USD: freelance, suscripción internacional y ahorro ----

  if (azar() < 0.5) {
    const monto = entre(300, 650);
    await ingreso(
      cuentaDolares,
      cat('Freelance', 'income'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(FREELANCE),
    );
    dolaresVirtual.suma(monto);
  }

  {
    const monto = entre(12, 25);
    if (dolaresVirtual.puedeGastar(monto)) {
      await gasto(
        cuentaDolares,
        cat('Suscripciones', 'expense'),
        monto,
        haceMeses(mesesAtras, diaAlAzar()),
        'Streaming internacional',
      );
      dolaresVirtual.resta(monto);
    }
  }

  if (mesesAtras === 6) {
    const monto = entre(200, 500);
    if (dolaresVirtual.puedeGastar(monto)) {
      await gasto(
        cuentaDolares,
        cat('Viajes', 'expense'),
        monto,
        haceMeses(mesesAtras, diaAlAzar()),
        elegir(VIAJES_USD),
      );
      dolaresVirtual.resta(monto);
    }
  }

  if (azar() < 0.6) {
    const monto = entre(80, 220);
    if (dolaresVirtual.puedeGastar(monto, 50)) {
      await transferencia(
        cuentaDolares,
        cuentaAhorroUsd,
        monto,
        haceMeses(mesesAtras, diaAlAzar()),
        'Ahorro mensual en dólares',
      );
      dolaresVirtual.resta(monto);
    }
  }

  console.log(
    `  mes -${mesesAtras}: ok (efectivo=${efectivoVirtual.valor()} tarjeta=${tarjetaVirtual.valor()} usd=${dolaresVirtual.valor()})`,
  );
}

console.log(`Listo: ${creados} movimientos nuevos para ${usuario.email}.`);

await closeDb();

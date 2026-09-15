/**
 * Llena una cuenta de prueba con un año de movimientos realistas, para hacer
 * pruebas funcionales manuales (filtros, gráficas, exportación, etc.) sin
 * tener que registrar cada movimiento a mano.
 *
 *   npm run seed:prueba -- correo@ejemplo.com
 *
 * Usa las mismas funciones de servicio que usa la API (crearCuenta,
 * registrarMovimiento, crearTransferencia, sembrarCategoriasPorDefecto), así
 * que todo lo que valida el negocio (formato de moneda, transferencias entre
 * cuentas de igual moneda, etc.) se respeta igual que si viniera de la app.
 *
 * Cuentas y categorías son idempotentes (reusa las que ya existan con esos
 * nombres), pero los MOVIMIENTOS no: correrlo dos veces duplica el año
 * completo de movimientos, porque son inmutables y no queda otra forma de
 * detectar "esto ya se sembró".
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
// Categorías: siembra el catálogo por defecto si hace falta (idempotente).

await categoriasService.sembrarCategoriasPorDefecto(db, usuarioId);
const { data: categorias } = await categoriasService.listarCategorias(usuarioId, false);
const cat = (nombre: string, tipo: 'income' | 'expense') => {
  const encontrada = categorias.find((c) => c.name === nombre && c.kind === tipo);
  if (!encontrada) throw new Error(`Falta la categoría "${nombre}" (${tipo}) en el catálogo.`);
  return encontrada.id;
};

// -----------------------------------------------------------------------------
// Cuentas: reusa las que ya existan con ese nombre, o las crea.

async function cuentaOCrear(nombre: string, tipo: 'bank' | 'cash', apertura: string) {
  const { data: existentes } = await cuentasService.listarCuentas(usuarioId, false);
  const existente = existentes.find((c) => c.name === nombre);
  if (existente) return existente.id;

  const creada = await cuentasService.crearCuenta(usuarioId, {
    name: nombre,
    type: tipo,
    currency: 'COP',
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

const cuentaBanco = await cuentaOCrear('Cuenta bancaria', 'bank', '1850000');
const cuentaEfectivo = await cuentaOCrear('Efectivo', 'cash', '120000');

console.log(`Cuentas: banco=${cuentaBanco} efectivo=${cuentaEfectivo}`);

// -----------------------------------------------------------------------------
// Un año de movimientos, mes a mes, de más viejo a más nuevo.

let creados = 0;

// El efectivo es plata de verdad: no se puede gastar lo que no se ha
// retirado. Se sigue un saldo virtual para decidir, en cada gasto "a veces en
// efectivo, a veces en banco", si de verdad hay para pagarlo en efectivo.
let saldoEfectivoVirtual = 120000;
const COLCHON_EFECTIVO = 30000;

function cuentaConEfectivoSiAlcanza(monto: number, probabilidadEfectivo: number): string {
  if (azar() < probabilidadEfectivo && saldoEfectivoVirtual - monto >= COLCHON_EFECTIVO) {
    saldoEfectivoVirtual -= monto;
    return cuentaEfectivo;
  }
  return cuentaBanco;
}

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

const MERCADOS = ['Éxito', 'Carulla', 'D1', 'Ara', 'Jumbo'];
const RESTAURANTES = ['Almuerzo corriente', 'Domicilio', 'Café', 'Cena con amigos'];
const TRANSPORTE = ['Uber', 'Gasolina', 'Parqueadero', 'Bus'];
const OCIO = ['Cine', 'Streaming', 'Salida el fin de semana', 'Bar'];

for (let mesesAtras = 11; mesesAtras >= 0; mesesAtras--) {
  const tope = topeDelMes(mesesAtras);
  const diaAlAzar = () => entre(1, tope);

  // Sueldo, fin de mes (si ya pasó el día 28 este mes).
  if (yaPaso(mesesAtras, 28)) {
    await ingreso(
      cuentaBanco,
      cat('Sueldo', 'income'),
      entre(2900000, 3400000),
      haceMeses(mesesAtras, 28),
      'Pago de nómina',
    );
  }

  // Vivienda, principio de mes.
  if (yaPaso(mesesAtras, 5)) {
    await gasto(
      cuentaBanco,
      cat('Vivienda', 'expense'),
      950000,
      haceMeses(mesesAtras, 5),
      'Arriendo',
    );
  }

  // Servicios, mitad de mes.
  if (yaPaso(mesesAtras, 12)) {
    await gasto(
      cuentaBanco,
      cat('Servicios', 'expense'),
      entre(90000, 190000),
      haceMeses(mesesAtras, 12),
      elegir(['Luz', 'Agua', 'Internet', 'Gas']),
    );
  }

  // Retiro de efectivo un par de veces al mes: entra primero al saldo virtual,
  // así los gastos en efectivo de más abajo saben cuánto hay disponible.
  for (const dia of [8, 22]) {
    if (yaPaso(mesesAtras, dia) && azar() < 0.8) {
      const monto = entre(200000, 450000);
      await movimientosService.crearTransferencia(usuarioId, {
        fromAccountId: cuentaBanco,
        toAccountId: cuentaEfectivo,
        amount: `${monto}`,
        occurredAt: haceMeses(mesesAtras, dia),
        description: 'Retiro de efectivo',
      });
      saldoEfectivoVirtual += monto;
      creados += 2;
    }
  }

  // Mercado, ~4 veces al mes.
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

  // Restaurantes, 3 a 5 veces al mes.
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

  // Transporte, 8 a 14 veces al mes.
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

  // Ocio, 2 a 3 veces al mes.
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

  // Salud, algunos meses.
  if (azar() < 0.5) {
    await gasto(
      cuentaBanco,
      cat('Salud', 'expense'),
      entre(30000, 150000),
      haceMeses(mesesAtras, diaAlAzar()),
      elegir(['Droguería', 'Consulta médica', 'Odontólogo']),
    );
  }

  // Ropa, cada dos meses aprox.
  if (mesesAtras % 2 === 0) {
    await gasto(
      cuentaBanco,
      cat('Ropa', 'expense'),
      entre(80000, 240000),
      haceMeses(mesesAtras, diaAlAzar()),
      'Ropa',
    );
  }

  // Educación, cada tres meses.
  if (mesesAtras % 3 === 0) {
    await gasto(
      cuentaBanco,
      cat('Educación', 'expense'),
      entre(100000, 300000),
      haceMeses(mesesAtras, diaAlAzar()),
      'Curso',
    );
  }

  // Ingreso extra ocasional (ventas/freelance).
  if (azar() < 0.4) {
    await ingreso(
      cuentaBanco,
      cat('Ventas', 'income'),
      entre(100000, 450000),
      haceMeses(mesesAtras, diaAlAzar()),
      'Trabajo independiente',
    );
  }

  // Regalo ocasional, en efectivo.
  if (azar() < 0.2) {
    const monto = entre(50000, 200000);
    await ingreso(
      cuentaEfectivo,
      cat('Regalos', 'income'),
      monto,
      haceMeses(mesesAtras, diaAlAzar()),
      'Regalo',
    );
    saldoEfectivoVirtual += monto;
  }

  console.log(`  mes -${mesesAtras}: ok (saldo efectivo virtual: ${saldoEfectivoVirtual})`);
}

console.log(`Listo: ${creados} movimientos nuevos para ${usuario.email}.`);

await closeDb();

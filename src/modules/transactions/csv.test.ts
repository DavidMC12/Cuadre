/**
 * El escapado de un CSV es de las cosas que parecen triviales hasta que una
 * descripción trae una coma y el archivo entero se corre una columna.
 */
import { describe, expect, it } from 'vitest';
import { armarCsv, escaparCampo } from './csv.js';

describe('escapar un campo', () => {
  it('deja en paz el texto que no necesita comillas', () => {
    expect(escaparCampo('Mercado')).toBe('Mercado');
    expect(escaparCampo('-45000.0000')).toBe('-45000.0000');
  });

  it('envuelve en comillas el texto que trae una coma', () => {
    expect(escaparCampo('Café, pan y leche')).toBe('"Café, pan y leche"');
  });

  it('duplica las comillas de adentro', () => {
    expect(escaparCampo('El "mercado" del barrio')).toBe('"El ""mercado"" del barrio"');
  });

  it('envuelve el texto que trae un salto de línea', () => {
    expect(escaparCampo('Primera\nSegunda')).toBe('"Primera\nSegunda"');
    expect(escaparCampo('Primera\r\nSegunda')).toBe('"Primera\r\nSegunda"');
  });

  it('un dato que no existe sale como celda vacía, no como la palabra null', () => {
    expect(escaparCampo(null)).toBe('');
    expect(escaparCampo(undefined)).toBe('');
  });
});

describe('armar el archivo', () => {
  it('arranca con la marca que Excel necesita para las tildes', () => {
    expect(armarCsv(['Descripción'], [])).toMatch(/^﻿/);
  });

  it('sin filas sale solo el encabezado, para que se vea que sí funcionó', () => {
    const csv = armarCsv(['Fecha', 'Monto'], []);
    expect(csv).toBe('﻿Fecha,Monto\r\n');
  });

  it('separa las filas con el fin de línea que espera Windows', () => {
    const csv = armarCsv(['a', 'b'], [['1', '2']]);
    expect(csv).toBe('﻿a,b\r\n1,2\r\n');
  });

  it('una coma dentro de un campo no corre las columnas', () => {
    const csv = armarCsv(['Descripción', 'Monto'], [['Café, pan y leche', '-12000']]);
    expect(csv).toContain('"Café, pan y leche",-12000');
  });
});

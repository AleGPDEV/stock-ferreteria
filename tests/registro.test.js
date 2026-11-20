// Pruebas del registro de errores (electron/registro.js), sin abrir el programa.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearRegistro, lineaRegistro, ultimasLineas, informeSoporte, LARGO_LINEA } = require('../electron/registro');

const FECHA = new Date(2026, 10, 19, 22, 58, 1);
const carpetaNueva = () => fs.mkdtempSync(path.join(os.tmpdir(), 'registro-'));

test('la línea lleva fecha, nivel, área, mensaje y detalle', () => {
  assert.strictEqual(lineaRegistro(FECHA, 'ERROR', 'guardado', 'No se pudo guardar', 'disco lleno'),
    '2026-11-19 22:58:01 ERROR guardado: No se pudo guardar | disco lleno');
  assert.strictEqual(lineaRegistro(FECHA, 'INFO', 'inicio', 'Abre'), '2026-11-19 22:58:01 INFO inicio: Abre');
});

test('un nivel desconocido queda como INFO', () => {
  assert.match(lineaRegistro(FECHA, 'RARO', 'x', 'y'), / INFO x: y$/);
});

test('un error con varias líneas (stack) queda en una sola línea', () => {
  const e = new Error('se rompió');
  const l = lineaRegistro(FECHA, 'ERROR', 'programa', 'Error no atrapado', e);
  assert.ok(!/[\r\n]/.test(l));
  assert.match(l, /Error: se rompió ⏎ at /);
});

test('la línea nunca pasa del largo máximo', () => {
  const l = lineaRegistro(FECHA, 'ERROR', 'x', 'a'.repeat(5000), 'b'.repeat(5000));
  assert.strictEqual(l.length, LARGO_LINEA);
  assert.ok(l.endsWith('…'));
});

test('los objetos se anotan como JSON', () => {
  assert.match(lineaRegistro(FECHA, 'ERROR', 'x', 'falló', { codigo: 5 }), /\| \{"codigo":5\}$/);
});

test('anota en registro.log dentro de la carpeta (y la crea si no existe)', () => {
  const carpeta = path.join(carpetaNueva(), 'sub');
  const r = crearRegistro(carpeta, { ahora: () => FECHA });
  assert.ok(r.error('guardado', 'No se pudo guardar', 'detalle'));
  r.info('inicio', 'Abre');
  assert.strictEqual(fs.readFileSync(path.join(carpeta, 'registro.log'), 'utf8'),
    '2026-11-19 22:58:01 ERROR guardado: No se pudo guardar | detalle\n2026-11-19 22:58:01 INFO inicio: Abre\n');
});

test('al pasar el tope rota a registro.1.log y guarda uno solo viejo', () => {
  const carpeta = carpetaNueva();
  const r = crearRegistro(carpeta, { ahora: () => FECHA, tope: 200 });
  for (let i = 1; i <= 20; i++) r.info('prueba', `línea ${i}`);
  const actual = fs.readFileSync(path.join(carpeta, 'registro.log'), 'utf8');
  const viejo = fs.readFileSync(path.join(carpeta, 'registro.1.log'), 'utf8');
  assert.ok(Buffer.byteLength(actual) <= 200);
  assert.ok(Buffer.byteLength(viejo) <= 200);
  assert.deepStrictEqual(fs.readdirSync(carpeta).sort(), ['registro.1.log', 'registro.log']);
  assert.match(actual, /línea 20\n$/);
  // Lo más viejo se perdió, pero las últimas líneas cruzan los dos archivos en orden
  const ult = r.ultimas(200);
  assert.ok(ult.length < 20);
  assert.deepStrictEqual(ult.map((l) => Number(l.match(/línea (\d+)/)[1])), Array.from({ length: ult.length }, (_, i) => 21 - ult.length + i));
  assert.ok(ult.length > actual.trim().split('\n').length, 'debe incluir líneas del archivo viejo');
});

test('ultimasLineas junta los dos archivos y devuelve solo las últimas', () => {
  assert.deepStrictEqual(ultimasLineas('a\nb\n', 'c\r\nd\n', 3), ['b', 'c', 'd']);
  assert.deepStrictEqual(ultimasLineas('', '', 200), []);
  assert.deepStrictEqual(ultimasLineas(null, 'x\n\n', 200), ['x']);
});

test('si no puede escribir no tira error: devuelve false', () => {
  const malo = { mkdirSync() { throw new Error('sin permiso'); } };
  const r = crearRegistro('/no/existe', { fs: malo });
  assert.strictEqual(r.error('x', 'y'), false);
  assert.deepStrictEqual(r.ultimas(), []);
});

test('el informe para soporte lleva encabezado y las líneas', () => {
  const t = informeSoporte({ version: '1.44.0', sistema: 'Windows_NT 10.0.19045 (x64)', fecha: FECHA, lineas: ['l1', 'l2'] });
  assert.strictEqual(t, 'Stock Ferretería — informe para soporte\nVersión: 1.44.0\nSistema: Windows_NT 10.0.19045 (x64)\nFecha: 2026-11-19 22:58:01\n\nl1\nl2');
  assert.match(informeSoporte({ version: '1', sistema: 'x', fecha: FECHA, lineas: [] }), /registro está vacío/);
});

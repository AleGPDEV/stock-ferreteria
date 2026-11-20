// Pruebas de qué respaldos se guardan y de la comprobación (electron/respaldos.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { respaldosAConservar, diasDelMasViejo, comprobarRespaldo } = require('../electron/respaldos');

/** 'AAAA-MM-DD' de n días antes de una fecha. */
function antes(fecha, n) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}
const nombre = (f) => `respaldo_${f}.json.gz`;
const seguidos = (hoy, dias) => Array.from({ length: dias }, (_, i) => nombre(antes(hoy, i)));
const fechas = (lista) => lista.map((n) => n.slice(9, 19)).sort();

test('400 días seguidos: quedan 7 diarios, uno por semana y uno por mes', () => {
  const hoy = '2026-11-20';
  const quedan = respaldosAConservar(seguidos(hoy, 400), hoy);
  assert.deepStrictEqual(fechas(quedan), [
    // uno por mes (el más nuevo de cada mes): diciembre 2025 … octubre 2026
    '2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31',
    // uno por semana: el más nuevo de las semanas 2, 3 y 4 hacia atrás (la 1 ya está en los diarios)
    '2026-10-30', '2026-11-06', '2026-11-13',
    // los 7 más nuevos (también son la semana 1 y el mes de noviembre)
    '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
  ].sort());
  assert.strictEqual(quedan.length, 21);
  assert.strictEqual(diasDelMasViejo(quedan, hoy), 324); // 2025-12-31
});

test('cruza el 1 de enero: los meses del año anterior se cuentan bien', () => {
  const hoy = '2027-01-03';
  const quedan = fechas(respaldosAConservar(seguidos(hoy, 400), hoy));
  assert.ok(quedan.includes('2027-01-03') && quedan.includes('2026-12-28'));
  assert.ok(quedan.includes('2026-12-31'), 'diciembre: su último día');
  assert.ok(quedan.includes('2026-02-28'), 'el mes 12 hacia atrás es febrero de 2026');
  assert.ok(!quedan.includes('2026-01-31'), 'enero de 2026 ya es el mes 13');
  // Un mes por cada uno de los 12 (enero 2027 … febrero 2026)
  assert.strictEqual(new Set(quedan.map((f) => f.slice(0, 7))).size, 12);
});

test('con la PC apagada días seguidos igual quedan los 7 más nuevos', () => {
  const hoy = '2026-11-20';
  // solo un respaldo cada 3 días
  const lista = Array.from({ length: 40 }, (_, i) => nombre(antes(hoy, i * 3)));
  const quedan = fechas(respaldosAConservar(lista, hoy));
  for (let i = 0; i < 7; i++) assert.ok(quedan.includes(antes(hoy, i * 3)), `falta ${antes(hoy, i * 3)}`);
});

test('con pocos respaldos no se borra ninguno', () => {
  const hoy = '2026-11-20';
  const lista = seguidos(hoy, 5);
  assert.deepStrictEqual(respaldosAConservar(lista, hoy), lista);
  assert.deepStrictEqual(respaldosAConservar([], hoy), []);
});

test('los nombres raros y las fechas futuras no se tocan', () => {
  const hoy = '2026-11-20';
  const raros = ['notas.txt', 'respaldo_2026-02-30.json.gz', 'respaldo_hoy.json.gz', nombre('2026-12-25')];
  const quedan = respaldosAConservar(seguidos(hoy, 100).concat(raros), hoy);
  for (const r of raros) assert.ok(quedan.includes(r), r);
});

test('los respaldos viejos sin comprimir (.json) cuentan igual', () => {
  const hoy = '2026-11-20';
  const lista = seguidos(hoy, 7).concat(['respaldo_2026-11-05.json', 'respaldo_2026-11-04.json']);
  const quedan = respaldosAConservar(lista, hoy);
  assert.ok(quedan.includes('respaldo_2026-11-05.json'), 'es el más nuevo de la semana 3');
  assert.ok(!quedan.includes('respaldo_2026-11-04.json'));
});

test('respeta el orden y acepta hoy como Date', () => {
  const lista = seguidos('2026-11-20', 30).reverse();
  const a = respaldosAConservar(lista, '2026-11-20');
  const b = respaldosAConservar(lista, new Date(2026, 10, 20, 23, 50));
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a, lista.filter((n) => a.includes(n)));
});

test('comprobarRespaldo: uno bueno da null, uno roto da el problema', () => {
  const bueno = zlib.gzipSync(JSON.stringify({ productos: [], movimientos: [], ventas: [] }));
  assert.strictEqual(comprobarRespaldo(bueno), null);
  assert.match(comprobarRespaldo(bueno.subarray(0, bueno.length - 6)), /descomprimir/);
  assert.match(comprobarRespaldo(Buffer.from('hola')), /descomprimir/);
  assert.match(comprobarRespaldo(zlib.gzipSync('{"productos": [')), /no se puede leer/);
  assert.match(comprobarRespaldo(zlib.gzipSync('{"otra":1}')), /datos del programa/);
});

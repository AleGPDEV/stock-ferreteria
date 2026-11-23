// Pruebas de Depósito y etiquetas: la línea que dice cómo se imprimen las etiquetas.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

test('etiquetas: la línea de cómo se imprimen, para cada papel', () => {
  const r = app.resumenAjustesEtiquetas;
  assert.equal(r({ formato: 'a4' }), 'Hoja A4 de stickers · 24 por hoja, de 70 × 37 mm');
  assert.equal(r({ formato: 'hoja', porHoja: 0 }), 'Hoja A4 común · tamaño automático');
  assert.equal(r({ formato: 'hoja', porHoja: '8' }), 'Hoja A4 común · 8 por hoja');
  const rollo = app.medidaRollo(50, 40);
  assert.equal(r({ formato: 'rollo', rollo, directo: true, impresora: 'Xprinter XP-P323B' }), 'Etiquetadora Xprinter XP-P323B · 50 × 40 mm');
  assert.equal(r({ formato: 'rollo', rollo, directo: true, impresora: '' }), 'Etiquetadora (elegí la impresora) · 50 × 40 mm');
  assert.equal(r({ formato: 'rollo', rollo, directo: false, impresora: 'Xprinter' }), 'Impresora de etiquetas · 50 × 40 mm');
  assert.equal(r({ formato: 'rollo', rollo: app.medidaRollo(5, 5), directo: false }), 'Impresora de etiquetas · revisá la medida');
});

test('etiquetadora: con «Ancho que imprime la impresora» el dibujo se corre sin dar la vuelta', () => {
  const E = require('../js/etiqueta-tspl.js');
  const d = E.disenoEtiqueta({ nombre: 'Amoladora 2000w WURTH', codigo: '4061975716071', ubicacion: 'A-1' }, { ancho: 50, alto: 40 });
  // Rollo de 50 mm en una impresora de 72 mm: la hoja que se le dice a la impresora mide 72 mm
  const t = E.tspl(d, { cabezal: 72, correrX: 11 });
  assert.match(t, /^SIZE 72 mm,40 mm\r\n/);
  const barras = [...t.matchAll(/BAR (\d+),\d+,(\d+)/g)].map((m) => [+m[1], +m[2]]);
  // Todo el dibujo corrido 11 mm (88 puntos), entero y adentro de los 72 mm
  barras.forEach(([x, w], i) => { assert.equal(x, d.barras[i].x + 88); assert.equal(w, d.barras[i].w); assert.ok(x + w <= 72 * 8); });
  assert.match(t, new RegExp(`TEXT ${d.textos[0].x + 88},`));
  // Sin el ancho, la hoja es la etiqueta (como siempre)
  assert.match(E.tspl(d, {}), /^SIZE 50 mm,40 mm\r\n/);
  // La regla ocupa los 72 mm
  assert.match(E.tsplRegla({ cabezal: 72, alto: 40 }), /^SIZE 72 mm,40 mm\r\n[\s\S]*TEXT 563,96,"2",0,1,1,"70"/);
});

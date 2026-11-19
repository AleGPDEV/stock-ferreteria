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

// Pruebas de Depósito y etiquetas: la línea que dice cómo se imprimen las etiquetas.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

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

test('etiquetas: los EAN válidos van como EAN-13 / EAN-8; lo demás, Code 128', () => {
  const CB = require('../js/codigo-barras.js');
  assert.equal(CB.tipo('4061975716071'), 'ean13');  // la amoladora WURTH
  assert.equal(CB.tipo('012345678905'), 'ean13');   // UPC-A: EAN-13 con un 0 adelante
  assert.equal(CB.tipo('96385074'), 'ean8');
  assert.equal(CB.tipo('4061975716072'), 'code128'); // el dígito de control no cierra
  assert.equal(CB.tipo('PIN-ROD22'), 'code128');
  assert.equal(CB.tipo('12345'), 'code128');
  assert.equal(CB.tipo('Caño'), null);
  // Estructura: 95 módulos, guardas 101 a los costados y 01010 en el medio; 59 barras y espacios
  const a = CB.anchos('4061975716071');
  assert.equal(a.reduce((s, x) => s + x, 0), 95);
  assert.equal(a.length, 59);
  assert.deepEqual(a.slice(0, 3), [1, 1, 1]);
  assert.deepEqual(a.slice(-3), [1, 1, 1]);
  assert.deepEqual(a.slice(27, 32), [1, 1, 1, 1, 1]);
  assert.ok(a.every((x) => x >= 1 && x <= 4));
  // UPC-A y su EAN-13 con 0 adelante son el mismo dibujo
  assert.deepEqual(CB.anchos('012345678905'), CB.anchos('0012345678905'));
  assert.equal(CB.anchos('96385074').reduce((s, x) => s + x, 0), 67);
  assert.equal(CB.anchos128('4061975716071').reduce((s, x) => s + x, 0), 123);
});

test('etiquetas: el código de barras nunca se recorta al correr el dibujo (pasaba con −10 mm)', () => {
  const E = require('../js/etiqueta-tspl.js');
  const d = E.disenoEtiqueta({ nombre: 'Amoladora 2000w WURTH', codigo: '4061975716071', ubicacion: 'A-1' }, { ancho: 50, alto: 40 });
  const barras = (t) => [...t.matchAll(/BAR (\d+),(\d+),(\d+),(\d+)/g)].map((m) => ({ x: +m[1], w: +m[3] }));
  const original = d.barras.map((b) => b.w);
  for (const correrX of [0, -10, -20, 10, 20]) {
    const b = barras(E.tspl(d, { correrX }));
    assert.deepEqual(b.map((x) => x.w), original, `todas las barras enteras con ${correrX} mm`);
    assert.ok(b[0].x >= 0 && b[b.length - 1].x + b[b.length - 1].w <= 400, `adentro con ${correrX} mm`);
    // entre barras, los mismos espacios que en el dibujo
    b.forEach((x, i) => { if (i) assert.equal(x.x - b[i - 1].x, d.barras[i].x - d.barras[i - 1].x); });
  }
  // Sin corrimiento, igual que antes: no se mueve
  assert.equal(barras(E.tspl(d, {}))[0].x, d.barras[0].x);
  // En 50 mm la amoladora sale en EAN-13 con barras de 3 puntos (2 en Code 128), un punto más finas por la tinta
  assert.equal(E.elegirCodigo('4061975716071', 368).tipo, 'ean13');
  assert.equal(d.barras[0].w, 2); // barra de guarda: 1 módulo × 3 puntos − 1
  // En 40 mm el EAN no gana: sigue en Code 128
  assert.equal(E.elegirCodigo('4061975716071', 288).tipo, 'code128');
});

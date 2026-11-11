// Pruebas del Lector de facturas (lectura de PDF) y de la importación con «Llegó».
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const L = require('../herramientas/fuentes/lector-pdf.js');
const app = require('../js/app.js');

/** Arma un PDF chico como los de las e-facturas (Helvetica, texto con posiciones, contenido comprimido). */
function pdfDePrueba(paginas) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const fuente = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  const contenidos = paginas.map((textos) => {
    const c = textos.map(([x, y, t]) => `BT ${x} ${y} Td [(${t.replace(/[()\\]/g, (m) => '\\' + m)})] TJ ET`).join('\n');
    return zlib.deflateSync(Buffer.from(c, 'latin1'));
  });
  const partes = [];
  let pdf = '%PDF-1.7\n';
  const bin = [];
  contenidos.forEach((z) => {
    const id = add(null);
    bin[id] = z;
    const pg = add(`<< /Type /Page /Parent 999 0 R /Resources << /Font << /F1 ${fuente} 0 R >> >> /Contents ${id} 0 R >>`);
    kids.push(pg);
  });
  objs.forEach((o, i) => {
    const n = i + 1;
    if (bin[n]) partes.push(Buffer.from(`${n} 0 obj\n<< /Filter /FlateDecode /Length ${bin[n].length} >>\nstream\n`, 'latin1'), bin[n], Buffer.from('\nendstream\nendobj\n'));
    else partes.push(Buffer.from(`${n} 0 obj\n${o}\nendobj\n`, 'latin1'));
  });
  return new Uint8Array(Buffer.concat([Buffer.from(pdf, 'latin1'), ...partes, Buffer.from(`999 0 obj\n<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>\nendobj\n%%EOF`)]));
}

const CABECERA = [[30, 800, 'FERRETERIA MAYORISTA S.A.'], [30, 788, 'ventas@mayorista.com.uy'], [240, 800, 'RUC EMISOR'], [240, 785, '210000000019'],
  [240, 770, 'SERIE'], [290, 770, 'NÚMERO'], [240, 758, 'A'], [290, 758, '1234'], [240, 740, 'FECHA DOCUMENTO'], [240, 728, '05/11/2026'],
  [37, 600, 'Cantidad'], [90, 600, 'Uni'], [122, 600, 'Descripción'], [325, 600, 'P. Unitario $'], [415, 600, 'Dto.'], [468, 600, 'Importe $'], [554, 600, '*']];

test('el lector de facturas lee productos de varias páginas, con descripciones en dos renglones', async () => {
  const pdf = pdfDePrueba([
    CABECERA.concat([
      [37, 580, '10'], [90, 580, 'UN'], [122, 580, 'TORNILLO AUTOPERFORANTE 8X1"'], [122, 569, 'CAJA X100 LH-1234'], [330, 580, '100'], [418, 580, '-100'], [472, 580, '900'], [554, 580, '3'],
      [37, 550, '2'], [90, 550, 'UN'], [122, 550, 'PINZA UNIVERSAL 8" MAKAWA'], [330, 550, '1.250,50'], [472, 550, '2.501'], [554, 550, '3'],
      [400, 60, 'Página 1 de 2'],
    ]),
    CABECERA.concat([
      [122, 590, 'MK-0099'],
      [37, 570, '3'], [90, 570, 'UN'], [122, 570, 'CANDADO 40MM'], [330, 570, '200'], [418, 570, '-60'], [472, 570, '540'], [554, 570, '3'],
      [37, 550, '1'], [90, 550, 'N/A'], [122, 550, 'REDONDEO'], [330, 550, '0,2'], [472, 550, '0,2'], [554, 550, '6'],
      [300, 500, 'Subtotal gravado (22%): 3.247,54'], [300, 480, 'TOTAL A PAGAR: 3.962'],
    ]),
  ]);
  const r = await L.leerPdf(pdf);
  assert.equal(r.numero, '1234');
  assert.equal(r.serie, 'A');
  assert.equal(r.fecha, '2026-11-05');
  assert.equal(r.rucEmisor, '210000000019');
  assert.equal(r.dominio, 'mayorista');
  assert.equal(r.items.length, 3, 'el redondeo no es un producto');
  assert.deepEqual(r.items.map((i) => [i.cantidad, i.descripcion, i.importe]), [
    [10, 'TORNILLO AUTOPERFORANTE 8X1" CAJA X100 LH-1234', 900],
    [2, 'PINZA UNIVERSAL 8" MAKAWA MK-0099', 2501],
    [3, 'CANDADO 40MM', 540],
  ]);
  assert.equal(r.items[1].unitario, 1250.5);
  assert.equal(r.ivaIncluido, true, 'las líneas suman el total a pagar: ya traen IVA');
});

test('un PDF sin texto o que no es PDF da un error claro', async () => {
  await assert.rejects(L.leerPdf(new Uint8Array(Buffer.from('hola'))), /no es un PDF/);
  await assert.rejects(L.leerPdf(new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n'))), /no tiene texto/);
});

test('importar con «Llegó» suma la mercadería al stock y no toca el precio de venta si viene de una factura', () => {
  const d = app.baseVacia();
  const filas = [
    { 'Código': 'LH-1234', 'Producto': 'Tornillo 8x1', 'Proveedor': 'Mayorista', 'Costo': 90, 'Precio': 90, 'Llegó': '', 'Factura': 'A 1234' },
  ];
  let plan = app.planImportacion(d, filas);
  assert.equal(plan.deFactura, true);
  assert.equal(plan.conEntrada, true);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  const p = d.productos[0];
  assert.equal(p.stock, 0);
  p.precio = 150;
  plan = app.planImportacion(d, [{ ...filas[0], 'Costo': 95, 'Llegó': 10, 'Factura': 'A 1300' }]);
  const r = app.aplicarImportacion(d, plan, { ...app.CAMPOS_IMPORTAR, precio: false });
  assert.equal(r.llegadas, 1);
  assert.equal(p.stock, 10);
  assert.equal(p.costo, 95);
  assert.equal(p.precio, 150);
  assert.equal(d.movimientos.at(-1).nota, 'Factura A 1300');
  assert.equal(d.movimientos.at(-1).tipo, 'entrada');
  // sin marcar «Sumar al stock», no se suma
  app.aplicarImportacion(d, app.planImportacion(d, [{ ...filas[0], 'Llegó': 5 }]), { ...app.CAMPOS_IMPORTAR, entrada: false });
  assert.equal(p.stock, 10);
});

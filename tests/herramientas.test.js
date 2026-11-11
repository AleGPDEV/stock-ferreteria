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

// ---------- Revisión QA #2 ----------
const LP = require('../herramientas/fuentes/lector-productos.js');
/** Renglón de la tabla de la factura: [cantidad, descripción, importe] en la fila y. */
const renglon = (y, cant, desc, imp) => [[37, y, String(cant)], [90, y, 'UN'], [122, y, desc], [330, y, String(imp / cant)], [472, y, String(imp)], [554, y, '3']];
const factura = (cab, renglones) => pdfDePrueba([cab.concat(...renglones.map((r, i) => renglon(580 - i * 12, ...r)))]);

test('QA2 A1: «X100», «G120» y «X100M» no son códigos: productos distintos no se juntan', async () => {
  const r = await L.leerPdf(factura(CABECERA, [
    [10, 'TARUGO NYLON 8MM BOLSA X100', 500], [5, 'PRECINTO PLASTICO 200MM NEGRO X100', 400], [2, 'TORNILLO T1 MECHA 8X1/2 CAJA X100', 600],
    [20, 'LIJA AL AGUA G120', 400], [10, 'LIJA AL AGUA G80', 220],
    [1, 'CABLE UNIPOLAR 2,5MM ROJO X100M', 1500], [1, 'CABLE UNIPOLAR 2,5MM NEGRO X100M', 1600],
  ]));
  assert.equal(r.items.length, 7);
  const { productos } = LP.armarProductos([{ r }]);
  assert.equal(productos.length, 7, 'siete renglones distintos son siete productos');
  for (const p of productos) assert.equal(p.codigo, '', `${p.nombre} no tiene código del proveedor`);
  const tarugo = productos.find((p) => /Tarugo/.test(p.nombre));
  assert.equal(tarugo.cantidad, 10);
  assert.equal(tarugo.costo, 50, 'cada uno con su costo, no el del último');
  assert.ok(productos.some((p) => p.nombre === 'Cable unipolar 2,5mm rojo x100m'), 'el nombre conserva la presentación');
  for (const w of ['X100', 'X50', 'X100M', 'G120', '8MM', '200MM', '8X1/2']) assert.equal(LP.esMedida(w), true, w);
  for (const w of ['LH-5563', 'MK-0099', 'EBM301']) assert.equal(LP.esMedida(w), false, w);
});

test('QA2 A1: la clave es el código del proveedor (columna, número al principio o LH-); el mismo código sí se suma', () => {
  assert.equal(LP.separarCodigo('TARUGO 8MM X100', 'tar-08').codigo, 'TAR-08', 'la columna Código manda');
  assert.deepEqual(LP.separarCodigo('1234 TORNILLO MADERA 6X1 CAJA X100'), { codigo: '1234', nombre: 'TORNILLO MADERA 6X1 CAJA X100' });
  assert.equal(LP.separarCodigo('250 GR MASILLA').codigo, '', '«250 GR» es una medida, no un código');
  const r1 = { fecha: '2026-11-01', serie: 'A', numero: '1', items: [{ cantidad: 2, descripcion: 'TORNILLO 8X1" CAJA X100 LH-1234', importe: 200 }, { cantidad: 1, descripcion: 'TARUGO 8MM X100', importe: 50 }] };
  const r2 = { fecha: '2026-11-05', serie: 'A', numero: '2', items: [{ cantidad: 3, descripcion: 'TORNILLO 8X1 CAJA X100 LH1234', importe: 330 }, { cantidad: 1, descripcion: 'PRECINTO 200MM X100', importe: 80 }] };
  const { productos } = LP.armarProductos([{ r: r2 }, { r: r1 }]);
  const lh = productos.find((p) => p.codigo === 'LH-1234');
  assert.equal(lh.cantidad, 5, 'mismo código del proveedor en dos facturas: se suma');
  assert.equal(lh.costo, 110, 'con el costo de la factura más nueva');
  assert.deepEqual(lh.facturas, ['A 1', 'A 2']);
  assert.equal(productos.length, 3);
});

test('QA2 A1: con la factura de prueba, los productos de Uruimporta (LH-) siguen coincidiendo y no se duplican', async () => {
  const pdf = pdfDePrueba([CABECERA.concat([
    [37, 580, '10'], [90, 580, 'UN'], [122, 580, 'TORNILLO AUTOPERFORANTE 8X1"'], [122, 569, 'CAJA X100 LH-1234'], [330, 580, '100'], [418, 580, '-100'], [472, 580, '900'], [554, 580, '3'],
    [37, 550, '4'], [90, 550, 'UN'], [122, 550, 'TARUGO NYLON 8MM BOLSA X100'], [330, 550, '50'], [472, 550, '200'], [554, 550, '3'],
  ])]);
  const r = await L.leerPdf(pdf);
  const { productos } = LP.armarProductos([{ r }]);
  const filas = productos.map((p) => ({ 'Código': p.codigo, 'Producto': p.nombre, 'Proveedor': 'Uruimporta', 'Costo': p.costo, 'Precio': p.costo, 'Llegó': p.cantidad, 'Factura': p.facturas.join(', ') }));
  const d = app.baseVacia();
  d.productos.push({ id: 'u1', codigo: 'LH-1234', barras: [], nombre: 'Tornillo autoperforante 8x1 caja x100', categoria: 'Tornillería', unidad: 'caja', proveedorId: '', ubicacion: '', costo: 80, precio: 150, minimo: 0, stock: 3 });
  const plan = app.planImportacion(d, filas);
  assert.deepEqual(plan.actualizados.map((a) => a.codigo), ['LH-1234']);
  assert.equal(plan.nuevos.length, 1);
  assert.notEqual(plan.nuevos[0].codigo, 'X100');
  app.aplicarImportacion(d, plan, { ...app.CAMPOS_IMPORTAR, precio: false });
  assert.equal(d.productos.filter((p) => p.codigo === 'LH-1234').length, 1, 'no se crea un duplicado');
  assert.equal(d.productos[0].stock, 13);
});

test('QA2 M2: una nota de crédito se rechaza y una factura en dólares pide el tipo de cambio', async () => {
  const nc = await L.leerPdf(factura(CABECERA.concat([[400, 800, 'TIPO DE DOCUMENTO'], [400, 788, 'e-Factura Nota de Crédito']]), [[2, 'CANDADO 40MM', 400]]));
  assert.equal(nc.notaCredito, true);
  assert.equal(LP.problemaFactura(nc), 'Es una nota de crédito (devolución), no se carga como mercadería que llegó.');
  const normalR = await L.leerPdf(factura(CABECERA, [[2, 'CANDADO 40MM', 400]]));
  assert.equal(normalR.notaCredito, false);
  assert.equal(LP.problemaFactura(normalR), '');

  const usd = await L.leerPdf(factura(CABECERA.concat([[400, 770, 'MONEDA'], [400, 758, 'USD']]), [[2, 'CANDADO 40MM', 20]]));
  assert.equal(usd.dolares, true);
  assert.equal(normalR.dolares, false);
  const sin = LP.armarProductos([{ r: usd }]);
  assert.match(sin.error, /tipo de cambio/);
  assert.equal(sin.productos.length, 0, 'sin tipo de cambio no deja seguir');
  const con = LP.armarProductos([{ r: usd }], { tipoCambio: 40 });
  assert.equal(con.error, '');
  assert.equal(con.productos[0].costo, 400, 'USD 10 por unidad × 40 = $ 400');
});

test('QA2 M3: acepta Nº, N°, Nro, Número y RUT; facturas distintas no chocan; sin número no se usa para repetidas', async () => {
  const cab = (rotuloRut, rotuloNum, num) => [[30, 800, 'FERRETERIA OTRO S.A.'], [240, 800, rotuloRut], [240, 785, '21.000000.0019'], [240, 770, rotuloNum], [240, 758, num],
    [37, 600, 'Cantidad'], [90, 600, 'Uni'], [122, 600, 'Descripción'], [325, 600, 'P. Unitario $'], [468, 600, 'Importe $'], [554, 600, '*']];
  const a = await L.leerPdf(factura(cab('R.U.T.', 'Nº', 'A-5521'), [[1, 'CANDADO 40MM', 100]]));
  const b = await L.leerPdf(factura(cab('RUT', 'Nro.', 'A 5600'), [[1, 'CANDADO 40MM', 100]]));
  assert.deepEqual([a.rucEmisor, a.serie, a.numero], ['210000000019', 'A', '5521']);
  assert.deepEqual([b.rucEmisor, b.serie, b.numero], ['210000000019', 'A', '5600']);
  assert.equal(LP.mismaFactura(a, b), false, 'A-5521 y A-5600 son facturas distintas');
  assert.equal(LP.mismaFactura(a, a), true);
  for (const rot of ['N°', 'Número', 'Numero']) assert.equal((await L.leerPdf(factura(cab('RUC', rot, '777'), [[1, 'X', 1]]))).numero, '777', rot);
  // En la misma celda: «N° 5600»
  const c = await L.leerPdf(factura([[240, 770, 'Serie A  N° 5600']].concat(cab('RUT', '', '').filter((x) => x[2] && x[1] !== 770 && x[1] !== 758)), [[1, 'X', 1]]));
  assert.equal(c.numero, '5600');
  // Sin número: no se compara (no choca con otra sin número) y queda para escribirlo a mano
  const s1 = await L.leerPdf(factura(cab('RUT', 'Detalle', 'sin dato'), [[1, 'CANDADO 40MM', 100]]));
  const s2 = await L.leerPdf(factura(cab('RUT', 'Detalle', 'sin dato'), [[1, 'PINZA', 100]]));
  assert.equal(s1.numero, '');
  assert.equal(LP.mismaFactura(s1, s2), false);
  assert.equal(LP.numeroFactura(s1), '');
});

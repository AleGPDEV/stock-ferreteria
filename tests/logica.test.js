// Pruebas de la lógica de stock, caja, precios e importación.  Correr con: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

function base() {
  const d = app.baseVacia();
  d.productos.push(
    { id: 'a', codigo: 'MAR-16', nombre: 'Martillo 16 oz', categoria: 'Herramientas', unidad: 'unidad', proveedorId: 'v1', ubicacion: 'C-02', costo: 390, precio: 620, minimo: 4, stock: 10 },
    { id: 'b', codigo: 'CAB-25', nombre: 'Cable 2,5 mm²', categoria: 'Electricidad', unidad: 'm', proveedorId: '', ubicacion: '', costo: 28, precio: 48, minimo: 100, stock: 300 },
  );
  d.proveedores.push({ id: 'v1', nombre: 'Herramientas Sur', contacto: '', telefono: '', email: '', rut: '', notas: '' });
  return d;
}

test('una entrada suma stock y actualiza el costo', () => {
  const d = base();
  assert.equal(app.registrar(d, { tipo: 'entrada', productoId: 'a', cantidad: 5, costoUnit: 410 }), null);
  assert.equal(d.productos[0].stock, 15);
  assert.equal(d.productos[0].costo, 410);
  assert.equal(d.movimientos.at(-1).cantidad, 5);
});

test('una salida no puede dejar el stock en negativo', () => {
  const d = base();
  assert.match(app.registrar(d, { tipo: 'salida', productoId: 'a', cantidad: 11 }), /No alcanza el stock/);
  assert.equal(d.productos[0].stock, 10);
  assert.equal(d.movimientos.length, 0);
});

test('el ajuste deja el stock en lo contado', () => {
  const d = base();
  app.registrar(d, { tipo: 'ajuste', productoId: 'a', cantidad: 7 });
  assert.equal(d.productos[0].stock, 7);
  assert.equal(d.movimientos.at(-1).cantidad, -3);
});

test('cobrar descuenta el stock de cada producto y calcula el vuelto', () => {
  const d = base();
  const r = app.cobrar(d, [{ productoId: 'a', cantidad: 2, precio: 620 }, { productoId: 'b', cantidad: 12.5, precio: 48 }], 'Efectivo', 2000, 'Juan');
  assert.equal(r.venta.total, 1840);
  assert.equal(r.venta.vuelto, 160);
  assert.equal(d.productos[0].stock, 8);
  assert.equal(d.productos[1].stock, 287.5);
  assert.equal(d.movimientos.length, 2);
  assert.equal(r.venta.numero, 1);
});

test('cobrar con descuento', () => {
  const d = base();
  const r = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Débito', '', '', undefined, 10);
  assert.equal(r.venta.subtotal, 620);
  assert.equal(r.venta.descuento, 62);
  assert.equal(r.venta.total, 558);
  assert.match(app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Débito', '', '', undefined, 120).error, /descuento/);
});

test('si falta stock de un producto no se cobra nada', () => {
  const d = base();
  const r = app.cobrar(d, [{ productoId: 'b', cantidad: 10, precio: 48 }, { productoId: 'a', cantidad: 99, precio: 620 }], 'Débito', '');
  assert.match(r.error, /No alcanza el stock/);
  assert.equal(d.productos[1].stock, 300);
  assert.equal(d.ventas.length, 0);
  assert.equal(d.numVenta, 0);
});

test('el efectivo recibido tiene que alcanzar', () => {
  const d = base();
  assert.match(app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Efectivo', 500).error, /no alcanza/);
  assert.equal(d.productos[0].stock, 10);
});

test('anular una venta devuelve el stock y no cambia el costo', () => {
  const d = base();
  const { venta } = app.cobrar(d, [{ productoId: 'a', cantidad: 3, precio: 620 }], 'Crédito', '');
  assert.equal(app.anularVenta(d, venta.id), null);
  assert.equal(d.productos[0].stock, 10);
  assert.equal(d.productos[0].costo, 390);
  assert.equal(d.ventas[0].anulada, true);
  assert.match(app.anularVenta(d, venta.id), /ya está anulada/);
});

test('parseNum entiende números con coma, punto y símbolo de pesos', () => {
  assert.equal(app.parseNum('1.234,50'), 1234.5);
  assert.equal(app.parseNum('$ 290'), 290);
  assert.equal(app.parseNum('12,5'), 12.5);
  assert.equal(app.parseNum('1.500'), 1500);
  assert.equal(app.parseNum('1,234.50'), 1234.5);
  assert.equal(app.parseNum(48), 48);
  assert.equal(app.parseNum(''), null);
  assert.equal(app.parseNum('s/d'), null);
});

test('importar: agrega nuevos, actualiza existentes por código y saltea filas vacías', () => {
  const d = base();
  const filas = [
    { 'Código': 'mar-16', 'Producto': 'Martillo carpintero 16 oz', 'Categoría': '', 'Unidad': '', 'Proveedor': '', 'Stock': 14, 'Stock mínimo': '', 'Costo': '', 'Precio de venta': '$ 650' },
    { 'Código': 7790001000101, 'Producto': 'Tornillo 8 x 1"', 'Categoría': 'Tornillería', 'Unidad': 'Cajas', 'Proveedor': 'Distribuidora Norte', 'Stock': '30', 'Stock mínimo': 10, 'Costo': '180,00', 'Precio de venta': 290 },
    { 'Código': '', 'Producto': 'Clavo 2"', 'Categoría': 'Tornillería', 'Unidad': 'kilos', 'Proveedor': 'distribuidora norte', 'Stock': '', 'Stock mínimo': '', 'Costo': '', 'Precio de venta': 160 },
    { 'Código': '', 'Producto': '', 'Categoría': '', 'Unidad': '', 'Proveedor': '', 'Stock': '', 'Stock mínimo': '', 'Costo': '', 'Precio de venta': '' },
    { 'Código': '7790001000101', 'Producto': 'Repetido', 'Categoría': '', 'Unidad': '', 'Proveedor': '', 'Stock': 1, 'Stock mínimo': '', 'Costo': '', 'Precio de venta': 1 },
  ];
  const plan = app.planImportacion(d, filas);
  assert.equal(plan.error, undefined);
  // «Repetido» trae el mismo código que el tornillo de otra fila pero otra descripción: no se saltea en silencio (QA #5)
  assert.equal(plan.repetidasDistintas.length, 1);
  const rep = plan.nuevos.find((x) => x.datos.repetidaDe);
  assert.equal(rep.datos.nombre, 'Repetido');
  rep.accion = 'saltear'; // en la vista previa se puede elegir no cargarla
  assert.equal(plan.nuevos.length, 3);
  assert.equal(plan.actualizados.length, 1);
  assert.equal(plan.salteadas, 1);
  assert.equal(d.productos.length, 2, 'el plan no toca los datos');

  app.aplicarImportacion(d, plan);
  assert.equal(d.productos.length, 4);
  const martillo = d.productos[0];
  assert.equal(martillo.nombre, 'Martillo carpintero 16 oz');
  assert.equal(martillo.precio, 650);
  assert.equal(martillo.costo, 390, 'una celda vacía no borra el dato');
  assert.equal(martillo.categoria, 'Herramientas');
  assert.equal(martillo.stock, 14);
  assert.equal(d.movimientos.find((m) => m.productoId === 'a').tipo, 'ajuste');

  const tornillo = d.productos.find((p) => p.codigo === '7790001000101');
  assert.equal(tornillo.unidad, 'caja');
  assert.equal(tornillo.stock, 30);
  assert.equal(tornillo.costo, 180);
  const clavo = d.productos.find((p) => p.nombre === 'Clavo 2"');
  assert.equal(clavo.codigo, 'P-0001');
  assert.equal(clavo.unidad, 'kg');
  assert.equal(clavo.stock, 0);
  assert.equal(d.proveedores.length, 2, 'el proveedor nuevo se crea una sola vez');
  assert.equal(clavo.proveedorId, tornillo.proveedorId);
});

test('importar sin columna de producto avisa el error', () => {
  const plan = app.planImportacion(base(), [{ 'Cosa': 'x', 'Otra': 1 }]);
  assert.match(plan.error, /Producto/);
});

test('importar dos veces la misma planilla sin códigos no duplica', () => {
  const d = app.baseVacia();
  const filas = [{ Producto: 'Pincel N.º 10', Precio: 90, Stock: 5 }];
  app.aplicarImportacion(d, app.planImportacion(d, filas));
  const plan2 = app.planImportacion(d, filas);
  assert.equal(plan2.nuevos.length, 0);
  assert.equal(plan2.actualizados.length, 1);
  app.aplicarImportacion(d, plan2);
  assert.equal(d.productos.length, 1);
  assert.equal(d.productos[0].stock, 5);
  assert.equal(d.movimientos.length, 1);
});

test('los datos de ejemplo quedan consistentes', () => {
  const d = app.semilla();
  for (const p of d.productos) {
    const suma = d.movimientos.filter((m) => m.productoId === p.id).reduce((s, m) => s + m.cantidad, 0);
    assert.equal(Math.round(suma * 1000) / 1000, p.stock, p.nombre);
    assert.ok(p.stock >= 0);
  }
  assert.equal(d.ventas.length, 3);
});

// ---------- Caja ----------
test('abrir, vender, retirar y cerrar la caja con arqueo', () => {
  const d = base();
  d.cajas = [];
  assert.equal(app.cajaAbierta(d), null);
  assert.match(app.cerrarCaja(d, 100).error, /ya está cerrada/);
  const { caja } = app.abrirCaja(d, 2000, 'Marta');
  assert.equal(caja.numero, 1);
  assert.match(app.abrirCaja(d, 100).error, /ya está abierta/);
  // ventas: 2 en efectivo (una anulada), 1 con débito
  const v1 = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Efectivo', 1000).venta;
  const v2 = app.cobrar(d, [{ productoId: 'b', cantidad: 10, precio: 48 }], 'Efectivo', '').venta;
  app.cobrar(d, [{ productoId: 'a', cantidad: 2, precio: 620 }], 'Débito', '');
  assert.equal(v1.cajaId, caja.id);
  app.anularVenta(d, v2.id);
  assert.equal(app.movimientoCaja(d, 'retiro', 500, 'Pago a proveedor', 'Marta'), null);
  assert.equal(app.movimientoCaja(d, 'ingreso', 200, 'Más cambio', 'Marta'), null);
  assert.match(app.movimientoCaja(d, 'retiro', 0, 'x'), /monto/);
  assert.match(app.movimientoCaja(d, 'retiro', 10, ''), /motivo/);
  const r = app.resumenCaja(d, caja);
  assert.equal(r.ventasEfectivo, 620);
  assert.equal(r.porMedio['Débito'], 1240);
  assert.equal(r.ventas, 2);
  assert.equal(r.anuladas, 1);
  assert.equal(r.esperado, 2000 + 620 + 200 - 500);
  // cierre con faltante de 20
  assert.match(app.cerrarCaja(d, '').error, /Contá/);
  const cierre = app.cerrarCaja(d, 2300, 'Jorge', 'Faltó un vuelto').caja;
  assert.equal(cierre.diferencia, -20);
  assert.equal(cierre.cerradaPor, 'Jorge');
  assert.equal(app.cajaAbierta(d), null);
  // la venta siguiente ya no pertenece a esa caja
  assert.equal(app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Efectivo', '').venta.cajaId, '');
  // otra caja: el número sigue
  assert.equal(app.abrirCaja(d, 0).caja.numero, 2);
});

// ---------- Revisión QA #1 ----------
const XLSX = require('../vendor/xlsx.full.min.js');
function filasCsv(texto) {
  const libro = XLSX.read(new TextEncoder().encode(texto), { type: 'array', codepage: 65001, raw: true });
  return XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '' });
}

test('QA 1: un CSV de Excel en español (punto y coma, coma decimal) se importa bien', () => {
  const d = app.baseVacia();
  const filas = filasCsv('Código;Producto;Stock;Costo;Precio\n0012345;Tornillo;1,5;3.490;450,50\nX-2;Pinza;10;100;1.290,00\n');
  const plan = app.planImportacion(d, filas);
  assert.equal(plan.nuevos.length, 2);
  const [t, p] = plan.nuevos;
  assert.equal(t.codigo, '0012345', 'conserva los ceros del código');
  assert.equal(t.datos.precio, 450.5);
  assert.equal(t.datos.costo, 3490);
  assert.equal(t.datos.stock, 1.5);
  assert.equal(p.datos.precio, 1290);
});

test('QA 9: «Cantidad» no se toma como stock; se puede actualizar solo con Código y Precio', () => {
  const d = base();
  const plan = app.planImportacion(d, [{ 'Código': 'MAR-16', 'Precio': 700, 'Cantidad': 100 }, { 'Código': 'NO-EXISTE', 'Precio': 5 }]);
  assert.equal(plan.error, undefined);
  assert.equal(plan.soloActualiza, true);
  assert.equal(plan.actualizados.length, 1);
  assert.equal(plan.nuevos.length, 0);
  assert.equal(plan.sinProducto, 1);
  assert.equal(plan.actualizados[0].datos.stock, null);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.equal(d.productos[0].precio, 700);
  assert.equal(d.productos[0].stock, 10);
  assert.equal(d.productos[0].nombre, 'Martillo 16 oz');
  assert.equal(d.historialPrecios.length, 1, 'el cambio de precio queda anotado');
  // sin «Producto» ni «Código» sí es un error
  assert.match(app.planImportacion(d, [{ Precio: 1 }]).error, /Producto/);
});

test('QA 9: con las opciones por defecto la lista de un proveedor no pisa nombre ni stock', () => {
  const d = base();
  const plan = app.planImportacion(d, [{ 'Código': 'MAR-16', 'Producto': 'MARTILLO C/MANGO 16OZ', 'Stock': 3, 'Costo': 400, 'Precio': 650 }]);
  assert.deepEqual(app.cambiosStockImportacion(plan), [{ i: 0, codigo: 'MAR-16', nombre: 'Martillo 16 oz', antes: 10, despues: 3, cambiar: true }]);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  const p = d.productos[0];
  assert.equal(p.nombre, 'Martillo 16 oz');
  assert.equal(p.stock, 10);
  assert.equal(p.costo, 400);
  assert.equal(p.precio, 650);
  app.aplicarImportacion(d, plan, { ...app.CAMPOS_IMPORTAR, stock: true, nombre: true });
  assert.equal(p.stock, 3);
  assert.equal(p.nombre, 'MARTILLO C/MANGO 16OZ');
});

test('QA 5: no se cobra un producto con precio 0 o negativo', () => {
  const d = base();
  assert.match(app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: -500 }], 'Débito', '').error, /precio/);
  assert.match(app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 0 }], 'Débito', '').error, /precio/);
  assert.equal(d.ventas.length, 0);
});

test('QA 7: un efectivo recibido absurdo (un código escaneado) no se acepta', () => {
  const d = base();
  assert.match(app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Efectivo', 7790001000101).error, /Revisá el efectivo/);
  assert.equal(app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Efectivo', 2000).venta.vuelto, 1380);
});

test('QA 4: el empleado necesita autorización para un descuento mayor al tope', () => {
  const d = base();
  const it = [{ productoId: 'a', cantidad: 1, precio: 620 }];
  const r = app.cobrar(d, it, 'Débito', '', '', undefined, 100, { topeDescuento: 10 });
  assert.equal(r.autorizar, true);
  assert.equal(d.ventas.length, 0);
  assert.ok(app.cobrar(d, it, 'Débito', '', '', undefined, 10, { topeDescuento: 10 }).venta);
  const v = app.cobrar(d, it, 'Débito', '', '', undefined, 50, { topeDescuento: 10, autorizo: 'Administrador' }).venta;
  assert.equal(v.descuentoAutorizo, 'Administrador');
});

test('QA 11: se puede vender sin stock si se confirma, y el stock queda en negativo', () => {
  const d = base();
  const it = [{ productoId: 'a', cantidad: 12, precio: 620 }];
  const r = app.cobrar(d, it, 'Débito', '');
  assert.match(r.error, /No alcanza/);
  assert.equal(r.faltan[0].id, 'a');
  const ok = app.cobrar(d, it, 'Débito', '', '', undefined, 0, { sinStock: true });
  assert.ok(ok.venta);
  assert.equal(d.productos[0].stock, -2);
  assert.equal(app.estado(d.productos[0]), 'sin');
  assert.deepEqual(ok.venta.sinStock, ['Martillo 16 oz']);
  // al anular vuelve
  app.anularVenta(d, ok.venta.id);
  assert.equal(d.productos[0].stock, 10);
});

test('importar: una fila con el código de barras actualiza el producto que lo tiene, y la columna «Códigos de barras» los agrega', () => {
  const d = base();
  const p = d.productos[0];
  app.asignarBarras(d, p, '7790001000101');
  let plan = app.planImportacion(d, [{ 'Código': '7790001000101', 'Producto': 'Otro nombre', 'Stock': 3, 'Precio': 700 }]);
  assert.equal(plan.nuevos.length, 0);
  assert.equal(plan.actualizados[0].id, p.id);
  plan = app.planImportacion(d, [{ 'Código': p.codigo, 'Códigos de barras': '7790009999999 7790008888888', 'Producto': p.nombre }]);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.deepEqual(p.barras, ['7790001000101', '7790009999999', '7790008888888']);
  // solo códigos de barras y precio, sin nombre ni código propio
  plan = app.planImportacion(d, [{ 'Código de barras': '7790009999999', 'Precio': 710 }]);
  assert.equal(plan.error, undefined);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.equal(p.precio, 710);
});

// ---------- Excel con formato ----------
const XE = require('../vendor/xlsx-estilo.min.js');

test('Excel: con título, los nombres de columna quedan debajo y llevan color', () => {
  const filas = [
    { 'Código': '0012', 'Producto': 'Tornillo', 'Fecha': new Date(2026, 10, 11, 15, 30), 'Precio': 12.5, 'Margen %': 35.2 },
    { 'Código': 'X-2', 'Producto': 'Pinza', 'Fecha': new Date(2026, 10, 10, 9, 0), 'Precio': 1290, 'Margen %': 'sin costo' },
  ];
  const ws = app.hojaExcel(XE, filas, { titulo: 'Ferretería Prueba', subtitulo: 'Ventas', info: 'Del 01/11/2026 al 11/11/2026', texto: ['Código'], plata: ['Precio'], pct: ['Margen %'], totales: ['Precio'] });
  assert.equal(ws.A1.v, 'Ferretería Prueba');
  assert.equal(ws.A2.v, 'Ventas');
  assert.equal(ws.A5.v, 'Código', 'los títulos de columna van después del renglón en blanco');
  assert.equal(ws.A5.s.fill.fgColor.rgb, '1C5A8C');
  assert.equal(ws.A5.s.font.bold, true);
  assert.equal(ws.A6.t, 's', 'el código queda como texto');
  assert.equal(ws.A6.v, '0012', 'sin perder los ceros');
  assert.equal(ws.D6.z, '"$" #,##0.00;[Red]-"$" #,##0.00');
  assert.equal(ws.E6.v, 35.2);
  assert.equal(ws.E7.v, 'sin costo');
  assert.equal(ws.C6.t, 'n', 'la fecha es una fecha de Excel y se puede ordenar');
  assert.equal(ws.C6.z, 'dd/mm/yyyy hh:mm');
  assert.equal(ws.A8.v, 'Total');
  assert.equal(ws.D8.v, 1302.5);
  assert.equal(ws.D8.f, 'SUBTOTAL(109,D6:D7)');
  assert.equal(ws['!autofilter'].ref, 'A5:E7');
  assert.deepEqual(ws['!merges'][0], { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
  assert.equal(ws['!ref'], 'A1:E8');
});

test('Excel: la fecha de Excel respeta la hora de la PC', () => {
  assert.equal(app.fechaExcel(new Date(2026, 0, 1, 0, 0)), 46023);
  assert.equal(app.fechaExcel(new Date(2026, 0, 1, 12, 0)), 46023.5);
});

test('Excel: sin título se puede volver a importar (inventario)', () => {
  const ws = app.hojaExcel(XE, [{ 'Código': 'MAR-16', 'Producto': 'Martillo nuevo', 'Precio': 700 }], { texto: ['Código'], plata: ['Precio'] });
  assert.equal(ws.A1.v, 'Código');
  const wb = XE.utils.book_new();
  XE.utils.book_append_sheet(wb, ws, 'Inventario');
  const libro = XE.read(XE.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  const filas = XE.utils.sheet_to_json(libro.Sheets.Inventario, { defval: '' });
  const d = base();
  const plan = app.planImportacion(d, filas);
  assert.equal(plan.error, undefined);
  assert.equal(plan.actualizados.length, 1);
  assert.equal(plan.actualizados[0].datos.precio, 700);
});

test('Excel: el archivo guarda negrita y colores', () => {
  const ws = app.hojaExcel(XE, [{ 'Producto': 'Pinza', 'Total': 10 }], { titulo: 'X', totales: ['Total'], resaltar: () => 'rojo' });
  const wb = XE.utils.book_new();
  XE.utils.book_append_sheet(wb, ws, 'H');
  const zip = XE.CFB.read(XE.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const estilos = new TextDecoder().decode(XE.CFB.find(zip, '/xl/styles.xml').content);
  assert.match(estilos, /FF1C5A8C|1C5A8C/);
  assert.match(estilos, /<b\/>/);
  assert.match(estilos, /B3261E/);
});

test('Excel: texto del período', () => {
  assert.equal(app.textoPeriodo('2026-11-01', '2026-11-11'), 'Del 01/11/2026 al 11/11/2026');
  assert.equal(app.textoPeriodo('2026-11-11', '2026-11-11'), 'Día 11/11/2026');
  assert.equal(app.textoPeriodo('', ''), '');
});

// ---------- Reportes: moverse día a día, comparar y resumen del día ----------

// ---------- Revisión QA #2 (caja, PIN, precios, fotos) ----------

test('QA2 M4: anular una venta en efectivo de una caja cerrada anota la devolución en la caja abierta', () => {
  const d = base();
  d.cajas = [];
  app.abrirCaja(d, 2000, 'Marta');
  const v = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 290 }], 'Efectivo', '').venta;
  const deb = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 290 }], 'Débito', '').venta;
  app.cerrarCaja(d, 2290, 'Marta');
  const { caja } = app.abrirCaja(d, 2000, 'Jorge');
  assert.deepEqual(app.devolucionEnOtraCaja(d, v), { caja, monto: 290 });
  assert.equal(app.devolucionEnOtraCaja(d, deb), null, 'con débito no sale plata de la caja');
  assert.equal(app.anularVenta(d, v.id, { devolucion: true, usuario: 'Jorge' }), null);
  const r = app.resumenCaja(d, caja);
  assert.equal(r.retiros, 290);
  assert.equal(r.esperado, 1710);
  assert.equal(caja.movs[0].motivo, `Devolución venta N.º ${v.numero}`);
  // la caja vieja no cambia su cierre
  assert.equal(d.cajas[0].diferencia, 0);
  // una venta de la caja abierta no pide devolución aparte: el cierre ya la descuenta
  const v3 = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 290 }], 'Efectivo', '').venta;
  assert.equal(app.devolucionEnOtraCaja(d, v3), null);
  // sin caja abierta no se puede anotar
  const v4 = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 100 }], 'Efectivo', '').venta;
  app.cerrarCaja(d, 0, 'Jorge');
  assert.match(app.anularVenta(d, v4.id, { devolucion: true }), /caja abierta/);
  assert.ok(!d.ventas.find((x) => x.id === v4.id).anulada, 'no se anuló a medias');
});

test('QA2 B5: las fotos sin usar se borran recién cuando ningún respaldo guardado puede usarlas', () => {
  const { fotosEnUso, planLimpiezaFotos } = require('../electron/fotos.js');
  const usadas = fotosEnUso(JSON.stringify({ productos: [{ foto: 'a.jpg' }, { foto: '' }, {}] }));
  assert.deepEqual([...usadas], ['a.jpg']);
  assert.equal(fotosEnUso('{roto'), null, 'si no se puede leer, no se borra nada');
  const dia = 864e5, ahora = Date.UTC(2026, 10, 11);
  const p1 = planLimpiezaFotos({}, usadas, new Set(['a.jpg', 'b.jpg']), ahora, 67);
  assert.deepEqual(p1.borrar, []);
  assert.ok(p1.huerfanas['b.jpg'], 'se anota desde cuándo no se usa');
  const p2 = planLimpiezaFotos(p1.huerfanas, usadas, new Set(['a.jpg', 'b.jpg']), ahora + 66 * dia, 67);
  assert.deepEqual(p2.borrar, []);
  const p3 = planLimpiezaFotos(p2.huerfanas, usadas, new Set(['a.jpg', 'b.jpg']), ahora + 68 * dia, 67);
  assert.deepEqual(p3.borrar, ['b.jpg']);
  // si se vuelve a usar (por ejemplo, al restaurar un respaldo), deja de estar anotada
  const p4 = planLimpiezaFotos(p1.huerfanas, new Set(['a.jpg', 'b.jpg']), new Set(['a.jpg', 'b.jpg']), ahora + 68 * dia, 67);
  assert.deepEqual([p4.borrar, p4.huerfanas], [[], {}]);
});

// ---------- Revisión QA #2: importación ----------
test('QA2 M1: importar dos veces la misma factura no suma la mercadería dos veces', () => {
  const d = base();
  const filas = [{ 'Código': 'MAR-16', 'Producto': 'Martillo 16 oz', 'Proveedor': 'Herramientas Sur', 'Costo': 400, 'Llegó': 30, 'Factura': 'A 1234' }];
  let plan = app.planImportacion(d, filas);
  assert.deepEqual(plan.facturasRepetidas, []);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.equal(d.productos[0].stock, 40);
  // la segunda vez: avisa con la fecha y por defecto no suma
  plan = app.planImportacion(d, filas);
  assert.equal(plan.facturasRepetidas.length, 1);
  assert.equal(plan.facturasRepetidas[0].factura, 'A 1234');
  assert.equal(plan.facturasRepetidas[0].fecha, d.movimientos.at(-1).fecha);
  const r = app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.equal(r.llegadas, 0);
  assert.equal(d.productos[0].stock, 40, 'no vuelve a sumar');
  // marcando la casilla a propósito, sí
  app.aplicarImportacion(d, app.planImportacion(d, filas), { ...app.CAMPOS_IMPORTAR, repetidas: true });
  assert.equal(d.productos[0].stock, 70);
  // «A-1234» es la misma factura; otra factura u otro proveedor con el mismo número, no
  assert.equal(app.planImportacion(d, [{ ...filas[0], 'Factura': 'A-1234' }]).facturasRepetidas.length, 1);
  assert.equal(app.planImportacion(d, [{ ...filas[0], 'Factura': 'A 1300' }]).facturasRepetidas.length, 0);
  d.proveedores.push({ id: 'v2', nombre: 'Otro Proveedor' });
  assert.equal(app.planImportacion(d, [{ ...filas[0], 'Proveedor': 'Otro Proveedor' }]).facturasRepetidas.length, 0);
});

test('QA2 B3: el conteo del Cargador se aplica al importar sin tocar nada; un Excel común no cambia el stock', () => {
  const d = base();
  const cargador = [
    { 'Código': 'MAR-16', 'Producto': 'Martillo 16 oz', 'Stock': 7, 'Precio': '', 'Contado': 'Sí' },
    { 'Código': 'NUEVO-1', 'Producto': 'Pinza', 'Stock': 3, 'Precio': 500, 'Contado': 'Sí' },
  ];
  const plan = app.planImportacion(d, cargador);
  assert.equal(plan.deConteo, true, 'se reconoce el Excel del Cargador');
  assert.deepEqual(app.cambiosStockImportacion(plan), [{ i: 0, codigo: 'MAR-16', nombre: 'Martillo 16 oz', antes: 10, despues: 7, cambiar: true }], 'la vista previa muestra qué stock cambia');
  // la ventana marca «Stock» sola cuando plan.deConteo (mostrarPlan); así se importa
  app.aplicarImportacion(d, plan, { ...app.CAMPOS_IMPORTAR, stock: plan.deConteo });
  assert.equal(d.productos.find((p) => p.codigo === 'MAR-16').stock, 7);
  assert.equal(d.productos.find((p) => p.codigo === 'NUEVO-1').stock, 3);
  assert.equal(d.productos[0].precio, 620, 'sin precio en la planilla, no lo cambia');
  // Excel común: sin «Contado» el stock sigue apagado
  const comun = app.planImportacion(d, [{ 'Código': 'MAR-16', 'Producto': 'Martillo 16 oz', 'Stock': 99 }]);
  assert.equal(comun.deConteo, false);
  app.aplicarImportacion(d, comun, { ...app.CAMPOS_IMPORTAR, stock: comun.deConteo });
  assert.equal(d.productos[0].stock, 7);
});

// ---------- Revisión QA #3: códigos de cada proveedor ----------

function dosProveedores() {
  const d = app.baseVacia();
  d.proveedores.push({ id: 'norte', nombre: 'Distribuidora Norte' }, { id: 'uru', nombre: 'Uruimporta' });
  d.productos.push(
    { id: 't', codigo: '1234', nombre: 'Tornillo autoperforante', categoria: '', unidad: 'unidad', proveedorId: 'norte', ubicacion: '', costo: 180, precio: 300, minimo: 0, stock: 15 },
    { id: 'lh', codigo: 'LH-1234', nombre: 'Guante de nitrilo', categoria: '', unidad: 'par', proveedorId: 'uru', ubicacion: '', costo: 90, precio: 150, minimo: 0, stock: 4 },
  );
  return d;
}
const facturaSur = (codprov = true) => [{ 'Código': '1234', ...(codprov ? { 'Código del proveedor': '1234' } : {}), Producto: 'Esmalte sintético blanco 4L', Proveedor: 'Pinturería Sur', Costo: 1450, 'Llegó': 6, Factura: 'B 88' }];

test('QA3 A1: el código de un proveedor no pisa el producto de otro proveedor', () => {
  for (const conColumna of [true, false]) {
    const d = dosProveedores();
    const plan = app.planImportacion(d, facturaSur(conColumna));
    assert.equal(plan.actualizados.length, 0, 'el tornillo no se toca');
    assert.equal(plan.nuevos.length, 1);
    assert.notEqual(plan.nuevos[0].codigo, '1234', 'lleva otro código propio');
    assert.equal(plan.otroProveedor.length, 1);
    app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
    const t = d.productos.find((p) => p.id === 't');
    assert.deepEqual([t.stock, t.costo], [15, 180]);
    const pintura = d.productos.find((p) => p.nombre.startsWith('Esmalte'));
    assert.equal(pintura.stock, 6);
    assert.equal(pintura.costo, 1450);
    const sur = d.proveedores.find((v) => v.nombre === 'Pinturería Sur');
    assert.deepEqual(pintura.codigosProv.map((x) => [x.proveedorId, x.codigo]), [[sur.id, '1234']]);
    const entrada = d.movimientos.find((m) => m.productoId === pintura.id && m.nota === 'Factura B 88');
    assert.equal(entrada.proveedorId, sur.id);
    // La factura siguiente del mismo proveedor va a la misma pintura, no crea otra
    const f2 = facturaSur(conColumna); f2[0]['Llegó'] = 4; f2[0].Factura = 'B 95';
    const plan2 = app.planImportacion(d, f2);
    assert.deepEqual([plan2.nuevos.length, plan2.actualizados.length, plan2.otroProveedor.length], [0, 1, 0], conColumna ? 'con columna' : 'sin columna');
    assert.equal(plan2.actualizados[0].id, pintura.id);
    app.aplicarImportacion(d, plan2, app.CAMPOS_IMPORTAR);
    assert.equal(pintura.stock, 10);
    assert.equal(t.stock, 15);
  }
});

test('QA3 A1: con el mismo proveedor (o sin proveedor) el código sigue encontrando el producto', () => {
  const d = dosProveedores();
  const plan = app.planImportacion(d, [{ 'Código': 'LH-1234', 'Código del proveedor': 'LH-1234', Producto: 'Guante nitrilo', Proveedor: 'Uruimporta', Costo: 95, 'Llegó': 10, Factura: 'A 7' }]);
  assert.deepEqual([plan.nuevos.length, plan.actualizados.length], [0, 1]);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  const g = d.productos.find((p) => p.id === 'lh');
  assert.equal(g.stock, 14);
  assert.deepEqual(g.codigosProv.map((x) => [x.proveedorId, x.codigo]), [['uru', 'LH-1234']]);
  // Una lista de precios sin proveedor (Código + Precio) sigue funcionando
  const plan2 = app.planImportacion(d, [{ 'Código': '1234', Precio: 320 }]);
  assert.equal(plan2.actualizados[0].id, 't');
  // Solo actualizar con un proveedor distinto: se saltea y avisa
  const plan3 = app.planImportacion(d, [{ 'Código': '1234', Proveedor: 'Pinturería Sur', Precio: 2000 }]);
  assert.deepEqual([plan3.actualizados.length, plan3.sinProducto, plan3.otroProveedor.length], [0, 1, 1]);
  // Dos proveedores nuevos con el mismo código en la misma planilla: dos productos distintos
  const plan4 = app.planImportacion(d, [
    { 'Código del proveedor': '77', Producto: 'Pincel 2"', Proveedor: 'A' },
    { 'Código del proveedor': '77', Producto: 'Rodillo 23 cm', Proveedor: 'B' },
  ]);
  assert.equal(plan4.nuevos.length, 2);
  assert.notEqual(plan4.nuevos[0].codigo, plan4.nuevos[1].codigo);
});

// ---------- Depósito: dónde está y etiquetas con código de barras ----------
const CB = require('../js/codigo-barras.js');

test('código de barras Code 128: patrones, control y números en código C', () => {
  assert.equal(CB.PATRONES.length, 106);
  for (const p of CB.PATRONES) assert.equal([...p].reduce((s, x) => s + Number(x), 0), 11);
  // «P-0001» en código B: inicio B (104), P=48, -=13, 0=16, 0, 0, 1=17; control = (104 + 48·1 + 13·2 + 16·3 + 16·4 + 16·5 + 17·6) % 103
  assert.deepEqual(CB.simbolos('P-0001'), [104, 48, 13, 16, 16, 16, 17, (104 + 48 + 26 + 48 + 64 + 80 + 102) % 103]);
  // EAN de 13 dígitos: inicio C, 6 pares, cambio a B para el último dígito
  const ean = CB.simbolos('7790001234567');
  assert.deepEqual(ean.slice(0, 7), [105, 77, 90, 0, 12, 34, 56]);
  assert.deepEqual(ean.slice(7, 9), [100, 23]);
  assert.equal(CB.anchos('MAR-16').reduce((s, x) => s + x, 0), (CB.simbolos('MAR-16').length) * 11 + 13, 'cada símbolo 11 módulos y la parada 13');
  assert.equal(CB.simbolos('Ñandú'), null, 'con tildes o ñ no se puede');
  assert.equal(CB.svg(''), '');
  assert.match(CB.svg('A-3'), /^<svg[^>]+viewBox="0 0 \d+ 1"/);
});

test('depósito: ubicaciones ordenadas y dónde está un producto, una ubicación o una búsqueda', () => {
  const d = base();
  d.productos.push(
    { id: 'c', codigo: 'TOR-8', barras: ['7790001234567'], nombre: 'Tornillo 8x1', categoria: 'Tornillería', unidad: 'caja', proveedorId: '', ubicacion: 'c-02 ', costo: 1, precio: 2, minimo: 0, stock: 4 },
    { id: 'd', codigo: 'DEP-1', nombre: 'Pala ancha', categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: 'Depósito 10', costo: 1, precio: 2, minimo: 0, stock: 1 },
    { id: 'e', codigo: 'DEP-2', nombre: 'Pala punta', categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: 'Deposito 2', costo: 1, precio: 2, minimo: 0, stock: 1 },
  );
  const u = app.ubicacionesDe(d);
  assert.deepEqual(u.map((x) => [x.clave, x.productos.length]), [['C-02', 2], ['DEPOSITO 2', 1], ['DEPOSITO 10', 1]], 'sin tildes ni mayúsculas, y el 2 antes que el 10');
  assert.deepEqual(u[0].productos.map((p) => p.id), ['a', 'c']);
  // por código de barras, por código propio o por el código de un proveedor
  assert.equal(app.dondeEsta(d, '7790001234567').producto.id, 'c');
  assert.equal(app.dondeEsta(d, ' mar-16 ').producto.id, 'a');
  app.anotarCodigoProv(d.productos[1], 'v1', 'LH-5563');
  assert.equal(app.dondeEsta(d, 'LH-5563').producto.id, 'b');
  // la etiqueta de ubicación («UBIC …») o escribir la ubicación
  assert.equal(app.dondeEsta(d, 'UBIC C-02').ubicacion.clave, 'C-02');
  assert.equal(app.dondeEsta(d, 'depósito 2').ubicacion.clave, 'DEPOSITO 2');
  assert.equal(app.dondeEsta(d, 'UBIC Z-99').tipo, 'nada');
  // por nombre: uno solo va directo al producto; varios, la lista
  assert.equal(app.dondeEsta(d, 'martillo').producto.id, 'a');
  assert.deepEqual(app.dondeEsta(d, 'pala').productos.map((p) => p.id), ['d', 'e']);
  assert.equal(app.dondeEsta(d, 'nada parecido').tipo, 'nada');
  assert.equal(app.dondeEsta(d, '   ').tipo, 'vacio');
});

test('etiquetas: código de barras del producto o del programa, copias y hojas A4', () => {
  const d = base();
  d.productos[0].barras = ['7790001234567'];
  assert.equal(app.codigoEtiqueta(d.productos[0]), '7790001234567', 'si tiene código de barras, va ese');
  assert.equal(app.codigoEtiqueta(d.productos[1]), 'CAB-25', 'si no, el código del programa');
  const r = app.htmlEtiquetas([{ producto: d.productos[0], copias: 2 }, { producto: d.productos[1], copias: 23 }], 'a4');
  assert.equal(r.etiquetas, 25);
  assert.equal(r.hojas, 2, '24 por hoja');
  assert.equal((r.html.match(/class="et et-prod"/g) || []).length, 25);
  assert.match(r.html, /C-02/, 'la ubicación va en la etiqueta');
  assert.match(r.html, /Martillo 16 oz/);
  // saltear stickers ya usados de la hoja
  const s = app.htmlEtiquetas([{ producto: d.productos[0], copias: 1 }], 'a4', 5);
  assert.equal((s.html.match(/et-vacia/g) || []).length, 5);
  // rollo: una por página
  assert.equal(app.htmlEtiquetas([{ producto: d.productos[0], copias: 3 }], 'rollo', 5).hojas, 3);
  // etiqueta de ubicación: un QR (no código de barras) que dice «UBIC C-02»
  const ub = app.ubicacionesDe(d)[0];
  const e = app.htmlEtiquetas([{ ubicacion: ub, copias: 1 }], 'a4');
  assert.match(e.html, /aria-label="QR UBIC C-02"/);
  assert.doesNotMatch(e.html, /Código de barras/);
  assert.match(e.html, /Martillo 16 oz/);
  assert.equal(app.htmlEtiquetas([{ producto: d.productos[0], copias: 0 }]).etiquetas, 0);
});

test('lector con otro teclado: «PIN\'ROD22» encuentra PIN-ROD22, si no hay dudas', () => {
  const d = base();
  d.productos.push(
    { id: 'r', codigo: 'PIN-ROD22', nombre: 'Rodillo lana 22 cm', categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: 'A-01', costo: 1, precio: 2, minimo: 0, stock: 3 },
    { id: 'x1', codigo: 'AB-12', nombre: 'Uno', categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: '', costo: 1, precio: 2, minimo: 0, stock: 0 },
    { id: 'x2', codigo: 'AB12', nombre: 'Otro', categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: '', costo: 1, precio: 2, minimo: 0, stock: 0 },
  );
  assert.equal(app.buscarPorCodigo(d, "PIN'ROD22").id, 'r', 'el guion llegó como apóstrofo');
  assert.equal(app.buscarPorCodigo(d, "mar'16").id, 'a');
  assert.equal(app.dondeEsta(d, "PIN'ROD22").producto.id, 'r');
  assert.equal(app.buscarPorCodigo(d, 'AB-12').id, 'x1', 'si está exacto, va el exacto');
  assert.equal(app.buscarPorCodigo(d, "AB'12"), null, 'dos productos posibles: no adivina');
  assert.equal(app.buscarPorCodigo(d, "A'"), null, 'códigos muy cortos: no adivina');
  // la etiqueta de ubicación también
  assert.equal(app.dondeEsta(d, "UBIC A'01").ubicacion.clave, 'A-01');
  assert.equal(app.dondeEsta(d, "UBIC C'02").ubicacion.clave, 'C-02');
});

test('estantes con categoría: crear, no repetir, cambiar el nombre mueve los productos', () => {
  const d = base();
  assert.match(app.guardarEstante(d, { codigo: '  ', categoria: 'Sanitaria' }).error, /nombre del estante/);
  const a1 = app.guardarEstante(d, { codigo: 'A-1', categoria: ' Sanitaria ' }).estante;
  assert.deepEqual([a1.codigo, a1.categoria], ['A-1', 'Sanitaria']);
  assert.match(app.guardarEstante(d, { codigo: 'a-1 ', categoria: 'Otra' }).error, /Ya hay un estante A-1 \(Sanitaria\)/);
  // aparece en las ubicaciones aunque no tenga productos, con su categoría
  const u = app.ubicacionesDe(d).find((x) => x.clave === 'A-1');
  assert.deepEqual([u.categoria, u.productos.length, u.estanteId], ['Sanitaria', 0, a1.id]);
  // poner un producto y cambiar el nombre del estante
  assert.equal(app.ubicarProducto(d, 'a', 'a-1'), null);
  assert.equal(d.productos[0].ubicacion, 'A-1');
  assert.equal(app.ubicarProducto(d, 'a', 'Z-9'), 'Elegí el estante.');
  app.guardarEstante(d, { codigo: 'A-01', categoria: 'Sanitaria' }, a1.id);
  assert.equal(d.productos[0].ubicacion, 'A-01', 'el producto sigue en su estante con el nombre nuevo');
  // la etiqueta del estante lleva la categoría
  const et = app.htmlEtiquetas([{ ubicacion: app.ubicacionesDe(d).find((x) => x.clave === 'A-01'), copias: 1 }]);
  assert.match(et.html, /et-titulo">Sanitaria</);
  // borrar el estante no toca los productos
  app.eliminarEstante(d, a1.id);
  assert.equal(app.estantesDe(d).length, 0);
  assert.equal(d.productos[0].ubicacion, 'A-01');
});

test('recibir en el depósito: código nuevo con nombre y estante, y la próxima vez dice dónde va', () => {
  const d = base();
  app.guardarEstante(d, { codigo: 'A-1', categoria: 'Sanitaria' });
  // escanear un código que no está: se ofrece cargarlo
  assert.deepEqual(app.dondeEsta(d, '7730901480023'), { tipo: 'nuevo', codigo: '7730901480023' });
  assert.equal(app.dondeEsta(d, '22cm').tipo, 'nada', 'algo corto escrito a mano no es un código nuevo');
  assert.match(app.altaEnDeposito(d, { codigo: '7730901480023', nombre: ' ', ubicacion: 'A-1' }, 'Ana', 'empleado').error, /nombre/);
  assert.match(app.altaEnDeposito(d, { codigo: '7730901480023', nombre: 'Codo PVC 110', ubicacion: '' }, 'Ana', 'empleado').error, /estante/);
  assert.match(app.altaEnDeposito(d, { codigo: 'mar-16', nombre: 'X', ubicacion: 'A-1' }, 'Ana', 'empleado').error, /ya es de «Martillo 16 oz»/);
  const { producto: p } = app.altaEnDeposito(d, { codigo: '7730901480023', nombre: 'Codo  PVC 110', ubicacion: 'a-1' }, 'Ana', 'empleado');
  assert.deepEqual([p.codigo, p.nombre, p.ubicacion, p.categoria, p.precio, p.stock, p.revisar, p.creadoPor], ['7730901480023', 'Codo PVC 110', 'A-1', 'Sanitaria', 0, 0, true, 'Ana'],
    'la categoría es la del estante; queda para revisar (falta el precio); sin stock si no se dijo cuántos');
  // el administrador también lo ve para revisar (falta el precio)
  assert.equal(app.altaEnDeposito(d, { codigo: '7790000000001', nombre: 'Otro', ubicacion: 'A-1' }, 'Admin', 'admin').producto.revisar, true);
  // la próxima vez que llega: lo encuentra y dice el estante
  const r = app.dondeEsta(d, '7730901480023');
  assert.equal(r.producto.id, p.id);
  assert.equal(r.producto.ubicacion, 'A-1');
  // cuántos llegaron es opcional; si se pone, entra como llegada (queda en el historial)
  assert.equal(app.recibirEnDeposito(d, p.id, ''), 'Escribí cuántos llegaron.');
  assert.equal(app.recibirEnDeposito(d, p.id, 12), null);
  assert.equal(p.stock, 12);
  const m = d.movimientos.at(-1);
  assert.deepEqual([m.tipo, m.cantidad, m.nota], ['entrada', 12, 'Llegó (Depósito)']);
  assert.equal(app.recibirEnDeposito(d, 'a', 5), null);
  assert.equal(d.productos[0].stock, 15);
  assert.equal(d.productos[0].costo, 390, 'sumar en el depósito no cambia el costo');
});

// ---------- Revisión QA #5: importación y fichas repetidas ----------

test('QA5 A1: el Excel con dos facturas a nombre de un solo proveedor no pisa ni saltea', () => {
  const d = dosProveedores();
  // el tornillo ya tiene registrado su código 1234 de Distribuidora Norte
  app.anotarCodigoProv(d.productos.find((p) => p.id === 't'), 'norte', '1234', 'TORNILLO AUTOPERFORANTE 8X1');
  const filas = [
    { 'Código': '1234', 'Código del proveedor': '1234', Producto: 'ESMALTE SINTETICO BLANCO 4L', Proveedor: 'Distribuidora Norte', Costo: 1450, 'Llegó': 6, Factura: 'B 88' },
    { 'Código': '1234', 'Código del proveedor': '1234', Producto: 'TORNILLO AUTOPERFORANTE 8X1', Proveedor: 'Distribuidora Norte', Costo: 185, 'Llegó': 10, Factura: 'A 500' },
  ];
  const plan = app.planImportacion(d, filas);
  assert.equal(plan.salteadas, 0, 'ninguna fila se pierde');
  assert.equal(plan.dudosas.length, 1);
  assert.equal(plan.dudosas[0].nombre, 'ESMALTE SINTETICO BLANCO 4L');
  assert.equal(plan.actualizados.length, 1);
  assert.equal(plan.actualizados[0].id, 't', 'el tornillo lo actualiza la fila del tornillo');
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  const t = d.productos.find((p) => p.id === 't');
  assert.deepEqual([t.stock, t.costo], [25, 185], 'llegaron los 10 tornillos, con su costo');
  const esmalte = d.productos.find((p) => p.nombre.startsWith('ESMALTE'));
  assert.deepEqual([esmalte.stock, esmalte.costo], [6, 1450]);
  assert.notEqual(esmalte.codigo, '1234');
});

test('QA5 A1: en la vista previa se puede decir «es el mismo» o «no cargar»', () => {
  const d = dosProveedores();
  const fila = [{ 'Código': '1234', Producto: 'TORN. AUTOPERF. PUNTA MECHA', Proveedor: 'Distribuidora Norte', 'Llegó': 5, Costo: 190 }];
  let plan = app.planImportacion(d, [{ ...fila[0], Producto: 'Cinta de embalar' }]);
  assert.equal(plan.dudosas.length, 1);
  plan.nuevos[0].accion = 'mismo';
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.equal(d.productos.find((p) => p.id === 't').stock, 20);
  assert.equal(d.productos.length, 2, 'no se creó otro');
  plan = app.planImportacion(d, [{ ...fila[0], Producto: 'Cinta de embalar' }]);
  plan.nuevos[0].accion = 'saltear';
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.equal(d.productos.length, 2);
  assert.equal(d.productos.find((p) => p.id === 't').stock, 20);
  // abreviado del mismo producto: no es dudosa
  plan = app.planImportacion(d, fila);
  assert.deepEqual([plan.dudosas.length, plan.actualizados.length], [0, 1]);
});

test('QA5 B1: una planilla con factura y sin proveedor tampoco pisa un producto que no se parece', () => {
  const d = dosProveedores();
  const plan = app.planImportacion(d, [{ 'Código': '1234', Producto: 'Esmalte sintético blanco 4L', Costo: 1450, 'Llegó': 6, Factura: 'B 88' }]);
  assert.equal(plan.actualizados.length, 0);
  assert.equal(plan.dudosas.length, 1);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  const t = d.productos.find((p) => p.id === 't');
  assert.deepEqual([t.stock, t.costo], [15, 180]);
});

test('QA5 M2: lo que ya se recibió en el Depósito no se suma otra vez con la factura', () => {
  const d = dosProveedores();
  app.registrar(d, { tipo: 'entrada', productoId: 't', cantidad: 10, nota: 'Llegó (Depósito)' });
  const fila = [{ 'Código': '1234', Producto: 'Tornillo autoperforante', Proveedor: 'Distribuidora Norte', Costo: 190, 'Llegó': 10, Factura: 'A 500' }];
  const plan = app.planImportacion(d, fila);
  assert.equal(plan.enDeposito.length, 1);
  assert.deepEqual([plan.enDeposito[0].cantidad, plan.enDeposito[0].llego], [10, 10]);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  const t = d.productos.find((p) => p.id === 't');
  assert.equal(t.stock, 25, '15 + 10 del Depósito, no 35');
  assert.equal(t.costo, 190, 'el costo de la factura sí se actualiza');
  // marcando la casilla a propósito, se suma
  const plan2 = app.planImportacion(d, [{ ...fila[0], Factura: 'A 501' }]);
  app.aplicarImportacion(d, plan2, { ...app.CAMPOS_IMPORTAR, deposito: true });
  assert.equal(t.stock, 35);
});

test('QA5 M2: una fila dudosa que va como producto nuevo suma lo suyo aunque el otro se haya recibido en el Depósito', () => {
  const d = dosProveedores();
  app.registrar(d, { tipo: 'entrada', productoId: 't', cantidad: 10, nota: 'Llegó (Depósito)' });
  const plan = app.planImportacion(d, [{ 'Código': '1234', Producto: 'Esmalte sintético blanco 4L', Proveedor: 'Distribuidora Norte', Costo: 1450, 'Llegó': 6 }]);
  assert.deepEqual([plan.dudosas.length, plan.enDeposito.length], [1, 0]);
  app.aplicarImportacion(d, plan, app.CAMPOS_IMPORTAR);
  assert.equal(d.productos.find((p) => p.nombre.startsWith('Esmalte')).stock, 6);
});

// ---------- Revisión QA #5: Depósito ----------
test('QA5 M1: «¿Cuántos llegaron?» con tope y confirmación; un código escaneado no entra como cantidad', () => {
  assert.deepEqual(app.revisarCantidadDeposito(''), { cantidad: 0 }, 'vacío es válido: es opcional');
  assert.deepEqual(app.revisarCantidadDeposito('24'), { cantidad: 24, grande: false });
  assert.deepEqual(app.revisarCantidadDeposito('600'), { cantidad: 600, grande: true }, 'más de 500: se confirma');
  assert.deepEqual(app.revisarCantidadDeposito('10000'), { cantidad: 10000, grande: true });
  assert.match(app.revisarCantidadDeposito('10001').error, /más de 10\.000 de una vez no se acepta/);
  assert.match(app.revisarCantidadDeposito('57790001000101').error, /no se acepta/, 'el código pegado a la cantidad');
  assert.match(app.revisarCantidadDeposito('abc').error, /con números/);
  assert.match(app.revisarCantidadDeposito('-3').error, /con números/);
  // la lógica también se niega, aunque se llame directo
  const d = base();
  assert.match(app.recibirEnDeposito(d, 'a', 57790001000101), /no se acepta/);
  assert.equal(d.productos[0].stock, 10);
  assert.equal(app.recibirEnDeposito(d, 'a', 600), null);
  assert.equal(d.productos[0].stock, 610);
});

test('QA5 M4: la etiqueta de un estante lleva un número corto (U1) aunque el nombre sea largo; las viejas «UBIC …» siguen andando', () => {
  const d = base();
  const largo = app.guardarEstante(d, { codigo: 'Herramientas eléctricas 12', categoria: 'Herramientas' }).estante;
  const otro = app.guardarEstante(d, { codigo: 'A-1', categoria: 'Sanitaria' }).estante;
  assert.deepEqual([largo.num, otro.num, d.numEstante], [1, 2, 2], 'número fijo, en orden');
  const u = app.ubicacionesDe(d).find((x) => x.estanteId === largo.id);
  assert.equal(u.corto, 'U1');
  const html = app.htmlEtiquetas([{ ubicacion: u, copias: 1 }], 'rollo').html;
  assert.match(html, /aria-label="QR U1"/, 'el QR lleva U1, no el nombre');
  assert.match(html, /Herramientas eléctricas 12/, 'el nombre va escrito');
  // el código queda corto: muchas menos barras que con el nombre entero
  const CB = require('../js/codigo-barras.js');
  const corto = CB.anchos('U1').reduce((s, x) => s + x, 0);
  const viejo = CB.anchos(app.PREFIJO_UBIC + u.clave).reduce((s, x) => s + x, 0);
  assert.ok(corto <= 70, `U1 mide ${corto} módulos`);
  assert.ok(viejo > corto * 4, `con el nombre medía ${viejo} módulos`);
  // escanear el número nuevo o la etiqueta vieja lleva al mismo estante
  assert.equal(app.dondeEsta(d, 'U1').ubicacion.estanteId, largo.id);
  assert.equal(app.dondeEsta(d, 'u2').ubicacion.estanteId, otro.id);
  assert.equal(app.dondeEsta(d, 'UBIC HERRAMIENTAS ELECTRICAS 12').ubicacion.estanteId, largo.id);
  // borrar un estante no libera su número
  app.eliminarEstante(d, otro.id);
  assert.equal(app.guardarEstante(d, { codigo: 'B-1', categoria: '' }).estante.num, 3);
  // estantes cargados antes (sin número) y ubicaciones que solo están en los productos: se numeran al imprimir
  const v = base();
  v.estantes = [{ id: 'e1', codigo: 'A-1', categoria: 'Sanitaria' }];
  assert.equal(app.completarEstantes(v), true);
  assert.deepEqual(v.estantes.map((e) => [e.codigo, e.num]), [['A-1', 1], ['C-02', 2]]);
  assert.equal(app.completarEstantes(v), false, 'la segunda vez no cambia nada');
});

test('depósito: producto suelto sin código de barras recibe un código propio que se puede imprimir y escanear', () => {
  const d = base();
  app.guardarEstante(d, { codigo: 'A-1', categoria: 'Bulonería' });
  d.productos.push({ id: 'x', codigo: 'p-0001', barras: [], nombre: 'Ya usado', stock: 0 });
  assert.equal(app.codigoLibreDe(d), 'P-0002', 'saltea los códigos que ya existen, sin importar mayúsculas');
  assert.match(app.altaEnDeposito(d, { sinCodigo: true, nombre: '', ubicacion: 'A-1' }, 'Ana', 'empleado').error, /nombre/);
  const { producto: p } = app.altaEnDeposito(d, { sinCodigo: true, codigo: '', nombre: 'Arandela plana 8 mm (suelta)', ubicacion: 'A-1' }, 'Ana', 'empleado');
  assert.deepEqual([p.codigo, p.ubicacion, p.categoria, p.revisar], ['P-0002', 'A-1', 'Bulonería', true]);
  assert.equal(app.codigoEtiqueta(p), 'P-0002', 'la etiqueta lleva ese código');
  assert.equal(app.dondeEsta(d, 'P-0002').producto.id, p.id, 'escanear la etiqueta lo encuentra');
  assert.equal(app.altaEnDeposito(d, { sinCodigo: true, nombre: 'Otra suelta', ubicacion: 'A-1' }, 'Ana', 'empleado').producto.codigo, 'P-0003');
});

test('etiquetas: se reconoce qué productos no traen código de barras de fábrica', () => {
  assert.equal(app.tieneCodigoFabrica({ codigo: 'P-0003', barras: [] }), false);
  assert.equal(app.tieneCodigoFabrica({ codigo: 'LH-5283', barras: [] }), false);
  assert.equal(app.tieneCodigoFabrica({ codigo: 'P-0003', barras: ['7790001234567'] }), true);
  assert.equal(app.tieneCodigoFabrica({ codigo: '7730901480023' }), true);
  assert.equal(app.tieneCodigoFabrica({ codigo: '1234' }), false, 'un número corto es un código interno');
});

test('importar lo del Cargador crea los estantes nuevos con su categoría', () => {
  const d = app.baseVacia();
  app.guardarEstante(d, { codigo: 'A-1', categoria: 'Comida' });
  const filas = [
    { 'Código': '', Producto: 'Guantes de látex', 'Categoría': 'Indumentaria', 'Ubicación': 'A-2', Precio: 300, Stock: 4 },
    { 'Código': '', Producto: 'Galletas', 'Categoría': 'Comida', 'Ubicación': 'a-1', Precio: 50, Stock: 2 },
  ];
  const r = app.aplicarImportacion(d, app.planImportacion(d, filas));
  assert.equal(r.estantes, 1, 'solo A-2 es nuevo (a-1 es el mismo que A-1)');
  assert.deepEqual(app.estantesDe(d).map((e) => [e.codigo, e.categoria]), [['A-1', 'Comida'], ['A-2', 'Indumentaria']]);
  assert.ok(app.estantesDe(d).every((e) => e.num > 0), 'con su número para la etiqueta');
  assert.equal(app.asegurarEstante(d, 'A-2', 'Otra'), false, 'uno que ya existe no cambia');
  assert.equal(app.estantesDe(d)[1].categoria, 'Indumentaria');
});

test('etiquetas en hoja A4 común: el tamaño se ajusta a cuántas van por hoja', () => {
  const d = base();
  const p = d.productos[0];
  // automático: con pocas, salen grandes; nunca más de 24 por hoja
  assert.equal(app.porHojaEtiquetas(0, 1), 1);
  assert.equal(app.porHojaEtiquetas(0, 5), 6);
  assert.equal(app.porHojaEtiquetas(0, 30), 24);
  assert.equal(app.porHojaEtiquetas(40, 3), 40, 'si se eligió, se respeta');
  const grande = app.medidaEtiquetaHoja(1), chica = app.medidaEtiquetaHoja(24);
  assert.ok(grande.k > chica.k * 3, 'una sola es más de 3 veces más grande que de a 24');
  for (const n of [1, 2, 3, 4, 6, 8, 10, 12, 14, 21, 24, 40, 65]) {
    const m = app.medidaEtiquetaHoja(n);
    assert.equal(m.cols * m.filas, n);
    assert.ok(m.cols * m.celdaAncho + (m.cols - 1) * 4 + 16 <= 210.01 && m.filas * m.celdaAlto + (m.filas - 1) * 4 + 16 <= 297.01, `${n} entran en la hoja`);
  }
  const r = app.htmlEtiquetas([{ producto: p, copias: 7 }], 'hoja', 0, 0);
  assert.deepEqual([r.etiquetas, r.hojas, r.porHoja], [7, 1, 8]);
  assert.match(r.html, /--k:1\.36/);
  const r2 = app.htmlEtiquetas([{ producto: p, copias: 5 }], 'hoja', 0, 2);
  assert.deepEqual([r2.hojas, r2.porHoja], [3, 2], '5 de a 2 por hoja: 3 hojas');
});

test('importar: el stock se puede dejar sin cambiar producto por producto', () => {
  const d = app.baseVacia();
  app.aplicarImportacion(d, app.planImportacion(d, [
    { 'Código': 'A1', Producto: 'Agua 2 L', Precio: 80, Stock: 12 },
    { 'Código': 'B1', Producto: 'Bujía', Precio: 50, Stock: 3 },
  ]));
  const plan = app.planImportacion(d, [
    { 'Código': 'A1', Producto: 'Agua 2 L', Precio: 85, Stock: 20, Contado: 'Sí' },
    { 'Código': 'B1', Producto: 'Bujía', Precio: 55, Stock: 9, Contado: 'Sí' },
  ]);
  const cambios = app.cambiosStockImportacion(plan);
  assert.deepEqual(cambios.map((c) => [c.nombre, c.antes, c.despues, c.cambiar]), [['Agua 2 L', 12, 20, true], ['Bujía', 3, 9, true]]);
  plan.actualizados[cambios[1].i].sinStock = true; // la bujía no
  app.aplicarImportacion(d, plan, { precio: true, costo: true, stock: true });
  const p = (c) => d.productos.find((x) => x.codigo === c);
  assert.deepEqual([p('A1').stock, p('A1').precio, p('B1').stock, p('B1').precio], [20, 85, 3, 55], 'el precio se actualiza igual; el stock de la desmarcada no');
});

test('depósito: sugerencias mientras se escribe, primero lo que empieza con lo escrito', () => {
  const d = app.semilla();
  app.guardarEstante(d, { codigo: 'A-1', categoria: 'Comida' });
  const nombres = (t) => app.sugerenciasDeposito(d, t).map((s) => (s.tipo === 'producto' ? s.producto.nombre : 'Estante ' + s.ubicacion.ubicacion));
  assert.equal(nombres('tor')[0], 'Tornillo autoperforante 8 x 1" (caja x100)');
  assert.deepEqual(nombres('pint lat'), ['Pintura látex interior blanco 4 L'], 'varias palabras, en cualquier orden y sin tildes');
  assert.equal(nombres('A-1')[0], 'Estante A-1', 'los estantes también');
  assert.ok(nombres('7790001000101').length >= 1, 'por código');
  assert.deepEqual(nombres('zzz'), []);
  assert.ok(app.sugerenciasDeposito(d, 'a').length <= 8);
});

test('QA6 B1: lo exacto gana al número corto del estante', () => {
  const d = app.baseVacia();
  const a1 = app.guardarEstante(d, { codigo: 'A1', categoria: 'X' }).estante; // número U1
  const u1 = app.guardarEstante(d, { codigo: 'U1', categoria: 'Y' }).estante; // número U2
  for (let i = 0; i < 10; i++) app.guardarEstante(d, { codigo: 'Z' + i, categoria: '' }); // hasta U12
  d.productos.push({ id: 'p', codigo: 'U12', barras: [], nombre: 'Producto U12', stock: 0 });
  assert.equal(app.dondeEsta(d, 'U1').ubicacion.estanteId, u1.id, 'el estante que se llama U1');
  assert.equal(app.dondeEsta(d, 'U12').producto.id, 'p', 'el producto con código U12');
  assert.equal(app.dondeEsta(d, 'U2').ubicacion.estanteId, u1.id, 'el número corto sigue andando');
  assert.ok(a1.num === 1);
});

test('dólares: un producto en U$S se cobra en dólares, con la cotización del día', () => {
  const d = app.baseVacia();
  d.productos.push({ id: 'ta', codigo: 'TAL', barras: [], nombre: 'Taladro', unidad: 'unidad', stock: 5, minimo: 0, costo: 80, precio: 120, moneda: 'USD' });
  d.productos.push({ id: 'to', codigo: 'TOR', barras: [], nombre: 'Tornillo', unidad: 'unidad', stock: 50, minimo: 0, costo: 5, precio: 10 });
  app.abrirCaja(d, 1000, 'Ana', undefined, { inicialUSD: 50, cotizacion: 40 });
  assert.match(app.cobrar(d, [{ productoId: 'ta', cantidad: 1, precio: 120 }, { productoId: 'to', cantidad: 1, precio: 10 }], 'Efectivo', '', '').error, /pesos y en dólares/);
  assert.match(app.cobrar(d, [{ productoId: 'ta', cantidad: 1, precio: 120 }], 'Efectivo', '', '').error, /cotización/);
  const { venta } = app.cobrar(d, [{ productoId: 'ta', cantidad: 2, precio: 120 }], 'Efectivo', 300, '', undefined, 0, { cotizacion: 40 });
  assert.deepEqual([venta.moneda, venta.total, venta.cotizacion, venta.vuelto], ['USD', 240, 40, 60]);
  app.cobrar(d, [{ productoId: 'to', cantidad: 3, precio: 10 }], 'Efectivo', '', '');
  // Caja: pesos y dólares por separado
  const r = app.resumenCaja(d, d.cajas[0]);
  assert.deepEqual([r.esperado, r.total, r.usd.esperado, r.usd.total, r.ventas], [1030, 30, 290, 240, 2]);
  assert.match(app.cerrarCaja(d, 1030, 'Ana', '').error, /dólares/);
  const c = app.cerrarCaja(d, 1030, 'Ana', '', undefined, 280).caja;
  assert.deepEqual([c.diferencia, c.diferenciaUSD], [0, -10]);
  // Reportes: la venta en dólares se suma en pesos con su cotización
  const a = app.analisisVentas(d, 0, Date.now() + 1e9);
  assert.deepEqual([a.total, a.usd.total, a.usd.enPesos, a.ganancia], [9630, 240, 9600, 2*40*40 + 15]);
  assert.equal(app.$m(1234.5, 'USD'), 'U$S 1.234,50');
});

test('dólares: la columna Moneda de la planilla', () => {
  assert.deepEqual(['USD', 'U$S', 'dólares', 'us$', '$', 'pesos', 'UYU', '', 'x'].map(app.leerMoneda), ['USD', 'USD', 'USD', 'USD', 'UYU', 'UYU', 'UYU', null, null]);
  const d = app.baseVacia();
  app.aplicarImportacion(d, app.planImportacion(d, [{ 'Código': 'TAL', Producto: 'Taladro', Moneda: 'USD', Costo: 80, Precio: 120, Stock: 2 }, { 'Código': 'TOR', Producto: 'Tornillo', Precio: 10 }]));
  assert.deepEqual(d.productos.map((p) => [p.codigo, p.moneda || 'UYU', p.precio]), [['TAL', 'USD', 120], ['TOR', 'UYU', 10]]);
  // sin precio en la fila, la moneda no cambia
  app.aplicarImportacion(d, app.planImportacion(d, [{ 'Código': 'TAL', Producto: 'Taladro', Moneda: 'UYU', Stock: 3 }]));
  assert.equal(d.productos[0].moneda, 'USD');
  app.aplicarImportacion(d, app.planImportacion(d, [{ 'Código': 'TAL', Producto: 'Taladro', Moneda: 'pesos', Precio: 4900 }]));
  assert.deepEqual([d.productos[0].moneda, d.productos[0].precio], [undefined, 4900]);
});

test('dólares: el ticket impreso muestra lo recibido y el vuelto en la moneda de la venta', () => {
  const venta = { numero: 7, fecha: new Date().toISOString(), items: [{ nombre: 'Taladro', unidad: 'unidad', cantidad: 1, precio: 120, subtotal: 120 }],
    subtotal: 120, total: 120, moneda: 'USD', cotizacion: 40, medio: 'Efectivo', recibido: 150, vuelto: 30 };
  const html = app.htmlTicket(venta);
  assert.match(html, /Recibido<\/span><span>U\$S 150,00/);
  assert.match(html, /Vuelto<\/span><span>U\$S 30,00/);
  const enPesos = app.htmlTicket({ ...venta, moneda: undefined, cotizacion: undefined });
  assert.doesNotMatch(enPesos, /U\$S/);
});

test('el ticket sin nombre de negocio usa el nombre del programa', () => {
  assert.match(app.htmlTicket({ numero: 1, fecha: new Date().toISOString(), items: [], subtotal: 0, total: 0, medio: 'Efectivo', recibido: null }), /Grupo Muros/);
});

test('celular: etiqueta TSPL para la etiquetadora (mismo código de barras que el programa)', () => {
  const E = require('../js/etiqueta-tspl.js');
  const CB = require('../js/codigo-barras.js');
  assert.equal(E.ascii('Caño ½" PVC — 3ª'), "Cano 1/2' PVC 3");
  for (const [a, h] of [[50, 25], [40, 30], [60, 40], [100, 50], [100, 150]]) {
    const d = E.disenoEtiqueta({ nombre: 'Taladro percutor 800 W Makawa con maletín', codigo: '7790001234567', ubicacion: 'V-1' }, { ancho: a, alto: h });
    const [W, H] = d.puntos;
    assert.equal(W, a * 8);
    // todo adentro de la etiqueta
    for (const b of d.barras) assert.ok(b.x >= 0 && b.x + b.w <= W && b.y >= 0 && b.y + b.h <= H, `barra fuera en ${a}x${h}`);
    for (const t of d.textos) assert.ok(t.x >= 0 && t.x + t.texto.length * E.FUENTES[t.fuente][0] <= W && t.y + E.FUENTES[t.fuente][1] <= H, `texto fuera en ${a}x${h}: ${t.texto}`);
    // las barras son exactamente las del código de barras del programa (EAN-13 si sale más grueso, si no Code 128),
    // con un punto menos de ancho cuando la barra fina tiene 3 o más (la impresora térmica las engorda)
    const coincide = [CB.anchos('7790001234567'), CB.anchos128('7790001234567')].some((lista) => {
      const barras = lista.filter((_, i) => i % 2 === 0);
      return [0, 1].some((afinar) => {
        const fino = (d.barras[0].w + afinar) / barras[0];
        return Number.isInteger(fino) && fino >= 2 && (afinar === 0) === (fino < 3)
          && d.barras.length === barras.length && d.barras.every((b, i) => b.w + afinar === barras[i] * fino);
      });
    });
    assert.ok(coincide, `barras del código del programa, de al menos 2 puntos, en ${a}x${h}`);
  }
  const t = E.tspl(E.disenoEtiqueta({ nombre: 'Gancho "S"', codigo: 'C1-0002', ubicacion: 'B-2' }, { ancho: 50, alto: 25 }), { copias: 3, separacion: 3, oscuridad: 10 });
  assert.match(t, /^SIZE 50 mm,25 mm\r\nGAP 3 mm,0 mm\r\nDENSITY 10\r\n/);
  assert.match(t, /TEXT \d+,\d+,"2",0,1,1,"Gancho 'S'"/);
  assert.match(t, /PRINT 1,3\r\n$/);
  assert.match(E.tsplPrueba({ ancho: 50, alto: 25 }), /BOX 4,4,396,196,3/);
  // corrida y girada (impresoras que no la ponen justo en la etiqueta)
  const p = E.tsplPrueba({ ancho: 58, alto: 40 }, { correrX: 5, correrY: -1, girar: true });
  assert.match(p, /SIZE 58 mm,40 mm/);
  assert.match(p, /DIRECTION 0\r\n/);
  assert.match(p, /BOX 44,0,500,308,3/);
  assert.match(E.tsplPrueba({ ancho: 50, alto: 25 }), /DIRECTION 1\r\n/);
  // área del ancho del cabezal (72 mm) para poder correr el dibujo sin que dé la vuelta
  assert.match(E.tsplPrueba({ ancho: 50, alto: 40 }, { cabezal: 72, correrX: 15 }), /SIZE 72 mm,40 mm[\s\S]*BOX 124,4,516,316,3/);
  assert.match(E.tsplPrueba({ ancho: 100, alto: 50 }, { cabezal: 72 }), /SIZE 100 mm,50 mm/);
  const regla = E.tsplRegla({ cabezal: 72, alto: 40, correrX: 9 });
  assert.match(regla, /^SIZE 72 mm,40 mm/);
  assert.match(regla, /TEXT 403,96,"2",0,1,1,"50"/);
  assert.equal((regla.match(/^BAR /gm) || []).length, 74);
  const corrida = E.tspl(E.disenoEtiqueta({ nombre: 'X', codigo: '7790001234567' }, { ancho: 50, alto: 25 }), { correrX: -40 });
  assert.ok(!/-\d/.test(corrida.replace(/C1-|PRUEBA-/g, '')), 'sin coordenadas negativas');
});

test('celular + Cargador: las dos planillas se importan juntas sin duplicar', () => {
  const d = app.baseVacia();
  d.productos.push({ id: 'ag', codigo: 'P-0001', barras: ['7730123456789'], nombre: 'Agua 2 L', unidad: 'unidad', stock: 3, minimo: 0, costo: 40, precio: 80 });
  // Planilla del Cargador (PC): lo que ya tenía código de barras, contado
  const cargador = [
    { 'Código': 'P-0001', 'Códigos de barras': '7730123456789', Producto: 'Agua 2 L', Stock: 12, Precio: '', Contado: 'Sí' },
    { 'Código': '7790001234567', Producto: 'Taladro', Ubicación: 'V-1', Categoría: 'Herramientas', Stock: 2, Precio: 4900, Contado: 'Sí' },
  ];
  // Planilla del celular: lo suelto, con códigos propios del celular C1
  const celular = [
    { 'Código': 'C1-0001', Producto: 'Arandela plana 8 mm', Ubicación: 'B-2', Categoría: 'Bulonería', Stock: 200, Moneda: 'UYU', Precio: 5, Contado: 'Sí' },
    { 'Código': 'C1-0002', Producto: 'Gancho S', Ubicación: 'B-2', Categoría: 'Bulonería', Stock: 1, Moneda: 'UYU', Precio: 30, Contado: 'Sí' },
  ];
  app.aplicarImportacion(d, app.planImportacion(d, cargador));
  app.aplicarImportacion(d, app.planImportacion(d, celular));
  // Importar otra vez la del celular no duplica
  app.aplicarImportacion(d, app.planImportacion(d, celular));
  assert.deepEqual(d.productos.map((p) => [p.codigo, p.stock]).sort(), [['7790001234567', 2], ['C1-0001', 200], ['C1-0002', 1], ['P-0001', 12]]);
  assert.deepEqual(app.estantesDe(d).map((e) => [e.codigo, e.categoria]).sort(), [['B-2', 'Bulonería'], ['V-1', 'Herramientas']]);
  // Lo del celular se puede escanear con la etiqueta que imprimió
  assert.equal(app.dondeEsta(d, 'C1-0001').producto.nombre, 'Arandela plana 8 mm');
});

test('PC: etiquetas directo a la etiquetadora (TSPL, igual que el celular)', () => {
  global.EtiquetaTSPL = require('../js/etiqueta-tspl.js');
  try {
    const p = { id: 'x', codigo: 'P-0007', barras: ['7791293049632'], nombre: 'Desodorante', ubicacion: 'A-01' };
    const it = app.itemEtiquetadora({ producto: p });
    assert.equal(it.nombre, 'Desodorante');
    assert.equal(it.ubicacion, 'A-01');
    assert.ok(it.codigo);
    const u = app.itemEtiquetadora({ ubicacion: { ubicacion: 'A-02', categoria: 'Pinturas', corto: 'U2', clave: 'a-02', productos: [] } });
    assert.deepEqual(u, { qr: true, nombre: 'Pinturas', codigo: 'U2', ubicacion: 'A-02' });
    const t = app.tsplEtiquetas([{ producto: p, copias: 3 }, { producto: p, copias: 0 }, { ubicacion: { ubicacion: 'A-02', corto: 'U2', clave: 'a-02', productos: [] }, copias: 1 }],
      { ancho: 50, alto: 40 }, { separacion: 2, oscuridad: 9, correrX: 1 });
    assert.equal((t.match(/^SIZE 50 mm,40 mm/gm) || []).length, 2);
    assert.match(t, /PRINT 1,3\r\n/);
    assert.match(t, /PRINT 1,1\r\n$/);
    assert.match(t, /DENSITY 9/);
    assert.match(t, /"A-02"/);
    assert.match(t, /"Ubicacion"/);
  } finally { delete global.EtiquetaTSPL; }
});

test('etiqueta de estante: QR con el número corto, cuadradito por cuadradito', () => {
  const T = require('../js/etiqueta-tspl.js');
  for (const [ancho, alto] of [[50, 40], [50, 25], [40, 30], [100, 50]]) {
    const d = T.disenoEtiqueta({ qr: true, codigo: 'U12', ubicacion: 'B-3', nombre: 'Bulonería' }, { ancho, alto });
    assert.ok(d.qr, 'es la de estante');
    const { n, negro } = T.modulosQR('U12');
    // Se arma de nuevo la grilla con las barras (cada barra es una tira de cuadraditos de una fila)
    const mod = Math.min(...d.barras.map((b) => b.h));
    const x0 = Math.min(...d.barras.map((b) => b.x)), y0 = Math.min(...d.barras.map((b) => b.y));
    const grilla = Array.from({ length: n }, () => Array(n).fill(false));
    for (const b of d.barras) {
      assert.equal(b.h, mod);
      for (let c = 0; c < b.w / mod; c++) grilla[(b.y - y0) / mod][(b.x - x0) / mod + c] = true;
    }
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) assert.equal(grilla[f][c], negro(f, c), `${ancho}x${alto} módulo ${f},${c}`);
    assert.ok(mod >= 3, `${ancho}x${alto}: cuadraditos de ${mod} puntos (se leen bien desde 3)`);
    // El QR entra en la etiqueta y el estante va escrito al lado
    for (const b of d.barras) assert.ok(b.x + b.w <= d.puntos[0] && b.y + b.h <= d.puntos[1]);
    assert.ok(d.textos.some((t) => t.texto === 'B-3'));
    assert.ok(d.textos.every((t) => t.x > Math.max(...d.barras.map((b) => b.x + b.w))), 'el texto no pisa el QR');
  }
  // La de producto sigue con código de barras
  assert.ok(!T.disenoEtiqueta({ codigo: 'C1-0007', nombre: 'Arandela', ubicacion: 'B-3' }, { ancho: 50, alto: 40 }).qr);
});

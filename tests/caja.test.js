// Pruebas de la sección Caja y ventas: devoluciones parciales (js/logica/ventas-y-stock.js y js/logica/caja.js).
// Las funciones de js/ quedan globales al cargarlas (igual que en el navegador): se usan sin module.exports.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/cargar-en-node.js');

/* global baseVacia, abrirCaja, cerrarCaja, cajaAbierta, cobrar, anularVenta, devolverVenta, devueltoDe, devolucionesDe, esDevolucion, resumenCaja */
function local() {
  const d = baseVacia();
  d.productos.push(
    { id: 'tor', codigo: 'TOR-81', barras: [], nombre: 'Tornillo 8 x 1', categoria: 'Tornillería', unidad: 'unidad', costo: 2, precio: 5, minimo: 10, stock: 100 },
    { id: 'cem', codigo: 'CEM-25', barras: [], nombre: 'Cemento 25 kg', categoria: 'Obra', unidad: 'bolsa', costo: 300, precio: 450, minimo: 2, stock: 10 },
    { id: 'tal', codigo: 'TAL-13', barras: [], nombre: 'Taladro 13 mm', categoria: 'Herramientas', unidad: 'unidad', costo: 40, precio: 80, minimo: 1, stock: 3, moneda: 'USD' },
  );
  abrirCaja(d, 1000, 'Ale');
  return d;
}
const stock = (d, id) => d.productos.find((p) => p.id === id).stock;

test('devolver una parte: repone el stock, resta la plata de la caja y no toca la venta original', () => {
  const d = local();
  const { venta } = cobrar(d, [{ productoId: 'tor', cantidad: 10, precio: 5 }, { productoId: 'cem', cantidad: 2, precio: 450 }], 'Efectivo', '', '', null);
  assert.equal(stock(d, 'tor'), 90);
  const original = JSON.stringify(venta);
  const r = devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 3 }], 'Efectivo', 'Ale');
  assert.ifError(r.error);
  const dev = r.devolucion;
  assert.equal(esDevolucion(dev), true);
  assert.equal(dev.ventaOriginal, venta.id);
  assert.equal(dev.numero, venta.numero + 1);
  assert.equal(dev.total, -15);
  assert.deepEqual(dev.items.map((it) => [it.productoId, it.cantidad, it.subtotal]), [['tor', -3, -15]]);
  assert.equal(stock(d, 'tor'), 93);
  assert.equal(stock(d, 'cem'), 8);
  assert.equal(JSON.stringify(venta), original, 'la venta original queda igual');
  const mov = d.movimientos.at(-1);
  assert.equal(mov.tipo, 'entrada'); assert.equal(mov.origen, 'devolucion'); assert.equal(mov.ventaId, dev.id); assert.equal(mov.cantidad, 3);
  // Caja: 1000 + 950 cobrados − 15 devueltos
  const res = resumenCaja(d, cajaAbierta(d));
  assert.equal(res.esperado, 1935);
  assert.equal(res.ventas, 1);
  assert.equal(res.devoluciones, 1);
  assert.equal(res.total, 935);
});

test('se puede devolver el resto, pero no más de lo vendido', () => {
  const d = local();
  const { venta } = cobrar(d, [{ productoId: 'tor', cantidad: 10, precio: 5 }], 'Efectivo', '', '', null);
  assert.ifError(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 4 }], 'Efectivo').error);
  assert.match(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 7 }], 'Efectivo').error, /hasta 6 unidad/);
  assert.ifError(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 6 }], 'Efectivo').error);
  assert.deepEqual(devueltoDe(d, venta), { 0: 10 });
  assert.match(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo').error, /ya se devolvió entero/);
  assert.equal(stock(d, 'tor'), 100);
  assert.equal(devolucionesDe(d, venta).length, 2);
});

test('el descuento de la venta se reparte: se devuelve lo que el cliente pagó por esos productos', () => {
  const d = local();
  const { venta } = cobrar(d, [{ productoId: 'cem', cantidad: 2, precio: 450 }], 'Débito', '', '', null, 10);
  assert.equal(venta.total, 810);
  const { devolucion } = devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 1 }], 'Débito');
  assert.equal(devolucion.subtotal, -450);
  assert.equal(devolucion.total, -405);
  assert.equal(devolucion.descuento, -45);
});

test('se puede devolver con otro medio: una venta con tarjeta devuelta en efectivo baja el efectivo esperado', () => {
  const d = local();
  const { venta } = cobrar(d, [{ productoId: 'cem', cantidad: 1, precio: 450 }], 'Crédito', '', '', null);
  const { devolucion } = devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo');
  assert.equal(devolucion.medio, 'Efectivo');
  const res = resumenCaja(d, cajaAbierta(d));
  assert.equal(res.esperado, 550);
  assert.equal(res.porMedio['Crédito'], 450);
  assert.equal(res.porMedio.Efectivo, -450);
});

test('una venta de una caja ya cerrada se devuelve en la caja de hoy', () => {
  const d = local();
  const { venta } = cobrar(d, [{ productoId: 'tor', cantidad: 4, precio: 5 }], 'Efectivo', '', '', null);
  cerrarCaja(d, 1020, 'Ale', '');
  assert.match(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo').error, /Abrí la caja/);
  abrirCaja(d, 500, 'Ale');
  const { devolucion } = devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 2 }], 'Efectivo');
  assert.equal(devolucion.cajaId, cajaAbierta(d).id);
  assert.equal(resumenCaja(d, cajaAbierta(d)).esperado, 490);
});

test('venta en dólares: la devolución va en dólares, con la cotización de la venta', () => {
  const d = local();
  const { venta } = cobrar(d, [{ productoId: 'tal', cantidad: 2, precio: 80 }], 'Efectivo', '', '', null, 0, { cotizacion: 40 });
  const { devolucion } = devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo');
  assert.equal(devolucion.moneda, 'USD');
  assert.equal(devolucion.cotizacion, 40);
  assert.equal(devolucion.total, -80);
  const usd = resumenCaja(d, cajaAbierta(d)).usd;
  assert.equal(usd.ventasEfectivo, 80);
  assert.equal(usd.ventas, 1);
});

test('no se devuelve una venta anulada, ni se anula una venta con devoluciones, ni una devolución', () => {
  const d = local();
  const a = cobrar(d, [{ productoId: 'tor', cantidad: 2, precio: 5 }], 'Efectivo', '', '', null).venta;
  assert.equal(anularVenta(d, a.id), null);
  assert.match(devolverVenta(d, a.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo').error, /anulada/);
  const b = cobrar(d, [{ productoId: 'tor', cantidad: 2, precio: 5 }], 'Efectivo', '', '', null).venta;
  const { devolucion } = devolverVenta(d, b.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo');
  assert.match(anularVenta(d, b.id), /ya tiene devoluciones/);
  assert.match(anularVenta(d, devolucion.id), /no se anula/);
  assert.match(devolverVenta(d, devolucion.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo').error, /ya es una devolución/);
});

test('devolución: pedidos mal armados dan error y no tocan nada', () => {
  const d = local();
  const { venta } = cobrar(d, [{ productoId: 'tor', cantidad: 5, precio: 5 }], 'Efectivo', '', '', null);
  const antes = JSON.stringify(d);
  assert.match(devolverVenta(d, venta.id, [], 'Efectivo').error, /Escribí cuánto/);
  assert.match(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 0 }], 'Efectivo').error, /Escribí cuánto/);
  assert.match(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: -2 }], 'Efectivo').error, /Revisá la cantidad/);
  assert.match(devolverVenta(d, venta.id, [{ renglon: 5, cantidad: 1 }], 'Efectivo').error, /Revisá los productos/);
  assert.match(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 1 }, { renglon: 0, cantidad: 1 }], 'Efectivo').error, /Revisá los productos/);
  assert.match(devolverVenta(d, venta.id, [{ renglon: 0, cantidad: 1 }], '').error, /Elegí cómo/);
  assert.match(devolverVenta(d, 'no-existe', [{ renglon: 0, cantidad: 1 }], 'Efectivo').error, /no existe/);
  assert.equal(JSON.stringify(d), antes);
});

/* global NOMBRE_SIN_REGISTRAR, analisisVentas */
test('producto sin registrar: se cobra y sale en la venta, sin crear producto ni mover stock', () => {
  const d = local();
  const productos = d.productos.length;
  const movs = d.movimientos.length;
  const r = cobrar(d, [
    { productoId: 'tor', cantidad: 4, precio: 5 },
    { libre: true, nombre: '  Bisagra vieja  ', precio: 120, cantidad: 2, moneda: 'UYU', codigo: '779123' },
    { libre: true, nombre: '', precio: 50, cantidad: 1, moneda: 'UYU' },
  ], 'Efectivo', '');
  assert.ok(r.venta, r.error);
  assert.equal(r.venta.total, 20 + 240 + 50);
  assert.equal(d.productos.length, productos, 'no se crea ningún producto');
  assert.equal(d.movimientos.length, movs + 1, 'solo el tornillo mueve stock');
  assert.equal(stock(d, 'tor'), 96);
  const [, b, c] = r.venta.items;
  assert.deepEqual([b.libre, b.nombre, b.codigo, b.productoId, b.subtotal, b.costo], [true, 'Bisagra vieja', '779123', '', 240, 0]);
  assert.equal(c.nombre, NOMBRE_SIN_REGISTRAR, 'sin nombre: «Producto sin registrar»');
  // Validaciones
  assert.match(cobrar(d, [{ libre: true, nombre: 'X', precio: 0, cantidad: 1 }], 'Efectivo', '').error, /precio/);
  assert.match(cobrar(d, [{ libre: true, nombre: 'X', precio: 10, cantidad: 0 }], 'Efectivo', '').error, /cantidad/);
  assert.match(cobrar(d, [{ productoId: 'tal', cantidad: 1, precio: 80 }, { libre: true, precio: 10, cantidad: 1, moneda: 'UYU' }], 'Efectivo', '', '', undefined, 0, { cotizacion: 40 }).error, /pesos y en dólares/);
  // Un ticket todo sin registrar, en dólares
  assert.equal(cobrar(d, [{ libre: true, precio: 15, cantidad: 1, moneda: 'USD' }], 'Efectivo', '', '', undefined, 0, { cotizacion: 40 }).venta.moneda, 'USD');
});

test('producto sin registrar: anular y devolver no tocan stock; en los reportes va junto', () => {
  const d = local();
  const v = cobrar(d, [{ productoId: 'cem', cantidad: 1, precio: 450 }, { libre: true, nombre: 'Varios', precio: 100, cantidad: 3, moneda: 'UYU' }], 'Efectivo', '').venta;
  const movs = d.movimientos.length;
  const dev = devolverVenta(d, v.id, [{ renglon: 1, cantidad: 1 }], 'Efectivo', 'Ale');
  assert.ok(dev.devolucion || dev.venta || !dev.error, dev.error);
  assert.equal(d.movimientos.length, movs, 'devolver lo sin registrar no mueve stock');
  cobrar(d, [{ libre: true, nombre: 'Otra cosa', precio: 30, cantidad: 1, moneda: 'UYU' }], 'Débito', '');
  const ahora = Date.now();
  const a = analisisVentas(d, ahora - 60000, ahora + 60000);
  const sr = Object.values(a.porProducto).filter((x) => x.nombre === 'Productos sin registrar');
  assert.equal(sr.length, 1, 'todos los sin registrar en un solo renglón');
  assert.equal(stock(d, 'cem'), 9);
  const v2 = cobrar(d, [{ productoId: 'cem', cantidad: 1, precio: 450 }, { libre: true, precio: 70, cantidad: 1, moneda: 'UYU' }], 'Efectivo', '').venta;
  assert.equal(stock(d, 'cem'), 8);
  assert.equal(anularVenta(d, v2.id), null);
  assert.equal(stock(d, 'cem'), 9, 'anular repone solo el producto registrado');
});

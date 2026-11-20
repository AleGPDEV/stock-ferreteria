// Pruebas de Reportes (js/logica/reportes.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

/* global cantidadPedido, armarPedidos, factorPesos */
function conProveedores() {
  const d = app.baseVacia();
  d.proveedores.push({ id: 'z', nombre: 'Uruimporta' }, { id: 'a', nombre: 'Bulonera Sur', telefono: '099 123 456' });
  d.productos.push(
    { id: 't', codigo: 'TOR', nombre: 'Tornillo 8', unidad: 'caja', proveedorId: 'a', costo: 100, precio: 180, minimo: 5, stock: 2 },
    { id: 'c', codigo: 'CLA', nombre: 'Clavo 2"', unidad: 'kg', proveedorId: 'a', costo: 50, precio: 90, minimo: 2.5, stock: 1 },
    { id: 'l', codigo: 'LLA', nombre: 'Llave térmica', unidad: 'unidad', proveedorId: 'z', costo: 10, precio: 20, minimo: 0, stock: 0, moneda: 'USD' },
    { id: 's', codigo: 'SIN', nombre: 'Sin proveedor', unidad: 'unidad', proveedorId: '', costo: 5, precio: 9, minimo: 3, stock: 3 },
    { id: 'ok', codigo: 'OK', nombre: 'Con stock', unidad: 'unidad', proveedorId: 'a', costo: 5, precio: 9, minimo: 1, stock: 20 },
  );
  d.cotizacion = 40;
  return d;
}

test('pedido: cantidad sugerida = mínimo × 2 − stock, hacia arriba, al menos 1 (#15)', () => {
  assert.equal(cantidadPedido({ minimo: 5, stock: 2 }), 8);
  assert.equal(cantidadPedido({ minimo: 2.5, stock: 1 }), 4);   // 4 justo
  assert.equal(cantidadPedido({ minimo: 2.5, stock: 1.5 }), 4); // 3,5 → 4
  assert.equal(cantidadPedido({ minimo: 0, stock: 0 }), 1);     // sin stock y sin mínimo: se pide 1
  assert.equal(cantidadPedido({ minimo: 3, stock: -2 }), 8);    // stock negativo (vendido sin stock)
  assert.equal(cantidadPedido({ minimo: 0.1, stock: 0.1 + 0.0000001 }), 1);
});

test('pedido: agrupado por proveedor, ordenado, sin proveedor al final, cantidades editables y costo estimado (#15)', () => {
  const d = conProveedores();
  const cot = factorPesos(d, d.productos[2]);
  assert.equal(cot, 40);
  const g = armarPedidos(d);
  assert.deepEqual(g.map((x) => x.nombre), ['Bulonera Sur', 'Uruimporta', 'Sin proveedor']);
  assert.deepEqual(g[0].items.map((it) => [it.producto.id, it.cantidad]), [['c', 4], ['t', 8]]); // por nombre
  assert.equal(g[0].total, 4 * 50 + 8 * 100);
  assert.equal(g[0].proveedor.telefono, '099 123 456');
  assert.equal(g[1].items[0].costo, 10 * cot, 'lo de dólares, en pesos');
  assert.equal(g[2].proveedor, null);
  assert.ok(!g.some((x) => x.items.some((it) => it.producto.id === 'ok')), 'lo que tiene stock no va');
  // Cambiar a mano: 0 lo deja en el pedido con costo 0 (la pantalla lo saca); la sugerida no cambia
  const e = armarPedidos(d, { t: 3, c: 0 });
  assert.deepEqual(e[0].items.map((it) => [it.producto.id, it.sugerida, it.cantidad, it.costo]), [['c', 4, 0, 0], ['t', 8, 3, 300]]);
  assert.equal(e[0].total, 300);
  assert.equal(armarPedidos(d, { t: -5 })[0].items[1].cantidad, 0, 'nunca negativo');
});

/* ---------- Mudadas de tests/logica.test.js (tarea #23), sin cambios ---------- */
function base() {
  const d = app.baseVacia();
  d.productos.push(
    { id: 'a', codigo: 'MAR-16', nombre: 'Martillo 16 oz', categoria: 'Herramientas', unidad: 'unidad', proveedorId: 'v1', ubicacion: 'C-02', costo: 390, precio: 620, minimo: 4, stock: 10 },
    { id: 'b', codigo: 'CAB-25', nombre: 'Cable 2,5 mm²', categoria: 'Electricidad', unidad: 'm', proveedorId: '', ubicacion: '', costo: 28, precio: 48, minimo: 100, stock: 300 },
  );
  d.proveedores.push({ id: 'v1', nombre: 'Herramientas Sur', contacto: '', telefono: '', email: '', rut: '', notas: '' });
  return d;
}

test('QA 15 y 16: compras sin stock inicial; ganancia sin productos sin costo', () => {
  const d = base();
  app.registrar(d, { tipo: 'entrada', productoId: 'a', cantidad: 5, costoUnit: 400, nota: 'Stock inicial', origen: 'inicial' });
  app.registrar(d, { tipo: 'entrada', productoId: 'a', cantidad: 5, costoUnit: 400, nota: 'Stock inicial (importado)' });
  app.registrar(d, { tipo: 'entrada', productoId: 'a', cantidad: 2, costoUnit: 400, nota: 'Factura 12' });
  assert.equal(app.totalCompras(d.movimientos), 800);
  d.productos[1].costo = 0;
  const v = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }, { productoId: 'b', cantidad: 10, precio: 48 }], 'Débito', '', '', undefined, 10).venta;
  const g = app.gananciaBruta([v]);
  assert.equal(g.ganancia, 158); // 620 × 0,9 − 400
  assert.equal(g.sinCosto, 1);
  assert.equal(g.vendidoSinCosto, 432);
});

test('reportes: análisis de ventas por medio, vendedor, categoría y producto, con el descuento repartido', () => {
  const d = base();
  const ahora = Date.now();
  const v1 = app.cobrar(d, [{ productoId: 'a', cantidad: 2, precio: 620 }, { productoId: 'b', cantidad: 10, precio: 48 }], 'Efectivo', '', '', undefined, 10).venta;
  v1.usuario = 'Ana';
  const v2 = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Débito', '').venta;
  v2.usuario = 'Beto';
  const r = app.analisisVentas(d, ahora - 60000, ahora + 60000);
  assert.equal(r.cantidad, 2);
  assert.equal(r.total, 1548 + 620);
  assert.equal(r.porMedio.Efectivo.total, 1548);
  assert.equal(r.porVendedor.Ana.cant, 1);
  assert.equal(r.porVendedor.Beto.total, 620);
  const ma = r.porProducto.a;
  assert.equal(ma.cant, 3);
  assert.equal(ma.vendido, 1116 + 620); // 1240 con 10 % de descuento + 620
  assert.equal(ma.ganancia, 1736 - 3 * 390);
  const cat = r.porCategoria[d.productos[0].categoria || 'Sin categoría'];
  assert.ok(cat.vendido >= 1736);
  assert.equal(r.ticketPromedio, 1084);
  // una venta anulada no cuenta
  app.anularVenta(d, v2.id);
  assert.equal(app.analisisVentas(d, ahora - 60000, ahora + 60000).cantidad, 1);
});

test('reportes: serie por día o por mes según el largo del período', () => {
  const desde = new Date(2026, 9, 1).getTime(), hasta = new Date(2026, 9, 31, 23, 59).getTime();
  const s = app.serieVentas({ '2026-10-05': 100, '2026-10-06': 50 }, desde, hasta);
  assert.equal(s.escala, 'día');
  assert.equal(s.serie.length, 27, 'los 4 domingos sin ventas no se muestran');
  assert.equal(s.serie.find((x) => x.clave === '2026-10-05').total, 100);
  const m = app.serieVentas({ '2026-02-05': 100, '2026-10-06': 50 }, new Date(2026, 0, 1).getTime(), hasta);
  assert.equal(m.escala, 'mes');
  assert.equal(m.serie.length, 10);
  assert.equal(m.serie[1].total, 100);
});

test('reportes: mercadería parada (con stock, sin ventas en N días, sin contar lo recién cargado)', () => {
  const d = base();
  const DIA = 864e5, ahora = Date.now();
  // el martillo se cargó hace 200 días y se vendió hace 120; el otro se cargó hace 10 días
  d.movimientos.push({ id: 'm1', productoId: 'a', fecha: new Date(ahora - 200 * DIA).toISOString(), tipo: 'entrada', cantidad: 10 });
  d.movimientos.push({ id: 'm2', productoId: 'b', fecha: new Date(ahora - 10 * DIA).toISOString(), tipo: 'entrada', cantidad: 50 });
  d.ventas.push({ id: 'v', fecha: new Date(ahora - 120 * DIA).toISOString(), items: [{ productoId: 'a', cantidad: 1 }], total: 620 });
  const p = app.mercaderiaParada(d, 90, ahora);
  assert.deepEqual(p.map((x) => x.p.id), ['a']);
  assert.equal(p[0].diasSinVenta, 120);
  assert.equal(p[0].valorCosto, 10 * 390);
  assert.equal(app.mercaderiaParada(d, 180, ahora).length, 0, 'se vendió hace 120 días');
});

test('períodos: un día se mueve de a un día, un mes de a un mes y una franja de a su largo; no pasa de hoy', () => {
  const hoy = '2026-11-11';
  assert.deepEqual(app.moverPeriodo('2026-11-10', '2026-11-10', -1, hoy), { desde: '2026-11-09', hasta: '2026-11-09' });
  assert.deepEqual(app.moverPeriodo('2026-11-10', '2026-11-10', 1, hoy), { desde: '2026-11-11', hasta: '2026-11-11' });
  assert.equal(app.moverPeriodo('2026-11-11', '2026-11-11', 1, hoy), null, 'mañana no');
  assert.deepEqual(app.moverPeriodo('2026-03-01', '2026-03-01', -1, hoy), { desde: '2026-02-28', hasta: '2026-02-28' });
  assert.deepEqual(app.moverPeriodo('2026-10-01', '2026-10-31', -1, hoy), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(app.moverPeriodo('2026-10-01', '2026-10-31', 1, hoy), { desde: '2026-11-01', hasta: '2026-11-11' }, 'el mes en curso llega hasta hoy');
  assert.deepEqual(app.moverPeriodo('2026-11-01', '2026-11-11', -1, hoy), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(app.moverPeriodo('2026-10-05', '2026-10-11', 1, hoy), { desde: '2026-10-12', hasta: '2026-10-18' });
});

test('períodos: con qué se compara', () => {
  const hoy = '2026-11-11';
  const d = app.periodoComparable('2026-11-07', '2026-11-07', hoy); // sábado
  assert.deepEqual([d.desde, d.hasta], ['2026-10-31', '2026-10-31']);
  assert.equal(d.texto, 'vs. el sábado anterior');
  const m = app.periodoComparable('2026-10-01', '2026-10-31', hoy);
  assert.deepEqual([m.desde, m.hasta, m.texto], ['2026-09-01', '2026-09-30', 'vs. septiembre']);
  const encurso = app.periodoComparable('2026-11-01', '2026-11-11', hoy);
  assert.deepEqual([encurso.desde, encurso.hasta], ['2026-10-01', '2026-10-11']);
  const marzo = app.periodoComparable('2026-03-01', '2026-03-31', hoy);
  assert.deepEqual([marzo.desde, marzo.hasta], ['2026-02-01', '2026-02-28']);
  const f = app.periodoComparable('2026-10-05', '2026-10-11', hoy);
  assert.deepEqual([f.desde, f.hasta, f.texto], ['2026-09-28', '2026-10-04', 'vs. los 7 días anteriores']);
});

test('tablero: tramos de crecimiento al día elegido', () => {
  const t = app.tramosCrecimiento('2026-10-15'); // jueves
  const por = Object.fromEntries(t.map((x) => [x.clave, x]));
  assert.deepEqual([por.dia.antDesde, por.dia.antHasta], ['2026-10-08', '2026-10-08']);
  assert.deepEqual([por.semana.desde, por.semana.antDesde, por.semana.antHasta], ['2026-10-12', '2026-10-05', '2026-10-08']);
  assert.deepEqual([por.mes.desde, por.mes.antDesde, por.mes.antHasta], ['2026-10-01', '2026-09-01', '2026-09-15']);
  assert.deepEqual([por.anio.desde, por.anio.antDesde, por.anio.antHasta], ['2026-01-01', '2025-01-01', '2025-10-15']);
  const fin = Object.fromEntries(app.tramosCrecimiento('2026-03-31').map((x) => [x.clave, x]));
  assert.equal(fin.mes.antHasta, '2026-02-28', 'el mes anterior más corto no se pasa');
});

test('tablero: subas y bajas ordenadas, y lo nuevo sin porcentaje', () => {
  const r = app.subasYBajas({ a: { nombre: 'A', vendido: 300 }, b: { nombre: 'B', vendido: 50 }, c: { nombre: 'C', vendido: 80 } },
    { a: { nombre: 'A', vendido: 100 }, b: { nombre: 'B', vendido: 200 }, d: { nombre: 'D', vendido: 40 } });
  assert.deepEqual(r.map((x) => x.clave), ['a', 'c', 'd', 'b']);
  assert.equal(r[0].pct, 200);
  assert.equal(r.find((x) => x.clave === 'c').pct, null, 'no se vendía antes');
  assert.equal(r.find((x) => x.clave === 'b').dif, -150);
});

test('reportes: un solo día se grafica por hora', () => {
  const ini = new Date(2026, 9, 15).getTime(), fin = new Date(2026, 9, 15, 23, 59, 59).getTime();
  const s = app.serieVentas({ '2026-10-15': 500 }, ini, fin, { '2026-10-15': 3 }, { 9: 200, 21: 300 }, { 9: 1, 21: 2 });
  assert.equal(s.escala, 'hora');
  assert.equal(s.serie[0].hora, 8);
  assert.equal(s.serie[s.serie.length - 1].hora, 21, 'se estira si hubo ventas tarde');
  assert.equal(s.serie.find((x) => x.hora === 21).cant, 2);
});

test('resumen del día: ventas, anuladas, comparación con la semana anterior y por hora', () => {
  const d = base();
  const v1 = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Efectivo', '').venta;
  const v2 = app.cobrar(d, [{ productoId: 'a', cantidad: 2, precio: 620 }], 'Débito', '').venta;
  const v3 = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 620 }], 'Efectivo', '').venta;
  const dia = '2026-10-15';
  v1.fecha = new Date(2026, 9, 15, 10, 5).toISOString();
  v2.fecha = new Date(2026, 9, 15, 17, 40).toISOString();
  v3.fecha = new Date(2026, 9, 8, 11, 0).toISOString(); // jueves anterior
  app.anularVenta(d, v2.id);
  const r = app.resumenDia(d, dia);
  assert.equal(r.a.cantidad, 1);
  assert.equal(r.a.total, 620);
  assert.equal(r.ventas.length, 2, 'la lista también muestra la anulada');
  assert.equal(r.anuladas.length, 1);
  assert.equal(r.totalAnulado, 1240);
  assert.equal(r.ant.total, 620, 'el jueves anterior');
  assert.equal(r.a.porHora[10], 620);
  assert.equal(r.comp.texto, 'vs. el jueves anterior');
});

test('tablero: promedio por día de la semana', () => {
  const d = base();
  const v = app.cobrar(d, [{ productoId: 'a', cantidad: 1, precio: 800 }], 'Efectivo', '').venta;
  v.fecha = new Date(2026, 10, 7, 10, 0).toISOString(); // sábado
  const sem = app.promedioPorDiaSemana(d, '2026-11-11', 2);
  assert.equal(sem[0].nombre, 'lunes');
  assert.equal(sem.find((x) => x.nombre === 'sábado').promedio, 400, '800 en 2 sábados');
  assert.ok(!sem.some((x) => x.nombre === 'domingo'), 'el domingo sin ventas no aparece');
});

// Pruebas de la lógica de stock, caja, precios e importación.  Correr con: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/app.js');

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

test('actualizar precios por categoría con redondeo', () => {
  const d = base();
  const r = app.actualizarPrecios(d, 'c:Herramientas', 12, { redondeo: 5 });
  assert.equal(r.cantidad, 1);
  assert.equal(d.productos[0].precio, 695); // 620 × 1,12 = 694,4 → 695
  assert.equal(d.productos[0].costo, 390);
  assert.equal(d.productos[1].precio, 48);
  app.actualizarPrecios(d, 'p:v1', -10, { costo: true });
  assert.equal(d.productos[0].precio, 625.5);
  assert.equal(d.productos[0].costo, 351);
  assert.ok(app.actualizarPrecios(d, '', 0).error);
  assert.ok(app.actualizarPrecios(d, '', -100).error);
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
  assert.equal(plan.nuevos.length, 2);
  assert.equal(plan.actualizados.length, 1);
  assert.equal(plan.salteadas, 2);
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

test('sha256 coincide con el de Node', () => {
  const { createHash } = require('node:crypto');
  for (const t of ['', 'abc', 'sal-123:1234', 'x'.repeat(200), 'ñandú']) {
    assert.equal(app.sha256(t), createHash('sha256').update(t, 'utf8').digest('hex'), t);
  }
});

test('la primera vez se crean administrador y empleado con PIN inicial', () => {
  const d = app.baseVacia();
  assert.equal(app.asegurarUsuarios(d), true);
  const [admin, emp] = d.usuarios;
  assert.equal(admin.rol, 'admin');
  assert.equal(emp.rol, 'empleado');
  assert.ok(app.verificarPin(admin, '1234'));
  assert.ok(app.verificarPin(emp, '0000'));
  assert.ok(!app.verificarPin(emp, '1234'));
  assert.ok(!JSON.stringify(d.usuarios).includes('"1234"'), 'el PIN no se guarda tal cual');
  assert.equal(app.asegurarUsuarios(d), false);
});

test('crear, editar y validar usuarios', () => {
  const d = app.baseVacia();
  app.asegurarUsuarios(d);
  const admin = d.usuarios[0];
  assert.match(app.guardarUsuario(d, { nombre: 'Carlos', rol: 'empleado', pin: '12' }).error, /4 a 6/);
  assert.match(app.guardarUsuario(d, { nombre: 'empleado', rol: 'empleado', pin: '5555' }).error, /Ya hay/);
  const { usuario } = app.guardarUsuario(d, { nombre: 'Carlos', rol: 'empleado', pin: '4321' });
  assert.ok(app.verificarPin(usuario, '4321'));
  // editar sin PIN no lo cambia
  app.guardarUsuario(d, { nombre: 'Carlos P.', rol: 'empleado', pin: '' }, usuario.id);
  assert.equal(usuario.nombre, 'Carlos P.');
  assert.ok(app.verificarPin(usuario, '4321'));
  // cambiar el PIN del admin saca la marca de PIN inicial
  app.guardarUsuario(d, { nombre: 'Administrador', rol: 'admin', pin: '908070' }, admin.id);
  assert.ok(app.verificarPin(admin, '908070'));
  assert.equal(admin.pinPorDefecto, false);
  // no puede quedar sin administrador
  assert.match(app.guardarUsuario(d, { nombre: 'Administrador', rol: 'empleado', pin: '' }, admin.id).error, /al menos un administrador/);
});

test('eliminar usuarios', () => {
  const d = app.baseVacia();
  app.asegurarUsuarios(d);
  const [admin, emp] = d.usuarios;
  assert.match(app.eliminarUsuario(d, admin.id, admin.id), /estás adentro/);
  assert.match(app.eliminarUsuario(d, admin.id, emp.id), /al menos un administrador/);
  assert.equal(app.eliminarUsuario(d, emp.id, admin.id), null);
  assert.equal(d.usuarios.length, 1);
});

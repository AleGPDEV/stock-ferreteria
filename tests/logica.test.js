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
  assert.deepEqual(app.cambiosStockImportacion(plan), [{ codigo: 'MAR-16', nombre: 'Martillo 16 oz', antes: 10, despues: 3 }]);
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

test('QA 6: el redondeo no dispara los precios baratos', () => {
  assert.equal(app.precioConAumento(2, 10, 10), 2.2);
  assert.equal(app.precioConAumento(8, 10, 10), 8.8);
  assert.equal(app.precioConAumento(3, 10, 5), 3.3);
  assert.equal(app.precioConAumento(45, 10, 5), 50, 'de 10 o más, al peso');
  assert.equal(app.precioConAumento(620, 12, 5), 695);
  assert.equal(app.precioConAumento(1000, 0.4, 10), 1000, 'nunca baja en una suba');
  assert.equal(app.precioConAumento(1000, -0.4, 10), 1000, 'nunca sube en una bajada');
  // el cambio real nunca se aleja más de 2,5 puntos (salvo centésimos)
  for (let precio = 0.5; precio < 3000; precio += 7.3) {
    for (const paso of [0, 1, 5, 10]) {
      const nuevo = app.precioConAumento(precio, 10, paso);
      const real = (nuevo / precio - 1) * 100;
      assert.ok(Math.abs(real - 10) <= 5.1, `${precio} paso ${paso} → ${nuevo} (${real.toFixed(1)} %)`);
    }
  }
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

test('QA 3: después de 5 PIN incorrectos hay que esperar', () => {
  const d = base();
  const t = 1_000_000;
  for (let i = 0; i < 4; i++) assert.equal(app.fallarPin(d, 'u1', t), 0);
  assert.ok(app.fallarPin(d, 'u1', t) > 0);
  assert.ok(app.esperaPin(d, 'u1', t + 1000) > 0);
  assert.equal(app.esperaPin(d, 'u1', t + 6 * 60 * 1000), 0);
  assert.ok(app.fallarPin(d, 'u1', t + 6 * 60 * 1000) > 0, 'otro error después de esperar vuelve a bloquear');
  app.acertarPin(d, 'u1');
  assert.equal(app.esperaPin(d, 'u1', t + 6 * 60 * 1000), 0);
  assert.equal(app.esperaPin(d, 'u2', t), 0);
});

test('QA 3: la clave de recuperación restablece el acceso del administrador', () => {
  const d = base();
  assert.equal(app.verificarRecuperacion(d, 'ABCD-EFGH-JKMN'), false, 'sin clave creada no entra nada');
  const clave = app.nuevaClaveRecuperacion(d);
  assert.match(clave, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.doesNotMatch(clave, /[01OIL]/, 'sin letras que se confunden');
  assert.ok(!JSON.stringify(d).includes(clave.replace(/-/g, '')), 'no se guarda tal cual');
  assert.equal(app.verificarRecuperacion(d, clave), true);
  assert.equal(app.verificarRecuperacion(d, clave.toLowerCase().replace(/-/g, ' ')), true, 'acepta minúsculas y espacios');
  assert.equal(app.verificarRecuperacion(d, clave.slice(0, -1) + (clave.endsWith('A') ? 'B' : 'A')), false);
  const otra = app.nuevaClaveRecuperacion(d);
  assert.notEqual(otra, clave);
  assert.equal(app.verificarRecuperacion(d, clave), false, 'la anterior deja de servir');
});

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

test('códigos de barras: un producto con código del proveedor también se encuentra por el código del paquete', () => {
  const d = base();
  const p = d.productos[0];
  assert.equal(app.buscarPorCodigo(d, '6901234567892'), null);
  assert.equal(app.asignarBarras(d, p, '6901234567892'), null);
  assert.equal(app.buscarPorCodigo(d, '6901234567892'), p);
  assert.equal(app.buscarPorCodigo(d, p.codigo.toLowerCase()), p, 'el código propio sigue sirviendo');
  assert.equal(app.asignarBarras(d, p, '6901234567892'), null, 'repetirlo en el mismo no es error');
  assert.equal(p.barras.length, 1);
  assert.match(app.asignarBarras(d, d.productos[1], '6901234567892'), /ya es de/);
  assert.equal(app.codigoUsado(d, '6901234567892', p.id), null);
  assert.equal(app.codigoUsado(d, '6901234567892', 'otro'), p);
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

test('QA2 B4: los errores al autorizar no bloquean el ingreso del administrador, y quedan avisados', () => {
  const d = base();
  const ahora = Date.now();
  for (let i = 0; i < 5; i++) app.fallarPin(d, 'aut:adm1', ahora);
  assert.ok(app.esperaPin(d, 'aut:adm1', ahora) > 0);
  assert.equal(app.esperaPin(d, 'adm1', ahora), 0, 'puede entrar al programa');
  const b = app.bloqueosPendientes(d, 'adm1');
  assert.equal(b.length, 1);
  assert.equal(b[0].donde, 'autorizar');
  assert.equal(app.bloqueosPendientes(d, 'adm1').length, 0, 'se avisa una sola vez');
});

test('QA2 B1/B2: precio bajo el costo y productos nuevos de un empleado', () => {
  assert.equal(app.precioBajoCosto({ costo: 100, precio: 100 }), true);
  assert.equal(app.precioBajoCosto({ costo: 100, precio: 90 }), true);
  assert.equal(app.precioBajoCosto({ costo: 100, precio: 130 }), false);
  assert.equal(app.precioBajoCosto({ costo: 0, precio: 50 }), false, 'sin costo cargado no se sabe');
  const d = base();
  const p = { id: 'n1', codigo: 'N1', nombre: 'Martillo barato', costo: 0, precio: 150 };
  d.productos.push(p);
  app.marcarProductoNuevo(d, p, 'Empleado', 'empleado', 'agregado desde la venta');
  assert.equal(p.revisar, true);
  assert.equal(p.creadoPor, 'Empleado');
  const h = d.historialPrecios[d.historialPrecios.length - 1];
  assert.deepEqual([h.producto, h.antes, h.despues, h.usuario], ['Martillo barato', null, 150, 'Empleado']);
  assert.match(h.motivo, /Producto nuevo/);
  const q = { id: 'n2', codigo: 'N2', nombre: 'Otro', costo: 0, precio: 10 };
  app.marcarProductoNuevo(d, q, 'Administrador', 'admin');
  assert.equal(q.revisar, undefined, 'lo que crea un administrador no queda para revisar');
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
  assert.deepEqual(app.cambiosStockImportacion(plan), [{ codigo: 'MAR-16', nombre: 'Martillo 16 oz', antes: 10, despues: 7 }], 'la vista previa muestra qué stock cambia');
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
    assert.deepEqual(pintura.codigosProv, [{ proveedorId: sur.id, codigo: '1234' }]);
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
  assert.deepEqual(g.codigosProv, [{ proveedorId: 'uru', codigo: 'LH-1234' }]);
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

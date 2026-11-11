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

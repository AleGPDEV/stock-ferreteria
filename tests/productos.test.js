// Pruebas de la sección Productos y stock (js/logica/productos.js).
// Las funciones de js/ quedan globales al cargarlas (igual que en el navegador): se usan sin module.exports.
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

/* global agregarCodigoExtra, quitarCodigoExtra */
const datos = () => ({
  productos: [
    { id: 'a', codigo: 'TOR-81', barras: ['7790001112223'], nombre: 'Tornillo 8 x 1' },
    { id: 'b', codigo: 'P-0001', barras: [], nombre: 'Clavo 2"' },
  ],
});

test('agregar otro código: se agrega en mayúsculas y sin espacios alrededor, sin tocar la lista original', () => {
  const d = datos();
  const lista = ['7790001112223'];
  const r = agregarCodigoExtra(d, lista, '  lh-5563 ', 'TOR-81', 'a');
  assert.deepEqual(r, { lista: ['7790001112223', 'LH-5563'] });
  assert.deepEqual(lista, ['7790001112223']);
});

test('agregar otro código en un producto nuevo (todavía sin id)', () => {
  const r = agregarCodigoExtra(datos(), [], '7790009998887', 'TOR-99', null);
  assert.deepEqual(r, { lista: ['7790009998887'] });
});

test('agregar otro código: vacío, con espacios, igual al Código o repetido da error', () => {
  const d = datos();
  assert.match(agregarCodigoExtra(d, [], '   ', 'TOR-81', 'a').error, /Escaneá o escribí/);
  assert.match(agregarCodigoExtra(d, [], '123 456', 'TOR-81', 'a').error, /de a uno/);
  assert.match(agregarCodigoExtra(d, [], 'tor-81', 'TOR-81', 'a').error, /ya es el código de este producto/);
  assert.match(agregarCodigoExtra(d, ['7790001112223'], '7790001112223', 'TOR-81', 'a').error, /ya está en la lista/);
});

test('agregar otro código: no puede ser de otro producto (código propio o de barras)', () => {
  const d = datos();
  assert.equal(agregarCodigoExtra(d, [], 'p-0001', 'TOR-81', 'a').error, 'El código P-0001 ya es de «Clavo 2"».');
  assert.equal(agregarCodigoExtra(d, [], '7790001112223', 'P-0001', 'b').error, 'El código 7790001112223 ya es de «Tornillo 8 x 1».');
});

test('agregar otro código: los códigos del mismo producto no cuentan como «de otro producto»', () => {
  // Se quitó de la lista sin guardar y se vuelve a agregar: sigue siendo de este producto
  const r = agregarCodigoExtra(datos(), [], '7790001112223', 'TOR-81', 'a');
  assert.deepEqual(r, { lista: ['7790001112223'] });
});

test('quitar otro código: saca solo ese (sin importar mayúsculas) y no toca la lista original', () => {
  const lista = ['7790001112223', 'LH-5563'];
  assert.deepEqual(quitarCodigoExtra(lista, 'lh-5563'), ['7790001112223']);
  assert.deepEqual(quitarCodigoExtra(lista, 'NO-ESTA'), lista);
  assert.deepEqual(lista, ['7790001112223', 'LH-5563']);
});

/* global enEstante, SIN_ESTANTE, claveUbic */
test('filtro por estante: todos, sin estante y un estante (sin importar mayúsculas, tildes ni espacios)', () => {
  const ps = [
    { id: '1', nombre: 'Codo', ubicacion: 'A-01' },
    { id: '2', nombre: 'Llave', ubicacion: '  a-01 ' },
    { id: '3', nombre: 'Taladro', ubicacion: 'Depósito atrás' },
    { id: '4', nombre: 'Clavo', ubicacion: '' },
    { id: '5', nombre: 'Tarugo' },
  ];
  const ids = (filtro) => ps.filter((p) => enEstante(p, filtro)).map((p) => p.id).join(',');
  assert.equal(ids(''), '1,2,3,4,5');
  assert.equal(ids(SIN_ESTANTE), '4,5');
  assert.equal(ids(claveUbic('A-01')), '1,2');
  assert.equal(ids(claveUbic('deposito ATRAS')), '3');
  assert.equal(ids(claveUbic('B-02')), '');
  // Un estante llamado como el valor de «Sin estante» no se confunde
  assert.equal(enEstante({ ubicacion: SIN_ESTANTE }, SIN_ESTANTE), false);
});

/* global alDejarDeEscribir */
test('buscadores: buscan cuando se deja de escribir, no en cada tecla', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const el = new EventTarget(); el.value = '';
  let veces = 0;
  alDejarDeEscribir(el, () => { veces++; });
  const tecla = (v) => { el.value = v; el.dispatchEvent(new Event('input')); };
  tecla('t'); tecla('to'); tecla('tor');
  assert.equal(veces, 0, 'mientras se escribe no busca');
  t.mock.timers.tick(149);
  assert.equal(veces, 0);
  t.mock.timers.tick(1);
  assert.equal(veces, 1, 'busca una sola vez, al terminar');
  // Enter (el lector de códigos) busca enseguida
  tecla('7790001112223');
  const enter = new Event('keydown'); enter.key = 'Enter'; el.dispatchEvent(enter);
  assert.equal(veces, 2);
  t.mock.timers.tick(500);
  assert.equal(veces, 2, 'y no vuelve a buscar después');
  // Borrar todo muestra la lista completa enseguida
  tecla('');
  assert.equal(veces, 3);
});

/* ---------- Mudadas de tests/logica.test.js (tarea #23), sin cambios ---------- */
function dosProveedores() {
  const d = app.baseVacia();
  d.proveedores.push({ id: 'norte', nombre: 'Distribuidora Norte' }, { id: 'uru', nombre: 'Uruimporta' });
  d.productos.push(
    { id: 't', codigo: '1234', nombre: 'Tornillo autoperforante', categoria: '', unidad: 'unidad', proveedorId: 'norte', ubicacion: '', costo: 180, precio: 300, minimo: 0, stock: 15 },
    { id: 'lh', codigo: 'LH-1234', nombre: 'Guante de nitrilo', categoria: '', unidad: 'par', proveedorId: 'uru', ubicacion: '', costo: 90, precio: 150, minimo: 0, stock: 4 },
  );
  return d;
}

function base() {
  const d = app.baseVacia();
  d.productos.push(
    { id: 'a', codigo: 'MAR-16', nombre: 'Martillo 16 oz', categoria: 'Herramientas', unidad: 'unidad', proveedorId: 'v1', ubicacion: 'C-02', costo: 390, precio: 620, minimo: 4, stock: 10 },
    { id: 'b', codigo: 'CAB-25', nombre: 'Cable 2,5 mm²', categoria: 'Electricidad', unidad: 'm', proveedorId: '', ubicacion: '', costo: 28, precio: 48, minimo: 100, stock: 300 },
  );
  d.proveedores.push({ id: 'v1', nombre: 'Herramientas Sur', contacto: '', telefono: '', email: '', rut: '', notas: '' });
  return d;
}

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

test('QA5: ¿se parecen dos descripciones?', () => {
  assert.equal(app.seParecen('ESMALTE SINTETICO BLANCO 4L', 'Tornillo autoperforante'), false);
  assert.equal(app.seParecen('TORN AUTOP 8X1', 'Tornillo autoperforante 8 x 1"'), true, 'abreviado');
  assert.equal(app.seParecen('GUANTE DE NITRILO T9', 'Guante nitrilo'), true);
  assert.equal(app.seParecen('8X40', 'Bulón'), true, 'sin palabras para comparar, no se puede decir');
});

test('QA5 M3: unir dos fichas del mismo producto y editar sus códigos de proveedor', () => {
  const d = dosProveedores();
  d.ventas.push({ id: 'v1', numero: 1, fecha: new Date().toISOString(), total: 300, medio: 'Efectivo', items: [{ productoId: 'lh', nombre: 'Guante', cantidad: 1, precio: 150 }] });
  d.movimientos.push({ id: 'm1', fecha: new Date().toISOString(), tipo: 'entrada', productoId: 'lh', cantidad: 4 });
  app.anotarCodigoProv(d.productos.find((p) => p.id === 'lh'), 'uru', 'LH-1234');
  const r = app.unirProductos(d, 't', 'lh');
  assert.equal(r.error, undefined);
  const t = d.productos.find((p) => p.id === 't');
  assert.equal(d.productos.length, 1);
  assert.equal(t.stock, 19);
  assert.ok(t.barras.includes('LH-1234'), 'el código propio del otro queda como código de barras');
  assert.deepEqual(t.codigosProv.map((x) => x.proveedorId), ['uru']);
  assert.equal(d.ventas[0].items[0].productoId, 't');
  assert.equal(d.movimientos[0].productoId, 't');
  assert.match(app.unirProductos(d, 't', 't').error, /mismo/);
  app.quitarCodigoProv(t, 'uru');
  assert.deepEqual(t.codigosProv, []);
});

test('QA6 B2: una palabra de presentación, color o material no alcanza para decir que es el mismo producto', () => {
  assert.equal(app.seParecen('Tarugo nylon 8mm caja x100', 'Tornillo autoperforante 8 x 1" (caja x100)'), false);
  assert.equal(app.seParecen('Caño PVC 110 blanco', 'Codo PVC 40 blanco'), false);
  assert.equal(app.seParecen('TORN AUTOP 8X1 CAJA', 'Tornillo autoperforante 8 x 1" (caja x100)'), true, 'abreviado sigue siendo el mismo');
  assert.equal(app.seParecen('Caja', 'Caja'), true, 'si solo hay palabras comunes, se comparan esas');
});

/* global textoMargen */
test('margen en la ficha: solo para el administrador (#1)', () => {
  assert.equal(textoMargen(390, 620, true), 'Margen: 59 % sobre el costo');
  assert.equal(textoMargen('100', '161,1'.replace(',', '.'), true), 'Margen: 61,1 % sobre el costo');
  // El empleado no ve el margen: con el precio, le daría el costo
  assert.equal(textoMargen(390, 620, false), '');
  // Sin costo o sin precio no hay margen
  assert.equal(textoMargen('', 620, true), '');
  assert.equal(textoMargen(390, 0, true), '');
});

/* global claveCodigo, buscarPorCodigo, codigoUsado, asignarBarras, agregarCodigoExtra */
test('códigos: un UPC de 12 números y su EAN-13 con 0 adelante son el mismo', () => {
  const d = app.baseVacia();
  d.productos.push(
    { id: 'u', codigo: 'TAL-1', nombre: 'Taladro importado', barras: ['012345678905'] }, // guardado con 12
    { id: 'e', codigo: '0098765432109', nombre: 'Disco de corte', barras: [] },        // guardado con 13
    { id: 'w', codigo: '4061975716071', nombre: 'Amoladora 2000w WURTH', barras: [] },
  );
  assert.equal(claveCodigo('012345678905'), '0012345678905');
  assert.equal(claveCodigo(' 0012345678905 '), '0012345678905');
  assert.equal(claveCodigo('4061975716071'), '4061975716071'); // un EAN-13 queda igual
  assert.equal(claveCodigo('PIN-ROD22'), 'PIN-ROD22');
  assert.equal(claveCodigo('12345'), '12345');
  // La pistola manda 13 y está guardado con 12, o al revés
  assert.equal(buscarPorCodigo(d, '0012345678905').id, 'u');
  assert.equal(buscarPorCodigo(d, '012345678905').id, 'u');
  assert.equal(buscarPorCodigo(d, '098765432109').id, 'e');
  assert.equal(buscarPorCodigo(d, '4061975716071').id, 'w');
  assert.equal(buscarPorCodigo(d, '061975716071'), null, 'un código cortado no es el de la amoladora');
  // No se puede cargar el mismo código escrito distinto
  assert.equal(codigoUsado(d, '0012345678905').id, 'u');
  assert.equal(codigoUsado(d, '098765432109', 'x').id, 'e');
  assert.equal(codigoUsado(d, '098765432109', 'e'), null);
  assert.match(asignarBarras(d, d.productos[2], '098765432109'), /ya es de «Disco de corte»/);
  assert.equal(asignarBarras(d, d.productos[0], '0012345678905'), null);
  assert.deepEqual(d.productos[0].barras, ['012345678905'], 'no se duplica');
  assert.match(agregarCodigoExtra(d, ['012345678905'], '0012345678905', 'TAL-1', 'u').error, /ya está en la lista/);
  assert.match(agregarCodigoExtra(d, [], '098765432109', '0098765432109', 'e').error, /ya es el código de este producto/);
});

test('«Revisado ✓»: le saca la marca de revisar a un producto que cargó un empleado', () => {
  const app = require('../js/cargar-en-node.js');
  const d = app.baseVacia();
  d.productos.push({ id: 'a', codigo: 'A', nombre: 'Martillo', revisar: true, creadoPor: 'Empleado' }, { id: 'b', codigo: 'B', nombre: 'Pinza' });
  assert.equal(app.marcarRevisado(d, 'a').nombre, 'Martillo');
  assert.equal('revisar' in d.productos[0], false);
  assert.equal(d.productos[0].creadoPor, 'Empleado', 'queda quién lo cargó');
  assert.equal(app.marcarRevisado(d, 'a'), null, 'ya estaba revisado');
  assert.equal(app.marcarRevisado(d, 'b'), null);
  assert.equal(app.marcarRevisado(d, 'no-existe'), null);
});

test('ordenar productos por precio o stock, y precio muy bajo', () => {
  const ps = [
    { nombre: 'Cinta', precio: 1, stock: 5 },
    { nombre: 'Arandela', precio: 120, stock: -2 },
    { nombre: 'Broca', precio: 0, stock: 40 },
    { nombre: 'Disco', precio: 1, stock: 5, moneda: 'USD' },
  ];
  const nombres = (l) => l.map((p) => p.nombre);
  assert.deepEqual(nombres(app.ordenarProductos(ps)), ['Arandela', 'Broca', 'Cinta', 'Disco']);
  assert.deepEqual(nombres(app.ordenarProductos(ps, 'precio-asc')), ['Broca', 'Cinta', 'Disco', 'Arandela']);
  assert.deepEqual(nombres(app.ordenarProductos(ps, 'precio-desc')), ['Arandela', 'Cinta', 'Disco', 'Broca']);
  assert.deepEqual(nombres(app.ordenarProductos(ps, 'stock-asc')), ['Arandela', 'Cinta', 'Disco', 'Broca']);
  assert.deepEqual(nombres(app.ordenarProductos(ps, 'stock-desc')), ['Broca', 'Cinta', 'Disco', 'Arandela']);
  assert.deepEqual(nombres(ps), ['Cinta', 'Arandela', 'Broca', 'Disco'], 'no toca la lista original');
  assert.deepEqual(ps.map(app.precioMuyBajo), [true, false, false, false]);
});

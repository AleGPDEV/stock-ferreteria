// Pruebas de la conexión con la app del celular: el servidor de la PC y lo que la pantalla le contesta.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../js/app.js');
const { crearServidorCelular, ipsLocales, datosVinculo } = require('../electron/servidor-celular.js');

function base() {
  const d = app.baseVacia();
  d.proveedores.push({ id: 'v1', nombre: 'Herramientas Sur' });
  d.productos.push(
    { id: 'a', codigo: 'MAR-16', barras: ['7790001112223'], nombre: 'Martillo 16 oz', categoria: 'Herramientas', unidad: 'unidad', proveedorId: 'v1', ubicacion: 'C-02', costo: 390, precio: 620, minimo: 4, stock: 10, codigosProv: [{ proveedorId: 'v1', codigo: 'HS-555' }] },
    { id: 'b', codigo: 'CAB-25', nombre: 'Cable 2,5 mm²', categoria: 'Electricidad', unidad: 'm', proveedorId: '', ubicacion: '', costo: 28, precio: 48, minimo: 100, stock: 300 },
    { id: 'c', codigo: 'P-0001', nombre: 'Arandela plana 8 mm', categoria: 'Bulonería', unidad: 'unidad', proveedorId: '', ubicacion: 'A-1', costo: 1, precio: 5, minimo: 0, stock: 500, moneda: 'USD' },
  );
  return d;
}

test('celular: busca por código propio, de barras y de proveedor, sin mandar el costo', () => {
  const d = base();
  for (const c of ['MAR-16', 'mar-16', '7790001112223', 'HS-555']) {
    const r = app.productoCelular(d, c);
    assert.equal(r.producto && r.producto.nombre, 'Martillo 16 oz', c);
    assert.equal('costo' in r.producto, false);
    assert.equal(r.producto.proveedor, 'Herramientas Sur');
    assert.deepEqual(r.producto.barras, ['7790001112223']);
  }
  assert.deepEqual(app.productoCelular(d, 'NO-EXISTE'), { producto: null });
  assert.deepEqual(app.productoCelular(d, ''), { producto: null });
  assert.equal(app.productoCelular(d, 'P-0001').producto.moneda, 'USD');
});

test('celular: busca por nombre con palabras en cualquier orden y sin tildes', () => {
  const d = base();
  assert.deepEqual(app.productosCelular(d, 'plana arandela').productos.map((p) => p.codigo), ['P-0001']);
  assert.deepEqual(app.productosCelular(d, 'BULONERIA').productos.map((p) => p.codigo), ['P-0001']);
  assert.deepEqual(app.productosCelular(d, 'a').productos, []); // muy corto
  assert.equal(app.productosCelular(d, 'm', 1).productos.length, 0);
  const todos = app.productosCelular(d, 'ma', 1);
  assert.equal(todos.productos.length, 1);
  assert.equal(todos.productos[0].nombre, 'Martillo 16 oz'); // primero el que empieza con lo escrito
  assert.ok(todos.productos.every((p) => !('costo' in p)));
});

test('celular: los estantes con su categoría', () => {
  const d = base();
  app.guardarEstante(d, { codigo: 'A-1', categoria: 'Bulonería' });
  const r = app.estantesCelular(d);
  assert.deepEqual(r.estantes.find((e) => e.codigo === 'A-1'), { codigo: 'A-1', categoria: 'Bulonería' });
  assert.ok(r.estantes.some((e) => e.codigo === 'C-02'));
});

test('servidor: el QR lleva las direcciones, el token y el pcId', () => {
  const v = datosVinculo({ token: 'tk', pcId: 'id1' }, ['192.168.1.10', '10.0.0.5'], 8765);
  assert.deepEqual(v, { t: 'stock-ferreteria', v: 1, urls: ['http://192.168.1.10:8765', 'http://10.0.0.5:8765'], token: 'tk', pcId: 'id1' });
});

test('servidor: primero las direcciones de la red del local, sin las internas ni las virtuales', () => {
  const ips = ipsLocales({
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', internal: false }],
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.34', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    Ethernet: [{ family: 'IPv4', address: '169.254.10.2', internal: false }],
  });
  assert.deepEqual(ips, ['192.168.1.34', '172.20.0.1']);
});

function pedir(puerto, ruta, token, metodo = 'GET') {
  return new Promise((ok, mal) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: metodo, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => ok({ status: res.statusCode, data: t ? JSON.parse(t) : null }));
    });
    req.on('error', mal);
    req.end();
  });
}

test('servidor: pide el token, contesta lo que dice la pantalla y no deja escribir', async () => {
  const d = base();
  let clave = { token: 'secreto-123', pcId: 'pc-1' };
  const preguntados = [];
  // Hace de pantalla: corre la función pedida sobre los datos de prueba
  const pantalla = { estadoParaCelular: () => ({ listo: true, productos: d.productos.length }), productoParaCelular: (c) => app.productoCelular(d, c), productosParaCelular: (q) => app.productosCelular(d, q), estantesParaCelular: () => app.estantesCelular(d) };
  const preguntar = async (js) => { preguntados.push(js); return Function(...Object.keys(pantalla), `return ${js}`)(...Object.values(pantalla)); };
  const s = crearServidorCelular({ clave: () => clave, preguntar, version: '9.9.9', puerto: 0, host: '127.0.0.1' });
  assert.equal(await s.iniciar(), null);
  const p = s.puerto;
  try {
    assert.equal((await pedir(p, '/api/estado')).status, 401);
    assert.equal((await pedir(p, '/api/estado', 'secreto-12X')).status, 401);
    assert.equal((await pedir(p, '/api/estado', 'otro')).status, 401);
    const e = await pedir(p, '/api/estado', 'secreto-123');
    assert.equal(e.status, 200);
    assert.deepEqual(e.data, { pcId: 'pc-1', nombre: 'Stock Ferretería', version: '9.9.9', listo: true, productos: 3, aviso: '' });
    const r = await pedir(p, '/api/producto?codigo=7790001112223', 'secreto-123');
    assert.equal(r.data.producto.codigo, 'MAR-16');
    const r2 = await pedir(p, `/api/productos?q=${encodeURIComponent('cable 2,5')}`, 'secreto-123');
    assert.deepEqual(r2.data.productos.map((x) => x.codigo), ['CAB-25']);
    assert.ok((await pedir(p, '/api/estantes', 'secreto-123')).data.estantes.length >= 2);
    // Lo escrito por el celular no puede cerrar la llamada a la pantalla e inyectar código
    const malo = `x"); estadoParaCelular("`;
    await pedir(p, `/api/producto?codigo=${encodeURIComponent(malo)}`, 'secreto-123');
    assert.equal(preguntados.at(-1), `productoParaCelular(${JSON.stringify(malo)})`);
    assert.equal((await pedir(p, '/api/productos', 'secreto-123', 'POST')).status, 405);
    assert.equal((await pedir(p, '/api/ventas', 'secreto-123')).status, 404);
    assert.equal(s.ultimoPedido.ip, '127.0.0.1');
    // Código nuevo: el celular viejo queda afuera enseguida
    clave = { token: 'nuevo-456', pcId: 'pc-1' };
    assert.equal((await pedir(p, '/api/estado', 'secreto-123')).status, 401);
    assert.equal((await pedir(p, '/api/estado', 'nuevo-456')).status, 200);
  } finally {
    await s.detener();
  }
  assert.equal(s.activo, false);
});

test('servidor: si el programa no responde, el celular recibe el aviso y no datos viejos', async () => {
  const s = crearServidorCelular({ clave: () => ({ token: 't', pcId: 'p' }), preguntar: async () => ({ error: 'El programa no está abierto.' }), puerto: 0, host: '127.0.0.1' });
  await s.iniciar();
  try {
    const e = await pedir(s.puerto, '/api/estado', 't');
    assert.equal(e.status, 200);
    assert.equal(e.data.listo, false);
    assert.equal(e.data.aviso, 'El programa no está abierto.');
    const r = await pedir(s.puerto, '/api/producto?codigo=X', 't');
    assert.equal(r.status, 503);
    assert.equal(r.data.error, 'El programa no está abierto.');
  } finally { await s.detener(); }
});

test('servidor: avisa si el puerto está ocupado', async () => {
  const a = crearServidorCelular({ clave: () => ({ token: 't', pcId: 'p' }), preguntar: async () => ({}), puerto: 0, host: '127.0.0.1' });
  await a.iniciar();
  const b = crearServidorCelular({ clave: () => ({ token: 't', pcId: 'p' }), preguntar: async () => ({}), puerto: a.puerto, host: '127.0.0.1' });
  try { assert.match(await b.iniciar(), /lo está usando otro programa/); } finally { await a.detener(); }
});

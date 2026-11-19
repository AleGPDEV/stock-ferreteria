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
    assert.equal((await pedir(p, '/api/ventas', 'secreto-123', 'POST')).status, 404);
    assert.equal((await pedir(p, '/api/estado', 'secreto-123', 'DELETE')).status, 405);
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
  const s = crearServidorCelular({ clave: () => ({ token: 't', pcId: 'p' }), preguntar: async () => ({ error: 'El programa no está abierto.', sinPrograma: true }), puerto: 0, host: '127.0.0.1' });
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

/* ---------- Fase 2: el celular guarda en la PC ---------- */

test('celular: producto nuevo, idempotente y marcado para revisar, sin costo', () => {
  const d = base();
  app.guardarEstante(d, { codigo: 'A-1', categoria: 'Bulonería' });
  const x = { idCelular: 'cel-1', equipo: 'c1', codigo: 'C1-0001', nombre: 'Tuerca  8 mm', precio: 3, cantidad: 40, ubicacion: 'a-1', costo: 999, proveedor: 'herramientas sur', hace: 1000 };
  const r = app.altaDesdeCelularEn(d, x);
  assert.equal(r.error, undefined);
  assert.equal(r.existia, false);
  const p = d.productos.find((q) => q.codigo === 'C1-0001');
  assert.equal(p.nombre, 'Tuerca 8 mm');
  assert.equal(p.costo, 0);
  assert.equal(p.categoria, 'Bulonería'); // la del estante
  assert.equal(p.ubicacion, 'A-1');
  assert.equal(p.proveedorId, 'v1');
  assert.equal(p.stock, 40);
  assert.equal(p.revisar, true);
  assert.equal(p.creadoPor, 'Celular C1');
  assert.equal(d.movimientos.at(-1).usuario, 'Celular C1');
  // Se cortó el WiFi y el celular reintenta: no se duplica
  const r2 = app.altaDesdeCelularEn(d, x);
  assert.equal(r2.existia, true);
  assert.equal(d.productos.filter((q) => q.codigo === 'C1-0001').length, 1);
  assert.equal(p.stock, 40);
  // El mismo celular corrige el precio y la cantidad antes de que lo revisen
  app.altaDesdeCelularEn(d, { ...x, precio: 4, cantidad: 45 });
  assert.equal(p.precio, 4);
  assert.equal(p.stock, 45);
  // Después de que el administrador lo revisó, el celular ya no cambia sus datos (sí el conteo)
  delete p.revisar;
  app.altaDesdeCelularEn(d, { ...x, nombre: 'Otro nombre', precio: 1, cantidad: 44 });
  assert.equal(p.nombre, 'Tuerca 8 mm');
  assert.equal(p.precio, 4);
  assert.equal(p.stock, 44);
});

test('celular: un producto nuevo con un código que ya existe no pisa al otro', () => {
  const d = base();
  const r = app.altaDesdeCelularEn(d, { idCelular: 'z', equipo: 'C1', codigo: '7790001112223', nombre: 'Otra cosa', precio: 10 });
  assert.match(r.error, /ya es de «Martillo 16 oz»/);
  assert.equal(r.producto.codigo, 'MAR-16');
  assert.equal(d.productos.length, 3);
  assert.match(app.altaDesdeCelularEn(d, { idCelular: 'z', equipo: 'C1', codigo: 'C1-9', nombre: 'X', precio: 10, ubicacion: 'NO-EXISTE' }).error, /no está en el programa/);
  assert.match(app.altaDesdeCelularEn(d, { idCelular: 'z', equipo: '', codigo: 'C1-9', nombre: 'X', precio: 10 }).error, /nombre del celular/);
  assert.match(app.altaDesdeCelularEn(d, { idCelular: 'z', equipo: 'C1', codigo: 'C1-9', nombre: 'X', precio: 0 }).error, /precio/);
});

test('celular: el conteo suma lo que se vendió después de contar (no se pierden ventas)', () => {
  const d = base();
  const martillo = d.productos[0]; // stock 10
  // Se contaron 8 hace 10 minutos; después se vendieron 2 en la caja
  const hace10 = new Date(Date.now() - 10 * 60000).toISOString();
  d.movimientos.push({ id: 'v', fecha: new Date(Date.now() - 5 * 60000).toISOString(), tipo: 'salida', productoId: 'a', cantidad: -2, stockAntes: 12, stockDespues: 10 });
  assert.equal(app.stockDesdeConteo(d, 'a', 8, hace10), 6);
  const r = app.conteoDesdeCelularEn(d, { conteoId: 'k1', equipo: 'C1', codigo: '7790001112223', contado: 8, hace: 10 * 60000 });
  assert.equal(r.error, undefined);
  assert.equal(martillo.stock, 6);
  assert.equal(d.movimientos.at(-1).conteoId, 'k1');
  assert.equal(d.movimientos.at(-1).usuario, 'Celular C1');
  // El celular sigue contando (cada escaneo suma 1) y corrige el mismo conteo: no se cuenta dos veces
  app.conteoDesdeCelularEn(d, { conteoId: 'k1', equipo: 'C1', codigo: 'MAR-16', contado: 9, hace: 10 * 60000 });
  assert.equal(martillo.stock, 7);
  // Reintento igual: no cambia nada
  const movs = d.movimientos.length;
  app.conteoDesdeCelularEn(d, { conteoId: 'k1', equipo: 'C1', codigo: 'MAR-16', contado: 9, hace: 10 * 60000 });
  assert.equal(martillo.stock, 7);
  assert.equal(d.movimientos.length, movs);
  // Sin cantidad: no toca el stock, pero sí el estante y el código de barras nuevo
  app.guardarEstante(d, { codigo: 'B-2', categoria: 'Herramientas' });
  app.conteoDesdeCelularEn(d, { conteoId: 'k2', equipo: 'C1', codigo: 'MAR-16', ubicacion: 'B-2', barra: '7790009998887' });
  assert.equal(martillo.stock, 7);
  assert.equal(martillo.ubicacion, 'B-2');
  assert.ok(martillo.barras.includes('7790009998887'));
  // Nunca el precio ni el nombre de un producto que ya existía
  app.conteoDesdeCelularEn(d, { conteoId: 'k3', equipo: 'C1', codigo: 'MAR-16', nombre: 'X', precio: 1 });
  assert.equal(martillo.precio, 620);
  assert.equal(martillo.nombre, 'Martillo 16 oz');
  assert.match(app.conteoDesdeCelularEn(d, { conteoId: 'k4', equipo: 'C1', codigo: 'NADA' }).error, /ya no está/);
  assert.match(app.conteoDesdeCelularEn(d, { conteoId: 'k4', equipo: 'C1', codigo: 'MAR-16', contado: 1e7 }).error, /demasiado/);
});

test('celular: la hora del conteo es la de la PC (no importa el reloj del celular)', () => {
  const ahora = Date.parse('2026-11-19T15:00:00Z');
  assert.equal(app.contadoElDesde(60000, ahora), '2026-11-19T14:59:00.000Z');
  assert.equal(app.contadoElDesde(-5, ahora), '2026-11-19T15:00:00.000Z');
  assert.equal(app.contadoElDesde(1e12, ahora), '2026-11-12T15:00:00.000Z'); // como mucho una semana
});

test('celular: código libre del celular y estante nuevo', () => {
  const d = base();
  assert.deepEqual(app.codigoLibreCelular(d, 'c1'), { codigo: 'C1-0001' });
  d.productos.push({ id: 'z', codigo: 'C1-0007', nombre: 'x', stock: 0 });
  assert.deepEqual(app.codigoLibreCelular(d, 'C1'), { codigo: 'C1-0008' });
  assert.match(app.codigoLibreCelular(d, 'P').error, /nombre de este celular/);
  const r = app.estanteDesdeCelularEn(d, { codigo: 'D-4', categoria: 'Sanitaria' });
  assert.deepEqual(r.estante, { codigo: 'D-4', categoria: 'Sanitaria' });
  assert.ok(r.estantes.some((e) => e.codigo === 'D-4'));
  assert.ok(app.estanteDesdeCelularEn(d, { codigo: 'D-4', categoria: 'Sanitaria' }).error);
});

function mandar(puerto, ruta, token, cuerpo) {
  return new Promise((ok, mal) => {
    const t = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(t) } }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => ok({ status: res.statusCode, data: s ? JSON.parse(s) : null }));
    });
    req.on('error', mal);
    req.end(t);
  });
}

test('servidor: el celular guarda en la PC (alta, conteo, estante) y los errores llegan con su motivo', async () => {
  const d = base();
  const P = {
    productoDesdeCelular: (x) => app.altaDesdeCelularEn(d, x), conteoDesdeCelular: (x) => app.conteoDesdeCelularEn(d, x), estanteDesdeCelular: (x) => app.estanteDesdeCelularEn(d, x),
    codigoLibreParaCelular: (e) => app.codigoLibreCelular(d, e), estadoParaCelular: () => ({ listo: true, productos: d.productos.length }),
  };
  const llamadas = [];
  const preguntar = async (js) => { llamadas.push(js); return Function(...Object.keys(P), `return ${js}`)(...Object.values(P)); };
  const s = crearServidorCelular({ clave: () => ({ token: 't', pcId: 'p' }), preguntar, puerto: 0, host: '127.0.0.1' });
  await s.iniciar();
  try {
    const c = await pedir(s.puerto, '/api/codigo-libre?equipo=C2', 't');
    assert.deepEqual(c.data, { codigo: 'C2-0001' });
    const e = await mandar(s.puerto, '/api/estantes', 't', { codigo: 'Z-1', categoria: 'Jardín' });
    assert.equal(e.status, 200);
    const a = await mandar(s.puerto, '/api/productos', 't', { idCelular: 'i1', equipo: 'C2', codigo: 'C2-0001', nombre: 'Manguera', precio: 300, cantidad: 2, ubicacion: 'Z-1', costo: 5 });
    assert.equal(a.status, 200);
    assert.equal(a.data.producto.categoria, 'Jardín');
    assert.equal(d.productos.find((p) => p.codigo === 'C2-0001').costo, 0); // el costo ni siquiera pasa
    assert.ok(!llamadas.at(-1).includes('costo'));
    const k = await mandar(s.puerto, '/api/conteos', 't', { conteoId: 'k', equipo: 'C2', codigo: 'MAR-16', contado: 3, hace: 0 });
    assert.equal(k.status, 200);
    assert.equal(k.data.producto.stock, 3);
    const mal = await mandar(s.puerto, '/api/productos', 't', { idCelular: 'i2', equipo: 'C2', codigo: 'MAR-16', nombre: 'X', precio: 1 });
    assert.equal(mal.status, 422);
    assert.match(mal.data.error, /ya es de/);
    assert.equal((await mandar(s.puerto, '/api/productos', 't', 'esto no es json')).status, 400);
    assert.equal((await mandar(s.puerto, '/api/productos', 'otro', {})).status, 401);
    assert.equal((await mandar(s.puerto, '/api/productos', 't', { nombre: 'x'.repeat(40000) })).status, 400);
  } finally { await s.detener(); }
});

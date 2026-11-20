// Pruebas de la sección Base y guardado (js/base/datos-y-guardado.js): guardar sin recorrer toda la historia.
// Las funciones de js/ quedan globales al cargarlas (igual que en el navegador): se usan sin module.exports.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/cargar-en-node.js');

/* global baseVacia, abrirCaja, cobrar, anularVenta, devolverVenta, registrar, fotoDe, calcularCambios */

function local() {
  const d = baseVacia();
  d.productos.push(
    { id: 'tor', codigo: 'TOR-81', barras: [], nombre: 'Tornillo 8 x 1', categoria: 'Tornillería', unidad: 'unidad', costo: 2, precio: 5, minimo: 10, stock: 100000 },
    { id: 'cem', codigo: 'CEM-25', barras: [], nombre: 'Cemento 25 kg', categoria: 'Obra', unidad: 'bolsa', costo: 300, precio: 450, minimo: 2, stock: 100000 },
  );
  abrirCaja(d, 1000, 'Ale');
  return d;
}

/** Lo que encontraba el recorrido completo de antes (la referencia). */
function recorridoCompleto(foto, d) {
  return {
    ventas: d.ventas.filter((v) => foto.ventas.get(v.id) !== !!v.anulada).map((v) => v.id).sort(),
    movimientos: d.movimientos.filter((m) => !foto.movimientos.has(m.id)).map((m) => m.id).sort(),
  };
}
const ids = (filas) => (filas || []).map((f) => f.id).sort();

/** Un «disco» de mentira: aplica los cambios como lo haría SQLite (una fila por id). */
function disco() {
  const tablas = {};
  let config = '{}';
  return {
    aplicar(c) {
      if (c.completo) for (const k of Object.keys(tablas)) tablas[k] = new Map();
      if (typeof c.config === 'string') config = c.config;
      for (const [t, filas] of Object.entries(c.upsert || {})) { tablas[t] = tablas[t] || new Map(); filas.forEach((f) => tablas[t].set(f.id, f.datos)); }
      for (const [t, lista] of Object.entries(c.borrar || {})) lista.forEach((id) => tablas[t] && tablas[t].delete(id));
    },
    leer() {
      const d = JSON.parse(config);
      for (const [t, m] of Object.entries(tablas)) if (m.size) d[t] = [...m.values()].map((x) => JSON.parse(x));
      return d;
    },
  };
}

test('una serie de cobros, anulaciones y devoluciones guarda lo mismo que el recorrido completo', () => {
  const d = local();
  const hd = disco();
  let r = calcularCambios(null, d);
  hd.aplicar(r.cambios);
  let foto = r.confirmar();
  // Generador fijo (siempre la misma serie)
  let semilla = 7;
  const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  for (let paso = 0; paso < 300; paso++) {
    const q = azar(10);
    const vivas = d.ventas.filter((v) => !v.anulada && v.tipo !== 'devolucion');
    if (q < 5 || !vivas.length) {
      cobrar(d, [{ productoId: azar(2) ? 'tor' : 'cem', cantidad: 1 + azar(5), precio: 5 }], azar(2) ? 'Efectivo' : 'Tarjeta', '', '', null);
    } else if (q < 7) {
      // anula una venta vieja (si tiene devoluciones, anularVenta no la deja: también vale)
      anularVenta(d, vivas[azar(vivas.length)].id);
    } else if (q < 9) {
      const v = vivas[azar(vivas.length)];
      devolverVenta(d, v.id, [{ renglon: 0, cantidad: 1 }], 'Efectivo', 'Ale');
    } else {
      registrar(d, { tipo: 'entrada', productoId: 'tor', cantidad: 10, costoUnit: 2, nota: 'Compra' });
    }
    // A veces se guardan varios pasos juntos (por ejemplo si un guardado falló)
    if (azar(3) === 0) continue;
    const esperado = recorridoCompleto(foto, d);
    r = calcularCambios(foto, d);
    if (!r) { assert.deepEqual(esperado, { ventas: [], movimientos: [] }, `paso ${paso}: no encontró cambios`); continue; }
    assert.equal(r.cambios.completo, undefined, `paso ${paso}: no tiene que guardar todo`);
    assert.deepEqual(ids(r.cambios.upsert.ventas), esperado.ventas, `paso ${paso}: ventas`);
    assert.deepEqual(ids(r.cambios.upsert.movimientos), esperado.movimientos, `paso ${paso}: movimientos`);
    hd.aplicar(r.cambios);
    foto = r.confirmar();
  }
  const fin = calcularCambios(foto, d);
  if (fin) { hd.aplicar(fin.cambios); fin.confirmar(); }
  // Lo guardado es exactamente lo que hay en pantalla
  const sinVacias = (x) => Object.fromEntries(Object.entries(x).filter(([, v]) => !(Array.isArray(v) && !v.length)));
  assert.deepEqual(sinVacias(hd.leer()), sinVacias(JSON.parse(JSON.stringify(d))));
  assert.ok(d.ventas.some((v) => v.anulada), 'la serie tiene anulaciones');
  assert.ok(d.ventas.some((v) => v.tipo === 'devolucion'), 'la serie tiene devoluciones');
});

test('la lista de ventas cambiadas no se guarda en los datos', () => {
  const d = local();
  let r = calcularCambios(null, d);
  const foto = r.confirmar();
  const { venta } = cobrar(d, [{ productoId: 'tor', cantidad: 1, precio: 5 }], 'Efectivo', '', '', null);
  calcularCambios(foto, d).confirmar();
  anularVenta(d, venta.id);
  assert.equal(JSON.stringify(d).includes('__ventas'), false);
  r = calcularCambios(foto, d);
  assert.deepEqual(ids(r.cambios.upsert.ventas), [venta.id]);
  assert.equal(String(r.cambios.config || '').includes('__ventas'), false);
  r.confirmar();
  assert.equal(calcularCambios(foto, d), null, 'después de guardar no queda nada pendiente');
});

test('si una venta se agregó fuera de orden, igual se guarda (recorrido completo)', () => {
  const d = local();
  const foto = calcularCambios(null, d).confirmar();
  cobrar(d, [{ productoId: 'tor', cantidad: 1, precio: 5 }], 'Efectivo', '', '', null);
  calcularCambios(foto, d).confirmar();
  // Alguien la mete al principio en vez de al final: la cuenta no cierra y se recorre todo
  const rara = { ...d.ventas[0], id: 'rara', numero: 999 };
  d.ventas.unshift(rara);
  const r = calcularCambios(foto, d);
  assert.deepEqual(ids(r.cambios.upsert.ventas), ['rara']);
});

test('si un guardado falla, lo pendiente se manda en el siguiente', () => {
  const d = local();
  const foto = calcularCambios(null, d).confirmar();
  const { venta } = cobrar(d, [{ productoId: 'tor', cantidad: 1, precio: 5 }], 'Efectivo', '', '', null);
  calcularCambios(foto, d).confirmar();
  anularVenta(d, venta.id);
  calcularCambios(foto, d); // falla: no se confirma
  const r = calcularCambios(foto, d);
  assert.deepEqual(ids(r.cambios.upsert.ventas), [venta.id]);
});

test('con 20.000 ventas guardadas, un cobro no recorre la historia', () => {
  const d = local();
  for (let i = 0; i < 20000; i++) d.ventas.push({ id: 'v' + i, numero: i, fecha: '2025-01-01T12:00:00.000Z', items: [], total: 0, anulada: false });
  for (let i = 0; i < 60000; i++) d.movimientos.push({ id: 'm' + i, tipo: 'salida', productoId: 'tor', cantidad: 1, fecha: '2025-01-01T12:00:00.000Z' });
  const foto = calcularCambios(null, d).confirmar();
  cobrar(d, [{ productoId: 'tor', cantidad: 1, precio: 5 }], 'Efectivo', '', '', null);
  // Si alguien lee .anulada de las ventas viejas, es que se recorrió la historia
  let leidas = 0;
  for (let i = 0; i < 20000; i++) {
    const v = d.ventas[i]; let a = v.anulada; delete v.anulada;
    Object.defineProperty(v, 'anulada', { get() { leidas++; return a; }, set(x) { a = x; }, enumerable: true, configurable: true });
  }
  const r = calcularCambios(foto, d);
  assert.equal(r.cambios.upsert.ventas.length, 1);
  assert.equal(leidas, 0, 'no se miró ninguna venta vieja');
});

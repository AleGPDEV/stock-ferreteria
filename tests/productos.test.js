// Pruebas de la sección Productos y stock (js/logica/productos.js).
// Las funciones de js/ quedan globales al cargarlas (igual que en el navegador): se usan sin module.exports.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/cargar-en-node.js');

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

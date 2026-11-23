// Pruebas de las categorías de productos y estantes (js/logica/categorias.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

function local() {
  const d = app.baseVacia();
  d.productos.push(
    { id: 'a', codigo: 'A', barras: [], nombre: 'Tornillo', categoria: 'Tornillería', stock: 1 },
    { id: 'b', codigo: 'B', barras: [], nombre: 'Tuerca', categoria: 'tornilleria', stock: 1 },
    { id: 'c', codigo: 'C', barras: [], nombre: 'Taladro', categoria: 'Herramientas', stock: 1 },
    { id: 'd', codigo: 'D', barras: [], nombre: 'Clavo', categoria: '', stock: 1 },
  );
  d.estantes = [{ id: 'e1', codigo: 'B-3', categoria: 'Tornillería' }, { id: 'e2', codigo: 'H-1', categoria: 'Herramientas' }, { id: 'e3', codigo: 'X-1', categoria: '' }];
  return d;
}

test('la lista junta las de productos, estantes y las creadas (sin repetir por mayúsculas o tildes)', () => {
  const d = local();
  d.categorias = ['Pinturería'];
  assert.deepEqual(app.categoriasDe(d), [
    { nombre: 'Herramientas', productos: 1, estantes: 1 },
    { nombre: 'Pinturería', productos: 0, estantes: 0 },
    { nombre: 'Tornillería', productos: 2, estantes: 1 },
  ]);
});

test('crear: nueva sí, repetida no', () => {
  const d = local();
  assert.deepEqual(app.crearCategoria(d, '  Electricidad  '), { nombre: 'Electricidad' });
  assert.ok(app.nombresCategorias(d).includes('Electricidad'));
  assert.match(app.crearCategoria(d, 'herramientas').error, /Ya existe la categoría Herramientas/);
  assert.match(app.crearCategoria(d, '   ').error, /Escribí/);
});

test('renombrar cambia todos los productos y estantes que la usan', () => {
  const d = local();
  const r = app.renombrarCategoria(d, 'Tornillería', 'Bulonería');
  assert.deepEqual(r, { productos: 2, estantes: 1, unidas: false, nombre: 'Bulonería' });
  assert.deepEqual(d.productos.map((p) => p.categoria), ['Bulonería', 'Bulonería', 'Herramientas', '']);
  assert.equal(d.estantes[0].categoria, 'Bulonería');
  assert.deepEqual(app.nombresCategorias(d), ['Bulonería', 'Herramientas']);
});

test('renombrar con el nombre de otra las une', () => {
  const d = local();
  const r = app.renombrarCategoria(d, 'Herramientas', 'TORNILLERIA');
  assert.equal(r.unidas, true);
  assert.equal(r.nombre, 'Tornillería');
  assert.deepEqual(app.categoriasDe(d), [{ nombre: 'Tornillería', productos: 3, estantes: 2 }]);
});

test('borrar deja sin categoría (no borra productos ni estantes)', () => {
  const d = local();
  d.categorias = ['Tornillería'];
  assert.deepEqual(app.borrarCategoria(d, 'tornillería'), { productos: 2, estantes: 1 });
  assert.equal(d.productos.length, 4);
  assert.deepEqual(d.productos.map((p) => p.categoria), ['', '', 'Herramientas', '']);
  assert.deepEqual(app.nombresCategorias(d), ['Herramientas']);
});

test('al escribir una categoría se usa como está en la lista; un estante también', () => {
  const d = local();
  assert.equal(app.categoriaComoEnLista(d, 'tornilleria '), 'Tornillería');
  assert.equal(app.categoriaComoEnLista(d, 'Nueva  cosa'), 'Nueva cosa');
  assert.equal(app.categoriaComoEnLista(d, ''), '');
  const r = app.guardarEstante(d, { codigo: 'T-9', categoria: 'HERRAMIENTAS' });
  assert.equal(r.estante.categoria, 'Herramientas');
});

test('la lista de categorías se guarda con los datos (config), no se pierde', () => {
  const d = local();
  app.crearCategoria(d, 'Jardín');
  const r = app.calcularCambios(null, d);
  assert.deepEqual(JSON.parse(r.cambios.config).categorias, ['Jardín']);
});

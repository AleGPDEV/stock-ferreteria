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

test('las categorías predeterminadas se agregan una sola vez y se pueden borrar', () => {
  const d = local(); // ya tiene «Herramientas» y «Tornillería»
  d.categorias = ['herramientas manuales'];
  const n = app.sembrarCategorias(d);
  assert.equal(n, app.CATEGORIAS_PREDETERMINADAS.length - 1, 'no repite «Herramientas manuales»');
  assert.equal(app.categoriasDe(d).filter((c) => app.claveCategoria(c.nombre) === 'herramientas manuales').length, 1);
  assert.ok(app.nombresCategorias(d).includes('Climatización y ventilación'));
  // Las de los productos siguen estando
  assert.ok(app.nombresCategorias(d).includes('Tornillería'));
  // Si se borra una, no vuelve
  app.borrarCategoria(d, 'Gas');
  assert.equal(app.sembrarCategorias(d), 0);
  assert.ok(!app.nombresCategorias(d).includes('Gas'));
  assert.equal(JSON.parse(app.calcularCambios(null, d).cambios.config).categoriasIniciales, true);
});

test('subcategorías predeterminadas: las 137 de la planilla, una sola vez y solo en categorías que existen', () => {
  assert.equal(Object.values(app.SUBCATEGORIAS_PREDETERMINADAS).flat().length, 137);
  const d = app.baseVacia();
  app.sembrarCategorias(d);
  app.borrarCategoria(d, 'Gas');
  const n = app.sembrarSubcategorias(d);
  assert.equal(n, 137 - 3);
  assert.deepEqual(app.nombresSubcategorias(d, 'Gas'), []);
  assert.ok(app.nombresSubcategorias(d, 'herramientas manuales').includes('Pinzas y alicates'));
  app.borrarSubcategoria(d, 'Herramientas manuales', 'Pinzas y alicates');
  assert.equal(app.sembrarSubcategorias(d), 0, 'no vuelven');
  assert.ok(!app.nombresSubcategorias(d, 'Herramientas manuales').includes('Pinzas y alicates'));
});

test('subcategorías: crear, renombrar (y unir), borrar; siguen a su categoría', () => {
  const d = local();
  assert.ok(app.crearSubcategoria(d, 'Herramientas', 'Taladros').nombre);
  assert.ok(app.crearSubcategoria(d, 'herramientas', 'taladros').error, 'repetida');
  assert.ok(app.crearSubcategoria(d, 'No existe', 'X').error);
  d.productos[2].subcategoria = 'Taladros';
  d.productos.push({ id: 'z', codigo: 'Z', barras: [], nombre: 'Atornillador', categoria: 'Herramientas', subcategoria: 'Atornilladores', stock: 1 });
  assert.deepEqual(app.subcategoriasDe(d, 'Herramientas'), [{ nombre: 'Atornilladores', productos: 1 }, { nombre: 'Taladros', productos: 1 }]);
  const r = app.renombrarSubcategoria(d, 'Herramientas', 'Atornilladores', 'taladros');
  assert.equal(r.unidas, true);
  assert.equal(d.productos.find((p) => p.id === 'z').subcategoria, 'Taladros');
  assert.deepEqual(app.nombresSubcategorias(d, 'Herramientas'), ['Taladros']);
  // Renombrar la categoría se lleva sus subcategorías
  app.renombrarCategoria(d, 'Herramientas', 'Herramientas eléctricas');
  assert.deepEqual(app.nombresSubcategorias(d, 'Herramientas eléctricas'), ['Taladros']);
  assert.deepEqual(app.nombresSubcategorias(d, 'Herramientas'), []);
  assert.equal(app.subcategoriaComoEnLista(d, 'herramientas electricas', 'TALADROS'), 'Taladros');
  // Borrar la subcategoría: los productos quedan con la categoría
  assert.equal(app.borrarSubcategoria(d, 'Herramientas eléctricas', 'Taladros').productos, 2);
  assert.equal(d.productos.find((p) => p.id === 'z').subcategoria, undefined);
  assert.equal(d.productos.find((p) => p.id === 'z').categoria, 'Herramientas eléctricas');
  // Borrar la categoría borra sus subcategorías
  app.crearSubcategoria(d, 'Tornillería', 'Bulones');
  d.productos[0].subcategoria = 'Bulones';
  app.borrarCategoria(d, 'Tornillería');
  assert.equal(d.productos[0].subcategoria, undefined);
  assert.deepEqual(app.nombresSubcategorias(d, 'Tornillería'), []);
});

test('importar con columna «Subcategoría»: la pone y la agrega a la lista de su categoría', () => {
  const d = local();
  const plan = app.planImportacion(d, [{ 'Código': 'C', 'Categoría': 'Herramientas', 'Subcategoría': 'Taladros' }, { 'Código': 'A', 'Categoría': 'Otra', 'Subcategoría': '' }]);
  d.productos[0].subcategoria = 'Vieja';
  app.aplicarImportacion(d, plan, { otros: true });
  assert.equal(d.productos.find((p) => p.id === 'c').subcategoria, 'Taladros');
  assert.deepEqual(app.nombresSubcategorias(d, 'Herramientas'), ['Taladros']);
  const a = d.productos.find((p) => p.id === 'a');
  assert.equal(a.categoria, 'Otra');
  assert.equal(a.subcategoria, undefined, 'cambió de categoría: la subcategoría vieja no sirve');
});

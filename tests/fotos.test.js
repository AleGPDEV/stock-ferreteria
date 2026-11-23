// Pruebas de las fotos de los productos (electron/fotos.js): formatos válidos y fotos dentro de una copia.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { esNombreFoto, esImagenFoto, empaquetarFotos, fotosDeCopia, fotosEnUso } = require('../electron/fotos');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(300, 2)]);

test('nombres de foto: .jpg (las de antes) y .webp (las nuevas), sin rutas', () => {
  for (const n of ['p1-123.jpg', 'cel-1-abc.webp', 'a_b.jpg']) assert.ok(esNombreFoto(n), n);
  for (const n of ['../x.jpg', 'x.png', 'x.jpg.exe', '', null, 'a/b.webp', 'x'.repeat(81) + '.jpg']) assert.ok(!esNombreFoto(n), String(n));
});

test('bytes de foto: JPEG o WebP, y del formato que dice el nombre', () => {
  assert.ok(esImagenFoto(JPEG) && esImagenFoto(WEBP));
  assert.ok(esImagenFoto(JPEG, 'a.jpg') && esImagenFoto(WEBP, 'a.webp'));
  assert.ok(!esImagenFoto(JPEG, 'a.webp'), 'un JPEG con nombre .webp no');
  assert.ok(!esImagenFoto(WEBP, 'a.jpg'));
  assert.ok(!esImagenFoto(Buffer.from('<svg>hola</svg>')));
  assert.ok(!esImagenFoto(Buffer.alloc(6 * 1024 * 1024, 0xff)), 'más de 5 MB no');
});

test('la copia lleva solo las fotos que usan los productos, y anota las que faltan', () => {
  const datos = { productos: [{ foto: 'a.jpg' }, { foto: 'b.webp' }, { foto: 'falta.jpg' }, { foto: '../malo.jpg' }, {}] };
  const enUso = fotosEnUso(JSON.stringify(datos));
  const disco = { 'a.jpg': JPEG, 'b.webp': WEBP, 'otra.jpg': JPEG };
  const { incluidas, faltan } = empaquetarFotos(enUso, (n) => disco[n] || null);
  assert.deepEqual(Object.keys(incluidas), ['a.jpg', 'b.webp']);
  assert.deepEqual(faltan, ['falta.jpg']);
  assert.equal(incluidas['a.jpg'], JPEG.toString('base64'));
});

test('al restaurar, de la copia salen solo fotos válidas', () => {
  const copia = { productos: [], fotosIncluidas: {
    'a.jpg': JPEG.toString('base64'), 'b.webp': WEBP.toString('base64'),
    '../x.jpg': JPEG.toString('base64'), 'c.jpg': Buffer.from('no es foto').toString('base64'), 'd.jpg': 123,
  } };
  const { fotos, malas } = fotosDeCopia(copia);
  assert.deepEqual(fotos.map(([n]) => n), ['a.jpg', 'b.webp']);
  assert.deepEqual(fotos[0][1], JPEG);
  assert.equal(malas, 3);
  assert.deepEqual(fotosDeCopia({ productos: [] }), { fotos: [], malas: 0 });
  assert.deepEqual(fotosDeCopia(null), { fotos: [], malas: 0 });
});

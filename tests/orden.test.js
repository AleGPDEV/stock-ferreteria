// El programa está repartido en un archivo por sección (js/base, js/logica, js/pantallas).
// index.html los carga en el orden de js/orden.json, y las pruebas también: tienen que coincidir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const orden = JSON.parse(fs.readFileSync(path.join(raiz, 'js', 'orden.json'), 'utf8'));

test('index.html carga los archivos del programa en el orden de js/orden.json', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1])
    .filter((s) => s !== 'js/codigo-barras.js' && s !== 'js/etiqueta-tspl.js');
  assert.deepEqual(scripts, orden);
});

test('cada archivo de js/base, js/logica y js/pantallas está en js/orden.json', () => {
  const carpetas = ['base', 'logica', 'pantallas'];
  const hay = carpetas.flatMap((c) => fs.readdirSync(path.join(raiz, 'js', c)).filter((f) => f.endsWith('.js')).map((f) => `js/${c}/${f}`));
  assert.deepEqual([...hay, 'js/arranque.js'].sort(), [...orden].sort());
  assert.equal(orden.at(-1), 'js/arranque.js', 'arranque.js va último: conecta todas las pantallas');
});

test('cada archivo empieza con su descripción y en modo estricto', () => {
  for (const a of orden) {
    const t = fs.readFileSync(path.join(raiz, a), 'utf8');
    // \r?\n: en Windows, git puede dejar los archivos con saltos de línea CRLF
    assert.match(t, /^\/\*[\s\S]*?\*\/\r?\n'use strict';\r?\n/, a);
  }
});

test('index.html carga css/base.css primero y todos los estilos de css/pantallas/', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const hojas = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map((m) => m[1]);
  assert.equal(hojas[0], 'css/base.css', 'base.css va primero: las pantallas pisan sus reglas generales');
  const pantallas = fs.readdirSync(path.join(raiz, 'css', 'pantallas')).filter((f) => f.endsWith('.css')).map((f) => `css/pantallas/${f}`);
  assert.deepEqual([...hojas.slice(1)].sort(), pantallas.sort());
  assert.ok(!fs.existsSync(path.join(raiz, 'css', 'styles.css')), 'css/styles.css ya no existe: los estilos van en base.css o en css/pantallas/');
});

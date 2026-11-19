/* Carga el programa en Node, para las pruebas (tests/) y la prueba del emulador (celular/).
 * Ejecuta cada archivo de js/orden.json como un script aparte que comparte el ámbito global, igual que
 * los <script> de index.html. Así, si un archivo usa algo de otro que se carga después, las pruebas fallan
 * igual que fallaría el programa, y los errores muestran el archivo y la línea de verdad.
 * Devuelve las funciones que exporta js/arranque.js. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.join(__dirname, '..');
const archivos = JSON.parse(fs.readFileSync(path.join(__dirname, 'orden.json'), 'utf8'));

// arranque.js pregunta por `module` para saber si está en Node, y depósito usa `require` para el código de barras
const antes = globalThis.module;
const modulo = { exports: {} };
globalThis.module = modulo;
globalThis.require = require;
try {
  for (const a of archivos) {
    const ruta = path.join(raiz, a);
    vm.runInThisContext(fs.readFileSync(ruta, 'utf8'), { filename: ruta });
  }
} finally {
  if (antes === undefined) delete globalThis.module; else globalThis.module = antes;
  // `require` queda: depósito lo usa recién al dibujar un código de barras (barras128)
}

module.exports = modulo.exports;

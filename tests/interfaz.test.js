// Pruebas de Interfaz general: dónde va el globito de la ayuda «?».
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

test('ayuda «?»: el globito va abajo del botón, centrado, sin salirse de la pantalla', () => {
  const p = app.posicionGlobito;
  const boton = (left, top) => ({ left, top, bottom: top + 22, width: 22 });
  // Lugar de sobra: abajo, centrado en el botón
  assert.deepEqual(p(boton(500, 100), 200, 60, 1000, 800), { top: 130, left: 411, arriba: false, flecha: 100 });
  // Cerca del borde de abajo: arriba del botón
  assert.deepEqual(p(boton(500, 760), 200, 60, 1000, 800), { top: 692, left: 411, arriba: true, flecha: 100 });
  // Pegado a la izquierda: no se sale, y la flecha sigue apuntando al botón
  assert.deepEqual(p(boton(2, 100), 200, 60, 1000, 800), { top: 130, left: 8, arriba: false, flecha: 12 });
  // Pegado a la derecha
  assert.deepEqual(p(boton(970, 100), 200, 60, 1000, 800), { top: 130, left: 792, arriba: false, flecha: 188 });
  // No entra ni abajo ni arriba (ventana muy baja): queda adentro de la pantalla
  assert.deepEqual(p(boton(500, 40), 200, 90, 1000, 120), { top: 22, left: 411, arriba: false, flecha: 100 });
});

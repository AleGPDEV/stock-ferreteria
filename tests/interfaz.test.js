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

/* global leerPrefBarra, barraPlegadaPara */
test('barra lateral: plegada sola en pantallas angostas, abierta en las anchas', () => {
  assert.equal(barraPlegadaPara({}, 1024), true);
  assert.equal(barraPlegadaPara({}, 1199), true);
  assert.equal(barraPlegadaPara({}, 1200), false);
  assert.equal(barraPlegadaPara({}, 1920), false);
});

test('barra lateral: lo que eligió el usuario manda, para ese tamaño de pantalla', () => {
  const pref = { angosta: 'abierta', ancha: 'plegada' };
  assert.equal(barraPlegadaPara(pref, 1024), false);
  assert.equal(barraPlegadaPara(pref, 1366), true);
  // Eligió solo para la ancha: en la angosta sigue el automático
  assert.equal(barraPlegadaPara({ ancha: 'abierta' }, 1024), true);
});

test('barra lateral: lee lo guardado por versiones anteriores y no se rompe con basura', () => {
  assert.deepEqual(leerPrefBarra('plegada'), { ancha: 'plegada' });
  assert.deepEqual(leerPrefBarra('abierta'), { ancha: 'abierta' });
  assert.deepEqual(leerPrefBarra('{"angosta":"abierta"}'), { angosta: 'abierta' });
  assert.deepEqual(leerPrefBarra(null), {});
  assert.deepEqual(leerPrefBarra('{roto'), {});
  assert.deepEqual(leerPrefBarra('[1,2]'), {});
});

test('barra lateral: en el celular (820 px o menos) nunca va plegada, aunque se haya elegido plegada', () => {
  assert.equal(barraPlegadaPara({}, 820), false);
  assert.equal(barraPlegadaPara({}, 760), false);
  assert.equal(barraPlegadaPara({ angosta: 'plegada', ancha: 'plegada' }, 400), false);
  assert.equal(barraPlegadaPara({}, 821), true); // notebook angosta: plegada
});

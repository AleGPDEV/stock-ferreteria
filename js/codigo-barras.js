/* Código de barras Code 128 para las etiquetas (sin librerías: funciona sin internet).
 * Code 128 lo leen todos los lectores de código de barras y acepta letras, números y signos (P-0001, LH-5563, A-3).
 * Los números van en «código C» (dos dígitos por barra), así un EAN de 13 dígitos entra en una etiqueta chica.
 * Lo usa js/app.js (pantalla Depósito) y se prueba en tests/logica.test.js. */
(function (global) {
  'use strict';

  // Ancho de cada barra y espacio (en módulos) de los 107 símbolos de Code 128; cada uno suma 11.
  const PATRONES = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232',
  ];
  const PARADA = '2331112';
  const INICIO_B = 104, INICIO_C = 105, A_C = 99, A_B = 100;

  /** ¿Se puede poner en el código de barras? (letras sin tilde, números y signos comunes) */
  const sePuede = (t) => /^[\x20-\x7E]+$/.test(String(t || ''));

  /** Símbolos (valores 0-106) para un texto, con el control y sin la parada. null si no se puede. */
  function simbolos(texto) {
    const t = String(texto || '');
    if (!t || !sePuede(t)) return null;
    const v = [];
    let i = 0;
    let modo;
    // Arranca en C si empieza con 4 dígitos o más (o es todo números y par)
    const digitosDesde = (k) => { let j = k; while (j < t.length && t[j] >= '0' && t[j] <= '9') j++; return j - k; };
    if (digitosDesde(0) >= 4 || (digitosDesde(0) === t.length && t.length % 2 === 0)) { modo = 'C'; v.push(INICIO_C); } else { modo = 'B'; v.push(INICIO_B); }
    while (i < t.length) {
      const dig = digitosDesde(i);
      if (modo === 'B' && dig >= 6 && (i + dig === t.length ? dig % 2 === 0 || dig >= 7 : true)) { v.push(A_C); modo = 'C'; }
      if (modo === 'C') {
        if (dig >= 2) { v.push(Number(t.substr(i, 2))); i += 2; continue; }
        v.push(A_B); modo = 'B';
      }
      v.push(t.charCodeAt(i) - 32);
      i++;
    }
    const control = v.reduce((s, x, k) => s + x * (k || 1), 0) % 103;
    v.push(control);
    return v;
  }

  /** Anchos alternados barra/espacio en módulos (empieza con barra). null si el texto no se puede codificar. */
  function anchos(texto) {
    const v = simbolos(texto);
    if (!v) return null;
    return (v.map((x) => PATRONES[x]).join('') + PARADA).split('').map(Number);
  }

  /** SVG del código de barras. alto: en las unidades que se quieran (se estira al ancho de la etiqueta). */
  function svg(texto, opc = {}) {
    const a = anchos(texto);
    if (!a) return '';
    const margen = 10; // zona en blanco a los costados: sin ella el lector no lo lee
    const total = a.reduce((s, x) => s + x, 0) + margen * 2;
    let x = margen;
    const barras = [];
    a.forEach((w, k) => { if (k % 2 === 0) barras.push(`<rect x="${x}" y="0" width="${w}" height="1"/>`); x += w; });
    const alto = opc.alto || '12mm';
    return `<svg class="cb" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" style="width:100%;height:${alto}" shape-rendering="crispEdges" role="img" aria-label="Código de barras ${String(texto).replace(/[<>&"]/g, '')}"><rect width="${total}" height="1" fill="#fff"/><g fill="#000">${barras.join('')}</g></svg>`;
  }

  const api = { simbolos, anchos, svg, sePuede, PATRONES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CodigoBarras = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Código de barras para las etiquetas (sin librerías: funciona sin internet).
 * Un EAN-13, EAN-8 o UPC-A válido (el de fábrica) se dibuja como EAN-13 / EAN-8: ocupa menos lugar que en Code 128,
 * así las barras salen más gruesas y la cámara del celular las lee mejor. Se lee el mismo número.
 * Todo lo demás va en Code 128, que acepta letras, números y signos (P-0001, LH-5563, A-3); los números van en
 * «código C» (dos dígitos por barra).
 * Lo usa js/logica/etiquetas.js (etiquetas de Depósito) y se prueba en tests/logica.test.js. */
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

  /* ---------- EAN-13 y EAN-8 ---------- */
  // Dígitos de la izquierda (L o G) y de la derecha (R), 7 módulos cada uno: 1 = barra
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_R = EAN_L.map((x) => x.replace(/./g, (b) => (b === '1' ? '0' : '1')));
  const EAN_G = EAN_R.map((x) => x.split('').reverse().join(''));
  // El primer dígito de un EAN-13 no se dibuja: decide qué dígitos de la izquierda van en L y cuáles en G
  const EAN_PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  /** ¿Cierra el dígito de control (EAN-8, UPC-A o EAN-13)? */
  function controlEan(dig) {
    const n = dig.split('').map(Number), ultimo = n.pop();
    const suma = n.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (suma % 10)) % 10 === ultimo;
  }
  /** Si el texto es un EAN-13, EAN-8 o UPC-A válido: { tipo: 'ean13' | 'ean8', digitos }. Si no, null.
   * Un UPC-A (12) se dibuja como EAN-13 con un 0 adelante: es el mismo código de barras. */
  function ean(texto) {
    const t = String(texto || '').trim();
    if (!/^(\d{8}|\d{12}|\d{13})$/.test(t) || !controlEan(t)) return null;
    if (t.length === 8) return { tipo: 'ean8', digitos: t };
    return { tipo: 'ean13', digitos: t.length === 12 ? `0${t}` : t };
  }
  /** Los módulos (1 = barra, 0 = espacio) de un EAN, con sus barras de guarda. */
  function modulosEan(e) {
    const d = e.digitos.split('').map(Number);
    if (e.tipo === 'ean8') return `101${d.slice(0, 4).map((x) => EAN_L[x]).join('')}01010${d.slice(4).map((x) => EAN_R[x]).join('')}101`;
    const par = EAN_PARIDAD[d[0]];
    return `101${d.slice(1, 7).map((x, i) => (par[i] === 'L' ? EAN_L : EAN_G)[x]).join('')}01010${d.slice(7).map((x) => EAN_R[x]).join('')}101`;
  }
  /** Qué código de barras lleva un texto: 'ean13', 'ean8', 'code128' o null (no se puede). */
  const tipo = (texto) => (ean(texto) || {}).tipo || (simbolos(texto) ? 'code128' : null);
  /** Módulos en blanco que necesita a cada lado: EAN pide 11 a la izquierda (se usan 11 de los dos lados), Code 128, 10. */
  const zonaBlanca = (texto) => (ean(texto) ? 11 : 10);

  /** Anchos en Code 128 (aunque sea un EAN). null si el texto no se puede codificar. */
  function anchos128(texto) {
    const v = simbolos(texto);
    if (!v) return null;
    return (v.map((x) => PATRONES[x]).join('') + PARADA).split('').map(Number);
  }
  /** Anchos alternados barra/espacio en módulos (empieza con barra): EAN si es un EAN válido, si no Code 128.
   * null si el texto no se puede codificar. */
  function anchos(texto) {
    const e = ean(texto);
    if (e) return modulosEan(e).match(/1+|0+/g).map((x) => x.length);
    return anchos128(texto);
  }

  /** SVG del código de barras. alto: en las unidades que se quieran (se estira al ancho de la etiqueta). */
  function svg(texto, opc = {}) {
    const a = anchos(texto);
    if (!a) return '';
    const margen = zonaBlanca(texto); // zona en blanco a los costados: sin ella el lector no lo lee
    const total = a.reduce((s, x) => s + x, 0) + margen * 2;
    let x = margen;
    const barras = [];
    a.forEach((w, k) => { if (k % 2 === 0) barras.push(`<rect x="${x}" y="0" width="${w}" height="1"/>`); x += w; });
    const alto = opc.alto || '12mm';
    return `<svg class="cb" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" style="width:100%;height:${alto}" shape-rendering="crispEdges" role="img" aria-label="Código de barras ${String(texto).replace(/[<>&"]/g, '')}"><rect width="${total}" height="1" fill="#fff"/><g fill="#000">${barras.join('')}</g></svg>`;
  }

  const api = { simbolos, anchos, anchos128, svg, sePuede, PATRONES, ean, tipo, zonaBlanca, controlEan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CodigoBarras = api;
})(typeof window !== 'undefined' ? window : globalThis);

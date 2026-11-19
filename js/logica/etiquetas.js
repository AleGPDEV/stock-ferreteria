/* Etiquetas (sin pantalla): medidas de hoja A4 y de rollo, y el HTML de las etiquetas de productos
 * y estantes. La impresión directa a la etiquetadora está en pantallas/etiquetadora.js. */
'use strict';

/* Medidas de las etiquetas. A4: hoja de 24 stickers (3 × 8) de 70 × 37 mm. Rollo: impresora de etiquetas de 50 × 25 mm. */
const FORMATOS_ETIQUETA = {
  hoja: { nombre: 'Hoja A4 común: el tamaño se ajusta a cuántas van por hoja', porHoja: 0, pagina: '@page { size: A4; margin: 0; }' },
  a4: { nombre: 'Hoja A4 de stickers (24 por hoja, 70 × 37 mm)', porHoja: 24, pagina: '@page { size: A4; margin: 0; }' },
  rollo: { nombre: 'Impresora de etiquetas (rollo)', porHoja: 1, pagina: '@page { size: 50mm 25mm; margin: 0; }' },
};

/* Hoja A4 común: cuántas etiquetas por hoja y en qué grilla (columnas × filas). Con pocas, cada una sale más grande. */
// Elegidas para que la etiqueta mantenga su forma (más ancha que alta): así crece de verdad cuando son pocas
const GRILLAS_HOJA = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [1, 4], 6: [2, 3], 8: [2, 4], 10: [2, 5], 12: [2, 6], 14: [2, 7], 21: [3, 7], 24: [3, 8], 40: [4, 10], 65: [5, 13] };
const POR_HOJA = Object.keys(GRILLAS_HOJA).map(Number);
const MARGEN_HOJA = 8, SEPARACION_HOJA = 4; // mm
/** Por hoja: el elegido o, en automático (0), el más chico donde entran todas (hasta 24, para que se lean bien). */
function porHojaEtiquetas(elegido, total) {
  if (POR_HOJA.includes(Number(elegido))) return Number(elegido);
  return POR_HOJA.find((n) => n >= Math.min(Math.max(1, total), 24));
}
/** Medidas de cada etiqueta en la hoja común (mm) y cuánto se agranda el contenido (k = 1 es una de 70 × 37 mm). */
function medidaEtiquetaHoja(porHoja) {
  const [cols, filas] = GRILLAS_HOJA[porHoja] || GRILLAS_HOJA[24];
  const celdaAncho = (210 - MARGEN_HOJA * 2 - SEPARACION_HOJA * (cols - 1)) / cols;
  const celdaAlto = (297 - MARGEN_HOJA * 2 - SEPARACION_HOJA * (filas - 1)) / filas;
  // La etiqueta ocupa la celda (se recorta por la línea punteada), sin quedar más alta que 3/4 de su ancho
  const ancho = celdaAncho, alto = Math.min(celdaAlto, celdaAncho * 0.75);
  const k = Math.min(ancho / 70, alto / 37);
  const r = (x) => Math.floor(x * 10) / 10;
  return { cols, filas, celdaAncho: r(celdaAncho), celdaAlto: r(celdaAlto), ancho: r(ancho), alto: r(alto), k: Math.round(k * 100) / 100 };
}
/* Medidas de rollo de las impresoras de etiquetas (ancho × alto de una etiqueta, en mm). 50 × 25 es la de siempre. */
const MEDIDAS_ROLLO = [[50, 40], [50, 25], [40, 30], [50, 30], [58, 40], [60, 40], [100, 50], [100, 100], [100, 150]];
/** Medida válida de rollo (ancho hasta 108 mm, el máximo de las impresoras de 4 pulgadas). */
function medidaRollo(ancho, alto) {
  const a = Math.round(Number(ancho)), h = Math.round(Number(alto));
  if (!(a >= 20 && a <= 108 && h >= 15 && h <= 300)) return null;
  return { ancho: a, alto: h };
}
/** Etiquetas de rollo de otra medida: cada una ocupa su etiqueta y el contenido se agranda o achica con ella. */
function htmlEtiquetasRollo(items, m) {
  const k = Math.round(Math.min((m.ancho - 2) / 70, (m.alto - 2) / 37) * 100) / 100;
  const celdas = [];
  for (const it of items) {
    const copias = Math.max(0, Math.min(500, Math.floor(Number(it.copias) || 0)));
    const una = `<div class="pagina hoja rollo-m" style="--k:${k};width:${m.ancho}mm;height:${m.alto}mm">${htmlEtiqueta(it, 'hoja')}</div>`;
    for (let i = 0; i < copias; i++) celdas.push(una);
  }
  return { html: celdas.join(''), etiquetas: celdas.length, hojas: celdas.length, medida: m, k,
    pagina: `@page { size: ${m.ancho}mm ${m.alto}mm; margin: 0; }` };
}
/** Una etiqueta (HTML). item: { producto } o { ubicacion } (de ubicacionesDe). */
function htmlEtiqueta(item, formato) {
  const alto = formato === 'rollo' ? '9mm' : formato === 'hoja' ? 'calc(12mm * var(--k))' : '12mm';
  if (item.producto) {
    const p = item.producto;
    const cod = codigoEtiqueta(p);
    return `<div class="et et-prod"><div class="et-nom">${esc(p.nombre)}</div>
      <div class="et-cb">${cod ? barras128().svg(cod, { alto }) : '<span class="et-sin">Sin código para imprimir</span>'}</div>
      <div class="et-pie"><span class="et-cod">${esc(cod)}</span>${p.ubicacion ? `<span class="et-ubi">${esc(p.ubicacion)}</span>` : ''}</div></div>`;
  }
  const u = item.ubicacion;
  const nombres = u.productos.slice(0, formato === 'rollo' ? 0 : 3).map((p) => esc(p.nombre));
  const resto = u.productos.length - nombres.length;
  // El código de barras lleva el número corto del estante (U12): con el nombre entero las barras quedan muy finas
  const cod = u.corto || PREFIJO_UBIC + u.clave;
  return `<div class="et et-lugar"><div class="et-titulo">${esc(u.categoria || 'Ubicación')}</div><div class="et-lugar-nom${u.ubicacion.length > 10 ? ' largo' : ''}">${esc(u.ubicacion)}</div>
    <div class="et-cb">${barras128().svg(cod, { alto })}</div>${u.corto ? `<div class="et-cod et-id">${esc(u.corto)}</div>` : ''}
    ${formato === 'rollo' ? '' : `<div class="et-lista">${nombres.join(' · ')}${resto > 0 ? `${nombres.length ? ' y ' : ''}${resto} ${resto === 1 ? 'producto' : 'productos'}${nombres.length ? ' más' : ''}` : ''}</div>`}</div>`;
}

/**
 * Todas las etiquetas listas para imprimir. items: [{ producto | ubicacion, copias }].
 * saltear: en la hoja A4, cuántos stickers ya se usaron (se dejan en blanco al principio).
 * Devuelve { html, etiquetas, hojas }.
 */
function htmlEtiquetas(items, formato = 'a4', saltear = 0, porHojaElegido = 0, rollo = null) {
  const f = FORMATOS_ETIQUETA[formato] || FORMATOS_ETIQUETA.a4;
  if (formato === 'hoja') return htmlEtiquetasHoja(items, porHojaElegido);
  if (formato === 'rollo' && rollo && !(rollo.ancho === 50 && rollo.alto === 25)) return htmlEtiquetasRollo(items, rollo);
  const celdas = [];
  if (formato === 'a4') for (let i = 0; i < Math.min(Math.max(0, Math.floor(saltear) || 0), f.porHoja - 1); i++) celdas.push('<div class="et et-vacia"></div>');
  let etiquetas = 0;
  for (const it of items) {
    const copias = Math.max(0, Math.min(500, Math.floor(Number(it.copias) || 0)));
    const una = htmlEtiqueta(it, formato);
    for (let i = 0; i < copias; i++) { celdas.push(una); etiquetas++; }
  }
  const hojas = [];
  for (let i = 0; i < celdas.length; i += f.porHoja) hojas.push(`<div class="pagina ${formato === 'rollo' ? 'rollo' : 'a4'}">${celdas.slice(i, i + f.porHoja).join('')}</div>`);
  return { html: etiquetas ? hojas.join('') : '', etiquetas, hojas: etiquetas ? hojas.length : 0 };
}
/** Hoja A4 común: las etiquetas se agrandan o achican según cuántas van por hoja (elegido, o automático según cuántas se imprimen). */
function htmlEtiquetasHoja(items, porHojaElegido) {
  const celdas = [];
  for (const it of items) {
    const copias = Math.max(0, Math.min(500, Math.floor(Number(it.copias) || 0)));
    const una = htmlEtiqueta(it, 'hoja');
    for (let i = 0; i < copias; i++) celdas.push(una);
  }
  const porHoja = porHojaEtiquetas(porHojaElegido, celdas.length);
  const m = medidaEtiquetaHoja(porHoja);
  const estilo = `--k:${m.k};grid-template-columns:repeat(${m.cols},${m.celdaAncho}mm);grid-template-rows:repeat(${m.filas},${m.celdaAlto}mm);padding:${MARGEN_HOJA}mm;gap:${SEPARACION_HOJA}mm`;
  const hojas = [];
  for (let i = 0; i < celdas.length; i += porHoja) {
    hojas.push(`<div class="pagina hoja" style="${estilo}">${celdas.slice(i, i + porHoja).map((c) => `<div class="celda"><div class="et-marco" style="width:${m.ancho}mm;height:${m.alto}mm">${c}</div></div>`).join('')}</div>`);
  }
  return { html: hojas.join(''), etiquetas: celdas.length, hojas: hojas.length, porHoja, medida: m };
}

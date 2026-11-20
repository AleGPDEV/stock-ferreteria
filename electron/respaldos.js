// Qué respaldos diarios se guardan y comprobación de un respaldo recién escrito.
// Funciones sin Electron, para poder probarlas (tests/respaldos.test.js).
'use strict';
const zlib = require('zlib');

const PATRON_RESPALDO = /^respaldo_(\d{4})-(\d{2})-(\d{2})\.json(\.gz)?$/;
const DIARIOS = 7; // los 7 respaldos más nuevos
const SEMANAS = 4; // el más nuevo de cada una de las últimas 4 semanas
const MESES = 12; // el más nuevo de cada uno de los últimos 12 meses (este y los 11 anteriores)

/** Día como número (días desde 1970), sin husos horarios. null si la fecha no existe. */
function numeroDia(a, m, d) {
  const t = Date.UTC(a, m - 1, d);
  const f = new Date(t);
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return t / 864e5;
}
/** 'AAAA-MM-DD' o Date (fecha local) → { dia, mes } con mes = año * 12 + mes. */
function partesFecha(hoy) {
  if (hoy instanceof Date) return { dia: numeroDia(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate()), mes: hoy.getFullYear() * 12 + hoy.getMonth() };
  const [a, m, d] = String(hoy).split('-').map(Number);
  return { dia: numeroDia(a, m, d), mes: a * 12 + m - 1 };
}
function fechaDeNombre(nombre) {
  const x = PATRON_RESPALDO.exec(nombre);
  if (!x) return null;
  const a = Number(x[1]), m = Number(x[2]), d = Number(x[3]);
  const dia = numeroDia(a, m, d);
  return dia === null ? null : { dia, mes: a * 12 + m - 1 };
}

/**
 * De los nombres de una carpeta de respaldos, cuáles quedan: los 7 más nuevos, el más nuevo de cada una de
 * las últimas 4 semanas (contadas hacia atrás desde hoy) y el más nuevo de cada uno de los últimos 12 meses.
 * Los nombres que no son respaldo_AAAA-MM-DD.json(.gz) y los de fecha futura (la PC con la hora mal) siempre quedan.
 * Devuelve los nombres que quedan, en el mismo orden en que vinieron.
 */
function respaldosAConservar(nombres, hoy) {
  const h = partesFecha(hoy);
  const fechas = new Map(); // nombre → { dia, mes }
  for (const n of nombres) { const f = fechaDeNombre(n); if (f) fechas.set(n, f); }
  // Días con respaldo (de hoy para atrás), del más nuevo al más viejo
  const dias = [...new Set([...fechas.values()].filter((f) => f.dia <= h.dia).map((f) => f.dia))].sort((a, b) => b - a);
  const elegidos = new Set(dias.slice(0, DIARIOS));
  for (let s = 0; s < SEMANAS; s++) {
    const d = dias.find((x) => x <= h.dia - 7 * s && x > h.dia - 7 * (s + 1));
    if (d !== undefined) elegidos.add(d);
  }
  for (let m = 0; m < MESES; m++) {
    const mes = h.mes - m;
    const d = dias.find((x) => { const f = new Date(x * 864e5); return f.getUTCFullYear() * 12 + f.getUTCMonth() === mes; });
    if (d !== undefined) elegidos.add(d);
  }
  return nombres.filter((n) => { const f = fechas.get(n); return !f || f.dia > h.dia || elegidos.has(f.dia); });
}

/** Cuántos días atrás llega el respaldo más viejo de la lista (0 si no hay ninguno). */
function diasDelMasViejo(nombres, hoy) {
  const h = partesFecha(hoy);
  let max = 0;
  for (const n of nombres) { const f = fechaDeNombre(n); if (f && f.dia <= h.dia) max = Math.max(max, h.dia - f.dia); }
  return max;
}

/**
 * Comprueba un respaldo recién escrito: se descomprime y se lee entero.
 * Devuelve null si está bien, o un texto con el problema.
 */
function comprobarRespaldo(bytes) {
  let texto;
  try { texto = zlib.gunzipSync(bytes).toString('utf8'); } catch (e) { return `no se puede descomprimir (${e.code || e.message})`; }
  let d;
  try { d = JSON.parse(texto); } catch (e) { return 'el contenido no se puede leer'; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.productos) || !Array.isArray(d.movimientos)) return 'no tiene los datos del programa';
  return null;
}

module.exports = { PATRON_RESPALDO, respaldosAConservar, diasDelMasViejo, comprobarRespaldo, DIARIOS, SEMANAS, MESES };

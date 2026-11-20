/* Stock Ferretería — control de stock y caja.
 * En la versión de escritorio los datos van a una base SQLite (electron/datos.js);
 * abierto en un navegador, a localStorage (solo para probar).
 * 
 * Utilidades comunes a todo el programa: $ y $$, formatos de plata y fechas, monedas,
 * normalizar textos, y las variables globales db (los datos) y sesion (quién entró).
 * Los archivos de js/ se cargan en el orden de js/orden.json (ver «Mapa del código» en el README). */
'use strict';

const CLAVE = 'ferreteria-stock-v1';
const VISTAS = ['panel', 'caja', 'productos', 'deposito', 'movimientos', 'proveedores', 'reportes', 'ajustes'];
const DIA = 864e5;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const red = (n) => Math.round(Number(n) * 1000) / 1000;
const red2 = (n) => Math.round(Number(n) * 100) / 100;
const dinero = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 2 });
const numero = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 });
const $u = (n) => dinero.format(Number(n) || 0);
/* Productos en dólares: precio y costo en U$S, y se cobran en dólares (la venta queda en U$S, con la cotización del día) */
const plata2 = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $usd = (x) => `U$S ${plata2.format(Number(x) || 0)}`;
const esUSD = (x) => !!x && x.moneda === 'USD';
const $m = (x, moneda) => (moneda === 'USD' ? $usd(x) : $u(x));
/** «USD», «U$S», «dólares»… → 'USD'; «$», «pesos», «UYU» → 'UYU'; vacío o raro → null */
function leerMoneda(t) {
  const s = String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!s) return null;
  if (/^(usd|us\$|u\$s|u\$|us|dolar|dolares|dol|u\$d)$/.test(s.replace(/\s+/g, ''))) return 'USD';
  if (/^(\$|uyu|\$u|pesos?|uy)$/.test(s.replace(/\s+/g, ''))) return 'UYU';
  return null;
}
const n = (x) => numero.format(Number(x) || 0);
const fechaHora = (iso) => new Date(iso).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const hora = (iso) => new Date(iso).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
const isoLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inicioDia = (s) => new Date(s + 'T00:00:00').getTime();
const finDia = (s) => new Date(s + 'T23:59:59.999').getTime();
const normal = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Buscadores: ¿el texto tiene TODAS las palabras de la búsqueda, en cualquier orden? Sin importar tildes ni
 * mayúsculas: «tornillo 8» encuentra «Tornillo autoperforante 8 x 1"». Una búsqueda vacía coincide con todo. */
let busquedaAnterior = null, palabrasAnteriores = [];
function coincide(texto, busqueda) {
  if (busqueda !== busquedaAnterior) { // la misma búsqueda se compara con miles de productos: se parte una sola vez
    busquedaAnterior = busqueda;
    palabrasAnteriores = normal(busqueda).split(/\s+/).filter(Boolean);
  }
  if (!palabrasAnteriores.length) return true;
  const t = normal(texto);
  return palabrasAnteriores.every((p) => t.includes(p));
}

let db;
let sesion = null; // usuario que ingresó

const vistaInicio = () => 'caja';

/** Buscadores: llama a fn cuando se deja de escribir (ms sin teclas), en lugar de en cada tecla, así no se traba
 * con miles de productos. Borrar todo o tocar Enter (el lector de códigos termina con Enter) lo hace enseguida. */
function alDejarDeEscribir(el, fn, ms = 150) {
  let espera = null;
  const ya = () => { clearTimeout(espera); espera = null; fn(); };
  el.addEventListener('input', () => { clearTimeout(espera); if (!el.value) ya(); else espera = setTimeout(ya, ms); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && espera) ya(); });
}

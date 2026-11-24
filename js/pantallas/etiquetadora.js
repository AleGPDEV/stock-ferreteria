/* Impresión directa a la etiquetadora (TSPL, igual que la app del celular). */
'use strict';

/* ---------- Impresión directa a la etiquetadora (TSPL, igual que la app del celular) ---------- */
/* Los ajustes de la impresora de etiquetas se guardan en los datos (db.ajustesEtiquetas): quedan puestos de una
 * vez para siempre, en todas las computadoras y también al restaurar una copia. Antes estaban en el
 * almacenamiento del navegador (localStorage): la primera vez se pasan de ahí. */
const AJUSTES_ETIQUETADORA = { rollo: '50x40', directo: true, impresora: '', separacion: 2, oscuridad: 8, correrX: 0, correrY: 0, girar: false, cabezal: 0 };
const puedeEtiquetadora = () => typeof window !== 'undefined' && !!(window.almacen && window.almacen.imprimirEtiquetadora) && typeof EtiquetaTSPL !== 'undefined';
/** Los de antes, guardados en este navegador (para pasarlos a los datos la primera vez). */
function ajustesEtiquetasViejos() {
  try {
    const a = JSON.parse(localStorage.getItem('etiquetadora') || 'null') || {};
    const r = localStorage.getItem('etiquetasRollo');
    if (r) a.rollo = r;
    return a;
  } catch { return {}; }
}
function ajustesEtiquetadora() {
  const guardados = db && db.ajustesEtiquetas && typeof db.ajustesEtiquetas === 'object' ? db.ajustesEtiquetas : ajustesEtiquetasViejos();
  return { ...AJUSTES_ETIQUETADORA, ...guardados };
}
/** Pone en la ventana los ajustes guardados (al abrirla, así toma también los de una copia restaurada). */
function ponerAjustesEtiquetasEnPantalla() {
  const a = ajustesEtiquetadora();
  const g = String(a.rollo || '').split('x').map(Number);
  if (g.length === 2 && medidaRollo(g[0], g[1])) {
    if ($(`#etq-rollo option[value="${g[0]}x${g[1]}"]`)) $('#etq-rollo').value = `${g[0]}x${g[1]}`;
    else { $('#etq-rollo').value = 'otra'; $('#etq-rollo-ancho').value = g[0]; $('#etq-rollo-alto').value = g[1]; }
  }
  $('#etq-directo').checked = a.directo !== false;
  $('#etq-sep').value = a.separacion; $('#etq-osc').value = a.oscuridad; $('#etq-cx').value = a.correrX; $('#etq-cy').value = a.correrY; $('#etq-girar').checked = !!a.girar;
  $('#etq-cabezal').value = String(a.cabezal || 0);
  if (impresorasCargadas && a.impresora && $(`#etq-impresora option[value="${CSS.escape(a.impresora)}"]`)) $('#etq-impresora').value = a.impresora;
}
/** Lo que va impreso en la etiqueta térmica: { nombre, codigo, ubicacion } (el mismo dibujo que el celular). */
function itemEtiquetadora(x) {
  if (x.producto) return { nombre: x.producto.nombre, codigo: codigoEtiqueta(x.producto), ubicacion: x.producto.ubicacion || '', precio: x.producto.precio, moneda: x.producto.moneda || 'UYU' };
  const u = x.ubicacion;
  // Estante: QR con el número corto (U12), el estante grande y la categoría (ver disenoEstante)
  return { qr: true, nombre: u.categoria || 'Ubicación', codigo: u.corto || PREFIJO_UBIC + u.clave, ubicacion: u.ubicacion };
}
/** Comandos TSPL de todas las etiquetas elegidas. sel: [{ producto | ubicacion, copias }]. */
function tsplEtiquetas(sel, medida, opc) {
  return sel.filter((x) => x.copias > 0)
    .map((x) => EtiquetaTSPL.tspl(EtiquetaTSPL.disenoEtiqueta(itemEtiquetadora(x), medida), { ...opc, copias: x.copias })).join('');
}
function leerAjustesEtiquetadora() {
  const num = (sel, def, min, max) => { const v = Number(String($(sel).value).replace(',', '.')); return Number.isFinite(v) && $(sel).value !== '' ? Math.max(min, Math.min(max, v)) : def; };
  return { directo: $('#etq-directo').checked, impresora: $('#etq-impresora').value, separacion: num('#etq-sep', 2, 0, 10), oscuridad: Math.round(num('#etq-osc', 8, 1, 15)),
    correrX: num('#etq-cx', 0, -40, 40), correrY: num('#etq-cy', 0, -40, 40), girar: $('#etq-girar').checked,
    // Ancho que imprime la impresora (0 = igual que la etiqueta). Con una impresora más ancha que el rollo, sin esto
    // el dibujo «da la vuelta» de un lado al otro al correrlo (la impresora cree que la hoja mide lo que la etiqueta).
    cabezal: Number($('#etq-cabezal').value) || 0 };
}
function guardarAjustesEtiquetadora() {
  const nuevos = leerAjustesEtiquetadora();
  const m = rolloElegido();
  nuevos.rollo = m ? `${m.ancho}x${m.alto}` : ajustesEtiquetadora().rollo;
  // Si todavía no se cargó la lista de impresoras, no se pisa la que estaba guardada
  if (!impresorasCargadas) nuevos.impresora = ajustesEtiquetadora().impresora;
  if (JSON.stringify(db.ajustesEtiquetas || null) === JSON.stringify(nuevos)) return;
  db.ajustesEtiquetas = nuevos;
  guardar();
}
let impresorasCargadas = false;
async function cargarImpresoras() {
  const a = ajustesEtiquetadora();
  let lista = [];
  try { lista = await window.almacen.impresoras(); } catch { /* sin lista */ }
  // Primero la que se usó la otra vez; si no, una que parezca de etiquetas (Xprinter, Unnion, label, TSC…)
  const pareceEtiquetas = (n) => /xprinter|xp-|unnion|label|etiq|tsc|zebra|tspl|lp\d/i.test(n);
  const elegida = lista.find((p) => p.nombre === a.impresora) || lista.find((p) => pareceEtiquetas(p.nombre)) || lista.find((p) => p.predeterminada) || lista[0];
  $('#etq-impresora').innerHTML = lista.length ? lista.map((p) => `<option value="${esc(p.nombre)}">${esc(p.nombreVisible)}${p.predeterminada ? ' (predeterminada)' : ''}</option>`).join('')
    : '<option value="">No encontré impresoras instaladas en Windows</option>';
  if (elegida) $('#etq-impresora').value = elegida.nombre;
  impresorasCargadas = true;
  // La primera vez queda guardada la que se eligió sola, así la próxima ya está
  if (elegida && !a.impresora) guardarAjustesEtiquetadora();
  actualizarResumenEtiquetas();
}
function prepararEtiquetadora(formato) {
  const ok = puedeEtiquetadora() && formato === 'rollo';
  $('#etq-directo-op').hidden = !ok;
  $('#etq-directo-campos').hidden = !ok || !$('#etq-directo').checked;
  $('#etq-driver-nota').hidden = ok && $('#etq-directo').checked;
  if (ok && !impresorasCargadas) cargarImpresoras();
}
async function mandarEtiquetadora(tspl, mensajeOk) {
  const a = leerAjustesEtiquetadora();
  if (!a.impresora) { aviso('Elegí la impresora de etiquetas. Si no aparece, instalá el driver que vino con la impresora y conectala.'); return false; }
  guardarAjustesEtiquetadora();
  const b = $('#etq-imprimir'); b.disabled = true;
  try {
    const err = await window.almacen.imprimirEtiquetadora(a.impresora, tspl);
    if (err) { aviso(`No se pudo imprimir en «${a.impresora}»: ${err}`); return false; }
    toast(mensajeOk);
    return true;
  } finally { b.disabled = false; }
}
async function imprimirPruebaEtiquetadora() {
  const m = rolloElegido();
  if (!m) { aviso('Revisá la medida de la etiqueta: ancho de 20 a 108 mm y alto de 15 a 300 mm.'); return; }
  await mandarEtiquetadora(EtiquetaTSPL.tsplPrueba(m, leerAjustesEtiquetadora()), 'Etiqueta de prueba enviada: el recuadro tiene que quedar justo en el borde de la etiqueta.');
}

/** Regla de 1 mm a lo ancho de todo el cabezal: el número que queda en el borde izquierdo de la etiqueta va en
 * «Correr a los costados» (lo mismo que en la app del celular). */
async function imprimirReglaEtiquetadora() {
  const a = leerAjustesEtiquetadora();
  if (!a.cabezal) { aviso('Primero elegí en «Ancho que imprime la impresora» el de tu impresora (las Xprinter de 3 pulgadas: 72 mm).'); $('#etq-cabezal').focus(); return; }
  const m = rolloElegido();
  await mandarEtiquetadora(EtiquetaTSPL.tsplRegla({ ...a, alto: m ? m.alto : 25 }), 'Regla enviada: el número que queda en el borde izquierdo de la etiqueta va en «Correr a los costados».');
}

/** La medida de rollo elegida en la ventana de etiquetas (null si «Otra medida» está mal escrita). */
function rolloElegido() {
  const v = $('#etq-rollo').value;
  if (v === 'otra') return medidaRollo($('#etq-rollo-ancho').value, $('#etq-rollo-alto').value);
  const [a, h] = v.split('x').map(Number);
  return medidaRollo(a, h);
}
function imprimirEtiquetas() {
  const formato = 'rollo'; // solo impresora de etiquetas (las hojas A4 se sacaron)
  const sel = itemsEtiquetas().filter((x) => etq.copias.get(x.id) > 0).map((x) => ({ ...x, copias: etq.copias.get(x.id) }));
  const rollo = formato === 'rollo' ? rolloElegido() : null;
  if (formato === 'rollo' && !rollo) { aviso('Revisá la medida de la etiqueta: ancho de 20 a 108 mm y alto de 15 a 300 mm.'); return; }
  if (formato === 'rollo' && puedeEtiquetadora() && $('#etq-directo').checked) {
    const total = sel.reduce((s, x) => s + x.copias, 0);
    if (!total) return;
    guardarAjustesEtiquetadora();
    mandarEtiquetadora(tsplEtiquetas(sel, rollo, leerAjustesEtiquetadora()), `${plural(total, 'etiqueta enviada', 'etiquetas enviadas')} a la impresora.`);
    return;
  }
  const r = htmlEtiquetas(sel, formato, 0, 0, rollo);
  if (!r.etiquetas) return;
  guardarAjustesEtiquetadora();
  // La hoja de las etiquetas es distinta a la del ticket: se cambia solo mientras se imprime
  $('#impresion').classList.add('etiquetas');
  $('#estilo-etiquetas').textContent = r.pagina || FORMATOS_ETIQUETA[formato].pagina;
  imprimir(r.html);
}

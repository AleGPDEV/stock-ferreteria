/* Impresión directa a la etiquetadora (TSPL, igual que la app del celular). */
'use strict';

/* ---------- Impresión directa a la etiquetadora (TSPL, igual que la app del celular) ---------- */
const AJUSTES_ETIQUETADORA = { directo: true, impresora: '', separacion: 2, oscuridad: 8, correrX: 0, correrY: 0, girar: false, cabezal: 0 };
const puedeEtiquetadora = () => typeof window !== 'undefined' && !!(window.almacen && window.almacen.imprimirEtiquetadora) && typeof EtiquetaTSPL !== 'undefined';
function ajustesEtiquetadora() {
  try { return { ...AJUSTES_ETIQUETADORA, ...(JSON.parse(localStorage.getItem('etiquetadora') || 'null') || {}) }; } catch { return { ...AJUSTES_ETIQUETADORA }; }
}
/** Lo que va impreso en la etiqueta térmica: { nombre, codigo, ubicacion } (el mismo dibujo que el celular). */
function itemEtiquetadora(x) {
  if (x.producto) return { nombre: x.producto.nombre, codigo: codigoEtiqueta(x.producto), ubicacion: x.producto.ubicacion || '' };
  const u = x.ubicacion;
  return { nombre: u.categoria ? `${u.categoria}: ${u.ubicacion}` : `Ubicación ${u.ubicacion}`, codigo: u.corto || PREFIJO_UBIC + u.clave, ubicacion: u.ubicacion };
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
function guardarAjustesEtiquetadora() { try { localStorage.setItem('etiquetadora', JSON.stringify(leerAjustesEtiquetadora())); } catch { /* nada */ } }
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
  const formato = $('#etq-ajustes-dlg [name=etq-formato]:checked').value;
  const sel = itemsEtiquetas().filter((x) => etq.copias.get(x.id) > 0).map((x) => ({ ...x, copias: etq.copias.get(x.id) }));
  const rollo = formato === 'rollo' ? rolloElegido() : null;
  if (formato === 'rollo' && !rollo) { aviso('Revisá la medida de la etiqueta: ancho de 20 a 108 mm y alto de 15 a 300 mm.'); return; }
  if (formato === 'rollo' && puedeEtiquetadora() && $('#etq-directo').checked) {
    const total = sel.reduce((s, x) => s + x.copias, 0);
    if (!total) return;
    try { localStorage.setItem('formatoEtiquetas', formato); localStorage.setItem('etiquetasRollo', `${rollo.ancho}x${rollo.alto}`); } catch { /* nada */ }
    mandarEtiquetadora(tsplEtiquetas(sel, rollo, leerAjustesEtiquetadora()), `${plural(total, 'etiqueta enviada', 'etiquetas enviadas')} a la impresora.`);
    return;
  }
  const r = htmlEtiquetas(sel, formato, Number($('#etq-saltear').value), Number($('#etq-porhoja').value), rollo);
  if (!r.etiquetas) return;
  try {
    localStorage.setItem('formatoEtiquetas', formato); localStorage.setItem('etiquetasPorHoja', $('#etq-porhoja').value);
    if (rollo) localStorage.setItem('etiquetasRollo', `${rollo.ancho}x${rollo.alto}`);
  } catch { /* sin almacenamiento: no pasa nada */ }
  // La hoja de las etiquetas es distinta a la del ticket: se cambia solo mientras se imprime
  $('#impresion').classList.add('etiquetas');
  $('#estilo-etiquetas').textContent = r.pagina || FORMATOS_ETIQUETA[formato].pagina;
  imprimir(r.html);
}

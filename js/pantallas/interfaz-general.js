/* Interfaz general: avisos (toast y confirmar), cambiar de pantalla, alerta de stock, render() de
 * la pantalla actual, barra lateral plegable y copiar al portapapeles. */
'use strict';

/* ---------- Interfaz general ---------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

function confirmar(texto, okTexto = 'Confirmar', peligro = false, cancelTexto = 'Cancelar') {
  return new Promise((res) => {
    const d = $('#dlg-conf');
    $('#conf-texto').textContent = texto;
    $('#conf-ok').textContent = okTexto;
    $('#conf-cancel').textContent = cancelTexto;
    $('#conf-cancel').hidden = cancelTexto == null;
    $('#conf-ok').className = 'btn ' + (peligro ? 'rojo' : 'primary');
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; d.close(); res(v); };
    $('#conf-ok').onclick = () => fin(true);
    $('#conf-cancel').onclick = () => fin(false);
    d.oncancel = () => fin(false);
    d.showModal();
  });
}

/** Un aviso que hay que leer (con un solo botón). */
const aviso = (texto) => confirmar(texto, 'Entendido', false, null);

const VISTAS_ADMIN = ['panel', 'reportes', 'ajustes'];
const esAdmin = () => !!sesion && sesion.rol === 'admin';

function vistaActual() {
  const h = location.hash.slice(1);
  const inicio = vistaInicio();
  if (!VISTAS.includes(h)) return inicio;
  if (VISTAS_ADMIN.includes(h) && !esAdmin()) return inicio;
  return h;
}

function mostrarVista() {
  if (!sesion) return;
  const v = vistaActual();
  if (location.hash && location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  $$('.vista').forEach((s) => { s.hidden = s.id !== 'v-' + v; });
  $$('.nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false'));
  render();
  if (v === 'caja') setTimeout(() => $('#caja-buscar').focus(), 0);
}

/* ---------- Alerta de stock ---------- */

let alertaOcultaFirma = '';

function paraReponer() {
  const sin = [], bajo = [];
  db.productos.forEach((p) => { const e = estado(p); if (e === 'sin') sin.push(p); else if (e === 'bajo') bajo.push(p); });
  return { sin, bajo };
}

const plural = (cant, uno, varios) => `${cant} ${cant === 1 ? uno : varios}`;

function renderAlertaStock() {
  const { sin, bajo } = paraReponer();
  const total = sin.length + bajo.length;
  const badge = $('#badge-bajo');
  badge.hidden = !total;
  badge.textContent = total;
  badge.classList.toggle('danger', sin.length > 0);
  badge.title = `${plural(total, 'producto', 'productos')} para reponer`;

  const firma = sin.map((p) => p.id).join(',') + '|' + bajo.map((p) => p.id).join(',');
  const banner = $('#banner-stock');
  banner.hidden = !total || firma === alertaOcultaFirma || !['productos', 'panel', 'movimientos'].includes(vistaActual())
    || vistaActual() === 'productos' && $('#prod-estado').value === 'reponer';
  if (banner.hidden) return;
  banner.classList.toggle('urgente', sin.length > 0);
  const partes = [];
  if (sin.length) partes.push(`<strong>${plural(sin.length, 'producto sin stock', 'productos sin stock')}</strong>`);
  if (bajo.length) partes.push(`<strong>${plural(bajo.length, 'producto bajo el mínimo', 'productos bajo el mínimo')}</strong>`);
  const ejemplos = sin.concat(bajo).slice(0, 3).map((p) => esc(p.nombre)).join(', ');
  $('#banner-stock-texto').innerHTML = `Hay ${partes.join(' y ')}. ${ejemplos}${total > 3 ? ' y otros' : ''}.`;
}

function verParaReponer() {
  $('#prod-buscar').value = '';
  $('#prod-cat').value = '';
  $('#prod-estante').value = '';
  $('#prod-estado').value = 'reponer';
  if (location.hash !== '#productos') location.hash = '#productos';
  else render();
}

/** Aviso corto para mostrar después de vender o sacar del stock. */
function avisoStock(p) {
  const e = estado(p);
  if (e === 'sin') return `${p.nombre} se quedó sin stock.`;
  if (e === 'bajo') return `${p.nombre} quedó bajo el mínimo: quedan ${n(p.stock)} ${p.unidad} (mínimo ${n(p.minimo)}).`;
  return '';
}

function render() {
  if (!sesion) return;
  $('#banner-ejemplo').hidden = !db.ejemplo;
  // Los avisos de PIN inicial y clave de recuperación están en Configuración; en la barra queda un número
  const faltaPin = esAdmin() && db.usuarios.some((u) => u.pinPorDefecto);
  const faltaClave = esAdmin() && !(db.recuperacion && db.recuperacion.hash) && !db.ejemplo;
  $('#banner-pin').hidden = !faltaPin;
  $('#banner-recuperacion').hidden = !faltaClave;
  const pendientes = faltaPin + faltaClave;
  $('#badge-ajustes').hidden = !pendientes;
  $('#badge-ajustes').textContent = pendientes;
  $('#badge-ajustes').title = [faltaPin && 'Cambiar los PIN iniciales', faltaClave && 'Crear la clave de recuperación'].filter(Boolean).join(' · ');
  $('#marca-nombre').textContent = (db.negocio && db.negocio.nombre) || NOMBRE_NEGOCIO;
  renderAlertaStock();
  // Solo se dibuja la pantalla que se está viendo
  ({ panel: renderPanel, caja: renderCaja, productos: renderProductos, deposito: renderDeposito, movimientos: renderMovimientos, proveedores: renderProveedores, reportes: renderReportes, ajustes: renderAjustes })[vistaActual()]();
}

function opcionesProv(sel, vacio = 'Sin proveedor') {
  const ord = [...db.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `<option value="">${esc(vacio)}</option>` + ord.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('');
}

function ventasDelDia(fechaStr = isoLocal()) {
  const a = inicioDia(fechaStr), b = finDia(fechaStr);
  return db.ventas.filter((v) => { const t = Date.parse(v.fecha); return t >= a && t <= b; });
}

function copiarTexto(texto, aviso) {
  const ok = () => toast(aviso || 'Copiado.');
  try { navigator.clipboard.writeText(texto).then(ok, () => toast(`No se pudo copiar. Anotalo: ${texto}`)); } catch (e) { toast(`Anotalo: ${texto}`); }
}

/* Barra lateral plegable (se recuerda en esta PC) */
function aplicarBarra(plegada) {
  document.querySelector('.app').classList.toggle('barra-plegada', plegada);
  const b = $('#btn-barra');
  const t = plegada ? 'Mostrar la barra' : 'Achicar la barra';
  b.setAttribute('aria-label', t);
  b.title = t;
  b.setAttribute('aria-expanded', String(!plegada));
}
function iniciarBarra() {
  let plegada = false;
  try { plegada = localStorage.getItem('ferreteria-barra') === 'plegada'; } catch (e) { /* nada */ }
  aplicarBarra(plegada);
  $('#btn-barra').addEventListener('click', () => {
    plegada = !document.querySelector('.app').classList.contains('barra-plegada');
    aplicarBarra(plegada);
    try { localStorage.setItem('ferreteria-barra', plegada ? 'plegada' : 'abierta'); } catch (e) { /* nada */ }
  });
}

/* ---------- Ayuda «?»: un globito con la explicación ----------
 * Marcado: <button type="button" class="ayuda-ico" data-ayuda="Texto de la explicación">?</button>
 * Se activa una sola vez para toda la página (delegación): sirve también para los «?» que se dibujan después.
 * Un solo globito a la vez. Dentro de una ventana (dialog) el globito se pone en la ventana, si no queda tapado. */

/** Dónde va el globito (px de la ventana): abajo del botón; si no entra, arriba. Sin salirse por los costados.
 * boton: { top, bottom, left, width } (getBoundingClientRect). flecha: a cuántos px del borde izquierdo apunta. */
function posicionGlobito(boton, ancho, alto, vw, vh, margen = 8) {
  const sep = 8;
  let arriba = false, top = boton.bottom + sep;
  if (top + alto > vh - margen) {
    if (boton.top - sep - alto >= margen) { arriba = true; top = boton.top - sep - alto; }
    else top = Math.max(margen, vh - margen - alto);
  }
  const centro = boton.left + boton.width / 2;
  const left = Math.max(margen, Math.min(vw - margen - ancho, centro - ancho / 2));
  const flecha = Math.max(12, Math.min(ancho - 12, centro - left));
  return { top: Math.round(top), left: Math.round(left), arriba, flecha: Math.round(flecha) };
}

const ayuda = { globo: null, boton: null };

/** A cada «?» le pone lo que necesita el lector de pantalla (sin tocar su id ni su texto). */
function prepararAyuda(b) {
  if (!b.hasAttribute('aria-label')) b.setAttribute('aria-label', 'Ayuda');
  b.setAttribute('aria-expanded', b === ayuda.boton ? 'true' : 'false');
  b.setAttribute('aria-controls', 'ayuda-globo');
}
function prepararAyudas(raiz) {
  if (raiz.matches && raiz.matches('.ayuda-ico')) prepararAyuda(raiz);
  if (raiz.querySelectorAll) raiz.querySelectorAll('.ayuda-ico').forEach(prepararAyuda);
}

function cerrarAyuda() {
  if (!ayuda.boton) return;
  ayuda.boton.setAttribute('aria-expanded', 'false');
  ayuda.boton = null;
  ayuda.globo.hidden = true;
  ayuda.globo.firstChild.textContent = '';
}

function ubicarAyuda() {
  const g = ayuda.globo, b = ayuda.boton;
  if (!g || !b) return;
  const r = b.getBoundingClientRect();
  const p = posicionGlobito(r, g.offsetWidth, g.offsetHeight, document.documentElement.clientWidth, window.innerHeight);
  g.style.top = p.top + 'px';
  g.style.left = p.left + 'px';
  g.style.setProperty('--flecha', p.flecha + 'px');
  g.classList.toggle('arriba', p.arriba);
}

function abrirAyuda(b) {
  const g = ayuda.globo;
  if (ayuda.boton) cerrarAyuda();
  ayuda.boton = b;
  b.setAttribute('aria-expanded', 'true');
  // En una ventana abierta, el globito va adentro: lo de afuera queda tapado (y el lector no lo lee)
  const lugar = b.closest('dialog[open]') || document.body;
  if (g.parentNode !== lugar) lugar.appendChild(g);
  g.hidden = false;
  g.style.visibility = 'hidden';
  // El texto se pone recién ahora (con el globito ya visible): así el lector de pantalla lo anuncia
  requestAnimationFrame(() => {
    if (ayuda.boton !== b) return;
    g.firstChild.textContent = b.dataset.ayuda || '';
    ubicarAyuda();
    g.style.visibility = '';
  });
}

function iniciarAyudas() {
  const g = document.createElement('div');
  g.id = 'ayuda-globo';
  g.className = 'ayuda-globo';
  g.setAttribute('role', 'status');
  g.hidden = true;
  g.appendChild(document.createElement('span'));
  document.body.appendChild(g);
  ayuda.globo = g;
  prepararAyudas(document);
  // Los «?» que se dibujan después (listas, pantallas) también llevan su aria-label
  new MutationObserver((cambios) => {
    for (const c of cambios) c.addedNodes.forEach((n) => { if (n.nodeType === 1 && n !== g) prepararAyudas(n); });
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.ayuda-ico');
    if (!b) return;
    e.preventDefault(); // dentro de un <label>, que no active el campo
    if (ayuda.boton === b) cerrarAyuda(); else abrirAyuda(b);
  });
  // Tocar afuera lo cierra (tocar el mismo «?» lo resuelve el click de arriba)
  document.addEventListener('pointerdown', (e) => {
    if (!ayuda.boton || g.contains(e.target) || ayuda.boton.contains(e.target)) return;
    cerrarAyuda();
  }, true);
  // Escape cierra solo el globito, no la ventana en la que está
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !ayuda.boton) return;
    e.preventDefault();
    e.stopPropagation();
    const b = ayuda.boton;
    cerrarAyuda();
    if (b.isConnected) b.focus();
  }, true);
  // Si se cierra la ventana, cambia la pantalla o se mueve la página, el globito se va
  document.addEventListener('close', (e) => { if (ayuda.boton && e.target.contains(ayuda.boton)) cerrarAyuda(); }, true);
  window.addEventListener('hashchange', cerrarAyuda);
  window.addEventListener('resize', cerrarAyuda);
  document.addEventListener('scroll', (e) => { if (ayuda.boton && !g.contains(e.target)) cerrarAyuda(); }, true);
}

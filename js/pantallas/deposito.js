/* Pantalla Depósito: ¿dónde está?, estantes, recibir mercadería escaneando y la ventana de etiquetas. */
'use strict';

/* ---------- Pantalla Depósito ---------- */

let depTexto = ''; // lo último que se buscó, para volver a mostrarlo al entrar
const etq = { tipo: 'producto', copias: new Map() }; // ventana de etiquetas: id del producto o clave de la ubicación → copias

let depUltimoEstante = ''; // el último estante elegido queda puesto para el siguiente producto (se carga estante por estante)

/** Opciones de estantes agrupadas por categoría. */
function opcionesEstante(sel, vacio = 'Elegí el estante') {
  const ubics = ubicacionesDe(db);
  if (!ubics.length) return '<option value="">Primero cargá los estantes (botón «Nuevo estante»)</option>';
  const grupos = new Map();
  ubics.forEach((u) => { const c = u.categoria || 'Sin categoría'; if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(u); });
  const orden = [...grupos.keys()].sort((x, y) => (x === 'Sin categoría') - (y === 'Sin categoría') || ordenNatural(x, y));
  return `<option value="">${esc(vacio)}</option>` + orden.map((c) => `<optgroup label="${esc(c)}">${grupos.get(c).map((u) => `<option value="${esc(u.clave)}" ${u.clave === sel ? 'selected' : ''}>${esc(u.ubicacion)}${u.categoria ? ' · ' + esc(u.categoria) : ''}</option>`).join('')}</optgroup>`).join('');
}
const categoriaDeUbic = (ubic) => (ubicacionesDe(db).find((u) => u.clave === claveUbic(ubic)) || {}).categoria || '';

function htmlDonde(r) {
  const fila = (p) => `<li><button type="button" class="dep-item" data-dep-prod="${p.id}">${miniatura(p)}<span class="dep-item-txt"><strong>${esc(p.nombre)}</strong><span class="meta"><span class="mono">${esc(p.codigo)}</span> · stock ${n(p.stock)} ${esc(p.unidad)}</span></span><span class="dep-item-ubi">${p.ubicacion ? esc(p.ubicacion) : '<span class="meta">sin ubicación</span>'}</span></button></li>`;
  const cantidad = (id, idBoton) => `<label class="f dep-cant" for="${id}">¿Cuántos llegaron? <small>Opcional: dejalo vacío si solo lo estás ubicando.</small>
      <span class="dep-fila"><input id="${id}" type="number" min="0" step="any" inputmode="decimal" autocomplete="off">${idBoton ? `<button class="btn verde" type="button" data-dep-recibir="${idBoton}">Sumar al stock</button>` : ''}</span></label>`;
  if (r.tipo === 'vacio') return '<p class="vacio">Escaneá un producto o la etiqueta de un estante, o escribí un nombre.</p>';
  if (r.tipo === 'nada') return `<p class="vacio">No encontré nada con eso. Probá con otra palabra${r.texto ? `, o <button type="button" class="link-btn" data-dep-sincodigo="${esc(r.texto)}">cargalo como producto sin código</button>` : ''}.</p>`;
  if (r.tipo === 'sincodigo' || r.tipo === 'nuevo') {
    const sin = r.tipo === 'sincodigo';
    return `<form class="dep-nuevo" id="dep-nuevo" data-codigo="${sin ? '' : esc(r.codigo)}" ${sin ? 'data-sincodigo="1"' : ''} novalidate>
      ${sin
        ? `<p class="dep-nuevo-cab"><span class="chip warn">Producto sin código</span> Para lo que viene suelto, sin código de barras. El programa le da un código propio (<span class="mono">${esc(codigoLibreDe(db))}</span>) y después imprimís su etiqueta para pegarla en el producto o en el estante.</p>`
        : `<p class="dep-nuevo-cab"><span class="chip warn">Producto nuevo</span> El código <span class="mono">${esc(r.codigo)}</span> no está cargado. Poné el nombre y elegí el estante: la próxima vez que llegue, ya vas a saber dónde va.</p>`}
      <label class="f" for="dep-n-nombre">Nombre del producto<input id="dep-n-nombre" type="text" autocomplete="off" placeholder="Ej.: Codo PVC 110 mm" value="${sin ? esc(r.nombre || '') : ''}"></label>
      <label class="f" for="dep-n-estante">¿En qué estante va?<select id="dep-n-estante">${opcionesEstante(depUltimoEstante)}</select><small>La categoría del producto es la del estante. El precio se completa después en Productos.</small></label>
      ${cantidad('dep-n-cant')}
      <p class="err" id="dep-n-err" role="alert"></p>
      <div class="dep-fila"><button class="btn primary btn-grande" type="submit">${sin ? 'Guardar e imprimir etiqueta' : 'Guardar producto'}</button></div>
      ${sin ? '' : `<details class="dep-vincular"><summary>¿Ya está cargado en el programa sin este código? Buscalo acá</summary>
        <input id="dep-v-buscar" type="text" autocomplete="off" placeholder="Nombre o código del producto"><ul id="dep-v-lista" class="dep-lista"></ul></details>`}
    </form>`;
  }
  if (r.tipo === 'producto') {
    const p = r.producto;
    const e = estado(p);
    const cat = p.ubicacion ? categoriaDeUbic(p.ubicacion) : '';
    return `<div class="dep-prod">
      <div class="dep-prod-cab">${miniatura(p, 'grande')}<div><div class="dep-prod-nom">${esc(p.nombre)}${p.revisar ? ' <span class="chip info">Nuevo · falta el precio</span>' : ''}</div>
        <div class="meta"><span class="mono">${esc(textoCodigos(p))}</span>${p.categoria ? ' · ' + esc(p.categoria) : ''}</div></div></div>
      <div class="dep-ubi${p.ubicacion ? '' : ' sin'}"><span class="dep-ubi-lbl">${p.ubicacion ? 'Va en' : 'Todavía no tiene estante'}</span><span class="dep-ubi-txt">${p.ubicacion ? esc(p.ubicacion) : 'Elegí dónde va'}</span>${cat ? `<span class="dep-ubi-cat">${esc(cat)}</span>` : ''}</div>
      <div class="dep-datos"><span>Hay <strong>${n(p.stock)} ${esc(p.unidad)}</strong></span>
        ${e === 'sin' ? '<span class="chip danger">Sin stock</span>' : e === 'bajo' ? '<span class="chip warn">Bajo el mínimo</span>' : ''}
        <button class="btn sm" type="button" data-etq-uno="${p.id}">Imprimir su etiqueta</button></div>
      <div class="dep-acciones">
        ${cantidad('dep-cant', p.id)}
        <label class="f" for="dep-estante">${p.ubicacion ? 'Cambiar de estante' : '¿En qué estante va?'}
          <span class="dep-fila"><select id="dep-estante">${opcionesEstante(p.ubicacion ? claveUbic(p.ubicacion) : depUltimoEstante)}</select><button class="btn primary" type="button" data-dep-ubicar="${p.id}">Guardar estante</button></span></label>
        <p class="err" id="dep-err" role="alert"></p>
      </div>
    </div>`;
  }
  if (r.tipo === 'ubicacion') {
    const u = r.ubicacion;
    return `<div class="dep-lugar-cab"><div><span class="dep-ubi-lbl">${esc(u.categoria || 'Estante')}</span><div class="dep-ubi-txt">${esc(u.ubicacion)}</div><div class="meta">${plural(u.productos.length, 'producto', 'productos')}</div></div>
      <div class="dep-fila"><button class="btn sm" type="button" data-estante-editar="${esc(u.clave)}">${u.estanteId ? 'Cambiar estante' : 'Ponerle categoría'}</button>
      <button class="btn sm" type="button" data-etq-ubic="${esc(u.clave)}">Imprimir etiquetas de este lugar</button></div></div>
      <ul class="dep-lista">${u.productos.map(fila).join('') || '<li class="vacio">Todavía no tiene productos. Escaneá uno y elegí este estante.</li>'}</ul>`;
  }
  return `<p class="meta">${plural(r.productos.length, 'producto encontrado', 'productos encontrados')}. Tocá uno para ver dónde está.</p>
    <ul class="dep-lista">${r.productos.slice(0, 40).map(fila).join('')}</ul>${r.productos.length > 40 ? '<p class="meta">Hay más: escribí algo más preciso.</p>' : ''}`;
}

function mostrarDonde(texto, enter = false) {
  depTexto = texto;
  const r = dondeEsta(db, texto);
  // Mientras se escribe a mano no se ofrece cargar un producto nuevo: solo al escanear o tocar Enter
  const t = String(texto || '').trim();
  $('#dep-resultado').innerHTML = htmlDonde(r.tipo === 'nuevo' && !enter ? { tipo: 'nada', texto: t } : r.tipo === 'nada' ? { ...r, texto: t } : r);
  if (r.tipo === 'nuevo' && enter) setTimeout(() => $('#dep-n-nombre').focus(), 0);
}
/** Formulario para cargar un producto suelto que no trae código de barras. */
function abrirSinCodigoDep(nombre = '') {
  $('#dep-resultado').innerHTML = htmlDonde({ tipo: 'sincodigo', nombre });
  $('#dep-resultado').scrollIntoView({ block: 'nearest' });
  setTimeout(() => $('#dep-n-nombre').focus(), 0);
}
function verProductoDep(p, aviso) {
  depTexto = p.codigo;
  $('#dep-resultado').innerHTML = htmlDonde({ tipo: 'producto', producto: p });
  if (aviso) toast(aviso);
  render();
  const b = $('#dep-buscar'); b.focus(); b.select(); // listo para escanear el próximo
}
function abrirEstante(clave, codigoNuevo = '') {
  const u = clave ? ubicacionesDe(db).find((x) => x.clave === clave) : null;
  const e = u && u.estanteId ? estantesDe(db).find((x) => x.id === u.estanteId) : null;
  $('#est-form').dataset.id = e ? e.id : '';
  $('#est-titulo').textContent = e ? `Estante ${e.codigo}` : 'Nuevo estante';
  $('#est-codigo').value = e ? e.codigo : (u ? u.ubicacion : codigoNuevo);
  $('#est-categoria').value = e ? e.categoria : '';
  $('#est-cats').innerHTML = [...new Set(db.productos.map((p) => p.categoria).concat(estantesDe(db).map((x) => x.categoria)).filter(Boolean))].sort(ordenNatural).map((c) => `<option value="${esc(c)}">`).join('');
  $('#est-borrar').hidden = !(e && esAdmin());
  $('#est-err').textContent = '';
  $('#dlg-estante').showModal();
}

function renderDeposito() {
  const ubics = ubicacionesDe(db);
  const sinUbic = db.productos.filter((p) => !claveUbic(p.ubicacion)).length;
  $('#dep-sub').textContent = `${plural(ubics.length, 'estante', 'estantes')} · ${plural(sinUbic, 'producto sin estante', 'productos sin estante')}`;
  $('#dep-ubicaciones').innerHTML = ubics.map((u) => `<button type="button" class="dep-ubic" data-dep-ubic="${esc(u.clave)}"><strong>${esc(u.ubicacion)}</strong>${u.categoria ? `<em>${esc(u.categoria)}</em>` : ''}<span>${plural(u.productos.length, 'producto', 'productos')}${u.corto ? ` · <span class="mono">${esc(u.corto)}</span>` : ''}</span></button>`).join('')
    || '<p class="vacio">Todavía no hay estantes. Tocá «Nuevo estante» y poné, por ejemplo, A-1 · Sanitaria.</p>';
  $('#dep-resultado').innerHTML = htmlDonde(dondeEsta(db, depTexto));
  // El lector de códigos escribe donde está el cursor: se deja en el buscador (salvo que se esté escribiendo en otro lado)
  const activo = document.activeElement;
  if (!document.querySelector('dialog[open]') && !(activo && activo.matches('input, textarea, select'))) setTimeout(() => $('#dep-buscar').focus(), 0);
}

/* Ventana «Imprimir etiquetas» */
function itemsEtiquetas() {
  if (etq.tipo === 'ubicacion') return ubicacionesDe(db).map((u) => ({ id: u.clave, ubicacion: u, nombre: u.ubicacion, detalle: [u.categoria, plural(u.productos.length, 'producto', 'productos')].filter(Boolean).join(' · ') }));
  return db.productos.slice().sort((a, b) => ordenNatural(a.ubicacion || '~', b.ubicacion || '~') || ordenNatural(a.nombre, b.nombre))
    .map((p) => ({ id: p.id, producto: p, nombre: p.nombre, detalle: [codigoEtiqueta(p) || 'sin código para imprimir', p.ubicacion || 'sin ubicación'].join(' · '), ubic: claveUbic(p.ubicacion), sinFabrica: !tieneCodigoFabrica(p) }));
}
/** Lo que se ve en la lista de etiquetas con los filtros puestos (búsqueda, ubicación y «solo sin código de fábrica»). */
function etiquetasFiltradas(todos = itemsEtiquetas()) {
  const q = normal($('#etq-buscar').value.trim());
  const fu = $('#etq-ubic').value;
  const sinFab = etq.tipo === 'producto' && $('#etq-sinfab').checked;
  return todos.filter((x) => (!q || normal(`${x.nombre} ${x.detalle}`).includes(q)) && (etq.tipo !== 'producto' || !fu || x.ubic === fu) && (!sinFab || x.sinFabrica));
}

function renderEtiquetas() {
  const todos = itemsEtiquetas();
  const lista = etiquetasFiltradas(todos);
  $('#etq-filtro-ubic').hidden = etq.tipo !== 'producto';
  $('#etq-lista').innerHTML = lista.map((x) => {
    const c = etq.copias.get(x.id) || 0;
    return `<li class="${c ? 'sel' : ''}"><label class="check"><input type="checkbox" data-etq-sel="${esc(x.id)}" ${c ? 'checked' : ''}> <span><strong>${esc(x.nombre)}</strong><span class="meta">${esc(x.detalle)}</span></span></label>
      <label class="etq-copias">Copias <input type="number" min="0" max="500" step="1" inputmode="numeric" data-etq-copias="${esc(x.id)}" value="${c}"></label></li>`;
  }).join('') || '<li class="vacio">Nada coincide.</li>';
  const formato = $('#etq-ajustes-dlg [name=etq-formato]:checked').value;
  $('#etq-saltear-campo').hidden = formato !== 'a4';
  $('#etq-porhoja-campo').hidden = formato !== 'hoja';
  $('#etq-rollo-campo').hidden = formato !== 'rollo';
  $('#etq-rollo-otra').hidden = $('#etq-rollo').value !== 'otra';
  prepararEtiquetadora(formato);
  const rollo = formato === 'rollo' ? rolloElegido() : null;
  actualizarResumenEtiquetas(formato, rollo);
  const sel = todos.filter((x) => etq.copias.get(x.id) > 0).map((x) => ({ ...x, copias: etq.copias.get(x.id) }));
  const r = htmlEtiquetas(sel, formato, Number($('#etq-saltear').value), Number($('#etq-porhoja').value), rollo);
  if (formato === 'hoja') {
    const ph = porHojaEtiquetas(Number($('#etq-porhoja').value), r.etiquetas);
    const m = medidaEtiquetaHoja(ph);
    $('#etq-porhoja-ayuda').textContent = `${ph} por hoja: cada etiqueta de ${n(Math.round(m.ancho))} × ${n(Math.round(m.alto))} mm.${Number($('#etq-porhoja').value) ? '' : ' Se elige solo según cuántas imprimís.'}`;
  }
  $('#etq-cuenta').textContent = r.etiquetas
    ? `Se van a imprimir ${plural(r.etiquetas, 'etiqueta', 'etiquetas')}${formato !== 'rollo' ? ` en ${plural(r.hojas, 'hoja', 'hojas')}` : ''}.`
    : 'Marcá lo que quieras imprimir.';
  $('#etq-imprimir').disabled = !r.etiquetas;
  // Muestra: en la hoja común, la primera hoja entera en chico; si no, la primera etiqueta en su tamaño
  const primera = sel[0];
  $('#etq-muestra').className = `etq-muestra ${formato}`;
  $('#etq-muestra').className = `etq-muestra ${formato}${r.medida && formato === 'rollo' ? ' rollo-m' : ''}`;
  $('#etq-muestra').innerHTML = !primera ? '' : formato === 'hoja' ? r.html.split('<div class="pagina hoja"').slice(0, 2).join('<div class="pagina hoja"')
    : formato === 'rollo' && r.medida ? r.html.split('<div class="pagina hoja rollo-m"').slice(0, 2).join('<div class="pagina hoja rollo-m"') : htmlEtiqueta(primera, formato);
}

/** La línea «Imprime en …» de la ventana de imprimir. */
function actualizarResumenEtiquetas(formato = $('#etq-ajustes-dlg [name=etq-formato]:checked').value, rollo = formato === 'rollo' ? rolloElegido() : null) {
  const op = $('#etq-impresora').selectedOptions[0];
  const impresora = $('#etq-impresora').value && op ? op.textContent.replace(/ \(predeterminada\)$/, '') : ajustesEtiquetadora().impresora;
  $('#etq-config-resumen').textContent = resumenAjustesEtiquetas({ formato, porHoja: $('#etq-porhoja').value, rollo,
    directo: formato === 'rollo' && puedeEtiquetadora() && $('#etq-directo').checked, impresora });
}
/** Los ajustes de la ventana «Cómo se imprimen las etiquetas» se guardan al cambiarlos (no solo al imprimir). */
function guardarFormatoEtiquetas() {
  const formato = $('#etq-ajustes-dlg [name=etq-formato]:checked').value;
  const rollo = rolloElegido();
  try {
    localStorage.setItem('formatoEtiquetas', formato); localStorage.setItem('etiquetasPorHoja', $('#etq-porhoja').value);
    if (rollo) localStorage.setItem('etiquetasRollo', `${rollo.ancho}x${rollo.alto}`);
  } catch { /* sin almacenamiento: no pasa nada */ }
}

function abrirEtiquetas(tipo, marcar = [], opciones = {}) {
  // Las etiquetas de estante llevan el número corto: las ubicaciones sin estante pasan a ser estantes y se numeran
  if (tipo === 'ubicacion' && completarEstantes(db)) guardar();
  etq.tipo = tipo;
  etq.copias = new Map(marcar.map((id) => [id, 1]));
  $('#etq-titulo').textContent = tipo === 'ubicacion' ? 'Imprimir etiquetas de estantes' : 'Imprimir etiquetas de productos';
  $('#etq-buscar').value = '';
  $('#etq-sinfab').checked = !!opciones.sinFabrica;
  $('#etq-ubic').innerHTML = '<option value="">Todas las ubicaciones</option>' + ubicacionesDe(db).map((u) => `<option value="${esc(u.clave)}">${esc(u.ubicacion)}</option>`).join('');
  renderEtiquetas();
  $('#etq-dlg').showModal();
}

const rafagaDep = { el: null, antes: '', texto: '', ult: 0 };
/** ¿Quedó escrita una cantidad sin tocar «Sumar al stock» (o sin guardar el producto nuevo)? */
function cantidadSinSumarDep() {
  const c = $('#dep-cant'), b = $('[data-dep-recibir]');
  if (c && b && c.value.trim() && Number(c.value) > 0) { const p = producto(b.dataset.depRecibir); return p ? { cantidad: c.value.trim(), nombre: p.nombre } : null; }
  const cn = $('#dep-n-cant'), nom = $('#dep-n-nombre');
  if (cn && cn.value.trim() && Number(cn.value) > 0) return { cantidad: cn.value.trim(), nombre: (nom && nom.value.trim()) || 'el producto nuevo', nuevo: true };
  return null;
}
function avisoPendienteDep(x) {
  aviso(x.nuevo
    ? `No se guardó ${x.nombre} ni se sumaron los ${x.cantidad} que escribiste: faltó tocar «Guardar producto». Volvé a escanearlo para cargarlo.`
    : `No se sumaron los ${x.cantidad} de ${x.nombre}: faltó tocar «Sumar al stock». Si llegaron, volvé a escanearlo y sumalos.`);
}
function vigilarEscanerDeposito(e) {
  const el = e.target;
  if (!el || !el.closest || !el.closest('#v-deposito') || el.id === 'dep-buscar' || !el.matches('input, textarea')) return;
  const ahora = (typeof performance !== 'undefined' ? performance : Date).now();
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (rafagaDep.el !== el || ahora - rafagaDep.ult > 60) { rafagaDep.el = el; rafagaDep.antes = el.value; rafagaDep.texto = ''; }
    rafagaDep.texto += e.key;
    rafagaDep.ult = ahora;
    return;
  }
  // Teclas muy seguidas y Enter: es el lector. Desde 3 letras, para las etiquetas de estante (U12).
  if (e.key === 'Enter' && rafagaDep.el === el && /^[0-9A-Za-z.\-']{3,}$/.test(rafagaDep.texto) && /\d/.test(rafagaDep.texto) && ahora - rafagaDep.ult < 100) {
    e.preventDefault();
    e.stopPropagation();
    const codigo = rafagaDep.texto.trim();
    el.value = rafagaDep.antes;
    rafagaDep.el = null;
    const pendiente = cantidadSinSumarDep();
    $('#dep-buscar').value = codigo;
    mostrarDonde(codigo, true);
    if (!$('#dep-nuevo')) { $('#dep-buscar').focus(); $('#dep-buscar').select(); }
    if (pendiente) avisoPendienteDep(pendiente);
    else toast(`Se escaneó ${codigo} con el cursor en un campo: busqué ese código.`);
  }
}

function iniciarDeposito() {
  // Al terminar de imprimir (o cancelar) se vuelve a la hoja del ticket
  window.addEventListener('afterprint', () => { $('#impresion').classList.remove('etiquetas'); $('#estilo-etiquetas').textContent = ''; });
  const buscar = $('#dep-buscar');
  const lista = $('#dep-sugerencias');
  let sugeridas = [], marcada = -1;
  const cerrarSugerencias = () => { lista.hidden = true; lista.innerHTML = ''; sugeridas = []; marcada = -1; buscar.setAttribute('aria-expanded', 'false'); buscar.removeAttribute('aria-activedescendant'); };
  // Resalta en negrita lo que coincide con lo escrito
  const resaltar = (texto, pal) => {
    const t = String(texto || ''), base = normal(t);
    const marcas = new Array(t.length).fill(false);
    pal.forEach((w) => { let i = base.indexOf(w); while (w && i >= 0) { for (let k = i; k < i + w.length; k++) marcas[k] = true; i = base.indexOf(w, i + w.length); } });
    let html = '', dentro = false;
    for (let i = 0; i < t.length; i++) { if (marcas[i] !== dentro) { html += marcas[i] ? '<mark>' : '</mark>'; dentro = marcas[i]; } html += esc(t[i]); }
    return html + (dentro ? '</mark>' : '');
  };
  const pintarSugerencias = () => {
    const pal = normal(buscar.value.trim()).split(/\s+/).filter(Boolean);
    lista.innerHTML = sugeridas.map((s, i) => {
      const sel = i === marcada ? 'true' : 'false';
      if (s.tipo === 'ubicacion') {
        const u = s.ubicacion;
        return `<li id="dep-sug-${i}" class="combo-op dep-sug" role="option" aria-selected="${sel}" data-sug="${i}"><span><span class="chip">Estante</span> ${resaltar(u.ubicacion, pal)}${u.categoria ? ` <span class="meta">· ${esc(u.categoria)}</span>` : ''}</span><small>${plural(u.productos.length, 'producto', 'productos')}</small></li>`;
      }
      const p = s.producto;
      return `<li id="dep-sug-${i}" class="combo-op dep-sug" role="option" aria-selected="${sel}" data-sug="${i}"><span class="dep-sug-txt"><span>${resaltar(p.nombre, pal)}</span><span class="meta mono">${esc(p.codigo)}</span></span><small>${p.categoria ? resaltar(p.categoria, pal) + ' · ' : ''}${p.ubicacion ? esc(p.ubicacion) : 'sin estante'} · ${n(p.stock)} ${esc(p.unidad)}</small></li>`;
    }).join('');
    lista.hidden = !sugeridas.length;
    buscar.setAttribute('aria-expanded', String(!!sugeridas.length));
    if (marcada >= 0) { buscar.setAttribute('aria-activedescendant', `dep-sug-${marcada}`); const li = $(`#dep-sug-${marcada}`); if (li) li.scrollIntoView({ block: 'nearest' }); }
    else buscar.removeAttribute('aria-activedescendant');
  };
  const elegirSugerencia = (i) => {
    const s = sugeridas[i];
    if (!s) return;
    cerrarSugerencias();
    if (s.tipo === 'producto') { buscar.value = s.producto.nombre; depTexto = s.producto.codigo; }
    else { buscar.value = s.ubicacion.ubicacion; depTexto = s.ubicacion.ubicacion; }
    $('#dep-resultado').innerHTML = htmlDonde(s);
    buscar.select();
  };
  let ultimaTecla = 0, rapido = false;
  buscar.addEventListener('input', () => {
    // El lector escribe muy rápido (menos de 40 ms entre letras): no se muestran sugerencias en medio de un escaneo
    sugeridas = buscar.value.trim() && !rapido ? sugerenciasDeposito(db, buscar.value) : [];
    marcada = -1;
    pintarSugerencias();
    if (!buscar.value.trim()) mostrarDonde('');
  });
  buscar.addEventListener('keydown', (e) => {
    if (e.key && e.key.length === 1) { const ahora = performance.now(); rapido = ahora - ultimaTecla < 40; ultimaTecla = ahora; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && sugeridas.length) {
      e.preventDefault();
      marcada = e.key === 'ArrowDown' ? (marcada + 1) % sugeridas.length : (marcada <= 0 ? sugeridas.length - 1 : marcada - 1);
      pintarSugerencias();
      return;
    }
    if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); e.stopPropagation(); cerrarSugerencias(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const pendiente = cantidadSinSumarDep();
    if (marcada >= 0 && sugeridas[marcada]) { elegirSugerencia(marcada); if (pendiente) avisoPendienteDep(pendiente); return; }
    cerrarSugerencias();
    mostrarDonde(buscar.value, true);
    if (pendiente && !$('#dep-cant, #dep-n-cant')?.value) avisoPendienteDep(pendiente);
    buscar.select(); // así el próximo escaneo reemplaza lo anterior
  });
  // mousedown y no click: así el cuadro no pierde el foco antes de elegir
  lista.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-sug]'); if (!li) return; e.preventDefault(); elegirSugerencia(Number(li.dataset.sug)); });
  lista.addEventListener('mousemove', (e) => { const li = e.target.closest('[data-sug]'); if (li && Number(li.dataset.sug) !== marcada) { marcada = Number(li.dataset.sug); pintarSugerencias(); } });
  buscar.addEventListener('blur', () => setTimeout(cerrarSugerencias, 120));
  const usuario = () => (sesion ? sesion.nombre : '');
  $('#dep-resultado').addEventListener('click', (e) => {
    const rec = e.target.closest('[data-dep-recibir]');
    if (rec) { sumarLlegadaDep(producto(rec.dataset.depRecibir)); return; }
    const ubi = e.target.closest('[data-dep-ubicar]');
    if (ubi) {
      const p = producto(ubi.dataset.depUbicar);
      const err = ubicarProducto(db, p.id, $('#dep-estante').value);
      if (err) { $('#dep-err').textContent = err; return; }
      depUltimoEstante = claveUbic(p.ubicacion);
      guardar();
      verProductoDep(p, `Listo: ${p.nombre} va en ${p.ubicacion}.`);
      return;
    }
    const vin = e.target.closest('[data-dep-vincular]');
    if (vin) {
      const p = producto(vin.dataset.depVincular);
      const codigo = $('#dep-nuevo').dataset.codigo;
      const err = asignarBarras(db, p, codigo);
      if (err) { $('#dep-n-err').textContent = err; return; }
      guardar();
      verProductoDep(p, `Listo: el código ${codigo} quedó en ${p.nombre}.`);
      return;
    }
    const est = e.target.closest('[data-estante-editar]');
    if (est) abrirEstante(est.dataset.estanteEditar);
  });
  $('#dep-resultado').addEventListener('input', (e) => {
    if (e.target.id !== 'dep-v-buscar') return;
    const q = normal(e.target.value.trim());
    const lista = q.length < 2 ? [] : db.productos.filter((p) => normal(`${textoCodigos(p)} ${p.nombre}`).includes(q)).slice(0, 12);
    $('#dep-v-lista').innerHTML = lista.map((p) => `<li><button type="button" class="dep-item" data-dep-vincular="${p.id}"><span class="dep-item-txt"><strong>${esc(p.nombre)}</strong><span class="meta"><span class="mono">${esc(p.codigo)}</span>${p.ubicacion ? ' · ' + esc(p.ubicacion) : ''}</span></span><span class="dep-item-ubi">Es este</span></button></li>`).join('')
      || (q.length >= 2 ? '<li class="vacio">No encontré ninguno.</li>' : '');
  });
  $('#dep-resultado').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'dep-cant') { e.preventDefault(); const b = $('[data-dep-recibir]'); if (b) b.click(); }
  });
  $('#dep-resultado').addEventListener('submit', (e) => {
    if (e.target.id !== 'dep-nuevo') return;
    e.preventDefault();
    cargarNuevoDep(e.target);
  });
  async function cargarNuevoDep(f) {
    // La cantidad se revisa antes de crear el producto: un número enorme no se acepta y uno grande se confirma
    const rv = revisarCantidadDeposito($('#dep-n-cant').value);
    if (rv.error) { $('#dep-n-err').textContent = rv.error; $('#dep-n-cant').focus(); return; }
    const nombre = $('#dep-n-nombre').value;
    if (rv.grande && !(await confirmar(`¿Llegaron ${n(rv.cantidad)} de «${nombre.trim()}»? Es una cantidad grande.`, 'Sí, llegaron'))) { $('#dep-n-cant').focus(); return; }
    const sin = !!f.dataset.sincodigo;
    const r = altaEnDeposito(db, { codigo: f.dataset.codigo, sinCodigo: sin, nombre, ubicacion: $('#dep-n-estante').value }, usuario(), sesion ? sesion.rol : '');
    if (r.error) { $('#dep-n-err').textContent = r.error; return; }
    const cant = rv.cantidad;
    if (cant > 0) recibirEnDeposito(db, r.producto.id, cant);
    depUltimoEstante = claveUbic(r.producto.ubicacion);
    guardar();
    verProductoDep(r.producto, `Listo: ${r.producto.nombre} quedó cargado en ${r.producto.ubicacion}${sin ? ` con el código ${r.producto.codigo}` : ''}${cant > 0 ? ` y ${n(cant)} en stock` : ''}.`);
    // Sin código de fábrica, la etiqueta es lo que lo hace escaneable: se abre lista con una copia
    // (lo suelto suele llevar una sola, en la caja o el estante; si van en cada uno, se cambian las copias)
    if (sin) abrirEtiquetas('producto', [r.producto.id]);
  }
  async function sumarLlegadaDep(p) {
    const rv = revisarCantidadDeposito($('#dep-cant').value);
    const err = rv.error || (rv.cantidad > 0 ? '' : 'Escribí cuántos llegaron.');
    if (err) { $('#dep-err').textContent = err; $('#dep-cant').focus(); return; }
    if (rv.grande && !(await confirmar(`¿Llegaron ${n(rv.cantidad)} de ${p.nombre}? Es una cantidad grande.`, 'Sí, sumar'))) { $('#dep-cant').focus(); return; }
    const e2 = recibirEnDeposito(db, p.id, rv.cantidad);
    if (e2) { $('#dep-err').textContent = e2; return; }
    guardar();
    verProductoDep(p, `Listo: sumé ${n(rv.cantidad)} al stock de ${p.nombre}.`);
  }
  // El lector de códigos escribe donde está el cursor: si es en «¿Cuántos llegaron?» u otro campo del Depósito,
  // se busca ese código y el campo queda como estaba (como vigilarEscaner en la caja)
  document.addEventListener('keydown', vigilarEscanerDeposito, true);
  // Estantes
  $('#btn-nuevo-estante').addEventListener('click', () => abrirEstante(''));
  $('#est-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#est-form').dataset.id || undefined;
    const r = guardarEstante(db, { codigo: $('#est-codigo').value, categoria: $('#est-categoria').value }, id);
    if (r.error) { $('#est-err').textContent = r.error; return; }
    guardar();
    $('#dlg-estante').close();
    render();
    $('#dep-resultado').innerHTML = htmlDonde({ tipo: 'ubicacion', ubicacion: ubicacionesDe(db).find((u) => u.estanteId === r.estante.id) });
    toast(`Listo: estante ${r.estante.codigo}${r.estante.categoria ? ' · ' + r.estante.categoria : ''}.`);
  });
  $('#est-borrar').addEventListener('click', async () => {
    const id = $('#est-form').dataset.id;
    const e = estantesDe(db).find((x) => x.id === id);
    if (!e || !esAdmin()) return;
    if (!(await confirmar(`¿Borrar el estante ${e.codigo} de la lista? Los productos no cambian: siguen diciendo que están en ${e.codigo}.`, 'Borrar estante', true))) return;
    eliminarEstante(db, id);
    guardar();
    $('#dlg-estante').close();
    render();
    toast(`Se borró el estante ${e.codigo}.`);
  });
  $('#dep-limpiar').addEventListener('click', () => { buscar.value = ''; mostrarDonde(''); buscar.focus(); });
  $('#v-deposito').addEventListener('click', (e) => {
    const prod = e.target.closest('[data-dep-prod]');
    if (prod) { $('#dep-resultado').innerHTML = htmlDonde({ tipo: 'producto', producto: producto(prod.dataset.depProd) }); return; }
    const ub = e.target.closest('[data-dep-ubic]');
    if (ub) { const u = ubicacionesDe(db).find((x) => x.clave === ub.dataset.depUbic); if (u) { $('#dep-resultado').innerHTML = htmlDonde({ tipo: 'ubicacion', ubicacion: u }); $('#dep-resultado').scrollIntoView({ block: 'nearest' }); } return; }
    const uno = e.target.closest('[data-etq-uno]');
    if (uno) { abrirEtiquetas('producto', [uno.dataset.etqUno]); return; }
    const sc = e.target.closest('[data-dep-sincodigo]');
    if (sc) { abrirSinCodigoDep(sc.dataset.depSincodigo); return; }
    const lugar = e.target.closest('[data-etq-ubic]');
    if (lugar) {
      const u = ubicacionesDe(db).find((x) => x.clave === lugar.dataset.etqUbic);
      if (u) abrirEtiquetas('producto', u.productos.map((p) => p.id));
    }
  });
  $('#btn-etq-productos').addEventListener('click', () => abrirEtiquetas('producto'));
  $('#btn-dep-sincodigo').addEventListener('click', () => abrirSinCodigoDep(''));
  $('#btn-etq-ubicaciones').addEventListener('click', () => abrirEtiquetas('ubicacion'));
  // Ventana de etiquetas
  try { const f = localStorage.getItem('formatoEtiquetas'); if (f && FORMATOS_ETIQUETA[f]) $(`#etq-ajustes-dlg [name=etq-formato][value=${f}]`).checked = true; } catch { /* nada */ }
  $('#etq-porhoja').innerHTML = '<option value="0">Automático (según cuántas imprimís)</option>' + POR_HOJA.map((n) => `<option value="${n}">${n} por hoja</option>`).join('');
  try { const ph = localStorage.getItem('etiquetasPorHoja'); if (ph && $(`#etq-porhoja option[value="${ph}"]`)) $('#etq-porhoja').value = ph; } catch { /* nada */ }
  $('#etq-porhoja').addEventListener('change', renderEtiquetas);
  // Medida del rollo: las de siempre y «Otra medida»; se recuerda la última que se usó
  $('#etq-rollo').innerHTML = MEDIDAS_ROLLO.map(([a, h]) => `<option value="${a}x${h}">${a} × ${h} mm</option>`).join('') + '<option value="otra">Otra medida…</option>';
  try {
    const g = (localStorage.getItem('etiquetasRollo') || '').split('x').map(Number);
    if (g.length === 2 && medidaRollo(g[0], g[1])) {
      if ($(`#etq-rollo option[value="${g[0]}x${g[1]}"]`)) $('#etq-rollo').value = `${g[0]}x${g[1]}`;
      else { $('#etq-rollo').value = 'otra'; $('#etq-rollo-ancho').value = g[0]; $('#etq-rollo-alto').value = g[1]; }
    }
  } catch { /* nada */ }
  ['#etq-rollo', '#etq-rollo-ancho', '#etq-rollo-alto'].forEach((s) => $(s).addEventListener('input', renderEtiquetas));
  // Impresión directa a la etiquetadora: se recuerdan los ajustes
  {
    const a = ajustesEtiquetadora();
    $('#etq-directo').checked = a.directo !== false;
    $('#etq-sep').value = a.separacion; $('#etq-osc').value = a.oscuridad; $('#etq-cx').value = a.correrX; $('#etq-cy').value = a.correrY; $('#etq-girar').checked = !!a.girar;
    $('#etq-directo').addEventListener('change', () => { guardarAjustesEtiquetadora(); renderEtiquetas(); });
    ['#etq-impresora', '#etq-sep', '#etq-osc', '#etq-cx', '#etq-cy', '#etq-girar'].forEach((s) => $(s).addEventListener('change', guardarAjustesEtiquetadora));
    $('#etq-prueba').addEventListener('click', imprimirPruebaEtiquetadora);
  }
  $('#etq-rollo').addEventListener('change', renderEtiquetas);
  $('#etq-buscar').addEventListener('input', renderEtiquetas);
  $('#etq-ubic').addEventListener('change', renderEtiquetas);
  $('#etq-sinfab').addEventListener('change', renderEtiquetas);
  $('#etq-saltear').addEventListener('input', renderEtiquetas);
  $$('#etq-ajustes-dlg [name=etq-formato]').forEach((r) => r.addEventListener('change', renderEtiquetas));
  // «Cambiar» abre los ajustes en una ventana aparte; lo que se cambia ahí queda guardado
  $('#etq-config-cambiar').addEventListener('click', () => $('#etq-ajustes-dlg').showModal());
  $('#etq-ajustes-dlg').addEventListener('change', guardarFormatoEtiquetas);
  $('#etq-ajustes-dlg').addEventListener('close', renderEtiquetas);
  $('#etq-impresora').addEventListener('change', () => actualizarResumenEtiquetas());
  $('#etq-lista').addEventListener('change', (e) => {
    const s = e.target.closest('[data-etq-sel]');
    if (s) etq.copias.set(s.dataset.etqSel, s.checked ? Math.max(1, etq.copias.get(s.dataset.etqSel) || 0) : 0);
    const c = e.target.closest('[data-etq-copias]');
    if (c) etq.copias.set(c.dataset.etqCopias, Math.max(0, Math.min(500, Math.floor(Number(c.value) || 0))));
    renderEtiquetas();
  });
  $('#etq-todos').addEventListener('click', () => {
    etiquetasFiltradas().forEach((x) => { if (!etq.copias.get(x.id)) etq.copias.set(x.id, 1); });
    renderEtiquetas();
  });
  $('#etq-ninguno').addEventListener('click', () => { etq.copias.clear(); renderEtiquetas(); });
  $('#etq-imprimir').addEventListener('click', imprimirEtiquetas);
}

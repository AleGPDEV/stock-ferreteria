/* Pantalla Reportes: período, gráficos, pestañas y cambios de precio. */
'use strict';

/* ---------- Reportes ---------- */

// La misma cantidad que el pedido al proveedor (logica/reportes.js): mínimo × 2 − stock, hacia arriba, al menos 1
const sugerido = (p) => cantidadPedido(p);

function ventasPeriodo() {
  const a = inicioDia($('#rep-desde').value), b = finDia($('#rep-hasta').value);
  return db.ventas.filter((v) => { const t = Date.parse(v.fecha); return t >= a && t <= b; });
}

function cambiosPrecioPeriodo() {
  const a = inicioDia($('#rep-desde').value), b = finDia($('#rep-hasta').value);
  return (db.historialPrecios || []).filter((h) => { const t = Date.parse(h.fecha); return t >= a && t <= b; }).reverse();
}

function renderCambiosPrecio() {
  const lista = cambiosPrecioPeriodo();
  $('#rep-precios').innerHTML = lista.length
    ? `<div class="table-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Producto</th><th class="num">Antes</th><th class="num">Ahora</th><th>Quién</th></tr></thead>
      <tbody>${lista.slice(0, 200).map((h) => `<tr><td class="num">${fechaHora(h.fecha)}</td>
        <td><div class="nom">${esc(h.producto)}</div><div class="meta">${esc(h.motivo || '')}${h.codigo ? ` · <span class="mono">${esc(h.codigo)}</span>` : ''}</div></td>
        <td class="num">${h.masivo || h.antes == null ? '—' : $m(h.antes, h.monedaAntes)}</td><td class="num">${h.masivo ? '—' : `<strong>${$m(h.despues, h.moneda)}</strong>`}</td><td>${esc(h.usuario || '')}</td></tr>`).join('')}
      ${lista.length > 200 ? `<tr><td colspan="5" class="muted">… y ${lista.length - 200} más (exportá a Excel para verlos todos)</td></tr>` : ''}</tbody></table></div>`
    : '<p class="vacio">No hubo cambios de precio en este período.</p>';
}

/* ---------- Pantalla de reportes ---------- */

const TABS_REPORTES = ['tablero', 'ventas', 'ganancias', 'stock', 'caja', 'precios'];
let tabReportes = 'tablero';
try { const t = localStorage.getItem('ferreteria-tab-rep'); if (TABS_REPORTES.includes(t)) tabReportes = t; } catch (e) { /* nada */ }

function periodoReportes() {
  const dDesde = $('#rep-desde').value, dHasta = $('#rep-hasta').value;
  const comp = periodoComparable(dDesde, dHasta);
  return { dDesde, dHasta, desde: inicioDia(dDesde), hasta: finDia(dHasta), antDesde: inicioDia(comp.desde), antHasta: finDia(comp.hasta), textoAnt: comp.texto };
}

const claseCambio = (actual, anterior) => {
  if (!anterior) return '';
  const pct = (actual - anterior) / Math.abs(anterior) * 100;
  return Math.abs(pct) < 0.5 ? 'neutro' : pct > 0 ? 'sube' : 'baja';
};
function chipCambio(actual, anterior, plata = false, texto = 'vs. período anterior') {
  if (!anterior) return '';
  const pct = (actual - anterior) / Math.abs(anterior) * 100;
  const cls = claseCambio(actual, anterior);
  const flecha = cls === 'sube' ? '▲' : cls === 'baja' ? '▼' : '＝';
  return `<span class="delta ${cls}" title="Antes: ${plata ? $u(anterior) : n(anterior)}">${flecha} ${n(Math.abs(Math.round(pct)))} % <span class="delta-txt">${esc(texto)}</span></span>`;
}
const kpi = (lbl, val, extra = '', cls = '') => `<div class="kpi ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}</div>${extra}</div>`;
/** Tarjeta con el valor, cuánto cambió y el borde de color: verde si subió, rojo si bajó. */
const kpiCambio = (lbl, actual, anterior, fmt, texto, plata = true) =>
  kpi(lbl, fmt(actual), anterior ? `${chipCambio(actual, anterior, plata, texto)}<span class="det">Antes: ${fmt(anterior)}</span>` : '<span class="det">Sin datos para comparar</span>', `k-${claseCambio(actual, anterior) || 'neutro'}`);
const pct1 = (x) => (x == null ? '—' : `${n(Math.round(x * 10) / 10)} %`);

function barrasHtml(items, valor, texto) {
  const max = Math.max(1, ...items.map(valor));
  return `<ul class="barras">${items.map((x) => `<li><div class="b-txt">${texto(x)}</div><div class="barra"><i style="width:${(valor(x) / max) * 100}%"></i></div></li>`).join('')}</ul>`;
}

/** Escala «linda» para el eje: 4 o 5 marcas redondas (0, 10 mil, 20 mil…). */
function escalaEje(max) {
  if (!(max > 0)) return { tope: 1, paso: 1 };
  // De los pasos redondos que dan entre 3 y 6 marcas, el que deja el tope más cerca del máximo
  const mag = Math.pow(10, Math.floor(Math.log10(max)) - 1);
  let mejor = null;
  for (const m of [mag, mag * 10]) {
    for (const f of [1, 2, 2.5, 5]) {
      const paso = f * m, tope = Math.ceil(max / paso) * paso, marcas = tope / paso;
      if (marcas >= 3 && marcas <= 6 && (!mejor || tope < mejor.tope || (tope === mejor.tope && paso > mejor.paso))) mejor = { tope, paso };
    }
  }
  return mejor || { tope: max, paso: max / 4 };
}
/** Plata corta para ejes y etiquetas: $ 900, $ 4.500, $ 25 mil, $ 1,2 M. */
const plataCorta = (x) => (x >= 1e6 ? `$ ${n(Math.round(x / 1e5) / 10)} M` : x >= 1e4 ? `$ ${n(Math.round(x / 100) / 10)} mil` : `$ ${n(Math.round(x))}`);

function graficoVentas(serieInfo, opc = {}) {
  const { escala, serie } = serieInfo;
  const max = Math.max(...serie.map((x) => x.total), 0);
  if (!max) return `<p class="vacio">${escala === 'hora' ? 'No hubo ventas este día.' : 'No hubo ventas en este período.'}</p>`;
  const { tope, paso } = escalaEje(max);
  const marcas = [];
  for (let v = 0; v <= tope + 1e-9; v += paso) marcas.push(v);
  const iMax = serie.findIndex((x) => x.total === max);
  const cada = Math.max(1, Math.ceil(serie.length / (escala === 'hora' ? 12 : 10))); // etiquetas del eje x que entran sin pisarse
  const corta = (x) => (escala === 'hora' ? `${x.hora} h` : escala === 'día'
    ? x.fecha.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' }).replace('.', '')
    : x.fecha.toLocaleDateString('es-UY', { month: 'short', year: '2-digit' }).replace('.', ''));
  const larga = (x) => (escala === 'hora' ? `De ${x.hora} a ${x.hora + 1} h` : escala === 'día'
    ? x.fecha.toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })
    : x.fecha.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' }));
  // Las barras de días y de meses se pueden tocar: un día abre su resumen; un mes pasa a ese mes
  const accion = (x) => (opc.sinClic ? '' : escala === 'día' ? `data-dia="${x.clave}"` : escala === 'mes' ? `data-mes="${x.clave}"` : '');
  const pista = opc.sinClic ? '' : escala === 'día' ? 'Clic para ver el resumen del día' : escala === 'mes' ? 'Clic para ver ese mes' : '';
  const pct = (v) => (v / tope) * 100;
  const tabla = opc.sinTabla ? '' : `<details class="g-datos"><summary>Ver los datos en una tabla</summary><div class="table-wrap"><table class="tabla">
    <thead><tr><th>${{ hora: 'Hora', día: 'Día', mes: 'Mes' }[escala]}</th><th class="num">Ventas</th><th class="num">Total</th></tr></thead>
    <tbody>${serie.map((x) => `<tr><td>${escala === 'día' && !opc.sinClic && x.cant ? `<button class="link-btn" type="button" data-dia="${x.clave}">${esc(larga(x))}</button>` : esc(larga(x))}</td><td class="num">${n(x.cant)}</td><td class="num">${$u(x.total)}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `<div class="g" role="group" aria-label="Ventas por ${escala}"${opc.alto ? ` style="--g-alto:${opc.alto}px"` : ''}>
    <div class="g-plot">
      ${marcas.map((v) => `<div class="g-grid" style="bottom:${pct(v)}%"><span>${v ? plataCorta(v) : '$ 0'}</span></div>`).join('')}
      <div class="g-cols" style="--n:${serie.length}">${serie.map((x, i) => `
        <div class="g-col${accion(x) ? ' g-click' : ''}" tabindex="0" data-g="${i}" ${accion(x)} ${accion(x) ? 'role="button"' : ''}
          aria-label="${esc(larga(x))}: ${$u(x.total)}, ${n(x.cant)} ventas${pista ? `. ${pista}` : ''}"
          data-titulo="${esc(larga(x))}" data-total="${esc($u(x.total))}" data-cant="${x.cant}" data-pista="${pista}">
          ${x.total ? `<div class="g-bar" style="height:${pct(x.total)}%">${i === iMax ? `<span class="g-max">${plataCorta(x.total)}</span>` : ''}</div>` : ''}
        </div>`).join('')}</div>
      <div class="g-tip" hidden></div>
    </div>
    <div class="g-x" style="--n:${serie.length}">${serie.map((x, i) => `<span>${i % cada === 0 ? esc(corta(x)) : ''}</span>`).join('')}</div>
  </div>${tabla}`;
}

/** Cartelito al pasar el mouse (o el foco del teclado) por una barra. */
function iniciarGraficos() {
  const mostrar = (col) => {
    const plot = col.closest('.g-plot');
    const tip = plot.querySelector('.g-tip');
    plot.querySelectorAll('.g-col.activa').forEach((c) => c.classList.remove('activa'));
    col.classList.add('activa');
    tip.innerHTML = `<strong>${esc(col.dataset.titulo)}</strong><span>${esc(col.dataset.total)}</span><span class="muted">${n(Number(col.dataset.cant))} venta${col.dataset.cant === '1' ? '' : 's'}</span>${col.dataset.pista ? `<em>${esc(col.dataset.pista)}</em>` : ''}`;
    tip.hidden = false;
    const r = col.getBoundingClientRect(), rp = plot.getBoundingClientRect();
    const bar = col.querySelector('.g-bar');
    const arriba = bar ? bar.getBoundingClientRect().top - rp.top : rp.height;
    const x = r.left - rp.left + r.width / 2;
    tip.style.left = `${Math.min(Math.max(x, tip.offsetWidth / 2 + 4), rp.width - tip.offsetWidth / 2 - 4)}px`;
    tip.style.top = `${Math.max(arriba - 10, tip.offsetHeight - 30)}px`;
  };
  const ocultar = (plot) => {
    if (!plot) return;
    plot.querySelectorAll('.g-col.activa').forEach((c) => c.classList.remove('activa'));
    const tip = plot.querySelector('.g-tip');
    if (tip) tip.hidden = true;
  };
  document.addEventListener('mouseover', (e) => { const c = e.target.closest && e.target.closest('.g-col'); if (c) mostrar(c); });
  document.addEventListener('focusin', (e) => { const c = e.target.closest && e.target.closest('.g-col'); if (c) mostrar(c); });
  document.addEventListener('mouseout', (e) => { const p = e.target.closest && e.target.closest('.g-plot'); if (p && !p.contains(e.relatedTarget)) ocultar(p); });
  document.addEventListener('focusout', (e) => { const p = e.target.closest && e.target.closest('.g-plot'); if (p && !p.contains(e.relatedTarget)) ocultar(p); });
  // Tocar un día abre su resumen; tocar un mes pasa los reportes a ese mes
  const tocar = (el) => {
    if (el.dataset.dia) abrirResumenDia(el.dataset.dia);
    else if (el.dataset.mes) {
      const [y, m] = el.dataset.mes.split('-').map(Number);
      ponerPeriodo(isoLocal(new Date(y, m - 1, 1)), isoLocal(new Date(y, m - 1, ultimoDelMes(y, m - 1))));
    }
  };
  document.addEventListener('click', (e) => { const el = e.target.closest && e.target.closest('[data-dia], [data-mes]'); if (el && (el.classList.contains('g-col') || el.classList.contains('link-btn'))) tocar(el); });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('g-click')) { e.preventDefault(); tocar(e.target); } });
}

/** «Miércoles 11 de noviembre», «Del 1 al 31 de octubre», «Del 28 de octubre al 3 de noviembre». */
function tituloPeriodo(desde, hasta) {
  const a = fechaDe(desde), b = fechaDe(hasta);
  const anio = (f) => (f.getFullYear() !== new Date().getFullYear() ? ` de ${f.getFullYear()}` : '');
  if (desde === hasta) {
    const t = `${DIAS_SEMANA[a.getDay()]} ${a.getDate()} de ${MESES[a.getMonth()]}${anio(a)}`;
    return t[0].toUpperCase() + t.slice(1);
  }
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `Del ${a.getDate()} al ${b.getDate()} de ${MESES[b.getMonth()]}${anio(b)}`;
  if (a.getFullYear() !== b.getFullYear()) return `Del ${a.getDate()} de ${MESES[a.getMonth()]} de ${a.getFullYear()} al ${b.getDate()} de ${MESES[b.getMonth()]} de ${b.getFullYear()}`;
  return `Del ${a.getDate()} de ${MESES[a.getMonth()]} al ${b.getDate()} de ${MESES[b.getMonth()]}${anio(b)}`;
}

/** Barra de arriba: el día (o la franja) que se está viendo y las flechas. */
function renderBarraPeriodo() {
  const d = $('#rep-desde').value, h = $('#rep-hasta').value, hoy = isoLocal();
  const unDia = d === h;
  $('#rep-titulo').textContent = tituloPeriodo(d, h);
  const dias = diasEntre(d, h) + 1;
  $('#rep-titulo-sub').textContent = unDia
    ? (d === hoy ? 'Hoy' : d === sumarDias(hoy, -1) ? 'Ayer' : `Hace ${diasEntre(d, hoy)} días`)
    : !esMesEntero(d, h, hoy) ? `${dias} días`
      : fechaDe(h).getDate() === ultimoDelMes(fechaDe(h).getFullYear(), fechaDe(h).getMonth()) ? 'Mes completo' : `Mes en curso · ${dias} días`;
  const que = unDia ? 'Día' : esMesEntero(d, h, hoy) ? 'Mes' : 'Período';
  $('#rep-ant').title = `${que} anterior (flecha ←)`; $('#rep-ant').setAttribute('aria-label', `${que} anterior`);
  $('#rep-sig').title = `${que} siguiente (flecha →)`; $('#rep-sig').setAttribute('aria-label', `${que} siguiente`);
  $('#rep-sig').disabled = !moverPeriodo(d, h, 1, hoy) || h >= hoy;
  $('#rep-hoy').disabled = unDia && d === hoy;
}

function ponerPeriodo(desde, hasta) {
  $('#rep-desde').value = desde;
  $('#rep-hasta').value = hasta;
  renderReportes();
}

function moverReportes(dir) {
  const r = moverPeriodo($('#rep-desde').value, $('#rep-hasta').value, dir);
  if (r) ponerPeriodo(r.desde, r.hasta);
}

function renderReportes() {
  // Fechas que no tienen sentido: se corrigen en lugar de mostrar un reporte vacío
  const hoy = isoLocal();
  if (!$('#rep-desde').value) $('#rep-desde').value = $('#rep-hasta').value || hoy;
  if (!$('#rep-hasta').value) $('#rep-hasta').value = $('#rep-desde').value;
  if ($('#rep-desde').value > $('#rep-hasta').value) $('#rep-hasta').value = $('#rep-desde').value;
  renderBarraPeriodo();
  $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tabReportes)));
  $$('#v-reportes .tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tabReportes; });
  const per = periodoReportes();
  // Ventas en dólares: los reportes las suman en pesos, a la cotización del día de cada venta
  const nota = $('#rep-usd-nota');
  const u = ['tablero', 'ventas', 'ganancias'].includes(tabReportes) ? analisisVentas(db, per.desde, per.hasta).usd : null;
  const enStock = tabReportes === 'stock' && db.productos.some(esUSD);
  nota.hidden = !((u && u.cant) || enStock);
  nota.textContent = u && u.cant
    ? `Incluye ${plural(u.cant, 'venta en dólares', 'ventas en dólares')} por ${$usd(u.total)}: acá se suman en pesos (${$u(u.enPesos)}), con el dólar del día de cada venta.`
    : enStock ? `Los productos en dólares se valorizan en pesos con el dólar de hoy${cotizacionActual(db) ? ` (${$u(cotizacionActual(db))})` : ': escribilo al abrir la caja'}.` : '';
  ({ tablero: renderRepTablero, ventas: renderRepVentas, ganancias: renderRepGanancias, stock: renderRepStock, caja: renderCierresCaja, precios: renderCambiosPrecio })[tabReportes](per);
}

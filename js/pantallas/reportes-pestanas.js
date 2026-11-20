/* Reportes → resumen de un día (al tocar una barra del gráfico) y pestañas Ventas, Ganancias y Stock. */
'use strict';

/* ---------- Resumen de un día (se abre tocando una barra del gráfico) ---------- */

let diaAbierto = '';
function abrirResumenDia(dia) {
  diaAbierto = dia;
  const r = resumenDia(db, dia);
  const { a, ant } = r;
  const t = r.comp.texto;
  $('#dia-titulo').textContent = tituloPeriodo(dia, dia);
  $('#dia-sub').textContent = a.cantidad ? `${n(a.cantidad)} venta${a.cantidad === 1 ? '' : 's'}, comparado con el ${DIAS_SEMANA[fechaDe(dia).getDay()]} anterior` : 'No hubo ventas este día.';
  $('#dia-sig').disabled = dia >= isoLocal();
  const medios = Object.entries(a.porMedio).map(([m, v]) => ({ m, ...v })).sort((x, y) => y.total - x.total);
  const vend = Object.entries(a.porVendedor).map(([u, v]) => ({ u, ...v })).sort((x, y) => y.total - x.total);
  const top = Object.values(a.porProducto).sort((x, y) => y.vendido - x.vendido).slice(0, 8);
  const hora = (iso) => new Date(iso).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
  $('#dia-cuerpo').innerHTML = `
    <div class="kpis">${[
      kpiCambio('Vendido', a.total, ant.total, $u, t),
      kpiCambio('Ventas', a.cantidad, ant.cantidad, n, t, false),
      kpiCambio('Ticket promedio', a.ticketPromedio, ant.ticketPromedio, $u, t),
      kpiCambio('Ganancia bruta', a.ganancia, ant.ganancia, $u, t),
    ].join('')}</div>
    ${a.cantidad ? `
    <section class="dia-sec"><h3 class="subt">Por hora</h3>${graficoVentas(serieVentas(a.porDia, inicioDia(dia), finDia(dia), a.porDiaCant, a.porHora, a.porHoraCant), { alto: 150, sinTabla: true, sinClic: true })}</section>
    <div class="dia-cols">
      <section class="dia-sec"><h3 class="subt">Por medio de pago</h3>${barrasHtml(medios, (x) => x.total, (x) => `<span>${esc(x.m)} <span class="muted">· ${n(x.cant)}</span></span><strong class="num">${$u(x.total)}</strong>`)}</section>
      <section class="dia-sec"><h3 class="subt">Por vendedor</h3>${barrasHtml(vend, (x) => x.total, (x) => `<span>${esc(x.u)} <span class="muted">· ${n(x.cant)}</span></span><strong class="num">${$u(x.total)}</strong>`)}</section>
    </div>
    <section class="dia-sec"><h3 class="subt">Lo más vendido</h3><div class="table-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Vendido</th></tr></thead>
      <tbody>${top.map((x) => `<tr><td>${esc(x.nombre)}</td><td class="num">${n(x.cant)} <span class="u">${esc(x.unidad)}</span></td><td class="num">${$u(x.vendido)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${r.cajas.length ? `<section class="dia-sec"><h3 class="subt">Caja</h3><ul class="lista">${r.cajas.map((c) => {
      const rc = c.resumen || resumenCaja(db, c);
      return `<li><div class="izq"><div class="nom">Caja ${String(c.numero).padStart(3, '0')}</div><div class="meta">Abrió ${esc(c.abiertaPor || '')} a las ${hora(c.abierta)}${c.cerrada ? ` · cerró ${esc(c.cerradaPor || '')} a las ${hora(c.cerrada)}` : ' · sigue abierta'}</div></div>
        <div class="der">${c.cerrada ? `<span class="muted">Debía haber ${$u(rc.esperado)} · se contó ${$u(c.contado)}</span> ${chipDiferencia(c.diferencia)}` : '<span class="chip ok">Abierta</span>'}</div></li>`;
    }).join('')}</ul></section>` : ''}
    ${r.ventas.length ? `<section class="dia-sec"><h3 class="subt">Ventas del día${r.anuladas.length ? ` <span class="chip danger">${r.anuladas.length} anulada${r.anuladas.length === 1 ? '' : 's'} · ${$u(r.totalAnulado)}</span>` : ''}</h3>
      <details class="g-datos"><summary>Ver las ${n(r.ventas.length)} ventas</summary><div class="table-wrap"><table class="tabla">
      <thead><tr><th>Hora</th><th>N.º</th><th>Vendedor</th><th>Medio</th><th class="num">Productos</th><th class="num">Total</th></tr></thead>
      <tbody>${r.ventas.map((v) => `<tr class="${v.anulada ? 'anulada' : ''}"><td>${hora(v.fecha)}</td><td class="mono">${v.numero}</td><td>${esc(v.usuario || '')}</td><td>${esc(v.medio)}${v.cliente ? `<div class="meta">${esc(v.cliente)}</div>` : ''}</td>
        <td class="num">${n(v.items.length)}</td><td class="num">${v.anulada ? '<span class="chip danger">Anulada</span> ' : ''}${$m(v.total, v.moneda)}${esUSD(v) ? `<div class="meta">${$u(enPesos(v).total)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div></details></section>` : ''}`;
  const d = $('#dlg-dia');
  if (!d.open) d.showModal();
  $('#dia-cuerpo').scrollTop = 0;
}

function iniciarResumenDia() {
  const mover = (dir) => { const k = sumarDias(diaAbierto, dir); if (k <= isoLocal()) abrirResumenDia(k); };
  $('#dia-ant').addEventListener('click', () => mover(-1));
  $('#dia-sig').addEventListener('click', () => mover(1));
  $('#dlg-dia').addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, summary')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
  });
  $('#dia-reportes').addEventListener('click', () => { $('#dlg-dia').close(); ponerPeriodo(diaAbierto, diaAbierto); });
}

function renderRepVentas(per) {
  const a = analisisVentas(db, per.desde, per.hasta);
  const ant = analisisVentas(db, per.antDesde, per.antHasta);
  const movs = db.movimientos.filter((m) => { const t = Date.parse(m.fecha); return t >= per.desde && t <= per.hasta; });
  const sinAnterior = !ant.cantidad;
  const t = per.textoAnt;
  $('#rep-kpis').innerHTML = [
    kpi('Total vendido', $u(a.total), chipCambio(a.total, ant.total, true, t), `k-${claseCambio(a.total, ant.total) || 'neutro'}`),
    kpi('Ventas', n(a.cantidad), chipCambio(a.cantidad, ant.cantidad, false, t), `k-${claseCambio(a.cantidad, ant.cantidad) || 'neutro'}`),
    kpi('Ticket promedio', $u(a.ticketPromedio), chipCambio(a.ticketPromedio, ant.ticketPromedio, true, t), `k-${claseCambio(a.ticketPromedio, ant.ticketPromedio) || 'neutro'}`),
    kpi('Ganancia bruta', $u(a.ganancia), chipCambio(a.ganancia, ant.ganancia, true, t), `k-${claseCambio(a.ganancia, ant.ganancia) || 'neutro'}`),
    kpi('Compras', $u(totalCompras(movs)), '<span class="delta neutro">mercadería que llegó</span>', 'k-neutro'),
  ].join('') + (sinAnterior && a.cantidad ? `<p class="kpis-nota muted">No hay ventas para comparar (${esc(t)}).</p>` : '');
  const s = serieVentas(a.porDia, per.desde, per.hasta, a.porDiaCant, a.porHora, a.porHoraCant);
  $('#rep-escala').textContent = s.escala;
  const mejor = s.serie.reduce((m, x) => (x.total > m.total ? x : m), { total: 0 });
  const nombreMejor = (x) => (s.escala === 'hora' ? `de ${x.hora} a ${x.hora + 1} h` : x.fecha.toLocaleDateString('es-UY', s.escala === 'día' ? { weekday: 'long', day: 'numeric', month: 'long' } : { month: 'long', year: 'numeric' }));
  $('#rep-dia-sub').textContent = mejor.total ? `${s.escala === 'hora' ? 'La mejor hora' : `El mejor ${s.escala}`}: ${nombreMejor(mejor)}, con ${$u(mejor.total)}.${s.escala === 'día' ? ' Tocá una barra para ver el resumen de ese día.' : s.escala === 'mes' ? ' Tocá un mes para verlo.' : ''}` : '';
  $('#rep-grafico').innerHTML = graficoVentas(s);
  const medios = Object.entries(a.porMedio).map(([m, v]) => ({ m, ...v })).sort((x, y) => y.total - x.total);
  $('#rep-medios').innerHTML = medios.length
    ? barrasHtml(medios, (x) => x.total, (x) => `<span>${esc(x.m)} <span class="muted">· ${n(x.cant)} venta${x.cant === 1 ? '' : 's'}</span></span><strong class="num">${$u(x.total)} <span class="muted">${pct1(x.total / a.total * 100)}</span></strong>`)
    : '<p class="vacio">Sin ventas.</p>';
  const vend = Object.entries(a.porVendedor).map(([u, v]) => ({ u, ...v })).sort((x, y) => y.total - x.total);
  $('#rep-vendedores').innerHTML = vend.length
    ? `<ul class="barras">${vend.map((v) => `<li><div class="b-txt"><span>${esc(v.u)}</span><strong class="num">${$u(v.total)}</strong></div>
        <div class="barra"><i style="width:${v.total / vend[0].total * 100}%"></i></div>
        <div class="b-meta">${n(v.cant)} venta${v.cant === 1 ? '' : 's'} · promedio ${$u(v.total / v.cant)}${v.descuentos ? ` · descuentos ${$u(v.descuentos)}` : ''}</div></li>`).join('')}</ul>`
    : '<p class="vacio">Sin ventas.</p>';
  const top = Object.values(a.porProducto).sort((x, y) => y.vendido - x.vendido).slice(0, 15);
  const maxTop = Math.max(1, ...top.map((x) => x.vendido));
  $('#rep-top').innerHTML = top.length
    ? `<div class="table-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Vendido</th><th class="num">Del total</th></tr></thead>
      <tbody>${top.map((x, i) => `<tr><td><div class="nom">${i + 1}. ${esc(x.nombre)}</div><div class="barra"><i style="width:${x.vendido / maxTop * 100}%"></i></div></td>
        <td class="num">${n(x.cant)} <span class="u">${esc(x.unidad)}</span></td><td class="num"><strong>${$u(x.vendido)}</strong></td><td class="num">${pct1(x.vendido / a.total * 100)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="vacio">No hubo ventas por la caja en este período.</p>';
}

function renderRepGanancias(per) {
  const a = analisisVentas(db, per.desde, per.hasta);
  const ant = analisisVentas(db, per.antDesde, per.antHasta);
  $('#rep-gan-kpis').innerHTML = [
    kpi('Vendido', $u(a.total), chipCambio(a.total, ant.total, true, per.textoAnt), `k-${claseCambio(a.total, ant.total) || 'neutro'}`),
    kpi('Costo de lo vendido', $u(a.costoVendido), '', 'k-neutro'),
    kpi('Ganancia bruta', $u(a.ganancia), chipCambio(a.ganancia, ant.ganancia, true, per.textoAnt), `k-${claseCambio(a.ganancia, ant.ganancia) || 'neutro'}`),
    kpi('Margen', pct1(a.margen), '<span class="delta neutro">ganancia sobre lo vendido</span>'),
  ].join('');
  $('#rep-gan-nota').innerHTML = a.productosSinCosto
    ? `<p class="nota-edit">No se cuentan ${$u(a.vendidoSinCosto)} vendidos de ${a.productosSinCosto} producto${a.productosSinCosto === 1 ? '' : 's'} sin costo cargado. Cargales el costo (Productos, filtro «Sin costo cargado») para que la ganancia sea exacta.</p>` : '';
  const cats = Object.values(a.porCategoria).sort((x, y) => y.ganancia - x.ganancia);
  const maxG = Math.max(1, ...cats.map((c) => Math.max(c.ganancia, 0)));
  $('#rep-gan-cat').innerHTML = cats.length
    ? `<div class="table-wrap"><table class="tabla"><thead><tr><th>Categoría</th><th class="num">Vendido</th><th class="num">Costo</th><th class="num">Ganancia</th><th class="num">Margen</th></tr></thead>
      <tbody>${cats.map((c) => `<tr><td>${esc(c.categoria)}<div class="barra"><i style="width:${Math.max(c.ganancia, 0) / maxG * 100}%"></i></div></td>
        <td class="num">${$u(c.vendido)}</td><td class="num">${$u(c.costo)}</td><td class="num"><strong>${$u(c.ganancia)}</strong></td><td class="num">${pct1(c.margen)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${$u(a.total)}</td><td class="num">${$u(a.costoVendido)}</td><td class="num">${$u(a.ganancia)}</td><td class="num">${pct1(a.margen)}</td></tr></tfoot></table></div>`
    : '<p class="vacio">No hubo ventas en este período.</p>';
  const orden = $('#rep-gan-orden').value;
  const prods = Object.values(a.porProducto).filter((x) => x.vendidoConCosto > 0)
    .sort(orden === 'menos' ? (x, y) => x.margen - y.margen : (x, y) => y.ganancia - x.ganancia).slice(0, 30);
  $('#rep-gan-prod').innerHTML = prods.length
    ? `<div class="table-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Vendido</th><th class="num">Ganancia</th><th class="num">Margen</th></tr></thead>
      <tbody>${prods.map((x) => `<tr><td><div class="nom">${esc(x.nombre)}</div><div class="meta">${esc(x.categoria)}</div></td><td class="num">${n(x.cant)}</td><td class="num">${$u(x.vendido)}</td>
        <td class="num"><strong>${$u(x.ganancia)}</strong></td><td class="num"><span class="${x.margen < 15 ? 'stock-bajo' : ''}">${pct1(x.margen)}</span></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="vacio">No hubo ventas de productos con costo cargado.</p>';
}

function renderRepStock() {
  const dias = Number($('#rep-parada-dias').value) || 90;
  const parada = mercaderiaParada(db, dias);
  const tc = parada.reduce((s, x) => s + x.valorCosto, 0), tv = parada.reduce((s, x) => s + x.valorVenta, 0);
  $('#rep-parada').innerHTML = parada.length
    ? `<div class="kpis kpis-chicos">${kpi('Productos', n(parada.length))}${kpi('Plata quieta (a costo)', $u(tc))}${kpi('Valor a precio de venta', $u(tv))}</div>
      <div class="table-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="num">Stock</th><th>Última venta</th><th class="num">A costo</th></tr></thead>
      <tbody>${parada.slice(0, 100).map((x) => `<tr><td><div class="nom">${esc(x.p.nombre)}</div><div class="meta"><span class="mono">${esc(x.p.codigo)}</span> · ${esc(x.p.categoria || SIN_CAT)}${x.p.ubicacion ? ' · ' + esc(x.p.ubicacion) : ''}</div></td>
        <td class="num">${n(x.p.stock)} <span class="u">${esc(x.p.unidad)}</span></td>
        <td>${x.ultimaVenta ? `${new Date(x.ultimaVenta).toLocaleDateString('es-UY')} <span class="muted">(hace ${n(x.diasSinVenta)} días)</span>` : '<span class="muted">Nunca se vendió</span>'}</td>
        <td class="num"><strong>${$u(x.valorCosto)}</strong></td></tr>`).join('')}
      ${parada.length > 100 ? `<tr><td colspan="4" class="muted">… y ${parada.length - 100} más (exportá a Excel para verlos todos)</td></tr>` : ''}</tbody></table></div>`
    : `<p class="vacio">Todo lo que tiene stock se vendió en los últimos ${dias} días.</p>`;
  renderReposicionYValor();
}

function renderReposicionYValor() {
  // Reposición
  const rep = db.productos.filter((p) => estado(p) !== 'ok').sort((x, y) => nombreProv(x.proveedorId).localeCompare(nombreProv(y.proveedorId)) || x.nombre.localeCompare(y.nombre));
  $('#rep-reposicion').innerHTML = rep.length
    ? `<div class="table-wrap"><table class="tabla">
        <thead><tr><th>Producto</th><th>Proveedor</th><th class="num">Stock</th><th class="num">Pedir</th><th class="num">Costo est.</th></tr></thead>
        <tbody>${rep.map((p) => `<tr>
          <td><div class="nom">${esc(p.nombre)}</div><div class="meta mono">${esc(p.codigo)}</div></td>
          <td>${esc(nombreProv(p.proveedorId)) || '<span class="muted">—</span>'}</td>
          <td class="num">${n(p.stock)} / ${n(p.minimo)}</td>
          <td class="num"><strong>${n(sugerido(p))}</strong> <span class="u">${esc(p.unidad)}</span></td>
          <td class="num">${$m(sugerido(p) * p.costo, p.moneda)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total estimado del pedido${rep.some(esUSD) ? ' (en pesos; lo de dólares, a la cotización de hoy)' : ''}</td><td class="num">${$u(rep.reduce((s, p) => s + sugerido(p) * p.costo * factorPesos(db, p), 0))}</td></tr></tfoot>
      </table></div>`
    : '<p class="vacio">No hay productos para reponer.</p>';

  // Valorización
  const cats = {};
  db.productos.forEach((p) => {
    const c = p.categoria || 'Sin categoría';
    cats[c] = cats[c] || { items: 0, costo: 0, venta: 0 };
    cats[c].items++;
    cats[c].costo += Math.max(p.stock, 0) * p.costo * factorPesos(db, p);
    cats[c].venta += Math.max(p.stock, 0) * p.precio * factorPesos(db, p);
  });
  const filas = Object.entries(cats).sort((x, y) => y[1].costo - x[1].costo);
  const max = Math.max(1, ...filas.map(([, v]) => v.costo));
  const tc = filas.reduce((s, [, v]) => s + v.costo, 0), tv = filas.reduce((s, [, v]) => s + v.venta, 0);
  $('#rep-valorizacion').innerHTML = filas.length
    ? `<div class="table-wrap"><table class="tabla">
        <thead><tr><th>Categoría</th><th class="num">Productos</th><th class="num">A costo</th><th class="num">A venta</th></tr></thead>
        <tbody>${filas.map(([c, v]) => `<tr>
          <td>${esc(c)}<div class="barra"><i style="width:${(v.costo / max) * 100}%"></i></div></td>
          <td class="num">${v.items}</td><td class="num">${$u(v.costo)}</td><td class="num">${$u(v.venta)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${db.productos.length}</td><td class="num">${$u(tc)}</td><td class="num">${$u(tv)}</td></tr></tfoot>
      </table></div>`
    : '<p class="vacio">Sin productos cargados.</p>';
}

/* ---------- Pedido a los proveedores (Reportes → Reposición → «Armar pedido») ----------
 * La cuenta (agrupar y sugerir) está en logica/reportes.js: armarPedidos y cantidadPedido.
 * Las cantidades que se cambian a mano viven mientras la ventana está abierta. */
let pedidoCant = {};
const claveGrupo = (g) => g.proveedorId || 'sin'; // el grupo sin proveedor tiene id ''
const grupoPedido = (clave) => armarPedidos(db, pedidoCant).find((g) => claveGrupo(g) === clave);
const codigoDelProv = (p, provId) => (codigosProvDe(p).find((x) => x.proveedorId === provId) || {}).codigo || '';
const contactoProv = (pr) => (pr ? [pr.contacto, pr.telefono && `Tel. ${pr.telefono}`, pr.email].filter(Boolean).join(' · ') : '');

function renderPedido() {
  const grupos = armarPedidos(db, pedidoCant);
  $('#pedido-cuerpo').innerHTML = grupos.length ? grupos.map((g) => `
    <section class="pedido-prov" data-grupo="${esc(claveGrupo(g))}">
      <header class="pedido-cab">
        <div><h3>${esc(g.nombre)}</h3>${contactoProv(g.proveedor) ? `<p class="meta">${esc(contactoProv(g.proveedor))}</p>` : ''}</div>
        <div class="card-acc">
          <button class="btn sm" type="button" data-pedido-imprimir="${esc(claveGrupo(g))}">Imprimir</button>
          <button class="btn sm" type="button" data-pedido-excel="${esc(claveGrupo(g))}">Exportar Excel</button>
        </div>
      </header>
      <div class="table-wrap"><table class="tabla">
        <thead><tr><th>Producto</th><th class="num">Stock / mín.</th><th class="num">Pedir</th><th class="num">Costo est.</th></tr></thead>
        <tbody>${g.items.map((it) => `<tr>
          <td><div class="nom">${esc(it.producto.nombre)}</div><div class="meta mono">${esc(it.producto.codigo)}${codigoDelProv(it.producto, g.proveedorId) ? ` · del proveedor: ${esc(codigoDelProv(it.producto, g.proveedorId))}` : ''}</div></td>
          <td class="num">${n(it.producto.stock)} / ${n(it.producto.minimo)}</td>
          <td class="num"><span class="pedido-cant"><input type="number" min="0" step="any" inputmode="decimal" value="${it.cantidad}" data-pedido-cant="${esc(it.producto.id)}" aria-label="Cantidad a pedir de ${esc(it.producto.nombre)}"> <span class="u">${esc(it.producto.unidad)}</span></span></td>
          <td class="num" data-pedido-costo="${esc(it.producto.id)}">${$u(it.costo)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total estimado${g.items.some((it) => esUSD(it.producto)) ? ' (en pesos; lo de dólares, a la cotización de hoy)' : ''}</td><td class="num" data-pedido-total="${esc(claveGrupo(g))}">${$u(g.total)}</td></tr></tfoot>
      </table></div>
    </section>`).join('')
    : '<p class="vacio">No hay productos para reponer.</p>';
}

/** Al cambiar una cantidad: se actualizan su costo y el total del proveedor, sin volver a dibujar (no se pierde el foco). */
function cambiarCantidadPedido(input) {
  pedidoCant[input.dataset.pedidoCant] = input.value === '' ? 0 : Number(input.value);
  const clave = input.closest('[data-grupo]').dataset.grupo;
  const g = grupoPedido(clave);
  if (!g) return;
  const it = g.items.find((x) => x.producto.id === input.dataset.pedidoCant);
  $(`[data-pedido-costo="${CSS.escape(input.dataset.pedidoCant)}"]`).textContent = $u(it ? it.costo : 0);
  $(`[data-pedido-total="${CSS.escape(clave)}"]`).textContent = $u(g.total);
}

/** La hoja para mandarle al proveedor: sin costos (son del negocio), con el código que usa ese proveedor. */
function htmlPedido(g) {
  const neg = (db && db.negocio) || {};
  const items = g.items.filter((it) => it.cantidad > 0);
  const conCodProv = items.some((it) => codigoDelProv(it.producto, g.proveedorId));
  return `<div class="pedido-hoja">
    <header><div><h1>Pedido de mercadería</h1><p>${new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
      <div class="pedido-de"><strong>${esc(neg.nombre || NOMBRE_NEGOCIO)}</strong>${neg.direccion ? `<div>${esc(neg.direccion)}</div>` : ''}${neg.telefono ? `<div>Tel. ${esc(neg.telefono)}</div>` : ''}${neg.rut ? `<div>RUT ${esc(neg.rut)}</div>` : ''}</div></header>
    <p class="pedido-para">Para: <strong>${esc(g.nombre)}</strong>${contactoProv(g.proveedor) ? ` · ${esc(contactoProv(g.proveedor))}` : ''}</p>
    <table><thead><tr>${conCodProv ? '<th>Su código</th>' : ''}<th>Código</th><th>Producto</th><th class="num">Cantidad</th><th>Unidad</th></tr></thead>
      <tbody>${items.map((it) => `<tr>${conCodProv ? `<td>${esc(codigoDelProv(it.producto, g.proveedorId))}</td>` : ''}<td>${esc(it.producto.codigo)}</td><td>${esc(it.producto.nombre)}</td><td class="num">${n(it.cantidad)}</td><td>${esc(it.producto.unidad)}</td></tr>`).join('')}</tbody></table>
    <p class="pedido-pie">${plural(items.length, 'producto', 'productos')}</p>
  </div>`;
}

function imprimirPedido(clave) {
  const g = grupoPedido(clave);
  if (!g || !g.items.some((it) => it.cantidad > 0)) { toast('No hay nada para pedir a este proveedor.'); return; }
  $('#impresion').classList.add('pedido');
  imprimir(htmlPedido(g));
}

function exportarPedido(clave) {
  const g = grupoPedido(clave);
  if (!g) return;
  descargarExcel(g.items.filter((it) => it.cantidad > 0).map((it) => ({
    'Código': it.producto.codigo, 'Código del proveedor': codigoDelProv(it.producto, g.proveedorId), 'Producto': it.producto.nombre,
    'Cantidad': it.cantidad, 'Unidad': it.producto.unidad, 'Costo unitario': red(Number(it.producto.costo || 0) * factorPesos(db, it.producto)), 'Costo estimado': it.costo,
  })), 'Pedido', `pedido_${normal(g.nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proveedor'}`, {
    titulo: `Pedido a ${g.nombre}`, subtitulo: contactoProv(g.proveedor), texto: ['Código', 'Código del proveedor'], plata: ['Costo unitario', 'Costo estimado'], totales: ['Costo estimado'],
  });
}

function iniciarPedido() {
  $('#btn-armar-pedido').addEventListener('click', () => {
    pedidoCant = {};
    renderPedido();
    $('#dlg-pedido').showModal();
  });
  $('#pedido-cuerpo').addEventListener('input', (e) => { if (e.target.matches('[data-pedido-cant]')) cambiarCantidadPedido(e.target); });
  $('#pedido-cuerpo').addEventListener('click', (e) => {
    const imp = e.target.closest('[data-pedido-imprimir]');
    if (imp) return imprimirPedido(imp.dataset.pedidoImprimir);
    const xl = e.target.closest('[data-pedido-excel]');
    if (xl) exportarPedido(xl.dataset.pedidoExcel);
  });
  window.addEventListener('afterprint', () => $('#impresion').classList.remove('pedido'));
}

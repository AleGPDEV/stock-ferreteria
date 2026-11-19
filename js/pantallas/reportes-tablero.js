/* Reportes → Tablero: lo importante de un vistazo. */
'use strict';

/* ---------- Tablero: lo importante de un vistazo ---------- */

const signoPlata = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${$u(Math.abs(x))}`;
const pctCambio = (pct) => (pct == null ? 'nuevo' : `${pct > 0 ? '▲' : pct < 0 ? '▼' : '＝'} ${n(Math.abs(Math.round(pct)))} %`);

function renderRepTablero(per) {
  const a = analisisVentas(db, per.desde, per.hasta);
  const ant = analisisVentas(db, per.antDesde, per.antHasta);
  const t = per.textoAnt;
  const margenTxt = (x) => pct1(x);
  // Margen: se compara en puntos, no en %
  const dm = a.margen != null && ant.margen != null ? Math.round((a.margen - ant.margen) * 10) / 10 : null;
  const clsM = dm == null || Math.abs(dm) < 0.5 ? 'neutro' : dm > 0 ? 'sube' : 'baja';
  $('#tab-kpis').innerHTML = [
    kpiCambio('Vendido', a.total, ant.total, $u, t),
    kpiCambio('Ganancia bruta', a.ganancia, ant.ganancia, $u, t),
    kpi('Margen', margenTxt(a.margen), dm == null ? '<span class="det">Sin datos para comparar</span>'
      : `<span class="delta ${clsM}">${clsM === 'sube' ? '▲' : clsM === 'baja' ? '▼' : '＝'} ${n(Math.abs(dm))} puntos <span class="delta-txt">${esc(t)}</span></span><span class="det">Antes: ${margenTxt(ant.margen)}</span>`, `k-${clsM}`),
    kpiCambio('Ventas', a.cantidad, ant.cantidad, n, t, false),
    kpiCambio('Ticket promedio', a.ticketPromedio, ant.ticketPromedio, $u, t),
  ].join('');

  // Crecimiento al último día del período: día, semana, mes y año
  const tramos = tramosCrecimiento(per.dHasta).map((x) => {
    const ahora = analisisVentas(db, inicioDia(x.desde), finDia(x.hasta)).total;
    const antes = analisisVentas(db, inicioDia(x.antDesde), finDia(x.antHasta)).total;
    return { ...x, ahora, antes, dif: red2(ahora - antes), pct: antes ? (ahora - antes) / antes * 100 : null };
  });
  $('#tab-crec-sub').textContent = `Hasta el ${tituloPeriodo(per.dHasta, per.dHasta).toLowerCase()}, comparado con el mismo tramo de antes.`;
  $('#tab-crec').innerHTML = `<div class="table-wrap"><table class="tabla crec">
    <thead><tr><th>Tramo</th><th class="num">Ahora</th><th class="num">Antes</th><th class="num">Diferencia</th><th class="num">Cambio</th></tr></thead>
    <tbody>${tramos.map((x) => {
      const cls = x.pct == null ? (x.ahora ? 'sube' : 'neutro') : Math.abs(x.pct) < 0.5 ? 'neutro' : x.pct > 0 ? 'sube' : 'baja';
      return `<tr class="fila-${cls}">
        <td><div class="nom">${x.nombre}</div><div class="meta">${esc(tituloPeriodo(x.desde, x.hasta))} · contra ${esc(x.textoAnt)}</div>
          <div class="par"><i class="ahora" style="width:${x.ahora / Math.max(1, x.ahora, x.antes) * 100}%"></i><i class="antes" style="width:${x.antes / Math.max(1, x.ahora, x.antes) * 100}%"></i></div></td>
        <td class="num"><strong>${$u(x.ahora)}</strong></td>
        <td class="num muted">${$u(x.antes)}</td>
        <td class="num"><span class="delta ${cls}">${signoPlata(x.dif)}</span></td>
        <td class="num"><span class="pill ${cls}">${x.antes ? pctCambio(x.pct) : x.ahora ? 'nuevo' : '—'}</span></td>
      </tr>`;
    }).join('')}</tbody></table></div>
    <p class="leyenda"><span><i class="ahora"></i>Ahora</span><span><i class="antes"></i>Antes</span></p>`;

  // Subas y bajas por categoría y por producto
  const lista = (items, cuantos) => {
    const suben = items.filter((x) => x.dif > 0).slice(0, cuantos);
    const bajan = items.filter((x) => x.dif < 0).reverse().slice(0, cuantos);
    const max = Math.max(1, ...[...suben, ...bajan].map((x) => Math.abs(x.dif)));
    const fila = (x, cls) => `<li class="${cls}"><div class="b-txt"><span>${esc(x.nombre)}</span><strong class="num delta ${cls}">${signoPlata(x.dif)}</strong></div>
      <div class="barra ${cls}"><i style="width:${Math.abs(x.dif) / max * 100}%"></i></div>
      <div class="b-meta">${$u(x.antes)} → ${$u(x.ahora)}${x.antes ? ` · <span class="delta ${cls}">${pctCambio(x.pct)}</span>` : ' · <span class="delta sube">nuevo en el período</span>'}</div></li>`;
    if (!suben.length && !bajan.length) return '<p class="vacio">Sin cambios para comparar.</p>';
    return `<div class="sube-baja">
      <div><h3 class="subt sube">▲ Suben</h3>${suben.length ? `<ul class="barras">${suben.map((x) => fila(x, 'sube')).join('')}</ul>` : '<p class="muted">Ninguna.</p>'}</div>
      <div><h3 class="subt baja">▼ Bajan</h3>${bajan.length ? `<ul class="barras">${bajan.map((x) => fila(x, 'baja')).join('')}</ul>` : '<p class="muted">Ninguna.</p>'}</div>
    </div>`;
  };
  $('#tab-cat-sub').textContent = `Lo vendido en cada categoría, ${t}.`;
  $('#tab-prod-sub').textContent = `Los que más cambiaron en plata, ${t}.`;
  $('#tab-cat').innerHTML = lista(subasYBajas(a.porCategoria, ant.porCategoria), 4);
  $('#tab-prod').innerHTML = lista(subasYBajas(a.porProducto, ant.porProducto), 5);

  // Para prestar atención
  const alertas = [];
  const ult30 = analisisVentas(db, inicioDia(sumarDias(per.dHasta, -29)), finDia(per.dHasta));
  const prods = new Map(db.productos.map((p) => [p.id, p]));
  const buenosSinStock = Object.values(ult30.porProducto).sort((x, y) => y.vendido - x.vendido).slice(0, 40)
    .map((x) => prods.get(x.id)).filter((p) => p && estado(p) !== 'ok');
  if (buenosSinStock.length) alertas.push(['baja', `${buenosSinStock.length} de los más vendidos se están quedando sin stock`, buenosSinStock.slice(0, 4).map((p) => `${p.nombre} (${n(p.stock)})`).join(', ') + (buenosSinStock.length > 4 ? '…' : ''), '#productos']);
  const anuladas = db.ventas.filter((v) => v.anulada && Date.parse(v.fecha) >= per.desde && Date.parse(v.fecha) <= per.hasta);
  if (anuladas.length) alertas.push(['aviso', `${anuladas.length} venta${anuladas.length === 1 ? ' anulada' : 's anuladas'}`, `Por ${$u(anuladas.reduce((x, v) => x + enPesos(v).total, 0))} en total.`]);
  const cajasDif = (db.cajas || []).filter((c) => c.cerrada && Math.abs(c.diferencia || 0) >= 0.01 && Date.parse(c.cerrada) >= per.desde && Date.parse(c.cerrada) <= per.hasta);
  if (cajasDif.length) alertas.push(['baja', `${cajasDif.length} cierre${cajasDif.length === 1 ? '' : 's'} de caja con diferencia`, cajasDif.slice(0, 3).map((c) => `Caja ${String(c.numero).padStart(3, '0')}: ${signoPlata(c.diferencia)}`).join(' · ')]);
  if (a.descuentos > 0) alertas.push([claseCambio(ant.descuentos, a.descuentos) === 'baja' ? 'aviso' : 'info', `Descuentos por ${$u(a.descuentos)}`, ant.descuentos ? `Antes: ${$u(ant.descuentos)} (${pctCambio((a.descuentos - ant.descuentos) / ant.descuentos * 100)})` : 'Lo que se dejó de cobrar en el período.']);
  if (a.productosSinCosto) alertas.push(['aviso', `${a.productosSinCosto} producto${a.productosSinCosto === 1 ? '' : 's'} vendido${a.productosSinCosto === 1 ? '' : 's'} sin costo cargado`, `La ganancia no cuenta ${$u(a.vendidoSinCosto)}.`]);
  const bajoCosto = db.productos.filter(precioBajoCosto);
  if (bajoCosto.length) alertas.push(['baja', `${bajoCosto.length} producto${bajoCosto.length === 1 ? '' : 's'} con precio igual o menor al costo`, bajoCosto.slice(0, 3).map((p) => p.nombre).join(', ') + (bajoCosto.length > 3 ? '…' : '') + ' · En Productos, filtro «Precio igual o menor al costo».']);
  const revisar = db.productos.filter((p) => p.revisar);
  if (revisar.length) alertas.push(['aviso', `${revisar.length} producto${revisar.length === 1 ? '' : 's'} nuevo${revisar.length === 1 ? '' : 's'} cargado${revisar.length === 1 ? '' : 's'} por empleados para revisar`, `${revisar.slice(0, 3).map((p) => `${p.nombre} (${$m(p.precio, p.moneda)})`).join(', ')}${revisar.length > 3 ? '…' : ''} · En Productos, filtro «Nuevos para revisar»; al editarlos quedan revisados.`]);
  const parada = mercaderiaParada(db, 90);
  if (parada.length) alertas.push(['info', `${$u(parada.reduce((x, y) => x + y.valorCosto, 0))} en mercadería parada`, `${parada.length} producto${parada.length === 1 ? '' : 's'} con stock y sin ventas en 90 días.`]);
  $('#tab-alertas').innerHTML = alertas.length
    ? `<ul class="alertas">${alertas.map(([cls, tit, det]) => `<li class="al-${cls}"><span class="al-ico" aria-hidden="true">${{ baja: '!', aviso: '!', info: 'i' }[cls]}</span><div><strong>${esc(tit)}</strong><div class="meta">${esc(det)}</div></div></li>`).join('')}</ul>`
    : '<p class="vacio">Nada para revisar. Todo en orden.</p>';

  // Por día de la semana (8 semanas)
  const sem = promedioPorDiaSemana(db, per.dHasta, 8);
  const mejor = sem.reduce((m, x) => (x.promedio > m.promedio ? x : m), { promedio: 0 });
  $('#tab-semana-sub').textContent = `Promedio vendido cada día, en las 8 semanas hasta el ${fechaDe(per.dHasta).getDate()} de ${MESES[fechaDe(per.dHasta).getMonth()]}.`;
  $('#tab-semana').innerHTML = mejor.promedio
    ? barrasHtml(sem, (x) => x.promedio, (x) => `<span>${x.nombre[0].toUpperCase() + x.nombre.slice(1)}${x === mejor ? ' <span class="chip ok">el mejor</span>' : ''}</span><strong class="num">${$u(x.promedio)}</strong>`)
    : '<p class="vacio">Sin ventas en esas semanas.</p>';
}

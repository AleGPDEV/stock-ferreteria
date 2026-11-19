/* Pantalla Panel (inicio del administrador). */
'use strict';

/* ---------- Panel ---------- */

function renderPanel() {
  const valorCosto = db.productos.reduce((s, p) => s + Math.max(p.stock, 0) * p.costo * factorPesos(db, p), 0);
  const valorVenta = db.productos.reduce((s, p) => s + Math.max(p.stock, 0) * p.precio * factorPesos(db, p), 0);
  const bajos = db.productos.filter((p) => estado(p) !== 'ok');
  const sin = bajos.filter((p) => estado(p) === 'sin').length;
  const hoy = ventasDelDia().filter((v) => !v.anulada);
  const totalHoy = hoy.reduce((s, v) => s + enPesos(v).total, 0);

  $('#kpis').innerHTML = `
    <div class="kpi"><span class="lbl">Vendido hoy</span><span class="val">${$u(totalHoy)}</span><span class="det">${hoy.length} ${hoy.length === 1 ? 'venta' : 'ventas'}</span></div>
    <div class="kpi"><span class="lbl">Productos</span><span class="val">${db.productos.length}</span><span class="det">${new Set(db.productos.map((p) => p.categoria).filter(Boolean)).size} categorías</span></div>
    <div class="kpi"><span class="lbl">Inventario a costo</span><span class="val">${$u(valorCosto)}</span><span class="det">A precio de venta: ${$u(valorVenta)}</span></div>
    <div class="kpi ${bajos.length ? 'alerta' : ''}"><span class="lbl">Para reponer</span><span class="val">${bajos.length}</span><span class="det">${sin} sin stock</span></div>`;

  const rep = bajos.sort((a, b) => (a.stock / (a.minimo || 1)) - (b.stock / (b.minimo || 1))).slice(0, 7);
  $('#panel-reponer').innerHTML = rep.length
    ? `<ul class="lista">${rep.map((p) => `
        <li>
          <div class="izq"><div class="nom">${esc(p.nombre)}</div>
          <div class="meta">${n(p.stock)} de mín. ${n(p.minimo)} ${esc(p.unidad)} · ${esc(nombreProv(p.proveedorId) || 'Sin proveedor')}</div></div>
          <button class="btn sm verde-suave" type="button" data-accion="entrada" data-id="${p.id}">+ Sumar stock</button>
        </li>`).join('')}</ul>`
    : '<p class="vacio">Todo el stock está por encima del mínimo.</p>';

  const ult = [...db.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 7);
  $('#panel-movs').innerHTML = ult.length
    ? `<ul class="lista">${ult.map((m) => `
        <li>
          <div class="izq"><div class="nom">${esc(m.producto)}</div><div class="meta">${fechaHora(m.fecha)} · ${esc(m.nota || etiquetaTipo(m))}</div></div>
          <span class="num ${m.cantidad >= 0 ? 'mas' : 'menos'}">${m.cantidad >= 0 ? '+' : '−'}${n(Math.abs(m.cantidad))} ${esc(m.unidad)}</span>
        </li>`).join('')}</ul>`
    : '<p class="vacio">Todavía no hay movimientos.</p>';
}

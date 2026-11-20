/* Pantalla Vender: buscar productos, armar el ticket, cobrar, lector de código de barras,
 * alta rápida de un producto que no está cargado y la ventana de venta cobrada. */
'use strict';

/* ---------- Caja ---------- */

const CANTIDAD_MAX = 9999;
let ticket = []; // { productoId, cantidad, precio }

const topeDescuentoEmpleado = () => {
  const x = Number((db.negocio || {}).descuentoMaxEmpleado);
  return Number.isFinite(x) && (db.negocio || {}).descuentoMaxEmpleado !== '' && (db.negocio || {}).descuentoMaxEmpleado != null ? x : 10;
};

/** Pide el PIN de un administrador. Devuelve el usuario administrador o null si se cancela. */
function pedirAdmin(texto) {
  return new Promise((res) => {
    const d = $('#dlg-autorizar');
    const admins = db.usuarios.filter((u) => u.rol === 'admin');
    $('#aut-usuario').innerHTML = admins.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
    $('#aut-texto').textContent = texto;
    $('#aut-pin').value = '';
    $('#aut-err').textContent = '';
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; d.close(); res(v); };
    $('#aut-cancel').onclick = () => fin(null);
    d.oncancel = () => fin(null);
    $('#form-autorizar').onsubmit = (e) => {
      e.preventDefault();
      const u = admins.find((x) => x.id === $('#aut-usuario').value);
      if (!u) return;
      // Contador aparte del ingreso: los errores en esta ventana (en la sesión de un empleado) no bloquean
      // al administrador para entrar al programa.
      const clave = `aut:${u.id}`;
      const espera = esperaPin(db, clave);
      if (espera) { $('#aut-err').textContent = `Demasiados intentos. Esperá ${textoEspera(espera)}.`; return; }
      if (!verificarPin(u, $('#aut-pin').value)) {
        const b = fallarPin(db, clave); guardar();
        $('#aut-err').textContent = b ? `PIN incorrecto. Esperá ${textoEspera(b)}.` : 'El PIN no es correcto.';
        $('#aut-pin').value = '';
        return;
      }
      if (acertarPin(db, clave)) guardar();
      fin(u);
    };
    d.showModal();
    $('#aut-pin').focus();
  });
}

/* Lector de códigos con el cursor en otro campo de la caja (efectivo, descuento, cliente, cantidad):
 * una tira de 6 o más caracteres escritos muy rápido y seguidos de Enter es un escaneo, no algo que
 * escribió una persona. Se deja el campo como estaba y el producto se agrega al ticket. */
const rafaga = { el: null, antes: '', texto: '', ult: 0 };
const esCampoCaja = (el) => !!el && (el.id === 'caja-recibido' || el.id === 'caja-desc' || el.id === 'caja-cliente' || (el.dataset && el.dataset.cant != null));
function vigilarEscaner(e) {
  const el = e.target;
  if (!esCampoCaja(el)) return;
  const ahora = (typeof performance !== 'undefined' ? performance : Date).now();
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (rafaga.el !== el || ahora - rafaga.ult > 60) { rafaga.el = el; rafaga.antes = el.value; rafaga.texto = ''; }
    rafaga.texto += e.key;
    rafaga.ult = ahora;
    return;
  }
  if (e.key === 'Enter' && rafaga.el === el && /^[0-9A-Za-z.\-]{6,}$/.test(rafaga.texto) && /\d/.test(rafaga.texto) && ahora - rafaga.ult < 100) {
    e.preventDefault();
    e.stopPropagation();
    const codigo = rafaga.texto.trim();
    el.value = rafaga.antes;
    rafaga.el = null;
    if (el.id === 'caja-recibido') actualizarVuelto();
    if (el.id === 'caja-desc') renderTicket();
    const p = buscarPorCodigo(db, codigo);
    if (p) { agregarAlTicket(p.id); toast(`Se escaneó ${p.nombre} con el cursor en otro campo: se agregó al ticket.`); }
    else abrirAltaRapida(codigo);
    $('#caja-buscar').focus();
  }
}

function medioActual() { return ($('input[name="medio"]:checked') || {}).value || 'Efectivo'; }
function descuentoActual() { const x = Number($('#caja-desc').value); return x > 0 && x <= 100 ? x : 0; }
function subtotalTicket() { return red2(ticket.reduce((s, it) => s + it.cantidad * it.precio, 0)); }
/** El ticket es todo en una moneda: la del primer producto. */
function monedaTicket() { const p = ticket.length ? producto(ticket[0].productoId) : null; return esUSD(p) ? 'USD' : 'UYU'; }
const $t = (x) => $m(x, monedaTicket());
function totalTicket() { const s = subtotalTicket(); return red2(s - red2(s * descuentoActual() / 100)); }

function agregarAlTicket(id, cant = 1) {
  const p = producto(id);
  if (!p) return;
  const linea = ticket.find((it) => it.productoId === id);
  const enTicket = linea ? linea.cantidad : 0;
  if (enTicket + cant > p.stock + 1e-9) {
    toast(p.stock > 0 ? `Ojo: según el programa quedan ${n(p.stock)} ${p.unidad} de ${p.nombre}.` : `Ojo: según el programa no hay stock de ${p.nombre}. Al cobrar se pide confirmar.`);
  }
  if (!linea && ticket.length && (esUSD(p) ? 'USD' : 'UYU') !== monedaTicket()) {
    aviso(`${p.nombre} es en ${esUSD(p) ? 'dólares' : 'pesos'} y este ticket es en ${monedaTicket() === 'USD' ? 'dólares' : 'pesos'}. Los productos en dólares se cobran aparte: cobrá primero este ticket y después agregalo en uno nuevo.`);
    return;
  }
  if (linea) linea.cantidad = red(linea.cantidad + cant);
  else ticket.push({ productoId: id, cantidad: cant, precio: p.precio });
  $('#caja-err').textContent = '';
  renderTicket();
}

function renderEstadoCaja() {
  const caja = cajaAbierta(db);
  $('#caja-cerrada').hidden = !!caja;
  $('#caja-abierta').hidden = !caja;
  $('#caja-barra').hidden = !caja;
  if (!caja) {
    // Con productos en dólares, al abrir se escribe el dólar de hoy y los dólares que hay para dar cambio
    const hayUSD = db.productos.some(esUSD);
    $('#ac-usd').hidden = !hayUSD;
    if (hayUSD && !$('#ac-cotiz').value && db.cotizacion) $('#ac-cotiz').value = db.cotizacion;
    const ultima = [...(db.cajas || [])].reverse().find((c) => c.cerrada);
    $('#caja-ultimo-cierre').textContent = ultima ? `Último cierre: ${fechaHora(ultima.cerrada)}${ultima.cerradaPor ? ` por ${ultima.cerradaPor}` : ''}.` : '';
    return false;
  }
  const deOtroDia = isoLocal(new Date(caja.abierta)) !== isoLocal();
  $('#caja-barra-texto').innerHTML = `Caja N.º ${caja.numero} abierta ${deOtroDia ? `el ${fechaHora(caja.abierta)}` : `a las ${hora(caja.abierta)}`}${caja.abiertaPor ? ` por ${esc(caja.abiertaPor)}` : ''} · empezó con ${$u(caja.inicial)}${caja.inicialUSD ? ` y ${$usd(caja.inicialUSD)}` : ''}${caja.cotizacion ? ` · dólar a ${$u(caja.cotizacion)}` : ''}`
    + (caja.movs.length ? ` · ${plural(caja.movs.length, 'movimiento de efectivo', 'movimientos de efectivo')}` : '');
  $('#caja-barra-estado').className = 'chip ' + (deOtroDia ? 'warn' : 'ok');
  $('#caja-barra-estado').textContent = deOtroDia ? 'Abierta desde otro día: cerrala' : 'Caja abierta';
  return true;
}

function renderCaja() {
  const abierta = renderEstadoCaja();
  renderVentasHoy();
  if (!abierta) return;
  $('#ticket-num').textContent = `N.º ${String((db.numVenta || 0) + 1).padStart(4, '0')}`;
  renderFiltrosCaja();
  renderResultados();
  renderTicket();
}

/* Filtros de la lista de productos al vender */
const SIN_CATEGORIA = 'Sin categoría';
const PASO_LISTA = 24;
let cajaCat = '';
let cajaLimite = PASO_LISTA;

function renderFiltrosCaja() {
  const cuenta = {};
  db.productos.forEach((p) => { const c = p.categoria || SIN_CATEGORIA; cuenta[c] = (cuenta[c] || 0) + 1; });
  const cats = Object.keys(cuenta).sort((a, b) => (a === SIN_CATEGORIA) - (b === SIN_CATEGORIA) || a.localeCompare(b));
  if (cajaCat && !cuenta[cajaCat]) cajaCat = '';
  $('#caja-cat').innerHTML = '<option value="">Todas las categorías</option>'
    + cats.map((c) => `<option value="${esc(c)}"${c === cajaCat ? ' selected' : ''}>${esc(c)} (${cuenta[c]})</option>`).join('');
  $('#caja-filtros').hidden = !db.productos.length;
  const sel = $('#caja-prov');
  const actual = sel.value;
  sel.innerHTML = opcionesProv(actual, 'Todos los proveedores');
  if (actual && !proveedor(actual)) sel.value = '';
}

function hayFiltrosCaja() { return !!(cajaCat || $('#caja-prov').value || $('#caja-constock').checked); }

function quitarFiltrosCaja() {
  cajaCat = '';
  $('#caja-prov').value = '';
  $('#caja-constock').checked = false;
  cajaLimite = PASO_LISTA;
  renderFiltrosCaja();
  renderResultados();
}

function renderResultados() {
  const texto = $('#caja-buscar').value.trim();
  const q = normal(texto);
  const prov = $('#caja-prov').value;
  const conStock = $('#caja-constock').checked;
  const orden = $('#caja-orden').value;
  const provs = new Map(db.proveedores.map((v) => [v.id, v.nombre]));
  let lista = db.productos.filter((p) => (!cajaCat || (p.categoria || SIN_CATEGORIA) === cajaCat)
    && (!prov || p.proveedorId === prov)
    && (!conStock || p.stock > 0)
    && (!q || coincide(`${textoCodigos(p)} ${p.nombre} ${p.categoria} ${provs.get(p.proveedorId) || ''} ${p.ubicacion}`, q)));

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);
  if (orden === 'vendidos') {
    const veces = {};
    db.ventas.forEach((v) => { if (!v.anulada) v.items.forEach((it) => { veces[it.productoId] = (veces[it.productoId] || 0) + 1; }); });
    lista.sort((a, b) => (veces[b.id] || 0) - (veces[a.id] || 0) || porNombre(a, b));
  } else if (orden === 'precio-asc') lista.sort((a, b) => a.precio - b.precio || porNombre(a, b));
  else if (orden === 'precio-desc') lista.sort((a, b) => b.precio - a.precio || porNombre(a, b));
  else lista.sort(porNombre);

  const total = lista.length;
  const filtros = hayFiltrosCaja();
  $('#caja-limpiar').hidden = !filtros;
  $('#caja-cuenta').textContent = db.productos.length && (q || filtros) ? `${total} ${total === 1 ? 'producto' : 'productos'}` : '';
  lista = lista.slice(0, cajaLimite);
  $('#caja-resultados').innerHTML = lista.length
    ? lista.map((p) => `
      <button class="prod-btn${p.stock <= 0 ? ' sin-stock' : ''}${tieneFoto(p) ? ' tiene-foto' : ''}" type="button" data-agregar="${p.id}">
        ${tieneFoto(p) ? `<img class="foto pb-foto" src="${esc(fotoUrl(p))}" alt="" loading="lazy">` : ''}
        <span class="nom">${esc(p.nombre)}</span>
        <span class="fila"><span class="mono">${esc(p.codigo)}</span><span class="${estado(p) === 'bajo' ? 'stock-bajo' : ''}">${p.stock <= 0 ? 'Sin stock' : estado(p) === 'bajo' ? `Quedan ${n(p.stock)} ${esc(p.unidad)}` : `Stock ${n(p.stock)} ${esc(p.unidad)}`}</span></span>
        <span class="precio">${$m(p.precio, p.moneda)}</span>
      </button>`).join('') + (total > lista.length ? `<button class="btn ver-mas" type="button" data-ver-mas>Ver más productos (faltan ${total - lista.length})</button>` : '')
    : `<div class="vacio sin-resultado">
        <p>${q ? `No encontré ningún producto con «${esc(texto)}»${filtros ? ' con esos filtros' : ''}.` : (filtros ? 'No hay productos con esos filtros.' : 'Todavía no hay productos cargados.')}</p>
        ${filtros ? '<button class="btn" type="button" data-quitar-filtros>Quitar filtros</button>' : ''}
        ${q || !filtros ? '<button class="btn verde" type="button" data-alta>Agregar como producto nuevo</button>' : ''}
      </div>`;
}

function renderTicket() {
  ticket = ticket.filter((it) => producto(it.productoId));
  $('#ticket-items').innerHTML = ticket.length
    ? ticket.map((it, i) => {
      const p = producto(it.productoId);
      return `<div class="ticket-linea">
        <span class="nom">${miniatura(p, 'mini tl-foto')}${esc(p.nombre)}</span>
        <span class="sub-t">${$t(it.cantidad * it.precio)}</span>
        <div class="ctrl">
          <span class="qty">
            <button type="button" data-menos="${i}" aria-label="Restar uno">−</button>
            <input type="number" min="0" step="any" inputmode="decimal" value="${it.cantidad}" data-cant="${i}" aria-label="Cantidad de ${esc(p.nombre)}">
            <button type="button" data-mas="${i}" aria-label="Sumar uno">+</button>
          </span>
          <span>${esc(p.unidad)} × ${$t(it.precio)}</span>
          <button class="btn sm danger quitar" type="button" data-quitar="${i}" aria-label="Quitar ${esc(p.nombre)}">Quitar</button>
        </div>
      </div>`;
    }).join('')
    : '<p class="vacio">Agregá productos tocándolos en la lista o escaneando su código.</p>';
  $('#ticket-total').textContent = $t(totalTicket());
  const pct = descuentoActual();
  const det = $('#ticket-desc-det');
  det.hidden = !(pct && ticket.length);
  det.textContent = pct ? `Subtotal ${$t(subtotalTicket())} · Descuento −${$t(red2(subtotalTicket() * pct / 100))}` : '';
  // Ticket en dólares: se pide la cotización del día (queda en la caja y en la venta, para los reportes)
  const usd = ticket.length && monedaTicket() === 'USD';
  $('#caja-cotiz-campo').hidden = !usd;
  if (usd && !$('#caja-cotiz').value) $('#caja-cotiz').value = cotizacionActual(db) || '';
  $('#bloque-efectivo').classList.toggle('en-usd', !!usd);
  actualizarVuelto();
  $('#btn-cobrar').disabled = !ticket.length;
  $('#btn-cobrar').textContent = ticket.length ? `Cobrar ${$t(totalTicket())}` : 'Cobrar';
}

function actualizarVuelto() {
  const ef = medioActual() === 'Efectivo';
  $('#bloque-efectivo').hidden = !ef;
  const rec = $('#caja-recibido').value;
  const v = $('#caja-vuelto');
  if (!ef || rec === '') { v.textContent = '—'; v.style.color = ''; return; }
  const dif = Number(rec) - totalTicket();
  v.textContent = dif >= 0 ? $t(dif) : `Faltan ${$t(-dif)}`;
  v.style.color = dif >= 0 ? '' : 'var(--danger)';
}

function fechaVentas() { return (esAdmin() && $('#ventas-fecha').value) || isoLocal(); }

function renderVentasHoy() {
  const dia = fechaVentas();
  const esHoy = dia === isoLocal();
  const lista = ventasDelDia(dia).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const validas = lista.filter((v) => !v.anulada);
  const cobradas = validas.filter((v) => !esDevolucion(v)), devs = validas.length - cobradas.length;
  const enPes = validas.filter((v) => !esUSD(v)), enUSD = validas.filter(esUSD);
  const total = enPes.reduce((s, v) => s + v.total, 0);
  const porMedio = {};
  enPes.forEach((v) => { porMedio[v.medio] = (porMedio[v.medio] || 0) + v.total; });
  $('#ventas-hoy-resumen').textContent = validas.length
    ? `${cobradas.length} ${cobradas.length === 1 ? 'venta' : 'ventas'}${devs ? ` · ${devs} ${devs === 1 ? 'devolución' : 'devoluciones'}` : ''} · ${$u(total)} · ` + Object.entries(porMedio).map(([m, t]) => `${m} ${$u(t)}`).join(' · ')
      + (enUSD.length ? ` · En dólares: ${$usd(enUSD.reduce((s, v) => s + v.total, 0))}` : '')
    : (esHoy ? 'Todavía no hay ventas hoy.' : 'No hubo ventas ese día.');
  $('#btn-cierre').disabled = !validas.length;
  $('#ventas-hoy').innerHTML = lista.length
    ? `<div class="table-wrap"><table class="tabla">
        <thead><tr><th>N.º</th><th>Hora</th><th>Detalle</th><th>Pago</th><th class="num">Total</th><th class="num"></th></tr></thead>
        <tbody>${lista.map((v) => `
          <tr${v.anulada ? ' class="muted"' : ''}>
            <td class="mono">${String(v.numero).padStart(4, '0')}</td>
            <td class="num">${hora(v.fecha)}${v.usuario ? `<div class="meta">${esc(v.usuario)}</div>` : ''}</td>
            <td>${esDevolucion(v) ? `<div><span class="chip warn">Devolución</span> de la venta N.º ${String(v.numeroOriginal).padStart(4, '0')}</div>` : ''}<div>${v.items.map((it) => `${n(Math.abs(it.cantidad))} × ${esc(it.nombre)}`).join('<br>')}</div>${v.cliente ? `<div class="meta">${esc(v.cliente)}</div>` : ''}${detalleDevuelto(v)}</td>
            <td>${esc(v.medio)}${v.vuelto != null ? `<div class="meta">Vuelto ${$m(v.vuelto, v.moneda)}</div>` : ''}</td>
            <td class="num"><strong>${$m(v.total, v.moneda)}</strong>${esUSD(v) ? `<div class="meta">Dólar a ${$u(v.cotizacion)}</div>` : ''}${v.descuento ? `<div class="meta">Descuento ${n(v.descuentoPct)} %</div>` : ''}</td>
            <td class="acc">${puedeImprimir() ? `<button class="btn sm" type="button" data-ticket="${v.id}">Imprimir</button>` : ''}${v.anulada ? '<span class="chip neutro">Anulada</span>' : botonesVenta(v)}</td>
          </tr>`).join('')}</tbody>
      </table></div>`
    : '';
}

/* Devoluciones parciales: botones en la lista de ventas del día y la ventana «Devolver productos» */
/** Lo que queda por devolver de cada renglón de una venta (vacío si ya se devolvió todo). */
function quedaPorDevolver(v) {
  const ya = devueltoDe(db, v);
  return v.items.map((it, i) => ({ i, it, queda: red(it.cantidad - (ya[i] || 0)) })).filter((x) => x.queda > 1e-9);
}
function botonesVenta(v) {
  if (!esAdmin() || esDevolucion(v)) return '';
  const devolver = quedaPorDevolver(v).length ? `<button class="btn sm" type="button" data-devolver="${v.id}">Devolver</button>` : '';
  const anular = devolucionesDe(db, v).length ? '' : `<button class="btn sm danger" type="button" data-anular="${v.id}">Anular</button>`;
  return devolver + anular;
}
function detalleDevuelto(v) {
  if (esDevolucion(v) || v.anulada) return '';
  const devs = devolucionesDe(db, v);
  return devs.length ? `<div class="meta">Devuelto en ${devs.map((x) => `N.º ${String(x.numero).padStart(4, '0')}`).join(', ')}</div>` : '';
}
let devolviendo = null;
function abrirDevolver(v) {
  devolviendo = v;
  $('#dev-venta').textContent = `Venta N.º ${String(v.numero).padStart(4, '0')} · ${fechaHora(v.fecha)} · ${v.medio} · ${$m(v.total, v.moneda)}${v.descuento ? ` (con ${n(v.descuentoPct)} % de descuento)` : ''}`;
  $('#dev-items').innerHTML = quedaPorDevolver(v).map(({ i, it, queda }) => `<tr>
      <td>${esc(it.nombre)}<div class="meta">${$m(it.precio, v.moneda)} c/u</div></td>
      <td class="num">${n(queda)} ${esc(it.unidad)}</td>
      <td class="num"><label class="visually-hidden" for="dev-c-${i}">Cuánto devuelve de ${esc(it.nombre)}</label><input id="dev-c-${i}" data-renglon="${i}" type="number" min="0" max="${queda}" step="any" inputmode="decimal" placeholder="0"></td>
    </tr>`).join('');
  const medios = $$('input[name="medio"]').map((r) => r.value);
  if (!medios.includes(v.medio)) medios.unshift(v.medio);
  $('#dev-medio').innerHTML = medios.map((m) => `<option${m === v.medio ? ' selected' : ''}>${esc(m)}</option>`).join('');
  $('#dev-err').textContent = '';
  totalDevolver();
  $('#dlg-devolver').showModal();
  const primero = $('#dev-items input'); if (primero) primero.focus();
}
function renglonesDevolver() {
  return $$('#dev-items input').map((el) => ({ renglon: Number(el.dataset.renglon), cantidad: Number(el.value) || 0 })).filter((r) => r.cantidad);
}
function totalDevolver() {
  const v = devolviendo;
  if (!v) return;
  const factor = v.subtotal > 0 ? v.total / v.subtotal : 1;
  const total = renglonesDevolver().reduce((s, r) => s + (v.items[r.renglon] ? r.cantidad * v.items[r.renglon].precio : 0), 0) * factor;
  $('#dev-total').textContent = $m(red2(total), v.moneda);
}
function iniciarDevoluciones() {
  $('#ventas-hoy').addEventListener('click', (e) => {
    const b = e.target.closest('[data-devolver]');
    if (!b || !esAdmin()) return;
    const v = db.ventas.find((x) => x.id === b.dataset.devolver);
    if (v) abrirDevolver(v);
  });
  $('#dev-items').addEventListener('input', () => { $('#dev-err').textContent = ''; totalDevolver(); });
  $('#form-devolver').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = devolviendo;
    if (!v || !esAdmin()) return;
    const r = devolverVenta(db, v.id, renglonesDevolver(), $('#dev-medio').value, sesion ? sesion.nombre : '');
    if (r.error) { $('#dev-err').textContent = r.error; return; }
    if (!guardar()) return;
    $('#dlg-devolver').close();
    devolviendo = null;
    render();
    const d = r.devolucion;
    toast(`Devolución N.º ${String(d.numero).padStart(4, '0')}: los productos volvieron al stock y se devuelven ${$m(-d.total, d.moneda)} (${d.medio.toLowerCase()}).`);
    if (puedeImprimir() && (await confirmar('¿Imprimir el comprobante de la devolución?', 'Imprimir'))) imprimir(htmlTicket(d));
  });
}

/* Producto que no está cargado: se agrega con nombre y precio sin salir de la venta */
/** El primer código propio libre (P-0001, P-0002…), para productos que no traen código de barras. */
function codigoLibreDe(d) {
  const usados = new Set(d.productos.flatMap(codigosDe).map(normCodigo));
  let i = 0, c;
  do { i++; c = 'P-' + String(i).padStart(4, '0'); } while (usados.has(c));
  return c;
}
const codigoLibre = () => codigoLibreDe(db);

function abrirAltaRapida(texto) {
  const esCodigo = !!texto && !/\s/.test(texto) && /\d/.test(texto);
  $('#ar-codigo').value = esCodigo ? texto.toUpperCase() : '';
  $('#ar-nombre').value = esCodigo ? '' : texto;
  $('#ar-precio').value = '';
  $('#ar-stock').value = '';
  $('#ar-err').textContent = '';
  $('#ar-sub').textContent = esCodigo
    ? `El código ${texto} no está cargado en ningún producto.`
    : 'Poné el nombre y el precio para venderlo ahora.';
  // Con un código escaneado se puede asignar a un producto que ya existe (por ejemplo, uno cargado desde una factura)
  arCodigo = esCodigo ? texto.toUpperCase() : '';
  $('#ar-titulo').textContent = esCodigo && db.productos.length ? 'Código que no conozco' : 'Producto nuevo';
  $('#ar-vincular').hidden = !esCodigo || !db.productos.length;
  $('#ar-buscar').value = '';
  $('#ar-lista').innerHTML = '';
  $('#dlg-rapido').showModal();
  (esCodigo ? (db.productos.length ? $('#ar-buscar') : $('#ar-nombre')) : texto ? $('#ar-precio') : $('#ar-nombre')).focus();
}

let arCodigo = '';
function buscarParaVincular() {
  const q = normal($('#ar-buscar').value.trim());
  if (q.length < 2) { $('#ar-lista').innerHTML = ''; return; }
  const palabras = q.split(/\s+/);
  const lista = db.productos
    .filter((p) => { const t = normal(`${p.nombre} ${textoCodigos(p)} ${p.categoria}`); return palabras.every((w) => t.includes(w)); })
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .slice(0, 8);
  $('#ar-lista').innerHTML = lista.length
    ? lista.map((p) => `<li><button type="button" data-vincular="${p.id}">${fotoUrl(p) ? `<img class="foto mini" src="${esc(fotoUrl(p))}" alt="">` : ''}<span class="ar-txt">${esc(p.nombre)}<br><span class="meta"><span class="mono">${esc(p.codigo)}</span>${p.categoria ? ' · ' + esc(p.categoria) : ''}${p.ubicacion ? ' · ' + esc(p.ubicacion) : ''} · stock ${n(p.stock)}</span></span><strong>${$m(p.precio, p.moneda)}</strong></button></li>`).join('')
    : '<li class="meta">No encontré ese producto. Cargalo como nuevo abajo.</li>';
}

function iniciarAltaRapida() {
  $('#ar-buscar').addEventListener('input', buscarParaVincular);
  $('#ar-buscar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const b = $('#ar-lista [data-vincular]'); if (b && $$('#ar-lista [data-vincular]').length === 1) b.click(); }
  });
  $('#ar-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vincular]');
    if (!b) return;
    const p = producto(b.dataset.vincular);
    const error = asignarBarras(db, p, arCodigo);
    if (error) { $('#ar-err').textContent = error; return; }
    guardar();
    $('#dlg-rapido').close();
    $('#caja-buscar').value = '';
    agregarAlTicket(p.id);
    render();
    toast(`Listo: el código ${arCodigo} quedó asignado a ${p.nombre}. La próxima vez entra solo.`);
    $('#caja-buscar').focus();
  });
  $('#form-rapido').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = (t) => { $('#ar-err').textContent = t; };
    const nombre = $('#ar-nombre').value.trim();
    const precio = Number($('#ar-precio').value);
    const codigo = $('#ar-codigo').value.trim().toUpperCase() || codigoLibre();
    const stockTxt = $('#ar-stock').value;
    const stock = stockTxt === '' ? 1 : Number(stockTxt);
    if (!nombre) return err('Escribí el nombre del producto.');
    if (!(precio > 0)) return err('Escribí el precio de venta.');
    if (!(stock > 0)) return err('El stock tiene que ser 1 o más para poder venderlo.');
    if (codigoUsado(db, codigo)) return err(`El código ${codigo} ya lo usa otro producto.`);
    const p = { id: uid(), codigo, nombre, categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: '', costo: 0, precio, minimo: 0, stock: 0 };
    db.productos.push(p);
    marcarProductoNuevo(db, p, sesion ? sesion.nombre : '', sesion ? sesion.rol : '', 'agregado desde la venta');
    registrar(db, { tipo: 'entrada', productoId: p.id, cantidad: stock, costoUnit: 0, nota: 'Agregado desde la venta', origen: 'inicial' });
    guardar();
    $('#dlg-rapido').close();
    $('#caja-buscar').value = '';
    agregarAlTicket(p.id);
    render();
    toast(`${p.nombre} quedó cargado y agregado a la venta.`);
    $('#caja-buscar').focus();
  });
}

function iniciarCaja() {
  iniciarAltaRapida();
  iniciarDevoluciones();
  const buscar = $('#caja-buscar');
  const refiltrar = () => { cajaLimite = PASO_LISTA; renderResultados(); };
  buscar.addEventListener('input', refiltrar);
  ['#caja-prov', '#caja-constock', '#caja-orden'].forEach((sel) => $(sel).addEventListener('input', refiltrar));
  $('#caja-limpiar').addEventListener('click', quitarFiltrosCaja);
  $('#caja-cat').addEventListener('input', () => { cajaCat = $('#caja-cat').value; refiltrar(); });
  $('#caja-mas-filtros').addEventListener('click', () => {
    const extra = $('#caja-filtros-extra');
    extra.hidden = !extra.hidden;
    $('#caja-mas-filtros').setAttribute('aria-expanded', String(!extra.hidden));
    $('#caja-mas-filtros').textContent = extra.hidden ? 'Más filtros' : 'Menos filtros';
  });
  buscar.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = buscar.value.trim();
    if (!q) return;
    const exacto = buscarPorCodigo(db, q);
    const cand = exacto ? [exacto] : db.productos.filter((p) => normal(`${textoCodigos(p)} ${p.nombre}`).includes(normal(q)));
    if (cand.length === 1) {
      agregarAlTicket(cand[0].id);
      buscar.value = '';
      renderResultados();
    } else if (!cand.length) {
      abrirAltaRapida(q);
    } else {
      toast('Hay varios productos que coinciden. Tocá el que corresponda.');
    }
  });
  $('#caja-resultados').addEventListener('click', (e) => {
    if (e.target.closest('[data-alta]')) { abrirAltaRapida(buscar.value.trim()); return; }
    if (e.target.closest('[data-quitar-filtros]')) { quitarFiltrosCaja(); return; }
    if (e.target.closest('[data-ver-mas]')) { cajaLimite += PASO_LISTA; renderResultados(); return; }
    const b = e.target.closest('[data-agregar]');
    if (b) { agregarAlTicket(b.dataset.agregar); buscar.focus(); }
  });
  $('#ticket-items').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.quitar != null) { ticket.splice(+t.dataset.quitar, 1); renderTicket(); }
    if (t.dataset.mas != null) agregarAlTicket(ticket[+t.dataset.mas].productoId, 1);
    if (t.dataset.menos != null) {
      const it = ticket[+t.dataset.menos];
      it.cantidad = red(it.cantidad - 1);
      if (it.cantidad <= 0) ticket.splice(+t.dataset.menos, 1);
      renderTicket();
    }
  });
  $('#ticket-items').addEventListener('change', (e) => {
    const i = e.target.dataset.cant;
    if (i == null) return;
    const it = ticket[+i];
    const p = producto(it.productoId);
    let q = Number(e.target.value);
    if (!(q > 0)) { ticket.splice(+i, 1); renderTicket(); return; }
    if (q > CANTIDAD_MAX) { e.target.value = it.cantidad; toast(`Revisá la cantidad: ${n(q)} es demasiado.`); return; }
    if (q > p.stock) toast(`Ojo: según el programa hay ${n(p.stock)} ${p.unidad} de ${p.nombre}.`);
    it.cantidad = red(q);
    renderTicket();
  });
  $('#ticket-vaciar').addEventListener('click', () => { ticket = []; $('#caja-recibido').value = ''; $('#caja-desc').value = ''; $('#cliente-det').open = false; renderTicket(); });
  $('#caja-desc').addEventListener('input', renderTicket);
  $('#ventas-fecha').value = isoLocal();
  $('#ventas-fecha').addEventListener('input', renderVentasHoy);
  $('#btn-cierre').addEventListener('click', () => imprimir(htmlCierre(fechaVentas())));
  $('#ventas-hoy').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ticket]');
    const v = b && db.ventas.find((x) => x.id === b.dataset.ticket);
    if (v) imprimir(htmlTicket(v));
  });
  // Si el lector de códigos escribe sin que el cursor esté en el buscador, se lleva el cursor ahí
  document.addEventListener('keydown', (e) => {
    if (!sesion || vistaActual() !== 'caja' || !cajaAbierta(db) || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1 || e.key === ' ') return;
    if (document.querySelector('dialog[open]')) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'radio') return;
    $('#caja-buscar').focus();
  });
  document.addEventListener('keydown', vigilarEscaner, true);
  $('#medios').addEventListener('change', actualizarVuelto);
  $('#caja-recibido').addEventListener('input', actualizarVuelto);

  let cobrando = false;
  $('#btn-cobrar').addEventListener('click', async () => {
    if (cobrando) return;
    if (!cajaAbierta(db)) { $('#caja-err').textContent = 'Abrí la caja antes de cobrar.'; render(); return; }
    if (errorGuardado && !guardar({ completo: true })) {
      $('#caja-err').textContent = 'No se puede cobrar: los cambios no se están guardando. Descargá una copia y avisá a quien instaló el programa.';
      return;
    }
    cobrando = true;
    try {
      const opc = { topeDescuento: esAdmin() ? null : topeDescuentoEmpleado() };
      if (monedaTicket() === 'USD') {
        const cot = Number($('#caja-cotiz').value);
        if (!(cot > 0 && cot < 1000)) { $('#caja-err').textContent = 'Escribí la cotización del dólar de hoy (por ejemplo 40,50).'; $('#caja-cotiz').focus(); return; }
        opc.cotizacion = red2(cot);
        const caja = cajaAbierta(db);
        if (caja && caja.cotizacion !== opc.cotizacion) { caja.cotizacion = opc.cotizacion; db.cotizacion = opc.cotizacion; }
      }
      const intentar = () => cobrar(db, ticket, medioActual(), $('#caja-recibido').value, $('#caja-cliente').value.trim(), undefined, Number($('#caja-desc').value) || 0, opc);
      let r = intentar();
      if (r.autorizar) {
        const adm = await pedirAdmin(`El descuento de ${n(Number($('#caja-desc').value))} % supera el máximo de ${n(opc.topeDescuento)} % para empleados.`);
        if (!adm) { $('#caja-err').textContent = r.error; return; }
        opc.autorizo = adm.nombre;
        r = intentar();
      }
      if (r.faltan) {
        const lista = r.faltan.map((f) => `${f.nombre} (hay ${n(f.hay)}, se venden ${n(f.pide)})`).join('; ');
        if (!(await confirmar(`Según el programa no alcanza el stock de: ${lista}. ¿Vender igual? El stock va a quedar en negativo; después corregilo contando lo que hay.`, 'Vender igual'))) { $('#caja-err').textContent = r.error; return; }
        opc.sinStock = true;
        r = intentar();
      }
      if (r.error) { $('#caja-err').textContent = r.error; return; }
      if (!guardar()) toast('La venta quedó registrada en pantalla pero NO se pudo guardar. Descargá una copia.');
      cobrarListo(r);
    } finally { cobrando = false; }
  });
  function cobrarListo(r) {
    ticket = [];
    $('#caja-recibido').value = '';
    $('#caja-cotiz').value = '';
    $('#caja-cliente').value = '';
    $('#cliente-det').open = false;
    $('#caja-desc').value = '';
    $('#ventas-fecha').value = isoLocal();
    $('#caja-err').textContent = '';
    render();
    const v = r.venta;
    mostrarVentaCobrada(v);
  }

  $('#ventas-hoy').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-anular]');
    if (!b || !esAdmin()) return;
    const v = db.ventas.find((x) => x.id === b.dataset.anular);
    if (!(await confirmar(`¿Anular la venta N.º ${v.numero} por ${$m(v.total, v.moneda)}? Los productos vuelven al stock.`, 'Anular venta', true))) return;
    // Venta en efectivo de una caja ya cerrada: la plata que se devuelve sale de la caja de hoy
    const dev = devolucionEnOtraCaja(db, v);
    let devolucion = false;
    if (dev && dev.caja) {
      devolucion = await confirmar(`La venta N.º ${v.numero} se cobró en efectivo en una caja que ya se cerró. ¿Le devolviste los ${$m(v.total, v.moneda)} al cliente con plata de la caja de ahora? Se anota como retiro «Devolución venta N.º ${v.numero}», así al cerrar no falta plata.`, 'Sí, anotar el retiro', false, 'No devolví plata');
    }
    const err = anularVenta(db, v.id, { devolucion, usuario: sesion ? sesion.nombre : '' });
    if (err) { toast(err); return; }
    guardar();
    render();
    toast(devolucion ? `Venta N.º ${v.numero} anulada. Se repuso el stock y se anotó el retiro de ${$m(v.total, v.moneda)} en la caja.`
      : dev && !dev.caja ? `Venta N.º ${v.numero} anulada. Si devolviste plata, anotala como retiro cuando abras la caja.`
        : `Venta N.º ${v.numero} anulada. El stock se repuso.`);
  });
}

/* ---------- Venta cobrada ---------- */

let ultimaVenta = null;
function mostrarVentaCobrada(v) {
  ultimaVenta = v;
  $('#venta-total').textContent = $m(v.total, v.moneda);
  $('#venta-medio').textContent = `Pagó con ${v.medio.toLowerCase()} · Venta N.º ${String(v.numero).padStart(4, '0')}`;
  $('#venta-vuelto-box').hidden = v.vuelto == null;
  $('#venta-vuelto').textContent = $m(v.vuelto, v.moneda);
  const avisos = [...new Set(v.items.map((it) => it.productoId))].map(producto).filter(Boolean).map((p) => ({ p, e: estado(p) })).filter((x) => x.e !== 'ok');
  $('#venta-alerta').hidden = !avisos.length;
  $('#venta-alerta').innerHTML = avisos.length ? `<strong>Hay que reponer</strong><ul>${avisos.map(({ p, e }) => `<li><span>${esc(p.nombre)}</span>${e === 'sin'
    ? '<span class="chip danger">Sin stock</span>' : `<span class="chip warn">Quedan ${n(p.stock)} · mín. ${n(p.minimo)}</span>`}</li>`).join('')}</ul>` : '';
  $('#dlg-venta').showModal();
  $('#venta-nueva').focus();
}

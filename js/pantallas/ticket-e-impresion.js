/* Impresión del ticket y del cierre del día. */
'use strict';

/* ---------- Impresión de ticket y cierre ---------- */

const puedeImprimir = () => typeof window !== 'undefined' && typeof window.print === 'function' && !window.SIN_IMPRESION;

function encabezadoNegocio() {
  const g = (db && db.negocio) || {};
  return `<div class="t-c"><strong class="t-neg">${esc(g.nombre || NOMBRE_NEGOCIO)}</strong>
    ${g.direccion ? `<div>${esc(g.direccion)}</div>` : ''}${g.telefono ? `<div>Tel. ${esc(g.telefono)}</div>` : ''}${g.rut ? `<div>RUT ${esc(g.rut)}</div>` : ''}</div>`;
}

function htmlTicket(v) {
  if (esDevolucion(v)) return htmlDevolucion(v);
  const g = (db && db.negocio) || {};
  const fila = (a, b, cls = '') => `<div class="t-fila ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `${encabezadoNegocio()}<hr>
    ${fila(`Venta N.º ${String(v.numero).padStart(4, '0')}`, fechaHora(v.fecha))}
    ${v.cliente ? `<div>Cliente: ${esc(v.cliente)}</div>` : ''}
    ${v.usuario ? `<div>Atendió: ${esc(v.usuario)}</div>` : ''}
    ${v.anulada ? '<div class="t-c"><strong>VENTA ANULADA</strong></div>' : ''}<hr>
    ${v.items.map((it) => `<div>${esc(it.nombre)}</div>${fila(`${n(it.cantidad)} ${esc(it.unidad)} × ${$m(it.precio, v.moneda)}`, $m(it.subtotal, v.moneda))}`).join('')}<hr>
    ${v.descuento ? fila('Subtotal', $m(v.subtotal, v.moneda)) + fila(`Descuento ${n(v.descuentoPct)} %`, '−' + $m(v.descuento, v.moneda)) : ''}
    ${fila('TOTAL', $m(v.total, v.moneda), 't-total')}
    ${esUSD(v) ? '<div class="t-c t-chico">Importes en dólares estadounidenses (U$S)</div>' : ''}
    ${fila('Pago', esc(v.medio))}
    ${v.recibido != null ? fila('Recibido', $m(v.recibido, v.moneda)) + fila('Vuelto', $m(v.vuelto, v.moneda)) : ''}<hr>
    <div class="t-c">${esc(g.pie || '¡Gracias por su compra!')}</div>
    <div class="t-c t-chico">Comprobante interno. No válido como factura.</div>`;
}

/** Comprobante de una devolución parcial: los importes se muestran en positivo («se devuelve»). */
function htmlDevolucion(v) {
  const fila = (a, b, cls = '') => `<div class="t-fila ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `${encabezadoNegocio()}<hr>
    <div class="t-c"><strong>DEVOLUCIÓN</strong></div>
    ${fila(`N.º ${String(v.numero).padStart(4, '0')}`, fechaHora(v.fecha))}
    <div>De la venta N.º ${String(v.numeroOriginal).padStart(4, '0')}</div>
    ${v.cliente ? `<div>Cliente: ${esc(v.cliente)}</div>` : ''}
    ${v.usuario ? `<div>Atendió: ${esc(v.usuario)}</div>` : ''}<hr>
    ${v.items.map((it) => `<div>${esc(it.nombre)}</div>${fila(`${n(-it.cantidad)} ${esc(it.unidad)} × ${$m(it.precio, v.moneda)}`, $m(-it.subtotal, v.moneda))}`).join('')}<hr>
    ${v.descuento ? fila('Subtotal', $m(-v.subtotal, v.moneda)) + fila(`Descuento de la venta ${n(v.descuentoPct)} %`, '−' + $m(-v.descuento, v.moneda)) : ''}
    ${fila('SE DEVUELVE', $m(-v.total, v.moneda), 't-total')}
    ${esUSD(v) ? '<div class="t-c t-chico">Importes en dólares estadounidenses (U$S)</div>' : ''}
    ${fila('Se devuelve con', esc(v.medio))}<hr>
    <div class="t-c t-chico">Comprobante interno. No válido como factura.</div>`;
}

function htmlCierre(dia) {
  const lista = ventasDelDia(dia);
  const todas = lista.filter((v) => !v.anulada);
  const validas = todas.filter((v) => !esUSD(v)), enUSD = todas.filter(esUSD);
  const porMedio = {};
  validas.forEach((v) => { porMedio[v.medio] = (porMedio[v.medio] || 0) + v.total; });
  const porMedioUSD = {};
  enUSD.forEach((v) => { porMedioUSD[v.medio] = (porMedioUSD[v.medio] || 0) + v.total; });
  const fila = (a, b, cls = '') => `<div class="t-fila ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `${encabezadoNegocio()}<hr>
    <div class="t-c"><strong>CIERRE DE CAJA</strong><div>${new Date(dia + 'T12:00:00').toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div><hr>
    ${fila('Ventas cobradas', todas.filter((v) => !esDevolucion(v)).length)}
    ${todas.some(esDevolucion) ? fila('Devoluciones', todas.filter(esDevolucion).length) : ''}
    ${fila('Ventas anuladas', lista.length - todas.length)}<hr>
    ${Object.entries(porMedio).map(([m, t]) => fila(esc(m), $u(t))).join('')}<hr>
    ${fila('TOTAL', $u(validas.reduce((s, v) => s + v.total, 0)), 't-total')}
    ${enUSD.length ? `<hr><div><strong>En dólares</strong></div>${Object.entries(porMedioUSD).map(([m, t]) => fila(esc(m), $usd(t))).join('')}${fila('TOTAL U$S', $usd(enUSD.reduce((s, v) => s + v.total, 0)), 't-total')}` : ''}
    <div class="t-c t-chico">Impreso el ${fechaHora(new Date().toISOString())}</div>`;
}

function imprimir(html) {
  $('#impresion').innerHTML = html;
  window.print();
}

/* ---------- Impresora de tickets ----------
 * Se elige una vez en Configuración y queda guardada en los datos (db.ajustesTicket): los tickets, devoluciones
 * y cierres de caja salen directo por ella, sin el cuadro de Windows. Sin elegir, se pregunta como antes. */
const impresoraTicket = () => (db && db.ajustesTicket && db.ajustesTicket.impresora) || '';
/** Imprime un ticket: directo en la impresora de tickets, o con el cuadro de Windows si no hay una elegida. */
async function imprimirTicket(html) {
  const imp = impresoraTicket();
  if (!imp || !escritorio() || !window.almacen.imprimirDirecto) { imprimir(html); return; }
  // Por si quedó puesto el estilo de una impresión de etiquetas o de un pedido
  $('#impresion').classList.remove('etiquetas', 'pedido');
  if ($('#estilo-etiquetas')) $('#estilo-etiquetas').textContent = '';
  $('#impresion').innerHTML = html;
  const err = await window.almacen.imprimirDirecto(imp);
  if (err) {
    // Si la de tickets no anda, igual se puede imprimir eligiendo otra
    if (await confirmar(`${err} ¿Elegir otra impresora para este ticket?`, 'Elegir impresora')) window.print();
  } else toast('Ticket enviado a la impresora.');
}
async function iniciarImpresoraTicket() {
  if (!escritorio() || !window.almacen.imprimirDirecto) return;
  $('#card-impresora-ticket').hidden = false;
  const sel = $('#tk-impresora');
  let lista = [];
  try { lista = await window.almacen.impresoras(); } catch { /* sin lista */ }
  const actual = impresoraTicket();
  sel.innerHTML = '<option value="">Preguntar cada vez (cuadro de Windows)</option>'
    + lista.map((p) => `<option value="${esc(p.nombre)}">${esc(p.nombreVisible)}${p.predeterminada ? ' (predeterminada de Windows)' : ''}</option>`).join('')
    + (actual && !lista.some((p) => p.nombre === actual) ? `<option value="${esc(actual)}">${esc(actual)} (no está conectada)</option>` : '');
  sel.value = actual;
  sel.addEventListener('change', () => {
    db.ajustesTicket = { ...(db.ajustesTicket || {}), impresora: sel.value };
    guardar();
    $('#tk-estado').textContent = sel.value ? 'Guardado: los tickets salen directo por esta impresora.' : 'Guardado: se va a preguntar en cada ticket.';
  });
  $('#tk-prueba').addEventListener('click', () => imprimirTicket(htmlTicketPrueba()));
}
function htmlTicketPrueba() {
  const n = db.negocio || {};
  return `<div class="t-c"><strong class="t-neg">${esc(n.nombre || 'Stock Ferretería')}</strong></div><hr>
    <div class="t-c">Ticket de prueba</div>
    <div class="t-fila"><span>Si se lee bien y no sale cortado,</span><span></span></div>
    <div class="t-fila"><span>la impresora está bien elegida.</span><span></span></div><hr>
    <div class="t-c t-chico">Impreso el ${fechaHora(new Date().toISOString())}</div>`;
}

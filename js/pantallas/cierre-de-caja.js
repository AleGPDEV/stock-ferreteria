/* Pantallas de apertura, movimientos de efectivo y cierre de caja (arqueo). */
'use strict';

/* ---------- Pantallas de apertura, movimientos y cierre de caja ---------- */

function htmlArqueo(caja) {
  const r = caja.resumen || resumenCaja(db, caja);
  const fila = (a, b2, cls = '') => `<div class="t-fila ${cls}"><span>${a}</span><span>${b2}</span></div>`;
  const dif = caja.diferencia;
  return `${encabezadoNegocio()}<hr>
    <div class="t-c"><strong>CIERRE DE CAJA N.º ${caja.numero}</strong></div>
    ${fila('Abierta', fechaHora(caja.abierta))}${caja.abiertaPor ? fila('Abrió', esc(caja.abiertaPor)) : ''}
    ${caja.cerrada ? fila('Cerrada', fechaHora(caja.cerrada)) : ''}${caja.cerradaPor ? fila('Cerró', esc(caja.cerradaPor)) : ''}<hr>
    ${fila('Efectivo inicial', $u(r.inicial))}
    ${fila('+ Ventas en efectivo', $u(r.ventasEfectivo))}
    ${r.ingresos ? fila('+ Ingresos', $u(r.ingresos)) : ''}
    ${r.retiros ? fila('− Retiros', $u(r.retiros)) : ''}
    ${fila('Debería haber', $u(r.esperado), 't-total')}
    ${caja.cerrada ? fila('Se contó', $u(caja.contado)) + fila(dif === 0 ? 'Diferencia' : dif > 0 ? 'Sobrante' : 'Faltante', $u(Math.abs(dif)), 't-total') : ''}<hr>
    ${fila('Ventas', r.ventas)}${r.devoluciones ? fila('Devoluciones', r.devoluciones) : ''}${r.anuladas ? fila('Anuladas', r.anuladas) : ''}
    ${Object.entries(r.porMedio).map(([m, t]) => fila(esc(m), $u(t))).join('')}
    ${fila('Total vendido', $u(r.total))}
    ${r.usd ? `<hr><div><strong>DÓLARES</strong></div>${fila('Dólares al empezar', $usd(r.usd.inicial))}${fila('+ Ventas en efectivo', $usd(r.usd.ventasEfectivo))}
      ${r.usd.ingresos ? fila('+ Ingresos', $usd(r.usd.ingresos)) : ''}${r.usd.retiros ? fila('− Retiros', $usd(r.usd.retiros)) : ''}
      ${fila('Debería haber', $usd(r.usd.esperado), 't-total')}
      ${caja.cerrada && caja.contadoUSD != null ? fila('Se contó', $usd(caja.contadoUSD)) + fila(caja.diferenciaUSD === 0 ? 'Diferencia' : caja.diferenciaUSD > 0 ? 'Sobrante' : 'Faltante', $usd(Math.abs(caja.diferenciaUSD)), 't-total') : ''}
      ${Object.entries(r.usd.porMedio).map(([m, t]) => fila(esc(m), $usd(t))).join('')}${fila('Total vendido en U$S', $usd(r.usd.total))}` : ''}
    ${caja.movs.length ? '<hr>' + caja.movs.map((m) => fila(`${m.tipo === 'retiro' ? 'Retiro' : 'Ingreso'}: ${esc(m.motivo)}`, (m.tipo === 'retiro' ? '−' : '+') + $m(m.monto, m.moneda))).join('') : ''}
    ${caja.nota ? `<hr><div>Nota: ${esc(caja.nota)}</div>` : ''}
    <div class="t-c t-chico">Impreso el ${fechaHora(new Date().toISOString())}</div>`;
}

function chipDiferencia(dif, moneda) {
  if (dif == null) return '';
  if (Math.abs(dif) < 0.005) return '<span class="chip ok">Justo</span>';
  return dif > 0 ? `<span class="chip warn">Sobran ${$m(dif, moneda)}</span>` : `<span class="chip danger">Faltan ${$m(-dif, moneda)}</span>`;
}

function renderCierreEnVivo() {
  const caja = cajaAbierta(db);
  if (!caja) return;
  const r = resumenCaja(db, caja);
  $('#cc-resumen').innerHTML = `
    <li><span>Efectivo inicial</span><span>${$u(r.inicial)}</span></li>
    <li><span>+ Ventas en efectivo</span><span>${$u(r.ventasEfectivo)}</span></li>
    ${r.ingresos ? `<li><span>+ Ingresos de efectivo</span><span>${$u(r.ingresos)}</span></li>` : ''}
    ${r.retiros ? `<li><span>− Retiros de efectivo</span><span>${$u(r.retiros)}</span></li>` : ''}
    <li class="cc-total"><span>Debería haber en efectivo</span><strong>${$u(r.esperado)}</strong></li>
    ${Object.entries(r.porMedio).filter(([m]) => m !== 'Efectivo').map(([m, t]) => `<li class="muted"><span>${esc(m)} (no es efectivo)</span><span>${$u(t)}</span></li>`).join('')}
    ${r.usd ? `<li class="cc-sep"><span><strong>Dólares</strong></span><span></span></li>
      <li><span>Dólares al empezar</span><span>${$usd(r.usd.inicial)}</span></li>
      <li><span>+ Ventas en efectivo (U$S)</span><span>${$usd(r.usd.ventasEfectivo)}</span></li>
      ${r.usd.ingresos ? `<li><span>+ Ingresos (U$S)</span><span>${$usd(r.usd.ingresos)}</span></li>` : ''}
      ${r.usd.retiros ? `<li><span>− Retiros (U$S)</span><span>${$usd(r.usd.retiros)}</span></li>` : ''}
      <li class="cc-total"><span>Debería haber en dólares</span><strong>${$usd(r.usd.esperado)}</strong></li>
      ${Object.entries(r.usd.porMedio).filter(([m]) => m !== 'Efectivo').map(([m, t]) => `<li class="muted"><span>${esc(m)} en U$S (no es efectivo)</span><span>${$usd(t)}</span></li>`).join('')}` : ''}
    <li class="muted"><span>Ventas cobradas</span><span>${r.ventas}${r.devoluciones ? ` · ${r.devoluciones} ${r.devoluciones === 1 ? 'devolución' : 'devoluciones'}` : ''}${r.anuladas ? ` · ${r.anuladas} anuladas` : ''}</span></li>`;
  const v = $('#cc-contado').value;
  $('#cc-diferencia').innerHTML = v === '' ? '' : chipDiferencia(red2(Number(v) - r.esperado));
  $('#cc-usd').hidden = !r.usd;
  const vu = $('#cc-contado-usd').value;
  $('#cc-diferencia-usd').innerHTML = !r.usd || vu === '' ? '' : chipDiferencia(red2(Number(vu) - r.usd.esperado), 'USD');
}

function mostrarResultadoCierre(caja) {
  $('#cr-titulo').textContent = `Caja N.º ${caja.numero} cerrada`;
  $('#cr-detalle').innerHTML = esAdmin()
    ? `<ul class="lista"><li><span>Debería haber</span><strong>${$u(caja.resumen.esperado)}</strong></li>
       <li><span>Se contó</span><strong>${$u(caja.contado)}</strong></li>
       <li><span>Resultado</span>${chipDiferencia(caja.diferencia)}</li>
       ${caja.resumen.usd ? `<li><span>Dólares: debería haber</span><strong>${$usd(caja.resumen.usd.esperado)}</strong></li>
       <li><span>Dólares: se contó</span><strong>${$usd(caja.contadoUSD)}</strong></li>
       <li><span>Resultado en dólares</span>${chipDiferencia(caja.diferenciaUSD, 'USD')}</li>` : ''}</ul>`
    : `<p>Se guardó el conteo: <strong>${$u(caja.contado)}</strong>${caja.resumen.usd ? ` y <strong>${$usd(caja.contadoUSD)}</strong>` : ''} en efectivo. El administrador revisa el cierre.</p>`;
  cajaParaImprimir = caja;
  $('#dlg-caja-resultado').showModal();
}

let cajaParaImprimir = null;

function renderCierresCaja() {
  const lista = [...(db.cajas || [])].reverse().slice(0, 60);
  $('#tabla-cajas').innerHTML = lista.length ? lista.map((c) => {
    const r = c.resumen || resumenCaja(db, c);
    return `<tr>
      <td class="mono">${String(c.numero).padStart(3, '0')}</td>
      <td>${fechaHora(c.abierta)}<div class="meta">${esc(c.abiertaPor || '')}</div></td>
      <td>${c.cerrada ? `${fechaHora(c.cerrada)}<div class="meta">${esc(c.cerradaPor || '')}</div>` : '<span class="chip ok">Abierta</span>'}</td>
      <td class="num">${r.ventas}</td>
      <td class="num">${$u(r.total)}${r.usd ? `<div class="meta">${$usd(r.usd.total)}</div>` : ''}</td>
      <td class="num">${$u(r.esperado)}${r.usd ? `<div class="meta">${$usd(r.usd.esperado)}</div>` : ''}</td>
      <td class="num">${c.cerrada ? $u(c.contado) : '—'}${c.cerrada && c.contadoUSD != null ? `<div class="meta">${$usd(c.contadoUSD)}</div>` : ''}</td>
      <td>${c.cerrada ? chipDiferencia(c.diferencia) : ''}${c.cerrada && c.diferenciaUSD != null ? `<div>${chipDiferencia(c.diferenciaUSD, 'USD')}</div>` : ''}</td>
      <td class="acc">${puedeImprimir() ? `<button class="btn sm" type="button" data-imprimir-caja="${c.id}">Imprimir</button>` : ''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" class="vacio">Todavía no se abrió ninguna caja.</td></tr>';
}

function iniciarAperturaCaja() {
  $('#form-abrir-caja').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = abrirCaja(db, $('#ac-monto').value, sesion ? sesion.nombre : '', undefined, { inicialUSD: $('#ac-usd-monto').value, cotizacion: $('#ac-cotiz').value });
    if (r.error) { $('#ac-err').textContent = r.error; return; }
    $('#ac-err').textContent = '';
    $('#ac-monto').value = '';
    $('#ac-usd-monto').value = '';
    guardar();
    render();
    toast(`Caja abierta con ${$u(r.caja.inicial)}${r.caja.inicialUSD ? ` y ${$usd(r.caja.inicialUSD)}` : ''}. Ya se puede vender.`);
    $('#caja-buscar').focus();
  });

  // Retiro o ingreso de efectivo
  $('#btn-caja-mov').addEventListener('click', () => {
    $('#cm-monto').value = '';
    $('#cm-motivo').value = '';
    $('#cm-err').textContent = '';
    $('#cm-moneda').value = 'UYU';
    // Si se trabaja con dólares, el retiro o ingreso puede ser en dólares
    const caja = cajaAbierta(db);
    $('#cm-moneda-campo').hidden = !(db.productos.some(esUSD) || (caja && resumenCaja(db, caja).usd));
    $('#dlg-caja-mov').showModal();
    $('#cm-monto').focus();
  });
  $('#form-caja-mov').addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = ($('input[name="cm-tipo"]:checked') || {}).value;
    const moneda = $('#cm-moneda').value === 'USD' ? 'USD' : 'UYU';
    const err = movimientoCaja(db, tipo, $('#cm-monto').value, $('#cm-motivo').value, sesion ? sesion.nombre : '', undefined, moneda);
    if (err) { $('#cm-err').textContent = err; return; }
    guardar();
    $('#dlg-caja-mov').close();
    render();
    toast(`${tipo === 'retiro' ? 'Retiro' : 'Ingreso'} de ${$m(Number($('#cm-monto').value), moneda)} anotado.`);
  });

  // Cierre
  $('#btn-cerrar-caja').addEventListener('click', () => {
    if (ticket.length) { toast('Hay productos en el ticket. Cobrá o borrá la venta antes de cerrar la caja.'); return; }
    $('#cc-contado').value = '';
    $('#cc-contado-usd').value = '';
    $('#cc-nota').value = '';
    $('#cc-err').textContent = '';
    renderCierreEnVivo();
    $('#dlg-cerrar-caja').showModal();
    $('#cc-contado').focus();
  });
  $('#cc-contado').addEventListener('input', renderCierreEnVivo);
  $('#cc-contado-usd').addEventListener('input', renderCierreEnVivo);
  $('#form-cerrar-caja').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = cerrarCaja(db, $('#cc-contado').value, sesion ? sesion.nombre : '', $('#cc-nota').value, undefined, $('#cc-contado-usd').value);
    if (r.error) { $('#cc-err').textContent = r.error; if (r.usd) $('#cc-contado-usd').focus(); return; }
    guardar();
    // Respaldo al cerrar la caja, así la copia del pendrive incluye las ventas del día
    if (escritorio() && window.almacen.respaldarAhora) window.almacen.respaldarAhora().catch(() => {});
    $('#dlg-cerrar-caja').close();
    render();
    mostrarResultadoCierre(r.caja);
  });
  $('#cr-imprimir').addEventListener('click', () => { if (cajaParaImprimir) imprimirTicket(htmlArqueo(cajaParaImprimir)); });
  $('#cr-listo').addEventListener('click', () => $('#dlg-caja-resultado').close());
  $('#tabla-cajas').addEventListener('click', (e) => {
    const bt = e.target.closest('[data-imprimir-caja]');
    const c = bt && (db.cajas || []).find((x) => x.id === bt.dataset.imprimirCaja);
    if (c) imprimirTicket(htmlArqueo(c));
  });
}

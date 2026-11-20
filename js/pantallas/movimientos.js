/* Pantalla Cargar mercadería (movimientos de stock) y el buscador de productos (combo). */
'use strict';

/* ---------- Movimientos ---------- */

function etiquetaTipo(m) {
  if (m.ventaId && m.tipo === 'salida') return 'Venta';
  if (m.ventaId && m.tipo === 'entrada') return 'Anulación';
  return { entrada: 'Llegó', salida: 'Sacado', ajuste: 'Corrección' }[m.tipo] || m.tipo;
}
function chipTipo(m) {
  const t = etiquetaTipo(m);
  const cls = { Venta: 'info', 'Llegó': 'ok', Sacado: 'neutro', 'Corrección': 'warn', Anulación: 'neutro' }[t] || 'neutro';
  return `<span class="chip ${cls}">${t}</span>`;
}

function tipoForm() { return ($('input[name="tipo"]:checked') || {}).value || 'entrada'; }

function actualizarFormMov() {
  const t = tipoForm();
  $$('.solo-entrada').forEach((el) => { el.hidden = t !== 'entrada' || (el.classList.contains('solo-admin') && !esAdmin()); });
  $('#mov-cant-label').textContent = { entrada: '¿Cuántos llegaron?', salida: '¿Cuántos sacás?', ajuste: '¿Cuántos contaste?' }[t];
  $('#mov-submit').textContent = { entrada: 'Sumar al stock', salida: 'Restar del stock', ajuste: 'Corregir el stock' }[t];
  $('#mov-submit').className = 'btn ' + { entrada: 'verde', salida: 'rojo', ajuste: 'primary' }[t];
  // Solo el aviso que evita un error: las ventas no se restan acá
  $('#mov-explica').textContent = t === 'salida' ? 'Las ventas no van acá: se hacen en Vender.' : '';
  $('#mov-explica').hidden = t !== 'salida';
  const p = producto($('#mov-prod').value);
  $('#mov-hint').textContent = p ? `Stock actual: ${n(p.stock)} ${p.unidad}` : '';
}

function renderMovimientos() {
  const elegido = producto($('#mov-prod').value);
  if (!elegido) $('#mov-prod').value = '';
  if (document.activeElement !== $('#mov-prod-buscar')) $('#mov-prod-buscar').value = elegido ? textoCombo(elegido) : '';
  $('#mov-prod-limpiar').hidden = !$('#mov-prod-buscar').value;
  const provSel = $('#mov-prov');
  const provAct = provSel.value;
  provSel.innerHTML = opcionesProv(provAct);
  actualizarFormMov();

  const lista = movimientosFiltrados();
  const mostrar = lista.slice(0, 400);
  $('#tabla-mov').innerHTML = mostrar.length
    ? mostrar.map((m) => `
      <tr>
        <td class="num">${fechaHora(m.fecha)}</td>
        <td>${chipTipo(m)}</td>
        <td><div class="nom">${esc(m.producto)}</div><div class="meta mono">${esc(m.codigo)}</div></td>
        <td class="num ${m.cantidad >= 0 ? 'mas' : 'menos'}">${m.cantidad >= 0 ? '+' : '−'}${n(Math.abs(m.cantidad))} <span class="u">${esc(m.unidad)}</span></td>
        <td class="num">${n(m.stockAntes)} → <strong>${n(m.stockDespues)}</strong></td>
        <td>${esc(m.nota)}${m.proveedorId ? `<div class="meta">${esc(nombreProv(m.proveedorId))}</div>` : ''}${m.usuario ? `<div class="meta">Por ${esc(m.usuario)}</div>` : ''}</td>
      </tr>`).join('') + (lista.length > mostrar.length ? `<tr><td colspan="6" class="vacio">Se muestran los últimos ${mostrar.length} de ${lista.length}. Exportá a Excel para verlos todos.</td></tr>` : '')
    : '<tr><td colspan="6" class="vacio">No hay movimientos en el período elegido.</td></tr>';
}

function movimientosFiltrados() {
  const desde = $('#mov-desde').value, hasta = $('#mov-hasta').value;
  const tipo = $('#mov-tipo').value;
  const q = normal($('#mov-buscar').value.trim());
  return db.movimientos.filter((m) => {
    const t = Date.parse(m.fecha);
    if (desde && t < inicioDia(desde)) return false;
    if (hasta && t > finDia(hasta)) return false;
    if (tipo === 'venta' && !(m.ventaId && m.tipo === 'salida')) return false;
    if (tipo && tipo !== 'venta' && (m.tipo !== tipo || (m.ventaId && m.tipo === 'salida'))) return false;
    if (q && !normal(`${m.producto} ${m.codigo} ${m.nota}`).includes(q)) return false;
    return true;
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/* Buscador de producto con lista que se filtra mientras se escribe */
let comboOps = [];
let comboActivo = -1;
const textoCombo = (p) => `${p.nombre} — ${p.codigo}`;

function abrirCombo(abrir) {
  $('#mov-prod-lista').hidden = !abrir;
  $('#mov-prod-buscar').setAttribute('aria-expanded', String(abrir));
}

function marcarCombo(i) {
  comboActivo = i;
  $$('#mov-prod-lista .combo-op').forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
  const li = $(`#combo-op-${i}`);
  if (li) { if (!li.matches(':hover')) li.scrollIntoView({ block: 'nearest' }); $('#mov-prod-buscar').setAttribute('aria-activedescendant', li.id); }
  else $('#mov-prod-buscar').removeAttribute('aria-activedescendant');
}

function filtrarCombo() {
  const texto = $('#mov-prod-buscar').value.trim();
  const elegido = producto($('#mov-prod').value);
  const q = elegido && texto === textoCombo(elegido) ? '' : normal(texto);
  const provs = new Map(db.proveedores.map((v) => [v.id, v.nombre]));
  const todos = db.productos
    .filter((p) => !q || normal(`${textoCodigos(p)} ${p.nombre} ${p.categoria} ${provs.get(p.proveedorId) || ''} ${p.ubicacion}`).includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  comboOps = todos.slice(0, 60);
  $('#mov-prod-lista').innerHTML = comboOps.length
    ? comboOps.map((p, i) => `<li class="combo-op" role="option" id="combo-op-${i}" data-id="${p.id}" aria-selected="false">
        <span>${esc(p.nombre)}</span><small><span class="mono">${esc(p.codigo)}</span> · stock ${n(p.stock)} ${esc(p.unidad)}</small></li>`).join('')
      + (todos.length > comboOps.length ? `<li class="combo-vacio">Hay ${todos.length - comboOps.length} más. Escribí más letras para encontrarlo.</li>` : '')
    : `<li class="combo-vacio">${db.productos.length ? `No hay ningún producto con «${esc(texto)}».` : 'Todavía no hay productos cargados.'}</li>`;
  abrirCombo(true);
  marcarCombo(q && comboOps.length ? 0 : -1);
}

function elegirCombo(id) {
  const p = producto(id);
  if (!p) return;
  $('#mov-prod').value = p.id;
  $('#mov-prod-buscar').value = textoCombo(p);
  $('#mov-prod-limpiar').hidden = false;
  abrirCombo(false);
  $('#mov-prod').dispatchEvent(new Event('change'));
  $('#mov-err').textContent = '';
  $('#mov-cant').focus();
}

function limpiarCombo() {
  $('#mov-prod').value = '';
  $('#mov-prod-buscar').value = '';
  $('#mov-prod-limpiar').hidden = true;
  $('#mov-prod').dispatchEvent(new Event('change'));
}

function iniciarCombo() {
  const caja = $('#mov-prod-buscar');
  caja.addEventListener('focus', () => { caja.select(); filtrarCombo(); });
  caja.addEventListener('input', () => {
    if ($('#mov-prod').value) { $('#mov-prod').value = ''; $('#mov-prod').dispatchEvent(new Event('change')); }
    $('#mov-prod-limpiar').hidden = !caja.value;
    filtrarCombo();
  });
  caja.addEventListener('keydown', (e) => {
    const abierta = !$('#mov-prod-lista').hidden;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!abierta) filtrarCombo(); marcarCombo(Math.min(comboActivo + 1, comboOps.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcarCombo(Math.max(comboActivo - 1, 0)); }
    else if (e.key === 'Escape') { abrirCombo(false); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const texto = caja.value.trim();
      const exacto = buscarPorCodigo(db, texto);
      if (exacto) elegirCombo(exacto.id);
      else if (comboActivo >= 0 && comboOps[comboActivo]) elegirCombo(comboOps[comboActivo].id);
      else if (comboOps.length === 1) elegirCombo(comboOps[0].id);
    }
  });
  caja.addEventListener('blur', () => setTimeout(() => {
    abrirCombo(false);
    const p = producto($('#mov-prod').value);
    if (p) caja.value = textoCombo(p);
  }, 150));
  // mousedown para que el clic no le saque el foco a la caja antes de elegir
  $('#mov-prod-lista').addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-id]');
    e.preventDefault();
    if (li) elegirCombo(li.dataset.id);
  });
  $('#mov-prod-lista').addEventListener('mousemove', (e) => {
    const li = e.target.closest('.combo-op');
    if (!li) return;
    const i = Number(li.id.replace('combo-op-', ''));
    if (i !== comboActivo) marcarCombo(i);
  });
  $('#mov-prod-limpiar').addEventListener('click', () => { limpiarCombo(); caja.focus(); });
}

function iniciarMovimientos() {
  iniciarCombo();
  $('#mov-desde').value = isoLocal(new Date(Date.now() - 30 * DIA));
  $('#mov-hasta').value = isoLocal();
  ['#mov-desde', '#mov-hasta', '#mov-tipo'].forEach((s) => $(s).addEventListener('input', renderMovimientos));
  alDejarDeEscribir($('#mov-buscar'), renderMovimientos);
  $$('input[name="tipo"]').forEach((r) => r.addEventListener('change', actualizarFormMov));
  $('#mov-prod').addEventListener('change', () => {
    const p = producto($('#mov-prod').value);
    if (p) { $('#mov-costo').value = p.costo; $('#mov-prov').value = p.proveedorId || ''; }
    actualizarFormMov();
  });
  $('#form-mov').addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = tipoForm();
    const p = producto($('#mov-prod').value);
    const err = registrar(db, {
      tipo, productoId: $('#mov-prod').value, cantidad: $('#mov-cant').value === '' ? NaN : $('#mov-cant').value,
      costoUnit: esAdmin() ? $('#mov-costo').value : '', proveedorId: tipo === 'entrada' ? $('#mov-prov').value : '', nota: $('#mov-nota').value.trim(),
    });
    if (err) { $('#mov-err').textContent = err; return; }
    $('#mov-err').textContent = '';
    $('#mov-cant').value = '';
    $('#mov-nota').value = '';
    guardar();
    render();
    toast(avisoStock(p) ? `Listo. Atención: ${avisoStock(p)}` : `Listo. Stock de ${p.nombre}: ${n(p.stock)} ${p.unidad}.`);
  });
}

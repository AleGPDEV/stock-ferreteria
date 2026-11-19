/* Pantalla Importar desde Excel: vista previa del plan, cambios de stock y filas dudosas.
 * La lógica está en logica/importar-planilla.js. */
'use strict';

/* ---------- Importar desde Excel ---------- */

let planImp = null;
const MAX_PLANILLA = 15 * 1048576; // planillas más grandes no son de productos y pueden trabar el programa

const camposImportar = () => {
  const c = {};
  $$('#imp-campos [data-campo]').forEach((x) => { c[x.dataset.campo] = x.checked; });
  return c;
};

/* Cambios de stock de la importación: se ven todos y cada uno se puede desmarcar (ese producto queda con el stock que tiene). */
function mostrarCambiosStock() {
  const caja = $('#imp-stock');
  if (!planImp || planImp.error || !camposImportar().stock) { caja.innerHTML = ''; return; }
  const cambios = cambiosStockImportacion(planImp);
  if (!cambios.length) { caja.innerHTML = '<p class="muted">La planilla no cambia el stock de ningún producto que ya existe.</p>'; return; }
  caja.innerHTML = `<p class="nota-edit" id="imp-stock-cuenta"></p>
    <div class="imp-stock-barra"><input type="search" id="imp-stock-buscar" placeholder="Buscar en la lista" aria-label="Buscar producto en la lista de stock">
      <button class="btn sm" type="button" data-stock-todos="1">Cambiar todos</button><button class="btn sm" type="button" data-stock-todos="0">No cambiar ninguno</button></div>
    <div class="table-wrap imp-stock-tabla"><table class="tabla"><thead><tr><th class="chk"><span class="visually-hidden">Cambiar</span></th><th>Producto</th><th class="num">Ahora</th><th class="num">Queda</th></tr></thead>
    <tbody>${cambios.map((c) => `<tr data-stock-fila="${c.i}" data-buscar="${esc(normal(`${c.nombre} ${c.codigo}`))}" class="${c.cambiar ? '' : 'no-cambia'}">
      <td class="chk"><input type="checkbox" data-stock-cambiar="${c.i}" ${c.cambiar ? 'checked' : ''} aria-label="Cambiar el stock de ${esc(c.nombre)}"></td>
      <td>${esc(c.nombre)}<div class="meta mono">${esc(c.codigo)}</div></td><td class="num">${n(c.antes)}</td>
      <td class="num"><strong class="queda">${n(c.despues)}</strong><span class="queda-igual">sigue en ${n(c.antes)}</span></td></tr>`).join('')}</tbody></table></div>`;
  cuentaCambiosStock();
}
function filtrarCambiosStock() {
  const q = normal($('#imp-stock-buscar').value.trim());
  $$('#imp-stock tr[data-stock-fila]').forEach((tr) => { tr.hidden = !!q && !tr.dataset.buscar.includes(q); });
}
function cuentaCambiosStock() {
  const cambios = cambiosStockImportacion(planImp);
  const si = cambios.filter((c) => c.cambiar).length;
  $('#imp-stock-cuenta').innerHTML = `Se va a cambiar el stock de <strong>${si} de ${plural(cambios.length, 'producto', 'productos')}</strong>.${si < cambios.length ? (cambios.length - si === 1 ? ' El desmarcado queda con el stock que tiene.' : ` Los ${cambios.length - si} desmarcados quedan con el stock que tienen.`) : ''} Desmarcá los que no quieras tocar, y revisá que la columna sea el stock real y no la cantidad por paquete.`;
}

/**
 * Filas que no se cargan a ciegas: un código que ya es de un producto que no se parece en nada (por ejemplo, el «1234»
 * de un esmalte contra el «1234» de un tornillo), o dos filas con el mismo código y descripciones distintas.
 */
function htmlFilasDudosas() {
  const filas = planImp.nuevos.map((x, i) => ({ x, i })).filter(({ x }) => x.datos.dudosaDe || x.datos.repetidaDe);
  if (!filas.length) return '';
  return `<div class="banner banner-aviso imp-dudosas" role="alert"><div>
    <p><strong>Revisá ${filas.length === 1 ? 'esta fila' : `estas ${filas.length} filas`}: el código coincide pero la descripción no.</strong> Para no mezclar productos distintos, se cargan como productos nuevos salvo que elijas otra cosa.</p>
    <ul class="imp-dudosas-l">${filas.map(({ x, i }) => {
      const otro = x.datos.dudosaDe ? db.productos.find((p) => p.id === x.datos.dudosaDe) : null;
      return `<li><div><strong>${esc(x.datos.nombre)}</strong>${x.datos.proveedor ? ` <span class="muted">(${esc(x.datos.proveedor)})</span>` : ''}<div class="meta">${otro
        ? `El código ya es de «${esc(otro.nombre)}»${otro.proveedorId ? ` (${esc(nombreProveedorDe(db, otro.proveedorId))})` : ''}`
        : `Otra fila de la planilla tiene el mismo código: «${esc(x.datos.repetidaDe)}»`}</div></div>
        <label class="f-inline"><span class="visually-hidden">Qué hacer con ${esc(x.datos.nombre)}</span><select data-dudosa="${i}">
          <option value="nuevo"${!x.accion || x.accion === 'nuevo' ? ' selected' : ''}>Cargar como producto nuevo</option>
          ${otro ? `<option value="mismo"${x.accion === 'mismo' ? ' selected' : ''}>Es «${esc(otro.nombre)}»</option>` : ''}
          <option value="saltear"${x.accion === 'saltear' ? ' selected' : ''}>No cargar esta fila</option>
        </select></label></li>`;
    }).join('')}</ul></div></div>`;
}

function mostrarPlan(nombreArchivo) {
  const r = $('#imp-resumen');
  $('#imp-ok').disabled = true;
  $('#imp-campos').hidden = true;
  if (!planImp || planImp.error) { $('#imp-err').textContent = (planImp && planImp.error) || ''; r.innerHTML = ''; return; }
  $('#imp-err').textContent = '';
  const total = planImp.nuevos.length + planImp.actualizados.length;
  if (!total) { $('#imp-err').textContent = planImp.sinProducto ? `Ningún código de la planilla está cargado (${planImp.sinProducto} filas). Para agregar productos nuevos hace falta la columna «Producto».` : 'La planilla no tiene productos para importar.'; r.innerHTML = ''; return; }
  const muestra = planImp.nuevos.concat(planImp.actualizados).slice(0, 4);
  r.innerHTML = `
    <p><strong>${esc(nombreArchivo)}</strong></p>
    <ul class="lista">
      <li><span>Productos nuevos que se agregan</span><strong>${planImp.nuevos.length}</strong></li>
      <li><span>Productos que ya existen y se actualizan</span><strong>${planImp.actualizados.length}</strong></li>
      ${planImp.sinProducto ? `<li><span>Códigos que no están cargados (se saltean)</span><strong>${planImp.sinProducto}</strong></li>` : ''}
      ${planImp.salteadas ? `<li><span>Filas que se saltean (vacías o repetidas)</span><strong>${planImp.salteadas}</strong></li>` : ''}
    </ul>
    <p class="muted">Columnas reconocidas: ${planImp.columnas.map(esc).join(', ')}.${planImp.soloActualiza ? ' Sin columna «Producto»: solo se actualizan productos que ya existen.' : ''}</p>
    <div class="table-wrap"><table class="tabla"><thead><tr><th>Código</th><th>Producto</th><th class="num">Stock</th><th class="num">Precio</th></tr></thead>
      <tbody>${muestra.map((m) => `<tr><td class="mono">${esc(m.codigo)}</td><td>${esc(m.datos.nombre || m.nombreActual || '')}</td><td class="num">${m.datos.stock == null ? '—' : n(m.datos.stock)}</td><td class="num">${m.datos.precio == null ? '—' : $u(m.datos.precio)}</td></tr>`).join('')}
      ${total > muestra.length ? `<tr><td colspan="4" class="muted">… y ${total - muestra.length} más</td></tr>` : ''}</tbody></table></div>
    ${planImp.facturasRepetidas.length ? `<div class="banner banner-error imp-repetida" role="alert"><div>${planImp.facturasRepetidas.map((f) => `<p><strong>Esta factura ya se cargó el ${new Date(f.fecha).toLocaleDateString('es-UY')}</strong> (Factura ${esc(f.factura)}).</p>`).join('')}
      <p>Su mercadería ya se sumó al stock, así que no se vuelve a sumar. Si de verdad llegó otra vez, marcá la casilla de abajo.</p></div></div>` : ''}
    ${planImp.otroProveedor.length ? `<div class="banner banner-aviso imp-otro-prov" role="alert"><div>
      <p><strong>${planImp.otroProveedor.length === 1 ? 'Un código ya lo usa' : `${planImp.otroProveedor.length} códigos ya los usan`} un producto de otro proveedor.</strong> ${planImp.otroProveedor.some((x) => x.nuevo) ? 'No se mezclan: se cargan como productos nuevos, con otro código propio.' : 'No se tocan: esos productos son de otro proveedor.'}</p>
      <ul>${planImp.otroProveedor.slice(0, 5).map((x) => `<li><span class="mono">${esc(x.codigo)}</span> ${esc(x.nombre)} (${esc(x.proveedor)}) ≠ ${esc(x.otro)}${x.otroProveedor ? ` (${esc(x.otroProveedor)})` : ''}</li>`).join('')}${planImp.otroProveedor.length > 5 ? `<li>… y ${planImp.otroProveedor.length - 5} más</li>` : ''}</ul></div></div>` : ''}
    ${htmlFilasDudosas()}
    ${planImp.enDeposito.length ? `<div class="banner banner-aviso imp-deposito-av" role="alert"><div>
      <p><strong>${planImp.enDeposito.length === 1 ? 'Un producto ya se recibió' : `${planImp.enDeposito.length} productos ya se recibieron`} en el Depósito en los últimos ${DIAS_RECIBIDO_DEPOSITO} días.</strong> Lo que llegó en esta factura no se vuelve a sumar, para no contarlo dos veces. El costo sí se actualiza.</p>
      <ul>${planImp.enDeposito.slice(0, 6).map((x) => `<li>${esc(x.nombre)}: en el Depósito se sumaron ${n(x.cantidad)} el ${new Date(x.fecha).toLocaleDateString('es-UY')}; la factura dice ${n(x.llego)}</li>`).join('')}${planImp.enDeposito.length > 6 ? `<li>… y ${planImp.enDeposito.length - 6} más</li>` : ''}</ul></div></div>` : ''}
    ${planImp.deConteo ? '<p class="nota-edit">Planilla del <strong>Cargador de productos</strong>: el stock de los productos que ya existen se cambia por lo que se contó. Revisalo abajo.</p>' : ''}
    ${db.ejemplo ? '<p class="nota-edit">Estás con los datos de ejemplo: lo importado se va a mezclar con ellos. Si no querés eso, cancelá y tocá primero «Empezar de cero».</p>' : ''}`;
  $$('#imp-campos [data-campo]').forEach((x) => { x.checked = !!CAMPOS_IMPORTAR[x.dataset.campo]; });
  // Planilla del Lector de facturas: el precio de venta de los que ya existen no se toca
  if (planImp.deFactura) $('#imp-campos [data-campo=precio]').checked = false;
  // Planilla del Cargador: el conteo se aplica sin tener que marcar nada
  if (planImp.deConteo) $('#imp-campos [data-campo=stock]').checked = true;
  $('#imp-entrada').hidden = !planImp.conEntrada;
  $('#imp-repetida').hidden = !planImp.facturasRepetidas.length;
  $('#imp-deposito').hidden = !planImp.enDeposito.length;
  // Qué hacer con cada fila dudosa (se guarda en el plan)
  $$('#imp-resumen [data-dudosa]').forEach((sel) => sel.addEventListener('change', () => { planImp.nuevos[Number(sel.dataset.dudosa)].accion = sel.value; mostrarCambiosStock(); }));
  $$('#imp-campos .solo-existentes').forEach((x) => { x.hidden = !planImp.actualizados.length; });
  if (planImp.actualizados.length || planImp.conEntrada) {
    $('#imp-campos').hidden = false;
    mostrarCambiosStock();
  }
  $('#imp-ok').disabled = false;
}

function iniciarImportacion() {
  $('#btn-importar').addEventListener('click', () => {
    planImp = null;
    $('#imp-resumen').innerHTML = '';
    $('#imp-err').textContent = '';
    $('#imp-campos').hidden = true;
    $('#imp-ok').disabled = true;
    $('#dlg-import').showModal();
  });
  $('#imp-modelo').addEventListener('click', () => descargarExcel([
    { 'Código': '7790001000101', 'Producto': 'Tornillo autoperforante 8 x 1" (caja x100)', 'Categoría': 'Tornillería', 'Unidad': 'caja', 'Proveedor': 'Distribuidora Ejemplo', 'Ubicación': 'A-01', 'Stock': 30, 'Stock mínimo': 10, 'Costo': 180, 'Precio': 290 },
    { 'Código': '', 'Producto': 'Cable unipolar 2,5 mm²', 'Categoría': 'Electricidad', 'Unidad': 'm', 'Proveedor': '', 'Ubicación': 'E-02', 'Stock': 300, 'Stock mínimo': 100, 'Costo': 28, 'Precio': 48 },
  ], 'Productos', 'planilla_modelo_productos'));
  $('#imp-archivo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_PLANILLA) {
      planImp = { error: `La planilla pesa ${n(Math.round(file.size / 1048576))} MB. El máximo es ${MAX_PLANILLA / 1048576} MB: dejá solo la hoja con los productos.` };
      mostrarPlan(file.name);
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      try {
        // raw: los números de un .csv llegan como texto y los lee parseNum, que entiende "1.290,50" (formato uruguayo)
        // y conserva los ceros de los códigos ("0012345"). En un .xlsx no cambia nada.
        // Para leer, la versión al día de SheetJS (la de los reportes con formato es más vieja)
        const LEER = window.XLSX_LEER || XLSX;
        const libro = LEER.read(new Uint8Array(lector.result), { type: 'array', codepage: 65001, raw: true });
        const filas = LEER.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '' });
        planImp = planImportacion(db, filas);
      } catch (err) {
        planImp = { error: 'No pude leer el archivo. Tiene que ser una planilla de Excel (.xlsx) o un archivo .csv.' };
      }
      mostrarPlan(file.name);
    };
    lector.readAsArrayBuffer(file);
  });
  $$('#imp-campos [data-campo]').forEach((x) => x.addEventListener('change', mostrarCambiosStock));
  // Stock producto por producto
  $('#imp-stock').addEventListener('change', (e) => {
    const chk = e.target.closest('[data-stock-cambiar]');
    if (!chk || !planImp) return;
    planImp.actualizados[Number(chk.dataset.stockCambiar)].sinStock = !chk.checked;
    chk.closest('tr').classList.toggle('no-cambia', !chk.checked);
    cuentaCambiosStock();
  });
  $('#imp-stock').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stock-todos]');
    if (!b || !planImp) return;
    const si = b.dataset.stockTodos === '1';
    // Solo los que se ven (si se buscó algo, se marcan o desmarcan esos)
    $$('#imp-stock tr[data-stock-fila]').forEach((tr) => { if (tr.hidden) return; planImp.actualizados[Number(tr.dataset.stockFila)].sinStock = !si; });
    const q = $('#imp-stock-buscar').value;
    mostrarCambiosStock();
    $('#imp-stock-buscar').value = q; filtrarCambiosStock();
  });
  $('#imp-stock').addEventListener('input', (e) => { if (e.target.id === 'imp-stock-buscar') filtrarCambiosStock(); });
  $$('[data-herramienta]').forEach((b) => b.addEventListener('click', () => { if (escritorio() && window.almacen.abrirHerramienta) window.almacen.abrirHerramienta(b.dataset.herramienta); }));
  $('#imp-ok').addEventListener('click', () => {
    if (!planImp || planImp.error) return;
    const r = aplicarImportacion(db, planImp, camposImportar());
    planImp = null;
    guardar();
    $('#dlg-import').close();
    render();
    toast(`Importación lista: ${r.nuevos} productos nuevos y ${r.actualizados} actualizados${r.llegadas ? `; mercadería sumada a ${r.llegadas}` : ''}${r.estantes ? `; ${plural(r.estantes, 'estante nuevo', 'estantes nuevos')} en Depósito` : ''}.`);
  });
}

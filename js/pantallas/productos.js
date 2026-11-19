/* Pantalla Productos: lista, ficha para editar, códigos de proveedor y movimiento rápido desde una fila. */
'use strict';

/* ---------- Productos ---------- */

function renderProductos() {
  const cats = [...new Set(db.productos.map((p) => p.categoria).filter(Boolean))].sort();
  const selCat = $('#prod-cat');
  const actual = selCat.value;
  selCat.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option${c === actual ? ' selected' : ''}>${esc(c)}</option>`).join('');
  $('#lista-cat').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  // Estantes: los mismos que en Depósito, con su categoría y cuántos productos tiene cada uno
  const selEst = $('#prod-estante');
  const estElegido = selEst.value;
  const sinEstante = db.productos.filter((p) => enEstante(p, SIN_ESTANTE)).length;
  selEst.innerHTML = '<option value="">Todos los estantes</option>'
    + `<option value="${SIN_ESTANTE}">Sin estante (${sinEstante})</option>`
    + ubicacionesDe(db).map((u) => `<option value="${esc(u.clave)}">${esc(u.ubicacion)}${u.categoria ? ` · ${esc(u.categoria)}` : ''} (${u.productos.length})</option>`).join('');
  selEst.value = estElegido;
  if (selEst.value !== estElegido) selEst.value = ''; // el estante ya no existe: se muestran todos

  const q = normal($('#prod-buscar').value.trim());
  const cat = selCat.value;
  const est = $('#prod-estado').value;
  const estante = selEst.value;
  const lista = db.productos
    .filter((p) => !q || normal(`${textoCodigos(p)} ${p.nombre} ${p.ubicacion} ${nombreProv(p.proveedorId)}`).includes(q))
    .filter((p) => !cat || p.categoria === cat)
    .filter((p) => enEstante(p, estante))
    .filter((p) => !est || (est === 'reponer' ? estado(p) !== 'ok' : est === 'sincosto' ? !(p.costo > 0) : est === 'sinprecio' ? !(p.precio > 0) : est === 'sinfoto' ? !tieneFoto(p) : est === 'bajocosto' ? precioBajoCosto(p) : est === 'revisar' ? !!p.revisar : estado(p) === est))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  $('#prod-sub').textContent = `${db.productos.length} productos cargados${lista.length !== db.productos.length ? ` · mostrando ${lista.length}` : ''}.`;
  const visibles = lista.slice(0, 300);
  $('#tabla-prod').innerHTML = lista.length
    ? visibles.map((p) => `
      <tr>
        <td><div class="con-foto">${miniatura(p)}<div><div class="nom">${esc(p.nombre)}${p.revisar && esAdmin() ? ` <span class="chip info" title="Lo creó ${esc(p.creadoPor || 'un empleado')}${p.creadoEl ? ` el ${fechaHora(p.creadoEl)}` : ''}. Al editarlo queda revisado.">Nuevo · revisar</span>` : ''}</div><div class="meta"><span class="mono">${esc(p.codigo)}${(p.barras || []).length ? ' · ' + (p.barras || []).map(esc).join(' · ') : ''}</span> · ${[p.categoria || 'Sin categoría', p.ubicacion, nombreProv(p.proveedorId)].filter(Boolean).map(esc).join(' · ')}</div></div></div></td>
        <td class="num"><strong>${n(p.stock)}</strong> <span class="u">${esc(p.unidad)}</span></td>
        <td class="num">${n(p.minimo)}</td>
        <td>${chipEstado(p)}</td>
        <td class="num solo-admin">${$m(p.costo, p.moneda)}</td>
        <td class="num">${$m(p.precio, p.moneda)}${precioBajoCosto(p) && esAdmin() ? `<div><span class="chip danger" title="El precio de venta no supera el costo (${$m(p.costo, p.moneda)}).">${p.precio < p.costo ? 'Bajo el costo' : 'Igual al costo'}</span></div>` : ''}</td>
        <td class="acc"><div class="acc-botones">
          <button class="btn sm verde-suave" type="button" data-accion="entrada" data-id="${p.id}" title="Sumar stock a ${esc(p.nombre)}" aria-label="Sumar stock a ${esc(p.nombre)}">+ Sumar</button>
          <button class="btn sm" type="button" data-accion="salida" data-id="${p.id}" title="Restar stock de ${esc(p.nombre)}" aria-label="Restar stock de ${esc(p.nombre)}">− Restar</button>
          <button class="btn sm ghost" type="button" data-accion="editar" data-id="${p.id}" aria-label="Editar ${esc(p.nombre)}">Editar</button>
        </div></td>
      </tr>`).join('') + (lista.length > visibles.length ? `<tr><td colspan="7" class="vacio">Se muestran ${visibles.length} de ${lista.length} productos. Usá el buscador para encontrar el resto.</td></tr>` : '')
    : `<tr><td colspan="7" class="vacio">${db.productos.length ? 'Ningún producto coincide con los filtros.' : 'Todavía no cargaste productos. Usá «Nuevo producto» para agregar el primero.'}</td></tr>`;
}

let editandoProd = null;

/* Otros códigos con que se reconoce el producto (p.barras): una línea chica debajo de «Código».
 * Se editan acá (agregarCodigoExtra / quitarCodigoExtra) y se guardan con «Guardar». */
let barrasEdit = [];
function renderBarras() {
  $('#p-barras-l').hidden = !barrasEdit.length;
  $('#p-barras-l').innerHTML = barrasEdit.length
    ? 'También se reconoce por: ' + barrasEdit.map((c) => `<span class="mono">${esc(c)}</span> <button type="button" class="btn sm ghost" data-quitar-barras="${esc(c)}" aria-label="Quitar el código ${esc(c)}">✕</button>`).join(' ')
    : '';
}
function mostrarNuevoCodigo(abrir) {
  $('#p-barras-nuevo').hidden = !abrir;
  $('#p-barras-abrir').hidden = abrir;
  $('#p-barras').value = '';
  $('#p-barras-err').textContent = '';
  if (abrir) $('#p-barras').focus();
}
function agregarCodigoFicha() {
  const r = agregarCodigoExtra(db, barrasEdit, $('#p-barras').value, $('#p-codigo').value, editandoProd);
  if (r.error) { $('#p-barras-err').textContent = r.error; $('#p-barras').select(); return; }
  barrasEdit = r.lista;
  renderBarras();
  mostrarNuevoCodigo(false);
  $('#p-barras-abrir').focus();
}

/* Códigos de proveedor en la ficha: se editan acá y se guardan con «Guardar» */
let codprovEdit = [];
function renderCodProv() {
  $('#p-codprov-l').innerHTML = codprovEdit.length
    ? codprovEdit.map((x, i) => `<li><span class="mono">${esc(x.codigo)}</span> <span>${esc(nombreProveedorDe(db, x.proveedorId) || 'proveedor borrado')}</span>${x.desc ? ` <span class="muted">«${esc(x.desc)}»</span>` : ''}
      <button type="button" class="btn sm ghost" data-quitar-codprov="${i}" aria-label="Quitar el código ${esc(x.codigo)}">Quitar</button></li>`).join('')
    : '<li class="muted">Ninguno.</li>';
  $('#p-codprov-prov').innerHTML = '<option value="">Proveedor…</option>' + db.proveedores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((v) => `<option value="${v.id}">${esc(v.nombre)}</option>`).join('');
}

function abrirProducto(id) {
  editandoProd = id || null;
  const p = id ? producto(id) : { codigo: '', nombre: '', categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: '', costo: '', precio: '', minimo: '' };
  $('#prod-titulo').textContent = id ? 'Editar producto' : 'Nuevo producto';
  if (fotoPendiente && fotoPendiente.url) URL.revokeObjectURL(fotoPendiente.url);
  fotoPendiente = null;
  $('#p-foto-err').textContent = '';
  mostrarFotoForm(fotoUrl(p));
  $('#p-codigo').value = p.codigo;
  barrasEdit = (p.barras || []).slice();
  renderBarras();
  mostrarNuevoCodigo(false);
  codprovEdit = codigosProvDe(p).map((x) => ({ ...x }));
  renderCodProv();
  $('#p-unir').hidden = !id || !esAdmin();
  $('#p-unir').open = false;
  $('#p-unir-buscar').value = '';
  $('#p-unir-res').innerHTML = '';
  $('#p-nombre').value = p.nombre;
  $('#p-categoria').value = p.categoria;
  $('#p-unidad').value = p.unidad;
  $('#p-proveedor').innerHTML = opcionesProv(p.proveedorId);
  $('#p-ubicacion').value = p.ubicacion;
  $('#p-costo').value = p.costo;
  $('#p-precio').value = p.precio;
  $('#p-moneda').value = esUSD(p) ? 'USD' : 'UYU';
  // Solo el administrador cambia el precio de un producto que ya existe (queda anotado en el historial)
  const bloqueaPrecio = !!id && !esAdmin();
  $('#p-precio').disabled = bloqueaPrecio;
  $('#p-moneda').disabled = bloqueaPrecio;
  etiquetasMoneda();
  $('#p-precio-nota').hidden = !bloqueaPrecio;
  $('#p-minimo').value = p.minimo;
  $('#p-stock').value = '';
  $('#p-stock-wrap').hidden = !!id;
  $('#p-stock-nota').hidden = !id;
  $('#prod-eliminar').hidden = !id;
  $('#prod-err').textContent = '';
  actualizarMargen();
  $('#dlg-prod').showModal();
  $('#p-codigo').focus();
}

/** Los rótulos de costo y precio dicen la moneda elegida. */
function etiquetasMoneda() {
  const usd = $('#p-moneda').value === 'USD';
  $('#p-costo-lbl').textContent = usd ? 'Costo (U$S)' : 'Costo';
  $('#p-precio-lbl').textContent = usd ? 'Precio de venta (U$S)' : 'Precio de venta';
}
function actualizarMargen() {
  const c = Number($('#p-costo').value), pr = Number($('#p-precio').value);
  $('#p-margen').textContent = c > 0 && pr > 0 ? `Margen: ${n(Math.round(((pr - c) / c) * 1000) / 10)} % sobre el costo` : '';
}

function iniciarProductos() {
  $('#btn-nuevo-prod').addEventListener('click', () => abrirProducto());
  ['#prod-buscar', '#prod-cat', '#prod-estante', '#prod-estado'].forEach((s) => $(s).addEventListener('input', renderProductos));
  ['#p-costo', '#p-precio'].forEach((s) => $(s).addEventListener('input', actualizarMargen));
  $('#p-moneda').addEventListener('change', etiquetasMoneda);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const { accion, id } = b.dataset;
    if (accion === 'editar') abrirProducto(id);
    else abrirMovRapido(accion, id);
  });

  $('#p-foto-archivo').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; elegirFotoForm(f); });
  $('#p-foto-quitar').addEventListener('click', () => {
    if (fotoPendiente && fotoPendiente.url) URL.revokeObjectURL(fotoPendiente.url);
    fotoPendiente = 'quitar';
    $('#p-foto-err').textContent = '';
    mostrarFotoForm('');
  });
  const zona = $('#p-foto-zona');
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastrando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastrando'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('arrastrando');
    const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|hei[cf])$/i.test(x.name));
    if (f) elegirFotoForm(f); else $('#p-foto-err').textContent = 'Arrastrá un archivo de foto (JPG o PNG).';
  });
  // Tocar una foto la muestra grande
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-ver-foto]');
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    verFoto(f.dataset.verFoto);
  }, true);
  // Soltar un archivo fuera del recuadro de la foto no tiene que abrirlo en la ventana del programa
  ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (!e.target.closest || !e.target.closest('#p-foto-zona')) e.preventDefault(); }));
  // Si falta el archivo de una foto, no se muestra el ícono de imagen rota
  document.addEventListener('error', (e) => { if (e.target.classList && e.target.classList.contains('foto')) e.target.hidden = true; }, true);

  // Otros códigos del producto: «+ Agregar otro código» abre el campo; el lector termina con Enter, que agrega (no guarda la ficha)
  $('#p-barras-abrir').addEventListener('click', () => mostrarNuevoCodigo(true));
  $('#p-barras-agregar').addEventListener('click', agregarCodigoFicha);
  $('#p-barras').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); agregarCodigoFicha(); }
    else if (e.key === 'Escape') { e.preventDefault(); mostrarNuevoCodigo(false); $('#p-barras-abrir').focus(); } // cierra el campo, no la ventana
  });
  $('#p-barras').addEventListener('input', () => { $('#p-barras-err').textContent = ''; });
  $('#p-barras-l').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar-barras]');
    if (!b) return;
    barrasEdit = quitarCodigoExtra(barrasEdit, b.dataset.quitarBarras);
    renderBarras();
    $(barrasEdit.length ? '#p-barras-l button' : '#p-barras-abrir').focus();
  });

  let guardandoProd = false;
  $('#form-prod').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardandoProd) return;
    const err = (t) => { $('#prod-err').textContent = t; };
    const datos = {
      codigo: $('#p-codigo').value.trim().toUpperCase(),
      nombre: $('#p-nombre').value.trim(),
      categoria: $('#p-categoria').value.trim(),
      unidad: $('#p-unidad').value,
      proveedorId: $('#p-proveedor').value,
      ubicacion: $('#p-ubicacion').value.trim(),
      costo: Number($('#p-costo').value) || 0,
      precio: Number($('#p-precio').value) || 0,
      minimo: Number($('#p-minimo').value) || 0,
      moneda: $('#p-moneda').value === 'USD' ? 'USD' : 'UYU',
    };
    if (!datos.codigo) return err('Escribí un código para el producto.');
    if (!datos.nombre) return err('Escribí el nombre del producto.');
    const actual = editandoProd ? producto(editandoProd) : null;
    if (actual && !esAdmin()) { datos.precio = actual.precio; datos.costo = actual.costo; datos.moneda = esUSD(actual) ? 'USD' : 'UYU'; }
    if (!actual && !esAdmin()) datos.costo = 0;
    if (!(datos.precio > 0)) return err('Escribí el precio de venta (mayor a 0).');
    if (datos.costo < 0 || datos.minimo < 0) return err('El costo y el stock mínimo no pueden ser negativos.');
    // Un código escrito en «Agregar otro código» sin tocar «Agregar» también se guarda
    if (!$('#p-barras-nuevo').hidden && $('#p-barras').value.trim()) {
      const r = agregarCodigoExtra(db, barrasEdit, $('#p-barras').value, datos.codigo, editandoProd);
      if (r.error) { $('#p-barras-err').textContent = r.error; $('#p-barras').focus(); return err(r.error); }
      barrasEdit = r.lista;
      renderBarras();
      mostrarNuevoCodigo(false);
    }
    const usado = codigoUsado(db, datos.codigo, editandoProd);
    if (usado) return err(`El código ${datos.codigo} ya lo usa «${usado.nombre}».`);
    // Si el «Código» pasó a ser uno de los otros códigos, ya no hace falta en la lista
    datos.barras = [...new Set(barrasEdit.map(normCodigo).filter(Boolean))].filter((b) => b !== datos.codigo);
    for (const b of datos.barras) {
      const otro = codigoUsado(db, b, editandoProd);
      if (otro) return err(`El código ${b} ya es de «${otro.nombre}».`);
    }
    const cambioPrecio = !actual || actual.precio !== datos.precio || actual.costo !== datos.costo || (esUSD(actual) ? 'USD' : 'UYU') !== datos.moneda;
    if (esAdmin() && cambioPrecio && precioBajoCosto(datos)
      && !(await confirmar(`El precio de venta (${$m(datos.precio, datos.moneda)}) ${datos.precio < datos.costo ? 'es menor que' : 'es igual a'} el costo (${$m(datos.costo, datos.moneda)}): ${datos.precio < datos.costo ? 'se vende perdiendo plata' : 'no deja ganancia'}. ¿Guardar igual?`, 'Guardar igual', false, 'Corregir el precio'))) {
      $('#p-precio').focus();
      return;
    }
    const nuevoId = actual ? actual.id : uid();
    if (fotoPendiente) {
      const conFoto = { id: nuevoId };
      guardandoProd = true;
      let ef;
      try { ef = await aplicarFotoPendiente(conFoto); } finally { guardandoProd = false; }
      if (ef) return err(ef);
      if (actual) { delete actual.foto; delete actual.fotoData; }
      if (conFoto.foto) datos.foto = conFoto.foto;
      if (conFoto.fotoData) datos.fotoData = conFoto.fotoData;
    }
    datos.codigosProv = codprovEdit.map((x) => ({ ...x }));
    // La moneda se guarda solo si es dólares (sin el campo, el producto es en pesos)
    const moneda = datos.moneda;
    delete datos.moneda;
    if (actual) {
      anotarPrecio(db, actual, datos.precio, 'Editar producto', moneda);
      Object.assign(actual, datos);
      if (moneda === 'USD') actual.moneda = 'USD'; else delete actual.moneda;
      if (esAdmin()) delete actual.revisar; // un administrador lo revisó
      toast('Producto guardado.');
    } else {
      const p = { id: nuevoId, ...datos, ...(moneda === 'USD' ? { moneda } : {}), stock: 0 };
      db.productos.push(p);
      marcarProductoNuevo(db, p, sesion ? sesion.nombre : '', sesion ? sesion.rol : '');
      const ini = Number($('#p-stock').value);
      if (ini > 0) registrar(db, { tipo: 'entrada', productoId: p.id, cantidad: ini, costoUnit: datos.costo, proveedorId: datos.proveedorId, nota: 'Stock inicial', origen: 'inicial' });
      toast(`Producto agregado: ${p.nombre}.`);
    }
    guardar();
    $('#dlg-prod').close();
    render();
  });

  // Códigos de proveedor: agregar y quitar
  $('#p-codprov-l').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quitar-codprov]');
    if (!b) return;
    codprovEdit.splice(Number(b.dataset.quitarCodprov), 1);
    renderCodProv();
  });
  $('#p-codprov-agregar').addEventListener('click', () => {
    const prov = $('#p-codprov-prov').value, cod = normCodigo($('#p-codprov-cod').value);
    $('#p-codprov-err').textContent = !prov ? 'Elegí el proveedor.' : !cod ? 'Escribí el código que usa ese proveedor.' : '';
    if (!prov || !cod) return;
    const otro = db.productos.find((p) => p.id !== editandoProd && codigosProvDe(p).some((x) => x.proveedorId === prov && x.codigo === cod));
    if (otro) { $('#p-codprov-err').textContent = `Ese código de ${nombreProveedorDe(db, prov)} ya es de «${otro.nombre}». Si es el mismo producto, unilos con «Unir con otro producto».`; return; }
    codprovEdit = codprovEdit.filter((x) => x.proveedorId !== prov).concat([{ proveedorId: prov, codigo: cod }]);
    $('#p-codprov-cod').value = '';
    renderCodProv();
  });
  $('#p-codprov-cod').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#p-codprov-agregar').click(); } });
  // Unir con otro producto (el mismo artículo cargado dos veces)
  $('#p-unir-buscar').addEventListener('input', () => {
    const q = normal($('#p-unir-buscar').value);
    const res = q.length < 2 ? [] : db.productos.filter((p) => p.id !== editandoProd && (normal(p.nombre).includes(q) || normal(textoCodigos(p)).includes(q))).slice(0, 8);
    $('#p-unir-res').innerHTML = res.map((p) => `<li><button type="button" class="link-btn" data-unir="${p.id}">${esc(p.nombre)}</button> <span class="mono">${esc(p.codigo)}</span> <span class="muted">· stock ${n(p.stock)}${p.proveedorId ? ` · ${esc(nombreProveedorDe(db, p.proveedorId))}` : ''}</span></li>`).join('')
      || (q.length >= 2 ? '<li class="muted">No encontré ningún producto con eso.</li>' : '');
  });
  $('#p-unir-res').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-unir]');
    if (!b) return;
    const a = producto(editandoProd), o = producto(b.dataset.unir);
    if (!(await confirmar(`¿Unir «${o.nombre}» con «${a.nombre}»? Queda un solo producto, «${a.nombre}», con el stock de los dos (${n(a.stock)} + ${n(o.stock)} = ${n(red(a.stock + o.stock))}), los códigos de los dos y todo su historial de ventas y movimientos. «${o.nombre}» deja de existir. No se puede deshacer.`, 'Unir los dos', true))) return;
    const r = unirProductos(db, a.id, o.id);
    if (r.error) { toast(r.error); return; }
    guardar({ completo: true });
    $('#dlg-prod').close();
    render();
    toast(`Listo: «${o.nombre}» quedó unido a «${a.nombre}».`);
  });
  $('#prod-eliminar').addEventListener('click', async () => {
    const p = producto(editandoProd);
    if (!(await confirmar(`¿Eliminar ${p.nombre}? Su historial de movimientos y ventas se conserva.`, 'Eliminar', true))) return;
    db.productos = db.productos.filter((x) => x.id !== p.id);
    guardar();
    $('#dlg-prod').close();
    render();
    toast('Producto eliminado.');
  });
}

/* Movimiento rápido desde una fila */
let movRapido = null;
function abrirMovRapido(tipo, id) {
  const p = producto(id);
  if (!p) return;
  movRapido = { tipo, id };
  $('#qm-titulo').textContent = tipo === 'entrada' ? 'Llegó mercadería' : 'Sacar del stock';
  $('#qm-sub').textContent = `${p.nombre} · stock actual ${n(p.stock)} ${p.unidad}`;
  $('#qm-cant').value = '';
  // Si está bajo el mínimo, se sugiere cuánto pedir (sin escribirlo solo en el campo)
  const sug = tipo === 'entrada' && p.minimo > 0 && p.stock <= p.minimo ? sugerido(p) : 0;
  $('#qm-sug').hidden = !sug;
  $('#qm-sug').innerHTML = sug ? `Está bajo el mínimo (${n(p.minimo)}). Sugerencia: sumar ${n(sug)}, así queda el doble del mínimo. <button type="button" class="link-btn" id="qm-sug-usar">Usar ${n(sug)}</button>` : '';
  $('#qm-costo').value = p.costo;
  $('#qm-costo-wrap').hidden = tipo !== 'entrada' || !esAdmin();
  $('#qm-nota').value = '';
  $('#qm-nota').placeholder = tipo === 'entrada' ? 'Ej.: Factura A-1234' : 'Ej.: Rotura, uso interno';
  $('#qm-ok').textContent = tipo === 'entrada' ? 'Sumar al stock' : 'Restar del stock';
  $('#qm-ok').className = 'btn ' + (tipo === 'entrada' ? 'verde' : 'rojo');
  $('#qm-err').textContent = '';
  $('#dlg-mov').showModal();
  $('#qm-cant').focus();
}

function iniciarMovRapido() {
  $('#qm-sug').addEventListener('click', (e) => {
    if (!e.target.closest('#qm-sug-usar')) return;
    e.preventDefault();
    $('#qm-cant').value = sugerido(producto(movRapido.id));
    $('#qm-cant').focus();
  });
  $('#form-qm').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = producto(movRapido.id);
    const err = registrar(db, {
      tipo: movRapido.tipo, productoId: p.id, cantidad: $('#qm-cant').value,
      costoUnit: esAdmin() ? $('#qm-costo').value : '', proveedorId: movRapido.tipo === 'entrada' ? p.proveedorId : '', nota: $('#qm-nota').value.trim(),
    });
    if (err) { $('#qm-err').textContent = err; return; }
    guardar();
    $('#dlg-mov').close();
    render();
    toast(avisoStock(p) || `${movRapido.tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada. Stock de ${p.nombre}: ${n(p.stock)} ${p.unidad}.`);
  });
}

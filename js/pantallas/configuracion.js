/* Pantalla Configuración: datos del negocio, actualizar precios, usuarios y clave de recuperación. */
'use strict';

function renderAjustes() {
  renderUsuarios();
  renderRespaldoExtra();
  if (!$('#form-negocio').contains(document.activeElement)) {
    ['nombre', 'direccion', 'telefono', 'rut', 'pie'].forEach((k) => { $('#n-' + k).value = (db.negocio || {})[k] || ''; });
    $('#n-descmax').value = topeDescuentoEmpleado();
  }
}

/* ---------- Actualizar precios ---------- */

function opcionesPrecios() {
  return {
    filtro: $('#pr-filtro').value,
    pct: Number($('#pr-pct').value),
    redondeo: Number($('#pr-red').value) || 0,
    costo: $('#pr-costo').checked,
  };
}

function vistaPreviaPrecios() {
  const o = opcionesPrecios();
  const lista = productosDeFiltro(db, o.filtro);
  const prev = $('#pr-prev');
  if (!lista.length) { prev.textContent = 'No hay productos en ese grupo.'; return; }
  if (!o.pct || o.pct <= -100) { prev.textContent = `${lista.length} productos. Escribí el porcentaje para ver un ejemplo.`; return; }
  const conPrecio = lista.filter((x) => x.precio > 0);
  const p = conPrecio[0] || lista[0];
  const cambios = conPrecio.map((x) => ({ x, nuevo: precioConAumento(x.precio, o.pct, o.redondeo) }))
    .map((c) => ({ ...c, real: (c.nuevo / c.x.precio - 1) * 100 }));
  const reales = cambios.map((c) => c.real);
  const min = Math.min(...reales), max = Math.max(...reales);
  const lejos = cambios.filter((c) => Math.abs(c.real - o.pct) > 2);
  const fmt = (v) => `${v > 0 ? '+' : ''}${n(Math.round(v * 10) / 10)} %`;
  const ej = cambios.length ? cambios[0] : null;
  prev.innerHTML = `Se ${o.pct > 0 ? 'suben' : 'bajan'} <strong>${lista.length} productos</strong>.`
    + (ej ? ` Ejemplo: ${esc(p.nombre)} pasa de ${$m(p.precio, p.moneda)} a <strong>${$m(ej.nuevo, p.moneda)}</strong>.` : '')
    + (cambios.length ? `<br>Cambio real con el redondeo: entre <strong>${fmt(min)}</strong> y <strong>${fmt(max)}</strong>.` : '')
    + (lejos.length ? `<br><span class="stock-bajo">${lejos.length} producto${lejos.length === 1 ? '' : 's'} cambia${lejos.length === 1 ? '' : 'n'} más de 2 puntos distinto de lo pedido (casi siempre artículos muy baratos), por ejemplo ${esc(lejos[0].x.nombre)}: ${$u(lejos[0].x.precio)} → ${$u(lejos[0].nuevo)}.</span>` : '');
}

function iniciarPrecios() {
  $('#btn-precios').addEventListener('click', () => {
    const cats = [...new Set(db.productos.map((p) => p.categoria).filter(Boolean))].sort();
    const provs = [...db.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
    $('#pr-filtro').innerHTML = '<option value="">Todos los productos</option>'
      + (cats.length ? `<optgroup label="Una categoría">${cats.map((c) => `<option value="c:${esc(c)}">${esc(c)}</option>`).join('')}</optgroup>` : '')
      + (provs.length ? `<optgroup label="Un proveedor">${provs.map((v) => `<option value="p:${v.id}">${esc(v.nombre)}</option>`).join('')}</optgroup>` : '');
    $('#pr-pct').value = '';
    $('#pr-red').value = '1';
    $('#pr-costo').checked = false;
    $('#precios-err').textContent = '';
    vistaPreviaPrecios();
    $('#dlg-precios').showModal();
    $('#pr-pct').focus();
  });
  ['#pr-filtro', '#pr-pct', '#pr-red', '#pr-costo'].forEach((sel) => $(sel).addEventListener('input', vistaPreviaPrecios));
  $('#form-precios').addEventListener('submit', async (e) => {
    e.preventDefault();
    const o = opcionesPrecios();
    const cant = productosDeFiltro(db, o.filtro).length;
    if (!o.pct) { $('#precios-err').textContent = 'Escribí un porcentaje, por ejemplo 10.'; return; }
    if (!(await confirmar(`¿${o.pct > 0 ? 'Subir' : 'Bajar'} un ${n(Math.abs(o.pct))} % el precio de ${cant} productos?`, 'Sí, actualizar'))) return;
    const sel = $('#pr-filtro');
    const r = actualizarPrecios(db, o.filtro, o.pct, { ...o, grupo: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '' });
    if (r.error) { $('#precios-err').textContent = r.error; return; }
    guardar();
    $('#dlg-precios').close();
    render();
    toast(`Listo: se actualizó el precio de ${r.cantidad} productos.`);
  });
}

/* ---------- Datos del negocio ---------- */

function iniciarNegocio() {
  $('#form-negocio').addEventListener('submit', (e) => {
    e.preventDefault();
    db.negocio = {};
    ['nombre', 'direccion', 'telefono', 'rut', 'pie'].forEach((k) => { db.negocio[k] = $('#n-' + k).value.trim(); });
    const dm = $('#n-descmax').value.trim();
    if (dm !== '') db.negocio.descuentoMaxEmpleado = Math.min(100, Math.max(0, Number(dm) || 0));
    guardar();
    render();
    toast('Datos del negocio guardados.');
  });
}

/* ---------- Usuarios (solo administrador) ---------- */

let editandoUsuario = null;

function renderUsuarios() {
  renderRecuperacion();
  const lista = [...db.usuarios].sort((a, b) => (b.rol === 'admin') - (a.rol === 'admin') || a.nombre.localeCompare(b.nombre));
  $('#tabla-usuarios').innerHTML = lista.map((u) => `
    <tr>
      <td><div class="nom">${esc(u.nombre)}${sesion && u.id === sesion.id ? ' <span class="muted">(vos)</span>' : ''}</div></td>
      <td>${u.rol === 'admin' ? '<span class="chip info">Administrador</span>' : '<span class="chip neutro">Empleado</span>'}</td>
      <td>${u.pinPorDefecto ? '<span class="chip warn">PIN inicial, cambialo</span>' : '<span class="chip ok">PIN propio</span>'}</td>
      <td class="acc"><button class="btn sm ghost" type="button" data-editar-usuario="${u.id}">Editar</button></td>
    </tr>`).join('');
}

function abrirUsuario(id) {
  editandoUsuario = id || null;
  const u = id ? db.usuarios.find((x) => x.id === id) : { nombre: '', rol: 'empleado' };
  $('#usr-titulo').textContent = id ? 'Editar usuario' : 'Nuevo usuario';
  $('#u-nombre').value = u.nombre;
  $('#u-rol').value = u.rol;
  $('#u-pin').value = '';
  $('#u-pin2').value = '';
  $('#u-pin-label').textContent = id ? 'PIN nuevo (dejalo vacío para no cambiarlo)' : 'PIN';
  $('#usr-err').textContent = '';
  $('#usr-eliminar').hidden = !id || id === sesion.id;
  $('#dlg-usuario').showModal();
  $(id ? '#u-pin' : '#u-nombre').focus();
}

function renderRecuperacion() {
  const r = db.recuperacion;
  $('#rec-estado').innerHTML = r && r.hash
    ? `<span class="chip ok">${r.creada && !isNaN(Date.parse(r.creada)) ? `Creada el ${fechaHora(r.creada)}` : 'Creada'}</span>`
    : '<span class="chip warn">Todavía no se creó</span>';
  $('#btn-rec-crear').textContent = r && r.hash ? 'Crear una nueva' : 'Crear clave de recuperación';
}

function mostrarClaveRecuperacion(clave, motivo = '') {
  $('#rec-clave').textContent = clave;
  $('#rec-motivo').textContent = motivo;
  $('#rec-motivo').hidden = !motivo;
  $('#dlg-rec').showModal();
}

function iniciarRecuperacion() {
  $('#btn-rec-crear').addEventListener('click', async () => {
    if (!esAdmin()) return;
    if (db.recuperacion && db.recuperacion.hash
      && !(await confirmar('¿Crear una clave de recuperación nueva? La anterior deja de servir.', 'Crear una nueva'))) return;
    const clave = await nuevaClaveRecuperacion(db);
    if (!guardar()) { toast('No se pudo guardar la clave.'); return; }
    mostrarClaveRecuperacion(clave);
    render();
  });
  $('#rec-clave-copiar').addEventListener('click', () => copiarTexto($('#rec-clave').textContent, 'Clave copiada. Anotala también en papel.'));
  $('#dlg-rec').addEventListener('close', () => { $('#rec-clave').textContent = ''; });
  // Ya se está en Configuración: el botón del aviso crea la clave directamente
  $('#banner-recuperacion-ir').addEventListener('click', () => $('#btn-rec-crear').click());
}

function iniciarUsuarios() {
  $('#btn-nuevo-usuario').addEventListener('click', () => abrirUsuario());
  $('#tabla-usuarios').addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar-usuario]');
    if (b) abrirUsuario(b.dataset.editarUsuario);
  });
  ['#u-pin', '#u-pin2'].forEach((sel) => $(sel).addEventListener('input', () => { $(sel).value = $(sel).value.replace(/\D/g, '').slice(0, 6); }));
  $('#form-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!esAdmin()) return;
    const boton = e.submitter || $('#form-usuario [type=submit]');
    if (boton && boton.disabled) return; // ya se está guardando
    const pin = $('#u-pin').value;
    if (pin !== $('#u-pin2').value) { $('#usr-err').textContent = 'Los dos PIN no coinciden.'; return; }
    if (boton) boton.disabled = true;
    let r, claveNueva = '';
    try {
      r = await guardarUsuario(db, { nombre: $('#u-nombre').value, rol: $('#u-rol').value, pin }, editandoUsuario);
      // Al poner el PIN de un administrador, si todavía no hay clave de recuperación se crea en el momento:
      // sin ella, un PIN olvidado deja el programa sin nadie que pueda entrar como administrador.
      if (!r.error && r.usuario.rol === 'admin' && pin && !(db.recuperacion && db.recuperacion.hash)) claveNueva = await nuevaClaveRecuperacion(db);
    } finally { if (boton) boton.disabled = false; }
    if (r.error) { $('#usr-err').textContent = r.error; return; }
    guardar();
    $('#dlg-usuario').close();
    if (r.usuario.id === sesion.id) { sesion = r.usuario; aplicarPermisos(); }
    mostrarVista();
    toast(editandoUsuario ? 'Usuario guardado.' : `Usuario ${r.usuario.nombre} creado.`);
    if (claveNueva) mostrarClaveRecuperacion(claveNueva, 'Como es el primer PIN de administrador, el programa creó la clave para entrar si alguien se lo olvida.');
  });
  $('#usr-eliminar').addEventListener('click', async () => {
    const u = db.usuarios.find((x) => x.id === editandoUsuario);
    if (!u || !(await confirmar(`¿Eliminar el usuario ${u.nombre}? Ya no va a poder entrar al programa.`, 'Eliminar', true))) return;
    const err = eliminarUsuario(db, u.id, sesion.id);
    if (err) { $('#usr-err').textContent = err; $('#dlg-usuario').showModal(); return; }
    guardar();
    $('#dlg-usuario').close();
    render();
    toast('Usuario eliminado.');
  });
}

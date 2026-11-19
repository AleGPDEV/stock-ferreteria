/* Pantalla Proveedores. */
'use strict';

/* ---------- Proveedores ---------- */

function renderProveedores() {
  $('#prov-sub').textContent = `${db.proveedores.length} proveedores.`;
  const lista = [...db.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  $('#tabla-prov').innerHTML = lista.length
    ? lista.map((v) => {
      const prods = db.productos.filter((p) => p.proveedorId === v.id);
      const rep = prods.filter((p) => estado(p) !== 'ok').length;
      return `<tr>
        <td><div class="nom">${esc(v.nombre)}</div><div class="meta">${v.rut ? 'RUT ' + esc(v.rut) : ''}${v.notas ? (v.rut ? ' · ' : '') + esc(v.notas) : ''}</div></td>
        <td>${esc(v.contacto)}</td>
        <td class="num">${esc(v.telefono)}</td>
        <td>${esc(v.email)}</td>
        <td class="num">${prods.length}</td>
        <td class="num">${rep ? `<span class="chip warn">${rep}</span>` : '<span class="muted">0</span>'}</td>
        <td class="acc"><button class="btn sm ghost" type="button" data-prov="${v.id}">Editar</button></td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="7" class="vacio">Todavía no cargaste proveedores. Usá «Nuevo proveedor» para agregar el primero.</td></tr>';
}

let editandoProv = null;
function abrirProveedor(id) {
  editandoProv = id || null;
  const v = id ? proveedor(id) : { nombre: '', contacto: '', telefono: '', email: '', rut: '', notas: '' };
  $('#prov-titulo').textContent = id ? 'Editar proveedor' : 'Nuevo proveedor';
  ['nombre', 'contacto', 'telefono', 'email', 'rut', 'notas'].forEach((k) => { $('#v-' + k).value = v[k] || ''; });
  $('#prov-eliminar').hidden = !id;
  $('#prov-err').textContent = '';
  $('#dlg-prov').showModal();
  $('#v-nombre').focus();
}

function iniciarProveedores() {
  $('#btn-nuevo-prov').addEventListener('click', () => abrirProveedor());
  $('#tabla-prov').addEventListener('click', (e) => {
    const b = e.target.closest('[data-prov]');
    if (b) abrirProveedor(b.dataset.prov);
  });
  $('#form-prov').addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = {};
    ['nombre', 'contacto', 'telefono', 'email', 'rut', 'notas'].forEach((k) => { datos[k] = $('#v-' + k).value.trim(); });
    if (!datos.nombre) { $('#prov-err').textContent = 'Escribí el nombre del proveedor.'; return; }
    if (editandoProv) Object.assign(proveedor(editandoProv), datos);
    else db.proveedores.push({ id: uid(), ...datos });
    guardar();
    $('#dlg-prov').close();
    render();
    toast('Proveedor guardado.');
  });
  $('#prov-eliminar').addEventListener('click', async () => {
    const v = proveedor(editandoProv);
    const cant = db.productos.filter((p) => p.proveedorId === v.id).length;
    if (!(await confirmar(`¿Eliminar ${v.nombre}?${cant ? ` Sus ${cant} productos quedan sin proveedor asignado.` : ''}`, 'Eliminar', true))) return;
    db.productos.forEach((p) => { if (p.proveedorId === v.id) p.proveedorId = ''; });
    db.proveedores = db.proveedores.filter((x) => x.id !== v.id);
    guardar();
    $('#dlg-prov').close();
    render();
    toast('Proveedor eliminado.');
  });
}

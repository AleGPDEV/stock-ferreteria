/* Copias de seguridad: descargar, restaurar y carpeta extra. */
'use strict';

/* ---------- Respaldo ---------- */

/** Cambia todos los datos. Los usuarios y los datos del negocio se mantienen salvo que el archivo nuevo traiga los suyos. */
function reemplazarDatos(nuevo, conservarUsuarios = true) {
  const usuarios = db.usuarios, negocio = db.negocio;
  const recuperacion = db.recuperacion;
  db = nuevo;
  if (!db.recuperacion) db.recuperacion = recuperacion;
  if (conservarUsuarios) db.usuarios = usuarios;
  if (!db.negocio || !db.negocio.nombre) db.negocio = negocio;
  asegurarUsuarios(db);
  if (!db.usuarios.some((u) => u.id === sesion.id)) sesion = null;
  else sesion = db.usuarios.find((u) => u.id === sesion.id);
  guardar({ completo: true });
  ticket = [];
  if (!sesion) mostrarLogin(); else { aplicarPermisos(); render(); }
}

/**
 * Prepara una copia leída para restaurarla: las fotos que trae adentro (fotosIncluidas) no son datos,
 * las guarda la PC aparte en la carpeta Fotos (ver traerFotosDeCopia).
 */
function datosDeCopia(datos) {
  const d = Object.assign(baseVacia(), datos);
  delete d.fotosIncluidas;
  return d;
}
/** Después de restaurar en la PC: trae las fotos de la copia y avisa cuántas hay. */
async function fotosAlRestaurar(file) {
  if (!escritorio() || !window.almacen.traerFotosDeCopia) return '';
  try {
    const r = await window.almacen.traerFotosDeCopia(file);
    if (!r || !r.enUso) return '';
    if (r.faltan) return ` Fotos: ${numero.format(r.hay)} de ${numero.format(r.enUso)}; las otras ${numero.format(r.faltan)} no estaban en la copia.`;
    return ` Con las ${numero.format(r.enUso)} fotos.`;
  } catch (e) { return ''; }
}
/** Lee una copia: .json, o .json.gz (los respaldos automáticos diarios y las copias con fotos). */
async function leerCopia(file) {
  if (/\.gz$/i.test(file.name)) {
    const flujo = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(flujo).text();
  }
  return file.text();
}

function renderRespaldoExtra(info) {
  if (!escritorio() || !window.almacen.elegirCarpetaExtra) return;
  const i = info && !info.error ? info : window.almacen.info();
  const est = i.estadoExtra;
  let texto;
  if (!i.carpetaExtra) {
    texto = 'Todavía no elegiste una carpeta. Elegí un pendrive o la carpeta de Google Drive u OneDrive, así hay una copia fuera de esta computadora.';
  } else if (!est) {
    texto = `Se copia a: ${esc(i.carpetaExtra)}.`;
  } else if (est.ok) {
    texto = `Se copia a: ${esc(i.carpetaExtra)}. <span class="chip ok">Última copia: ${fechaHora(est.fecha)}</span>`;
  } else {
    texto = `Se copia a: ${esc(i.carpetaExtra)}. <span class="chip warn">No se pudo copiar el ${fechaHora(est.fecha)}</span> ${esc(est.error || '')}`;
  }
  $('#extra-estado').innerHTML = texto;
  $('#btn-extra-quitar').hidden = !i.carpetaExtra;
  $('#btn-extra-elegir').textContent = i.carpetaExtra ? 'Cambiar carpeta' : 'Elegir carpeta';
}

/** Texto de la tarjeta: se guarda solo, y si el último respaldo falló, el aviso (queda hasta que salga uno bueno). */
function renderRespaldoTexto(info) {
  const detalle = `Cada día se hace un respaldo comprimido en ${info.respaldos} (al abrir, al cerrar la caja y al cerrar el programa). Se guardan los 7 más nuevos, uno por semana del último mes y uno por mes del último año. Las fotos de los productos se copian a la carpeta Fotos que está ahí mismo. Para pasar todo a otra PC, usá «Descargar copia»: guarda los datos y las fotos en un solo archivo.`;
  const est = info.estadoRespaldo;
  const fallo = est && !est.ok ? ` <span class="chip warn" title="${esc(est.error || '')}">El respaldo de hoy falló (${fechaHora(est.fecha)})</span>` : '';
  $('#respaldo-texto').innerHTML = `Los cambios se guardan solos en esta PC. <button type="button" class="ayuda-ico" data-ayuda="${esc(detalle)}">?</button>${fallo}`;
}

function iniciarRespaldo() {
  if (escritorio()) {
    const info = window.almacen.info();
    renderRespaldoTexto(info);
    if (window.almacen.alFallarRespaldo) {
      window.almacen.alFallarRespaldo(() => {
        toast('El respaldo de hoy falló. Se vuelve a intentar solo; si sigue fallando, avisá a soporte.');
        renderRespaldoTexto(window.almacen.info());
      });
    }
    $('#btn-abrir-respaldos').hidden = false;
    $('#btn-abrir-respaldos').addEventListener('click', () => window.almacen.abrirRespaldos());
    if (window.almacen.copiarInforme) {
      $('#btn-informe-soporte').hidden = false;
      $('#btn-informe-soporte').addEventListener('click', async () => {
        try {
          const r = await window.almacen.copiarInforme();
          toast(r && !r.error ? 'Informe copiado. Pegalo en el mensaje a soporte.' : 'No se pudo copiar el informe.');
        } catch (e) { toast('No se pudo copiar el informe.'); }
      });
    }
    if (window.almacen.elegirCarpetaExtra) {
      $('#respaldo-extra').hidden = false;
      const usar = async (accion, aviso) => {
        $$('#respaldo-extra button').forEach((x) => { x.disabled = true; });
        try { const r = await accion(); renderRespaldoExtra(r); renderRespaldoTexto(window.almacen.info()); if (aviso) toast(aviso(r)); } finally { $$('#respaldo-extra button').forEach((x) => { x.disabled = false; }); }
      };
      $('#btn-extra-elegir').addEventListener('click', () => usar(window.almacen.elegirCarpetaExtra, (r) => (r && r.estadoExtra && r.estadoExtra.ok ? 'Copia guardada en la carpeta elegida.' : '')));
      $('#btn-extra-quitar').addEventListener('click', () => usar(window.almacen.quitarCarpetaExtra, () => 'Se dejó de copiar a la carpeta extra.'));
      $('#btn-respaldar-ahora').addEventListener('click', () => usar(window.almacen.respaldarAhora, (r) => (r && r.error ? 'No se pudo hacer la copia.' : 'Copia de seguridad hecha.')));
    }
  }
  $('#btn-respaldo').addEventListener('click', async () => {
    // En la PC: un solo archivo con los datos y las fotos, para llevar a otra computadora
    if (escritorio() && window.almacen.copiaCompleta) {
      const b = $('#btn-respaldo');
      b.disabled = true;
      try {
        const r = await window.almacen.copiaCompleta();
        if (!r || r.cancelado) return;
        if (r.error) { toast('No se pudo guardar la copia: ' + r.error); return; }
        const mb = (r.bytes / 1048576).toLocaleString('es-UY', { maximumFractionDigits: 1 });
        toast(`Copia guardada con ${numero.format(r.fotos)} foto${r.fotos === 1 ? '' : 's'} (${mb} MB).${r.faltan ? ` ${numero.format(r.faltan)} foto${r.faltan === 1 ? '' : 's'} no estaba${r.faltan === 1 ? '' : 'n'} en esta PC.` : ''}`);
      } finally { b.disabled = false; }
      return;
    }
    descargarBlob(JSON.stringify(db), 'application/json', `respaldo_stock_${isoLocal()}.json`);
    toast('Descargando la copia de seguridad.');
  });
  $('#input-restaurar').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    (async () => {
      let datos;
      try { datos = JSON.parse(await leerCopia(file)); } catch (err) { toast('El archivo no es una copia válida.'); return; }
      if (!datos || !Array.isArray(datos.productos) || !Array.isArray(datos.movimientos)) { toast('El archivo no es una copia de Stock Ferretería.'); return; }
      if (!(await confirmar(`¿Reemplazar los datos actuales por la copia (${datos.productos.length} productos)? Lo que no esté en la copia se pierde.`, 'Restaurar', true))) return;
      reemplazarDatos(datosDeCopia(datos), !Array.isArray(datos.usuarios) || !datos.usuarios.length);
      toast('Copia restaurada.' + (await fotosAlRestaurar(file)));
      if (sesion) render(); // para que se vean las fotos que llegaron
    })();
  });
  $('#btn-cargar-ejemplo').addEventListener('click', async () => {
    if (!(await confirmar('¿Reemplazar todos los datos por los de ejemplo?', 'Cargar ejemplo', true))) return;
    reemplazarDatos(semilla()); toast('Datos de ejemplo cargados.');
  });
  $('#btn-borrar-todo').addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar todos los productos, proveedores, ventas y movimientos? Descargá una copia antes si la vas a necesitar.', 'Borrar todo', true))) return;
    reemplazarDatos(baseVacia()); toast('Se borraron todos los datos. Los usuarios se conservan.');
  });
  $('#btn-vaciar').addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar los datos de ejemplo y empezar con tu ferretería?', 'Empezar de cero', true))) return;
    reemplazarDatos(baseVacia()); location.hash = '#productos';
    toast('Listo. Empezá cargando tus proveedores y productos.');
  });
  $('#btn-ocultar-ejemplo').addEventListener('click', () => { db.ejemplo = false; guardar(); render(); });
}

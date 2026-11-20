/* Pantalla de datos dañados: restaurar una copia o reparar. */
'use strict';

/* ---------- Datos dañados ---------- */

function mostrarDanado() {
  const i = datosDanados || {};
  sesion = null;
  $$('dialog[open]').forEach((d) => d.close());
  $('#login').hidden = true;
  const textos = {
    filas: `Hay ${i.cantidad === 1 ? 'un dato' : `${i.cantidad || 'algunos'} datos`} guardado${i.cantidad === 1 ? '' : 's'} que no se ${i.cantidad === 1 ? 'puede' : 'pueden'} leer. Puede pasar por un corte de luz o un problema del disco.`,
    base: 'El archivo de la base de datos no se puede abrir. Puede pasar por un corte de luz o un problema del disco.',
    json: 'Los datos guardados no se pueden leer. Puede pasar por un corte de luz o un problema del disco.',
    archivo: 'El archivo de la base tiene partes dañadas. Puede pasar por un corte de luz o un problema del disco. Restaurá el respaldo más nuevo.',
  };
  $('#danado-texto').textContent = textos[i.error] || textos.json;
  const det = [];
  if (i.filas && i.filas.length) det.push('Dañado: ' + i.filas.slice(0, 8).map((f) => `${f.tabla} ${f.id}`).join(', ') + (i.cantidad > 8 ? '…' : ''));
  if (i.detalle) det.push(i.detalle);
  if (i.base) det.push('Base: ' + i.base);
  $('#danado-detalle').textContent = det.join(' · ');
  const esc_ = escritorio();
  $('#danado-carpeta-btn').hidden = !esc_ || !window.almacen.abrirRespaldos;
  if (esc_) { try { $('#danado-carpeta').textContent = window.almacen.info().respaldos; } catch (e) { /* nada */ } }
  $('#danado-reparar').hidden = !(esc_ && i.error === 'filas' && window.almacen.reparar);
  $('#danado-descargar').hidden = esc_;
  $('#danado-ejemplo').hidden = esc_;
  $('#danado-err').textContent = '';
  $('#danado').hidden = false;
}

function iniciarDanado() {
  // Si el chequeo diario de la PC encuentra el archivo de la base dañado con el programa abierto, se pasa a esta pantalla
  if (escritorio() && window.almacen.alDanarBase) {
    window.almacen.alDanarBase((info) => { marcarDanados(info || { error: 'archivo' }); mostrarDanado(); });
  }
  $('#danado-archivo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    (async () => {
      let datos;
      try { datos = JSON.parse(await leerCopia(file)); } catch (err) { $('#danado-err').textContent = 'Ese archivo no es una copia válida. Probá con el respaldo del día anterior.'; return; }
      if (!datos || !Array.isArray(datos.productos) || !Array.isArray(datos.movimientos)) { $('#danado-err').textContent = 'Ese archivo no es una copia de Stock Ferretería.'; return; }
      if (!(await confirmar(`¿Restaurar la copia «${file.name}» (${datos.productos.length} productos, ${(datos.ventas || []).length} ventas)? En la versión instalada, los datos dañados se guardan aparte por las dudas.`, 'Restaurar'))) return;
      db = Object.assign(baseVacia(), datos);
      asegurarUsuarios(db);
      fotoGuardada = null;
      if (!guardar({ completo: true })) { $('#danado-err').textContent = 'No se pudo guardar la copia: ' + errorGuardado; return; }
      datosDanados = null;
      $('#danado').hidden = true;
      toast('Copia restaurada.');
      if (cargar()) arrancar(); else mostrarDanado();
    })();
  });
  $('#danado-carpeta-btn').addEventListener('click', () => window.almacen.abrirRespaldos());
  $('#danado-reparar').addEventListener('click', async () => {
    const n_ = (datosDanados && datosDanados.cantidad) || 0;
    const config = datosDanados && datosDanados.configDanada;
    const msg = `Se va${n_ === 1 ? '' : 'n'} a quitar ${n_ === 1 ? 'el dato dañado' : `los ${n_} datos dañados`}${config ? ' (incluidos los datos del negocio y las cajas)' : ''}. Antes se guarda una copia de la base tal como está. Lo que se quite habrá que cargarlo de nuevo. ¿Seguir?`;
    if (!(await confirmar(msg, 'Quitar lo dañado', true))) return;
    const r = window.almacen.reparar();
    if (!r || r.error) { $('#danado-err').textContent = 'No se pudo reparar: ' + ((r && r.error) || 'error'); return; }
    $('#danado').hidden = true;
    toast(`Listo: se quitaron ${r.quitadas} datos dañados. Revisá el stock y las ventas.`);
    if (cargar()) arrancar(); else mostrarDanado();
  });
  $('#danado-descargar').addEventListener('click', () => {
    let raw = '';
    try { raw = localStorage.getItem(CLAVE) || ''; } catch (e) { raw = ''; }
    descargarBlob(raw, 'text/plain', `datos_danados_${isoLocal()}.txt`);
  });
  $('#danado-ejemplo').addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar lo guardado en este navegador y empezar con los datos de ejemplo? Lo que estaba guardado se pierde. Descargalo antes si lo querés revisar.', 'Borrar y empezar', true))) return;
    datosDanados = null;
    db = semilla();
    asegurarUsuarios(db);
    guardar({ completo: true });
    $('#danado').hidden = true;
    arrancar();
  });
}

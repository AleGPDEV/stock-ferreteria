/* Ventana para vincular el celular: QR y estado de la conexión. */
'use strict';

/** Dibuja el QR de vinculación (SVG, para que se vea nítido con cualquier zoom). */
function qrSvg(texto) {
  if (typeof qrcode !== 'function') return '';
  const q = qrcode(0, 'M');
  q.addData(unescape(encodeURIComponent(texto))); // UTF-8
  q.make();
  return q.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
}

let celularInfo = null;
let celularTimer = 0;
function pintarCelular() {
  const i = celularInfo;
  const admin = esAdmin();
  $('#cel-no-admin').hidden = admin;
  $('#cel-apagado').hidden = !admin || !i || i.activo;
  $('#cel-prendido').hidden = !admin || !i || !i.activo;
  $('#cel-prender').hidden = !admin || !i || i.activo;
  $('#cel-apagar').hidden = !admin || !i || !i.activo;
  $('#cel-nuevo').hidden = !admin || !i || !i.activo;
  $('#cel-err').textContent = (i && i.error) || '';
  if (i && !i.ips.length) $('#cel-err').textContent = 'Esta PC no está conectada a ninguna red. Conectala al WiFi o al cable del local.';
  if (admin && i && i.activo) {
    const texto = JSON.stringify(i.vinculo);
    if ($('#cel-qr').dataset.texto !== texto) { $('#cel-qr').innerHTML = qrSvg(texto); $('#cel-qr').dataset.texto = texto; }
    $('#cel-ips').textContent = i.ips.join(' · ') || '—';
    const u = i.ultimoPedido;
    const seg = u ? Math.round((Date.now() - Date.parse(u.fecha)) / 1000) : null;
    $('#cel-ultimo').textContent = !u ? 'Todavía no se conectó ningún celular.'
      : `Último pedido de un celular: ${seg < 60 ? `hace ${Math.max(seg, 0)} s` : seg < 3600 ? `hace ${Math.round(seg / 60)} min` : fechaHora(u.fecha)} (${u.ip}).`;
  } else if (!admin) {
    $('#cel-qr').innerHTML = ''; $('#cel-qr').dataset.texto = ''; // el QR lleva la clave: que no quede a la vista
  }
  $('#cel-card-estado').textContent = !i ? 'El celular carga productos y cuenta el stock directo en esta PC, por el WiFi del local.'
    : i.activo ? `Conexión prendida${i.ultimoPedido ? ` · último pedido de un celular: ${fechaHora(i.ultimoPedido.fecha)}` : '.'}`
      : 'Conexión apagada.';
}
async function refrescarCelular() {
  if (!escritorio() || !window.almacen.celular) return;
  try { celularInfo = await window.almacen.celular(); } catch (e) { celularInfo = null; }
  pintarCelular();
}
async function abrirCelular() {
  if (!escritorio() || !window.almacen.celular) return;
  await refrescarCelular();
  const d = $('#dlg-celular');
  if (!d.open) d.showModal();
  clearInterval(celularTimer);
  celularTimer = setInterval(() => { if (d.open) refrescarCelular(); else clearInterval(celularTimer); }, 3000);
}
function iniciarCelular() {
  if (!escritorio() || !window.almacen.celular) return;
  window.almacen.alAbrirCelular(() => { if (sesion) abrirCelular(); else toast('Entrá al programa con un usuario administrador para vincular un celular.'); });
  $('#btn-cel-abrir').addEventListener('click', abrirCelular);
  const accion = async (b, fn) => {
    b.disabled = true;
    try { celularInfo = await fn(); } catch (e) { $('#cel-err').textContent = String((e && e.message) || e); }
    b.disabled = false;
    pintarCelular();
  };
  $('#cel-prender').addEventListener('click', (e) => { if (esAdmin()) accion(e.currentTarget, window.almacen.activarCelular); });
  $('#cel-apagar').addEventListener('click', (e) => { if (esAdmin()) accion(e.currentTarget, window.almacen.desactivarCelular); });
  $('#cel-nuevo').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!esAdmin() || !(await confirmar('¿Desvincular todos los celulares? No pueden cargar nada en la PC hasta que escaneen el código QR nuevo.', 'Desvincular todos', true))) return;
    await accion(b, window.almacen.nuevoCodigoCelular);
    toast('Listo: los celulares tienen que volver a escanear el código.');
  });
  $('#dlg-celular').addEventListener('close', () => clearInterval(celularTimer));
  refrescarCelular();
}

/* Pantalla de ingreso: elegir usuario, PIN y permisos según el rol. */
'use strict';

/* ---------- Ingreso ---------- */

let loginUsuario = null;

function mostrarLogin() {
  sesion = null;
  document.body.classList.remove('rol-empleado', 'rol-admin');
  $$('dialog[open]').forEach((d) => d.close());
  $('#login-negocio').textContent = (db.negocio && db.negocio.nombre) || NOMBRE_NEGOCIO;
  const lista = [...db.usuarios].sort((a, b) => (a.rol === 'admin') - (b.rol === 'admin') || a.nombre.localeCompare(b.nombre));
  $('#login-usuarios').innerHTML = lista.map((u) => `
    <button type="button" class="login-user" data-usuario="${u.id}">
      <span>${esc(u.nombre)}</span><small>${ROLES[u.rol]}</small>
    </button>`).join('');
  $('#login-paso1').hidden = false;
  $('#login-paso2').hidden = true;
  $('#login-rec').hidden = true;
  $('#login').hidden = false;
  const primero = $('#login-usuarios .login-user');
  if (primero) primero.focus();
}

function elegirUsuario(id) {
  loginUsuario = db.usuarios.find((u) => u.id === id);
  if (!loginUsuario) return;
  $('#login-nombre').textContent = loginUsuario.nombre;
  $('#login-pin').value = '';
  $('#login-err').textContent = '';
  $('#login-paso1').hidden = true;
  $('#login-paso2').hidden = false;
  $('#login-pin').focus();
}

function aplicarPermisos() {
  document.body.classList.toggle('rol-admin', esAdmin());
  document.body.classList.toggle('rol-empleado', !esAdmin());
  $('#sesion-nombre').textContent = sesion.nombre;
  $('#sesion-rol').textContent = ROLES[sesion.rol];
}

function entrar(u) {
  sesion = u;
  loginUsuario = null;
  $('#login').hidden = true;
  aplicarPermisos();
  if (!esAdmin()) $('#ventas-fecha').value = isoLocal();
  if (location.hash !== '#' + vistaInicio()) location.hash = '#' + vistaInicio();
  mostrarVista();
}

function iniciarLogin() {
  $('#login-usuarios').addEventListener('click', (e) => {
    const b = e.target.closest('[data-usuario]');
    if (b) elegirUsuario(b.dataset.usuario);
  });
  $('#login-volver').addEventListener('click', mostrarLogin);
  $('#login-pin').addEventListener('input', () => {
    const i = $('#login-pin');
    i.value = i.value.replace(/\D/g, '').slice(0, 6);
    $('#login-err').textContent = '';
  });
  $('#login-paso2').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = $('#login-pin').value;
    if (!pin) { $('#login-err').textContent = 'Escribí tu PIN.'; return; }
    const espera = esperaPin(db, loginUsuario.id);
    // Un administrador bloqueado no tiene que esperar: puede entrar con la clave de recuperación
    const salida = loginUsuario.rol === 'admin' && db.recuperacion && db.recuperacion.hash ? ' Si no podés esperar, tocá «Me olvidé el PIN del administrador» y usá la clave de recuperación.' : '';
    if (espera) { $('#login-err').textContent = `Demasiados intentos. Esperá ${textoEspera(espera)} y probá de nuevo.${salida}`; $('#login-pin').value = ''; return; }
    if (!verificarPin(loginUsuario, pin)) {
      const bloq = fallarPin(db, loginUsuario.id);
      guardar();
      $('#login-err').textContent = bloq ? `PIN incorrecto. Por seguridad, esperá ${textoEspera(bloq)} antes de volver a probar.${salida}` : 'El PIN no es correcto. Probá de nuevo.';
      $('#login-pin').value = '';
      $('#login-pin').focus();
      return;
    }
    acertarPin(db, loginUsuario.id);
    const bloqueos = bloqueosPendientes(db, loginUsuario.id);
    guardar();
    entrar(loginUsuario);
    if (bloqueos.length) {
      const ult = bloqueos[bloqueos.length - 1];
      aviso(`Ojo: alguien escribió mal tu PIN ${INTENTOS_PIN} veces seguidas${bloqueos.length > 1 ? ` (${bloqueos.length} veces desde que entraste la última vez)` : ''}. La última fue el ${fechaHora(ult.fecha)}${ult.donde === 'autorizar' ? ', en la ventana para autorizar un descuento' : ', en el ingreso'}. Si no fuiste vos, cambiá el PIN en Configuración.`);
    }
  });
  $('#login-olvide').addEventListener('click', () => {
    const admins = db.usuarios.filter((u) => u.rol === 'admin');
    $('#rec-usuario').innerHTML = admins.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
    const hay = !!(db.recuperacion && db.recuperacion.hash);
    $('#rec-campos').hidden = !hay;
    $('#rec-sin').hidden = hay;
    $('#login-rec [type=submit]').hidden = !hay;
    ['#rec-codigo', '#rec-pin', '#rec-pin2'].forEach((x) => { $(x).value = ''; });
    $('#rec-err').textContent = '';
    $('#login-paso1').hidden = true;
    $('#login-rec').hidden = false;
    $('#rec-codigo').focus();
  });
  $('#rec-volver').addEventListener('click', mostrarLogin);
  ['#rec-pin', '#rec-pin2'].forEach((sel) => $(sel).addEventListener('input', () => { $(sel).value = $(sel).value.replace(/\D/g, '').slice(0, 6); }));
  $('#login-rec').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = (t) => { $('#rec-err').textContent = t; };
    const u = db.usuarios.find((x) => x.id === $('#rec-usuario').value && x.rol === 'admin');
    if (!u) return err('Elegí el administrador.');
    const pin = $('#rec-pin').value;
    if (!/^\d{4,6}$/.test(pin)) return err('El PIN tiene que tener de 4 a 6 números.');
    if (pin !== $('#rec-pin2').value) return err('Los dos PIN no coinciden.');
    const espera = esperaPin(db, 'recuperacion');
    if (espera) return err(`Demasiados intentos. Esperá ${textoEspera(espera)} y probá de nuevo.`);
    if (!verificarRecuperacion(db, $('#rec-codigo').value)) {
      const b = fallarPin(db, 'recuperacion');
      guardar();
      return err(b ? `La clave no es correcta. Esperá ${textoEspera(b)} antes de volver a probar.` : 'La clave de recuperación no es correcta. Revisá que esté completa.');
    }
    acertarPin(db, 'recuperacion');
    const g = guardarUsuario(db, { nombre: u.nombre, rol: 'admin', pin }, u.id);
    if (g.error) return err(g.error);
    acertarPin(db, u.id);
    guardar();
    toast(`PIN de ${u.nombre} restablecido.`);
    entrar(g.usuario);
  });
  $('#btn-salir').addEventListener('click', () => arrancar());
  $('#banner-pin-ir').addEventListener('click', () => $('#tabla-usuarios').scrollIntoView({ block: 'center' }));
}

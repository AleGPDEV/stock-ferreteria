/* Usuarios y PIN: SHA-256, crear y editar usuarios, verificar el PIN, bloqueos por intentos fallidos
 * y clave de recuperación del administrador. Sin pantalla (la pantalla está en pantallas/ingreso.js y pantallas/configuracion.js). */
'use strict';

/* ---------- Usuarios y PIN ---------- */

// SHA-256 en JavaScript puro (sirve en la versión de escritorio, en el navegador y en las pruebas).
function sha256(texto) {
  const rot = (v, n) => (v >>> n) | (v << (32 - n));
  const max = 2 ** 32;
  let h = [];
  const k = [];
  const compuesto = {};
  for (let c = 2, cuenta = 0; cuenta < 64; c++) {
    if (compuesto[c]) continue;
    for (let i = 0; i < 313; i += c) compuesto[i] = c;
    h[cuenta] = (Math.pow(c, 0.5) * max) | 0;
    k[cuenta++] = (Math.pow(c, 1 / 3) * max) | 0;
  }
  const bytes = Array.from(unescape(encodeURIComponent(texto)), (ch) => ch.charCodeAt(0));
  const largoBits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const w = [];
  for (let i = 0; i < bytes.length; i++) w[i >> 2] |= bytes[i] << ((3 - (i % 4)) * 8);
  w.push((largoBits / max) | 0, largoBits | 0);
  for (let j = 0; j < w.length; j += 16) {
    const m = w.slice(j, j + 16);
    const previo = h;
    h = h.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const a15 = m[i - 15], a2 = m[i - 2];
        m[i] = (m[i - 16] + (rot(a15, 7) ^ rot(a15, 18) ^ (a15 >>> 3)) + m[i - 7] + (rot(a2, 17) ^ rot(a2, 19) ^ (a2 >>> 10))) | 0;
      }
      const a = h[0], e = h[4];
      const t1 = h[7] + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & h[5]) ^ (~e & h[6])) + k[i] + m[i];
      const t2 = (rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
      h = [(t1 + t2) | 0].concat(h);
      h[4] = (h[4] + t1) | 0;
    }
    for (let i = 0; i < 8; i++) h[i] = (h[i] + previo[i]) | 0;
  }
  return h.slice(0, 8).map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

const ROLES = { admin: 'Administrador', empleado: 'Empleado' };
const pinValido = (p) => /^\d{4,6}$/.test(String(p));
const hashPin = (pin, sal) => sha256(`${sal}:${pin}`);

/* Clave de recuperación: la crea el administrador una vez (12 letras y números) y se anota en papel.
 * Sirve para poner un PIN nuevo si se olvida el del administrador. Se guarda solo su hash. */
const LETRAS_CLAVE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L, que se confunden
const normalizarClave = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function nuevaClaveRecuperacion(d) {
  const r = new Uint8Array(12);
  globalThis.crypto.getRandomValues(r);
  const t = Array.from(r, (x) => LETRAS_CLAVE[x % LETRAS_CLAVE.length]).join('');
  const sal = uid();
  d.recuperacion = { sal, hash: hashPin(t, sal), creada: new Date().toISOString() };
  return `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`;
}
const verificarRecuperacion = (d, texto) => !!(d.recuperacion && d.recuperacion.hash)
  && hashPin(normalizarClave(texto), d.recuperacion.sal) === d.recuperacion.hash;
const verificarPin = (u, pin) => !!u && hashPin(String(pin), u.sal) === u.pin;

/* Límite de intentos de PIN: después de 5 errores seguidos, hay que esperar 5 minutos (y otra vez con cada error más). */
const INTENTOS_PIN = 5;
const ESPERA_PIN = 5 * 60 * 1000;
function esperaPin(d, id, ahora = Date.now()) {
  const b = (d.intentosPin || {})[id];
  return b && b.hasta > ahora ? b.hasta - ahora : 0;
}
function fallarPin(d, id, ahora = Date.now()) {
  d.intentosPin = d.intentosPin || {};
  const b = d.intentosPin[id] || (d.intentosPin[id] = { fallos: 0, hasta: 0 });
  b.fallos++;
  if (b.fallos >= INTENTOS_PIN) {
    b.hasta = ahora + ESPERA_PIN;
    // Queda anotado para avisarle al dueño del PIN la próxima vez que entre
    const usuario = String(id).replace(/^aut:/, '');
    d.bloqueosPin = d.bloqueosPin || {};
    (d.bloqueosPin[usuario] = d.bloqueosPin[usuario] || []).push({ fecha: new Date(ahora).toISOString(), donde: String(id).startsWith('aut:') ? 'autorizar' : 'ingreso' });
    if (d.bloqueosPin[usuario].length > 20) d.bloqueosPin[usuario].splice(0, d.bloqueosPin[usuario].length - 20);
    return ESPERA_PIN;
  }
  return 0;
}
/** Bloqueos por PIN equivocado desde la última vez que ese usuario entró (y los borra). */
function bloqueosPendientes(d, usuarioId) {
  const l = (d.bloqueosPin || {})[usuarioId] || [];
  if (d.bloqueosPin) delete d.bloqueosPin[usuarioId];
  return l;
}
function acertarPin(d, id) {
  if (!d.intentosPin || !d.intentosPin[id]) return false;
  delete d.intentosPin[id];
  return true;
}
const textoEspera = (ms) => (ms > 60000 ? `${Math.ceil(ms / 60000)} minutos` : `${Math.ceil(ms / 1000)} segundos`);

function crearUsuario(nombre, rol, pin, porDefecto = false) {
  const sal = uid();
  return { id: uid(), nombre, rol, sal, pin: hashPin(pin, sal), pinPorDefecto: porDefecto };
}

/** La primera vez crea «Administrador» (PIN 1234) y «Empleado» (PIN 0000). Siempre deja al menos un administrador. */
function asegurarUsuarios(d) {
  // Los datos de prueba traían «Ferretería de prueba» como nombre del negocio: pasa a Grupo Muros
  let cambio = false;
  if (d.negocio && d.negocio.nombre === 'Ferretería de prueba') { d.negocio.nombre = NOMBRE_NEGOCIO; cambio = true; }
  if (!Array.isArray(d.usuarios) || !d.usuarios.length) {
    d.usuarios = [crearUsuario('Administrador', 'admin', '1234', true), crearUsuario('Empleado', 'empleado', '0000', true)];
    return true;
  }
  if (!d.usuarios.some((u) => u.rol === 'admin')) {
    d.usuarios.unshift(crearUsuario('Administrador', 'admin', '1234', true));
    return true;
  }
  return cambio;
}

/** Crea o modifica un usuario. datos: { nombre, rol, pin }. Al editar, el PIN vacío no cambia. */
function guardarUsuario(d, datos, id) {
  const nombre = String(datos.nombre || '').trim();
  const rol = datos.rol;
  const pin = String(datos.pin || '');
  if (!nombre) return { error: 'Escribí el nombre.' };
  if (!ROLES[rol]) return { error: 'Elegí si es administrador o empleado.' };
  if (d.usuarios.some((u) => u.id !== id && normal(u.nombre) === normal(nombre))) return { error: `Ya hay un usuario que se llama ${nombre}.` };
  if ((!id || pin) && !pinValido(pin)) return { error: 'El PIN tiene que tener de 4 a 6 números.' };
  let u = id ? d.usuarios.find((x) => x.id === id) : null;
  if (id && !u) return { error: 'El usuario ya no existe.' };
  if (u && u.rol === 'admin' && rol !== 'admin' && !d.usuarios.some((x) => x.id !== id && x.rol === 'admin')) {
    return { error: 'Tiene que quedar al menos un administrador.' };
  }
  if (!u) { u = crearUsuario(nombre, rol, pin); d.usuarios.push(u); return { usuario: u }; }
  u.nombre = nombre;
  u.rol = rol;
  if (pin) { u.sal = uid(); u.pin = hashPin(pin, u.sal); u.pinPorDefecto = false; }
  return { usuario: u };
}

function eliminarUsuario(d, id, idActual) {
  const u = d.usuarios.find((x) => x.id === id);
  if (!u) return 'El usuario ya no existe.';
  if (id === idActual) return 'No podés eliminar el usuario con el que estás adentro.';
  if (u.rol === 'admin' && !d.usuarios.some((x) => x.id !== id && x.rol === 'admin')) return 'Tiene que quedar al menos un administrador.';
  d.usuarios = d.usuarios.filter((x) => x.id !== id);
  return null;
}

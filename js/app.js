/* Stock Ferretería — control de stock y caja.
 * Todo funciona en el navegador; los datos se guardan en localStorage.
 */
'use strict';

const CLAVE = 'ferreteria-stock-v1';
const VISTAS = ['panel', 'caja', 'productos', 'movimientos', 'proveedores', 'reportes', 'desarrollador'];
const DIA = 864e5;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const red = (n) => Math.round(Number(n) * 1000) / 1000;
const red2 = (n) => Math.round(Number(n) * 100) / 100;
const dinero = new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 2 });
const numero = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 3 });
const $u = (n) => dinero.format(Number(n) || 0);
const n = (x) => numero.format(Number(x) || 0);
const fechaHora = (iso) => new Date(iso).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const hora = (iso) => new Date(iso).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' });
const isoLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inicioDia = (s) => new Date(s + 'T00:00:00').getTime();
const finDia = (s) => new Date(s + 'T23:59:59.999').getTime();
const normal = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let db;
let sesion = null; // usuario que ingresó

/* ---------- Licencia: código de activación ---------- */
// Los códigos los firma el desarrollador con su clave privada (generador de licencias).
// El programa solo tiene la clave pública: puede comprobar un código, pero no fabricarlo.
// Interruptor de la licencia. En false, el programa funciona sin código de activación y con todos
// los módulos (versión para pruebas). Para volver a pedir código, poner true y publicar una versión nueva.
// Las licencias ya cargadas quedan guardadas y vuelven a valer al reactivarla.
const LICENCIA_ACTIVADA = false;
const CLAVE_PUBLICA = {"kty": "EC", "crv": "P-256", "x": "7cCSPwXrL4DSrLqcs0waLuRLAKV04mmpys210lZlxC0", "y": "VgKNwTqhPGtuyuHnRDt_LA9EdzSjvHTxqKTMpc9wfq0"};
const PREFIJO_CODIGO = 'SF1';
const PERMANENTE = '9999-12-31';
const MODULOS = [
  { bit: 1, clave: 'caja', nombre: 'Caja y ventas' },
  { bit: 2, clave: 'usuarios', nombre: 'Usuarios y permisos' },
  { bit: 4, clave: 'reportes', nombre: 'Resumen y reportes' },
  { bit: 8, clave: 'masiva', nombre: 'Importar y actualizar precios' },
  { bit: 16, clave: 'impresion', nombre: 'Ticket y cierre impresos' },
];
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function aB64url(bytes) {
  let t = '';
  bytes.forEach((x) => { t += String.fromCharCode(x); });
  return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64url(t) {
  const s = t.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

/** Código corto de la computadora (8 letras y números) a partir de un hash. */
function idDesdeHex(hex) {
  let bits = BigInt('0x' + hex.slice(0, 10));
  let t = '';
  for (let i = 0; i < 8; i++) { t = BASE32[Number(bits & 31n)] + t; bits >>= 5n; }
  return t.slice(0, 4) + '-' + t.slice(4);
}
const normalizarId = (t) => String(t || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');

function sumarMeses(fecha, meses) {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + Number(meses), 1));
  const ultimo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, ultimo));
  return t.toISOString().slice(0, 10);
}
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DIA);
const fechaLarga = (iso) => (iso === PERMANENTE ? 'sin vencimiento'
  : new Date(iso + 'T12:00:00').toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' }));

function estadoLicencia(lic, hoy, aviso = 7) {
  if (!lic) return { estado: 'sin' };
  if (lic.h === PERMANENTE) return { estado: 'permanente' };
  const dias = diasEntre(hoy, lic.h);
  if (dias < 0) return { estado: 'vencida', dias };
  return { estado: dias < aviso ? 'por-vencer' : 'activa', dias };
}

/** Comprueba la firma, la computadora y la fecha de un código. No guarda nada. */
async function verificarCodigo(codigo, id, hoy, clave = CLAVE_PUBLICA) {
  const limpio = String(codigo || '').replace(/\s+/g, '');
  const partes = limpio.split('.');
  if (partes.length !== 3 || partes[0] !== PREFIJO_CODIGO) return { ok: false, motivo: 'formato' };
  let cuerpo, firma, datos;
  try {
    cuerpo = deB64url(partes[1]);
    firma = deB64url(partes[2]);
    datos = JSON.parse(new TextDecoder().decode(cuerpo));
  } catch (e) { return { ok: false, motivo: 'formato' }; }
  if (!datos || datos.v !== 1 || typeof datos.i !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(datos.h))) return { ok: false, motivo: 'formato' };
  const sutil = globalThis.crypto && globalThis.crypto.subtle;
  if (!sutil) return { ok: false, motivo: 'sin-cripto' };
  let valida = false;
  try {
    const k = await sutil.importKey('jwk', clave, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    valida = await sutil.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, firma, cuerpo);
  } catch (e) { valida = false; }
  if (!valida) return { ok: false, motivo: 'firma' };
  const lic = { i: datos.i, h: datos.h, m: Number(datos.m) || 0, f: datos.f || '', c: datos.c || '', codigo: limpio };
  if (normalizarId(lic.i) !== normalizarId(id)) return { ok: false, motivo: 'equipo', lic };
  if (estadoLicencia(lic, hoy).estado === 'vencida') return { ok: false, motivo: 'vencido', lic };
  return { ok: true, lic };
}

function mensajeMotivo(r) {
  return ({
    formato: 'El código está incompleto o tiene un error. Copialo de nuevo, entero.',
    firma: 'Ese código no es válido.',
    equipo: `Ese código es para otra computadora (${r.lic ? r.lic.i : ''}). Esta computadora es ${idEquipo()}.`,
    vencido: `Ese código ya venció el ${r.lic ? fechaLarga(r.lic.h) : ''}.`,
    'sin-cripto': 'Esta computadora no puede comprobar el código. Probá con la versión instalada del programa.',
  })[r.motivo] || 'No se pudo activar.';
}

let licenciaActual = null;
const modoDemo = () => !LICENCIA_ACTIVADA || (typeof window !== 'undefined' && !!window.MODO_DEMO);
function tieneModulo(clave) {
  if (modoDemo()) return true;
  const m = MODULOS.find((x) => x.clave === clave);
  return !!licenciaActual && !!m && (licenciaActual.m & m.bit) !== 0;
}

let idEquipoCache = '';
function idEquipo() {
  if (idEquipoCache) return idEquipoCache;
  let hex = '';
  if (escritorio() && window.almacen.idEquipo) { try { hex = window.almacen.idEquipo() || ''; } catch (e) { hex = ''; } }
  if (!hex) {
    try { hex = localStorage.getItem('ferreteria-equipo') || ''; } catch (e) { hex = ''; }
    if (!hex) hex = db.equipoNavegador || '';
    if (!hex) {
      hex = sha256(uid() + Date.now());
      try { localStorage.setItem('ferreteria-equipo', hex); } catch (e) { /* sin almacenamiento */ }
      db.equipoNavegador = hex;
      guardar();
    }
  }
  idEquipoCache = idDesdeHex(hex);
  return idEquipoCache;
}

const diasAviso = () => Number((db.desarrollador || {}).diasAviso) || 7;

/** Revisa la licencia guardada y que la fecha de la computadora no se haya atrasado. */
async function comprobarLicencia() {
  if (modoDemo()) { licenciaActual = { m: 31, h: PERMANENTE }; return { ok: true }; }
  const hoy = isoLocal();
  if (db.licUltimaFecha && diasEntre(hoy, db.licUltimaFecha) > 1) return { ok: false, motivo: 'reloj', ultima: db.licUltimaFecha };
  if (!db.licUltimaFecha || hoy > db.licUltimaFecha) { db.licUltimaFecha = hoy; guardar(); }
  if (!db.licencia || !db.licencia.codigo) { licenciaActual = null; return { ok: false, motivo: 'sin' }; }
  const r = await verificarCodigo(db.licencia.codigo, idEquipo(), hoy);
  licenciaActual = r.ok ? r.lic : null;
  return r;
}

async function activarCodigo(codigo) {
  const r = await verificarCodigo(codigo, idEquipo(), isoLocal());
  if (!r.ok) return { error: mensajeMotivo(r) };
  db.licencia = { codigo: r.lic.codigo, activada: new Date().toISOString() };
  licenciaActual = r.lic;
  guardar();
  return { lic: r.lic };
}

function aplicarModulos() {
  MODULOS.forEach((m) => document.body.classList.toggle('sin-' + m.clave, !tieneModulo(m.clave)));
}
const vistaInicio = () => (tieneModulo('caja') ? 'caja' : 'productos');

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
const verificarPin = (u, pin) => !!u && hashPin(String(pin), u.sal) === u.pin;

function crearUsuario(nombre, rol, pin, porDefecto = false) {
  const sal = uid();
  return { id: uid(), nombre, rol, sal, pin: hashPin(pin, sal), pinPorDefecto: porDefecto };
}

/** La primera vez crea «Administrador» (PIN 1234) y «Empleado» (PIN 0000). Siempre deja al menos un administrador. */
function asegurarUsuarios(d) {
  if (!Array.isArray(d.usuarios) || !d.usuarios.length) {
    d.usuarios = [crearUsuario('Administrador', 'admin', '1234', true), crearUsuario('Empleado', 'empleado', '0000', true)];
    return true;
  }
  if (!d.usuarios.some((u) => u.rol === 'admin')) {
    d.usuarios.unshift(crearUsuario('Administrador', 'admin', '1234', true));
    return true;
  }
  return false;
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

/* ---------- Datos ---------- */

function baseVacia() {
  return { productos: [], proveedores: [], movimientos: [], ventas: [], numVenta: 0, ejemplo: false, negocio: { nombre: '', direccion: '', telefono: '', rut: '', pie: '' } };
}

// En la versión de escritorio (Electron) existe window.almacen y los datos van a un archivo.
// En el navegador se usa localStorage.
const escritorio = () => typeof window !== 'undefined' && window.almacen && window.almacen.escritorio;

/* ---------- Guardado ----------
 * En la versión de escritorio los datos van a una base SQLite. Para que una venta tarde lo mismo
 * con un día o con años de historia, solo se manda lo que cambió desde el último guardado:
 * productos, proveedores y usuarios se comparan fila por fila; ventas y movimientos solo se agregan
 * (de una venta solo puede cambiar si está anulada).
 */
const TABLAS = ['productos', 'proveedores', 'usuarios', 'ventas', 'movimientos'];
const TABLAS_COMPARADAS = ['productos', 'proveedores', 'usuarios'];
const filasDe = (d, t) => (Array.isArray(d[t]) ? d[t] : []);

function configDe(d) {
  const config = {};
  for (const [k, v] of Object.entries(d)) if (!TABLAS.includes(k)) config[k] = v;
  return JSON.stringify(config);
}

/** Lo que hay guardado en el disco, para comparar en el próximo guardado. */
function fotoDe(d) {
  const foto = { config: configDe(d), ventas: new Map(), movimientos: new Set() };
  TABLAS_COMPARADAS.forEach((t) => { foto[t] = new Map(filasDe(d, t).map((x) => [x.id, JSON.stringify(x)])); });
  filasDe(d, 'ventas').forEach((v) => foto.ventas.set(v.id, !!v.anulada));
  filasDe(d, 'movimientos').forEach((m) => foto.movimientos.add(m.id));
  return foto;
}

/**
 * Calcula qué hay que escribir. Devuelve null si no cambió nada, o { cambios, confirmar }:
 * `cambios` va a la base y `confirmar()` actualiza la foto cuando se guardó bien.
 */
function calcularCambios(foto, d, completo = false) {
  const filaFecha = (x) => ({ id: x.id, fecha: x.fecha || '', datos: JSON.stringify(x) });
  if (!foto || completo || filasDe(d, 'ventas').length < foto.ventas.size || filasDe(d, 'movimientos').length < foto.movimientos.size) {
    const upsert = {};
    TABLAS_COMPARADAS.forEach((t) => { upsert[t] = filasDe(d, t).map((x) => ({ id: x.id, datos: JSON.stringify(x) })); });
    upsert.ventas = filasDe(d, 'ventas').map(filaFecha);
    upsert.movimientos = filasDe(d, 'movimientos').map(filaFecha);
    return { cambios: { completo: true, config: configDe(d), upsert }, confirmar: () => fotoDe(d) };
  }
  const cambios = { upsert: {}, borrar: {} };
  const tras = [];
  let hay = false;
  for (const t of TABLAS_COMPARADAS) {
    const vistos = new Set();
    const filas = [];
    for (const x of filasDe(d, t)) {
      vistos.add(x.id);
      const j = JSON.stringify(x);
      if (foto[t].get(x.id) !== j) filas.push({ id: x.id, datos: j });
    }
    const borrados = [...foto[t].keys()].filter((id) => !vistos.has(id));
    if (filas.length) { cambios.upsert[t] = filas; hay = true; tras.push(() => filas.forEach((f) => foto[t].set(f.id, f.datos))); }
    if (borrados.length) { cambios.borrar[t] = borrados; hay = true; tras.push(() => borrados.forEach((id) => foto[t].delete(id))); }
  }
  const ventas = filasDe(d, 'ventas').filter((v) => foto.ventas.get(v.id) !== !!v.anulada);
  if (ventas.length) { cambios.upsert.ventas = ventas.map(filaFecha); hay = true; tras.push(() => ventas.forEach((v) => foto.ventas.set(v.id, !!v.anulada))); }
  const movs = filasDe(d, 'movimientos').filter((m) => !foto.movimientos.has(m.id));
  if (movs.length) { cambios.upsert.movimientos = movs.map(filaFecha); hay = true; tras.push(() => movs.forEach((m) => foto.movimientos.add(m.id))); }
  const config = configDe(d);
  if (config !== foto.config) { cambios.config = config; hay = true; tras.push(() => { foto.config = config; }); }
  if (!hay) return null;
  return { cambios, confirmar: () => { tras.forEach((f) => f()); return foto; } };
}

let fotoGuardada = null;
const guardaEnBase = () => escritorio() && typeof window.almacen.cambios === 'function';

function cargar() {
  try {
    const raw = escritorio() ? window.almacen.leer() : localStorage.getItem(CLAVE);
    if (raw) {
      db = Object.assign(baseVacia(), JSON.parse(raw));
      fotoGuardada = guardaEnBase() ? fotoDe(db) : null;
      if (asegurarUsuarios(db)) guardar();
      return;
    }
  } catch (e) { /* sin almacenamiento: se usa el ejemplo en memoria */ }
  db = semilla();
  fotoGuardada = null;
  asegurarUsuarios(db);
  guardar();
}

let avisoErrorGuardado = false;
function guardar(opc = {}) {
  try {
    if (guardaEnBase()) {
      const r = calcularCambios(fotoGuardada, db, !!opc.completo);
      if (r) {
        const err = window.almacen.cambios(r.cambios);
        if (err) throw new Error(err);
        fotoGuardada = r.confirmar();
      }
    } else {
      localStorage.setItem(CLAVE, JSON.stringify(db));
    }
    avisoErrorGuardado = false;
  } catch (e) {
    if (!avisoErrorGuardado && typeof toast === 'function') {
      avisoErrorGuardado = true;
      toast('No se pudieron guardar los cambios. Descargá una copia de seguridad.');
    }
  }
}

const producto = (id) => db.productos.find((p) => p.id === id);
const proveedor = (id) => db.proveedores.find((p) => p.id === id);
const nombreProv = (id) => (proveedor(id) || {}).nombre || '';

function estado(p) {
  if (p.stock <= 0) return 'sin';
  if (p.stock <= p.minimo) return 'bajo';
  return 'ok';
}
function chipEstado(p) {
  const e = estado(p);
  if (e === 'sin') return '<span class="chip danger">Sin stock</span>';
  if (e === 'bajo') return '<span class="chip warn">Bajo mínimo</span>';
  return '<span class="chip ok">En stock</span>';
}

/**
 * Registra un movimiento y actualiza el stock.
 * tipo: 'entrada' | 'salida' | 'ajuste'. En ajuste, cantidad es el stock contado.
 * Devuelve un texto de error o null si salió bien.
 */
function registrar(d, m) {
  const p = d.productos.find((x) => x.id === m.productoId);
  if (!p) return 'Elegí un producto.';
  const q = Number(m.cantidad);
  if (!Number.isFinite(q) || q < 0 || (m.tipo !== 'ajuste' && q === 0)) return 'Ingresá una cantidad mayor a cero.';
  const antes = p.stock;
  let delta;
  if (m.tipo === 'entrada') {
    delta = q;
    if (Number(m.costoUnit) > 0) p.costo = Number(m.costoUnit);
  } else if (m.tipo === 'salida') {
    if (q > p.stock + 1e-9) return `No alcanza el stock de ${p.nombre}: hay ${n(p.stock)} ${p.unidad}.`;
    delta = -q;
  } else if (m.tipo === 'ajuste') {
    delta = q - p.stock;
  } else {
    return 'Tipo de movimiento desconocido.';
  }
  p.stock = red(antes + delta);
  d.movimientos.push({
    id: uid(),
    fecha: m.fecha || new Date().toISOString(),
    tipo: m.tipo,
    productoId: p.id,
    codigo: p.codigo,
    producto: p.nombre,
    unidad: p.unidad,
    cantidad: red(delta),
    costoUnit: m.tipo === 'entrada' ? (Number(m.costoUnit) || p.costo) : p.costo,
    precioUnit: m.precioUnit ?? p.precio,
    proveedorId: m.proveedorId || '',
    nota: m.nota || '',
    ventaId: m.ventaId || '',
    usuario: m.usuario || (sesion ? sesion.nombre : ''),
    stockAntes: antes,
    stockDespues: p.stock,
  });
  return null;
}

/** Cobra un ticket: valida stock, descuenta cada línea y guarda la venta. */
function cobrar(d, items, medio, recibido, cliente, fecha, descuentoPct = 0) {
  if (!items.length) return { error: 'El ticket está vacío.' };
  // Validar todo antes de tocar el stock
  const porProducto = {};
  for (const it of items) porProducto[it.productoId] = (porProducto[it.productoId] || 0) + Number(it.cantidad);
  for (const [id, q] of Object.entries(porProducto)) {
    const p = d.productos.find((x) => x.id === id);
    if (!p) return { error: 'Un producto del ticket ya no existe.' };
    if (!(q > 0)) return { error: `Revisá la cantidad de ${p.nombre}.` };
    if (q > p.stock + 1e-9) return { error: `No alcanza el stock de ${p.nombre}: hay ${n(p.stock)} ${p.unidad}.` };
  }
  const pct = Number(descuentoPct) || 0;
  if (pct < 0 || pct > 100) return { error: 'El descuento tiene que estar entre 0 y 100.' };
  const subtotal = red2(items.reduce((s, it) => s + it.cantidad * it.precio, 0));
  const descuento = red2(subtotal * pct / 100);
  const total = red2(subtotal - descuento);
  if (medio === 'Efectivo' && recibido !== '' && recibido != null && Number(recibido) < total) {
    return { error: `El efectivo recibido no alcanza: faltan ${$u(total - Number(recibido))}.` };
  }
  d.numVenta = (d.numVenta || 0) + 1;
  const venta = {
    id: uid(),
    numero: d.numVenta,
    fecha: fecha || new Date().toISOString(),
    items: items.map((it) => {
      const p = d.productos.find((x) => x.id === it.productoId);
      return { productoId: p.id, codigo: p.codigo, nombre: p.nombre, unidad: p.unidad, cantidad: red(it.cantidad), precio: it.precio, costo: p.costo, subtotal: red(it.cantidad * it.precio) };
    }),
    subtotal,
    descuentoPct: pct,
    descuento,
    total,
    medio,
    recibido: medio === 'Efectivo' && recibido !== '' && recibido != null ? Number(recibido) : null,
    vuelto: medio === 'Efectivo' && recibido !== '' && recibido != null ? red(Number(recibido) - total) : null,
    cliente: cliente || '',
    usuario: sesion ? sesion.nombre : '',
    anulada: false,
  };
  for (const it of venta.items) {
    registrar(d, { tipo: 'salida', productoId: it.productoId, cantidad: it.cantidad, precioUnit: it.precio, nota: `Venta N.º ${venta.numero}`, ventaId: venta.id, fecha: venta.fecha });
  }
  d.ventas.push(venta);
  return { venta };
}

function anularVenta(d, ventaId) {
  const v = d.ventas.find((x) => x.id === ventaId);
  if (!v || v.anulada) return 'La venta no existe o ya está anulada.';
  for (const it of v.items) {
    if (d.productos.some((p) => p.id === it.productoId)) {
      registrar(d, { tipo: 'entrada', productoId: it.productoId, cantidad: it.cantidad, costoUnit: 0, nota: `Anulación venta N.º ${v.numero}`, ventaId: v.id });
    }
  }
  v.anulada = true;
  v.anuladaEl = new Date().toISOString();
  return null;
}


/* ---------- Actualizar precios por porcentaje ---------- */

function productosDeFiltro(d, filtro) {
  if (!filtro) return d.productos;
  const tipo = filtro[0], valor = filtro.slice(2);
  return d.productos.filter((p) => (tipo === 'c' ? (p.categoria || '') === valor : p.proveedorId === valor));
}

function redondearPrecio(x, paso) {
  if (!(x > 0)) return 0;
  return paso > 0 ? Math.max(paso, Math.round(x / paso) * paso) : red2(x);
}

/** Sube o baja precios. op: { redondeo: 0|1|5|10, costo: true para cambiar también el costo }. */
function actualizarPrecios(d, filtro, pct, op = {}) {
  const f = 1 + Number(pct) / 100;
  if (!Number.isFinite(f) || Number(pct) === 0) return { error: 'Escribí un porcentaje, por ejemplo 10.' };
  if (f <= 0) return { error: 'No se puede bajar un 100 % o más.' };
  const lista = productosDeFiltro(d, filtro);
  if (!lista.length) return { error: 'No hay productos en ese grupo.' };
  lista.forEach((p) => {
    p.precio = redondearPrecio(p.precio * f, op.redondeo || 0);
    if (op.costo) p.costo = red2(p.costo * f);
  });
  return { cantidad: lista.length };
}

/* ---------- Importar productos desde una planilla ---------- */

const COLUMNAS = {
  codigo: ['codigo', 'cod', 'codigo de barras', 'sku', 'code'],
  nombre: ['producto', 'nombre', 'descripcion', 'articulo', 'detalle'],
  categoria: ['categoria', 'rubro', 'familia'],
  unidad: ['unidad', 'um', 'unidad de medida'],
  proveedor: ['proveedor'],
  ubicacion: ['ubicacion', 'estante', 'lugar'],
  stock: ['stock', 'cantidad', 'existencia', 'existencias'],
  minimo: ['stock minimo', 'minimo', 'stock min', 'min'],
  costo: ['costo', 'precio de costo', 'costo unitario', 'precio costo'],
  precio: ['precio', 'precio de venta', 'precio venta', 'pvp', 'venta'],
};
const UNIDADES = ['unidad', 'kg', 'm', 'litro', 'caja', 'paquete', 'rollo', 'par'];
const ALIAS_UNIDAD = { u: 'unidad', un: 'unidad', und: 'unidad', unid: 'unidad', unidades: 'unidad', kilo: 'kg', kilos: 'kg', kgs: 'kg', metro: 'm', metros: 'm', mt: 'm', mts: 'm', l: 'litro', lt: 'litro', lts: 'litro', litros: 'litro', cajas: 'caja', paq: 'paquete', paquetes: 'paquete', rollos: 'rollo', pares: 'par' };

const normCol = (k) => normal(k).replace(/[._:]/g, ' ').replace(/\s+/g, ' ').trim();
function normUnidad(u) {
  const x = normal(u).replace(/\./g, '').trim();
  if (UNIDADES.includes(x)) return x;
  return ALIAS_UNIDAD[x] || 'unidad';
}

/** Convierte "1.234,50", "$ 290" o 12.5 en número. Devuelve null si la celda está vacía o no es un número. */
function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(t)) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

/** Lee las filas de la planilla y arma qué se agregaría y qué se actualizaría, sin tocar los datos. */
function planImportacion(d, filas) {
  const plan = { nuevos: [], actualizados: [], salteadas: 0, columnas: [] };
  const mapa = {};
  const claves = new Set();
  filas.forEach((f) => Object.keys(f).forEach((k) => claves.add(k)));
  for (const k of claves) {
    const nk = normCol(k);
    for (const [campo, alias] of Object.entries(COLUMNAS)) if (!mapa[campo] && alias.includes(nk)) mapa[campo] = k;
  }
  plan.columnas = Object.values(mapa);
  if (!mapa.nombre) {
    plan.error = 'No encontré la columna «Producto». La primera fila de la planilla tiene que tener los títulos de las columnas.';
    return plan;
  }
  const porCodigo = new Map(d.productos.map((p) => [p.codigo, p]));
  const porNombre = new Map(d.productos.map((p) => [normal(p.nombre), p]));
  const vistos = new Set();
  let sec = 0;
  const codigoNuevo = () => { let c; do { sec++; c = 'P-' + String(sec).padStart(4, '0'); } while (porCodigo.has(c) || vistos.has(c)); return c; };
  for (const f of filas) {
    const txt = (c) => (mapa[c] ? String(f[mapa[c]] ?? '').trim() : '');
    const num = (c) => (mapa[c] ? parseNum(f[mapa[c]]) : null);
    const nombre = txt('nombre');
    if (!nombre) { plan.salteadas++; continue; }
    let codigo = txt('codigo').toUpperCase();
    const existente = codigo ? porCodigo.get(codigo) : porNombre.get(normal(nombre));
    const clave = existente ? existente.codigo : (codigo || 'n:' + normal(nombre));
    if (vistos.has(clave)) { plan.salteadas++; continue; }
    vistos.add(clave);
    const datos = {
      nombre, categoria: txt('categoria'), unidad: txt('unidad') ? normUnidad(txt('unidad')) : '', proveedor: txt('proveedor'),
      ubicacion: txt('ubicacion'), stock: num('stock'), minimo: num('minimo'), costo: num('costo'), precio: num('precio'),
    };
    if (existente) plan.actualizados.push({ id: existente.id, codigo: existente.codigo, datos });
    else {
      if (!codigo) { codigo = codigoNuevo(); vistos.add(codigo); }
      plan.nuevos.push({ codigo, datos });
    }
  }
  return plan;
}

function aplicarImportacion(d, plan) {
  const provId = (nombre) => {
    if (!nombre) return '';
    let v = d.proveedores.find((x) => normal(x.nombre) === normal(nombre));
    if (!v) { v = { id: uid(), nombre, contacto: '', telefono: '', email: '', rut: '', notas: '' }; d.proveedores.push(v); }
    return v.id;
  };
  const pos = (x) => (x != null && x >= 0 ? x : null);
  for (const nuevo of plan.nuevos) {
    const x = nuevo.datos;
    const p = {
      id: uid(), codigo: nuevo.codigo, nombre: x.nombre, categoria: x.categoria, unidad: x.unidad || 'unidad', proveedorId: provId(x.proveedor),
      ubicacion: x.ubicacion, costo: pos(x.costo) || 0, precio: pos(x.precio) || 0, minimo: pos(x.minimo) || 0, stock: 0,
    };
    d.productos.push(p);
    if (x.stock > 0) registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: x.stock, costoUnit: p.costo, proveedorId: p.proveedorId, nota: 'Stock inicial (importado)' });
  }
  for (const act of plan.actualizados) {
    const p = d.productos.find((q) => q.id === act.id);
    if (!p) continue;
    const x = act.datos;
    p.nombre = x.nombre;
    if (x.categoria) p.categoria = x.categoria;
    if (x.unidad) p.unidad = x.unidad;
    if (x.ubicacion) p.ubicacion = x.ubicacion;
    if (x.proveedor) p.proveedorId = provId(x.proveedor);
    if (pos(x.costo) != null) p.costo = x.costo;
    if (pos(x.precio) != null) p.precio = x.precio;
    if (pos(x.minimo) != null) p.minimo = x.minimo;
    if (pos(x.stock) != null && red(x.stock) !== p.stock) registrar(d, { tipo: 'ajuste', productoId: p.id, cantidad: x.stock, nota: 'Corrección por importación' });
  }
  return { nuevos: plan.nuevos.length, actualizados: plan.actualizados.length };
}

/* ---------- Datos de ejemplo ---------- */

function semilla() {
  const d = baseVacia();
  d.ejemplo = true;
  const prov = [
    ['Distribuidora Ejemplo Sur', 'Martín Pérez', '099 123 456', 'ventas@ejemplo-sur.com.uy', '210000000011', 'Entrega martes y viernes'],
    ['Pinturas Ejemplo S.A.', 'Laura Gómez', '098 765 432', 'pedidos@ejemplo-pinturas.com.uy', '210000000022', ''],
    ['Herramientas Ejemplo Ltda.', 'Diego Rodríguez', '2900 1234', 'contacto@ejemplo-herr.com.uy', '210000000033', 'Pedido mínimo $ 5.000'],
    ['Sanitaria Ejemplo', 'Ana Fernández', '097 111 222', 'info@ejemplo-sanitaria.com.uy', '210000000044', ''],
  ].map(([nombre, contacto, telefono, email, rut, notas]) => ({ id: uid(), nombre, contacto, telefono, email, rut, notas }));
  d.proveedores = prov;

  // código, nombre, categoría, unidad, proveedor, costo, precio, mínimo, ubicación, stock inicial, salidas
  const lista = [
    ['7790001000101', 'Tornillo autoperforante 8 x 1" (caja x100)', 'Tornillería', 'caja', 0, 180, 290, 10, 'A-01', 30, [6, 5, 4]],
    ['CLA-2000', 'Clavo punta París 2"', 'Tornillería', 'kg', 0, 95, 160, 15, 'A-02', 40, [8, 6]],
    ['TAR-0008', 'Tarugo nylon 8 mm (bolsa x50)', 'Tornillería', 'paquete', 0, 70, 120, 12, 'A-03', 25, [5, 6, 4, 2]],
    ['PIN-LAT4', 'Pintura látex interior blanco 4 L', 'Pinturería', 'unidad', 1, 890, 1390, 6, 'B-01', 18, [3, 4, 2]],
    ['PIN-ESM1', 'Esmalte sintético negro 1 L', 'Pinturería', 'unidad', 1, 410, 650, 5, 'B-02', 8, [2, 2, 2, 2]],
    ['PIN-ROD22', 'Rodillo lana 22 cm', 'Pinturería', 'unidad', 1, 160, 260, 8, 'B-03', 12, [3, 2]],
    ['ADH-SIL280', 'Silicona acética transparente 280 ml', 'Adhesivos', 'unidad', 1, 140, 240, 10, 'B-04', 14, [3, 2]],
    ['HER-TAL13', 'Taladro percutor 13 mm 650 W', 'Herramientas', 'unidad', 2, 2350, 3490, 2, 'C-01', 5, [1, 1]],
    ['HER-MAR16', 'Martillo carpintero 16 oz', 'Herramientas', 'unidad', 2, 390, 620, 4, 'C-02', 10, [2, 1, 1]],
    ['HER-CIN5', 'Cinta métrica 5 m', 'Herramientas', 'unidad', 2, 190, 320, 6, 'C-03', 9, [2]],
    ['SAN-PVC110', 'Caño PVC 110 mm x 3 m', 'Sanitaria', 'unidad', 3, 620, 940, 8, 'D-01', 20, [4, 3]],
    ['SAN-COD110', 'Codo PVC 110 mm a 90°', 'Sanitaria', 'unidad', 3, 85, 140, 20, 'D-02', 50, [10, 8]],
    ['SAN-TEF34', 'Cinta teflón 3/4"', 'Sanitaria', 'rollo', 3, 25, 50, 30, 'D-03', 60, [15, 10]],
    ['ELE-CAI19', 'Cinta aisladora 19 mm x 20 m', 'Electricidad', 'rollo', 0, 45, 85, 20, 'E-01', 40, [8, 7]],
    ['ELE-CAB25', 'Cable unipolar 2,5 mm²', 'Electricidad', 'm', 0, 28, 48, 100, 'E-02', 300, [60, 50]],
    ['CON-POR25', 'Cemento portland 25 kg', 'Construcción', 'unidad', 0, 390, 560, 10, 'Patio', 25, [6, 5, 4, 3]],
  ];
  const ahora = Date.now();
  lista.forEach(([codigo, nombre, categoria, unidad, pi, costo, precio, minimo, ubicacion, inicial, salidas], idx) => {
    const p = { id: uid(), codigo, nombre, categoria, unidad, proveedorId: prov[pi].id, costo, precio, stock: 0, minimo, ubicacion };
    d.productos.push(p);
    registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: inicial, costoUnit: costo, proveedorId: prov[pi].id, nota: 'Stock inicial', fecha: new Date(ahora - 24 * DIA).toISOString() });
    salidas.forEach((q, i) => {
      const f = ahora - (19 - i * 5) * DIA - ((idx * 7 + i * 3) % 9) * 36e5;
      registrar(d, { tipo: 'salida', productoId: p.id, cantidad: q, nota: 'Venta mostrador', fecha: new Date(f).toISOString() });
    });
  });
  // Ventas de hoy por la caja
  const cod = (c) => d.productos.find((p) => p.codigo === c);
  const item = (c, q) => ({ productoId: cod(c).id, cantidad: q, precio: cod(c).precio });
  const hoy0 = new Date(); hoy0.setHours(9, 0, 0, 0);
  const hace = (min) => new Date(Math.min(Date.now() - 60000, hoy0.getTime() + min * 60000)).toISOString();
  cobrar(d, [item('7790001000101', 2), item('ELE-CAI19', 1)], 'Efectivo', 1000, '', hace(25));
  cobrar(d, [item('SAN-PVC110', 2), item('SAN-COD110', 4)], 'Débito', '', 'Obra calle Rivera', hace(110));
  cobrar(d, [item('ELE-CAB25', 10), item('HER-MAR16', 1)], 'Transferencia', '', '', hace(190));
  d.movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  d.ventas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return d;
}

/* ---------- Interfaz general ---------- */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

function confirmar(texto, okTexto = 'Confirmar', peligro = false) {
  return new Promise((res) => {
    const d = $('#dlg-conf');
    $('#conf-texto').textContent = texto;
    $('#conf-ok').textContent = okTexto;
    $('#conf-ok').className = 'btn ' + (peligro ? 'rojo' : 'primary');
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; d.close(); res(v); };
    $('#conf-ok').onclick = () => fin(true);
    $('#conf-cancel').onclick = () => fin(false);
    d.oncancel = () => fin(false);
    d.showModal();
  });
}

const VISTAS_ADMIN = ['panel', 'reportes', 'desarrollador'];
const esAdmin = () => !!sesion && sesion.rol === 'admin';

function vistaActual() {
  const h = location.hash.slice(1);
  const inicio = vistaInicio();
  if (!VISTAS.includes(h)) return inicio;
  if (VISTAS_ADMIN.includes(h) && !esAdmin()) return inicio;
  if ((h === 'caja' && !tieneModulo('caja')) || (h === 'panel' && !tieneModulo('reportes'))) return inicio;
  return h;
}

function mostrarVista() {
  if (!sesion) return;
  const v = vistaActual();
  if (location.hash && location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  $$('.vista').forEach((s) => { s.hidden = s.id !== 'v-' + v; });
  $$('.nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false'));
  render();
  if (v === 'caja') setTimeout(() => $('#caja-buscar').focus(), 0);
}

function render() {
  if (!sesion) return;
  $('#banner-ejemplo').hidden = !db.ejemplo;
  $('#banner-pin').hidden = !(esAdmin() && db.usuarios.some((u) => u.pinPorDefecto));
  const est = licenciaActual && !modoDemo() ? estadoLicencia(licenciaActual, isoLocal(), diasAviso()) : null;
  $('#banner-licencia').hidden = !(esAdmin() && est && est.estado === 'por-vencer');
  if (!$('#banner-licencia').hidden) {
    const cuando = est.dias === 0 ? '<strong>hoy</strong>' : est.dias === 1 ? '<strong>mañana</strong>' : `en <strong>${est.dias} días</strong>`;
    $('#banner-licencia-texto').innerHTML = `La licencia del programa vence ${cuando} (${fechaLarga(licenciaActual.h)}). Para renovarla, comunicate con ${contactoCorto()}.`;
  }
  $('#marca-nombre').textContent = (db.negocio && db.negocio.nombre) || 'Stock Ferretería';
  const bajos = db.productos.filter((p) => estado(p) !== 'ok').length;
  const b = $('#badge-bajo');
  b.hidden = !bajos;
  b.textContent = bajos;
  b.title = `${bajos} productos para reponer`;
  // Solo se dibuja la pantalla que se está viendo
  ({ panel: renderPanel, caja: renderCaja, productos: renderProductos, movimientos: renderMovimientos, proveedores: renderProveedores, reportes: renderReportes, desarrollador: renderDesarrollador })[vistaActual()]();
}

function opcionesProv(sel, vacio = 'Sin proveedor') {
  const ord = [...db.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `<option value="">${esc(vacio)}</option>` + ord.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('');
}

function ventasDelDia(fechaStr = isoLocal()) {
  const a = inicioDia(fechaStr), b = finDia(fechaStr);
  return db.ventas.filter((v) => { const t = Date.parse(v.fecha); return t >= a && t <= b; });
}

/* ---------- Panel ---------- */

function renderPanel() {
  const valorCosto = db.productos.reduce((s, p) => s + Math.max(p.stock, 0) * p.costo, 0);
  const valorVenta = db.productos.reduce((s, p) => s + Math.max(p.stock, 0) * p.precio, 0);
  const bajos = db.productos.filter((p) => estado(p) !== 'ok');
  const sin = bajos.filter((p) => estado(p) === 'sin').length;
  const hoy = ventasDelDia().filter((v) => !v.anulada);
  const totalHoy = hoy.reduce((s, v) => s + v.total, 0);

  $('#kpis').innerHTML = `
    <div class="kpi"><span class="lbl">Vendido hoy</span><span class="val">${$u(totalHoy)}</span><span class="det">${hoy.length} ${hoy.length === 1 ? 'venta' : 'ventas'}</span></div>
    <div class="kpi"><span class="lbl">Productos</span><span class="val">${db.productos.length}</span><span class="det">${new Set(db.productos.map((p) => p.categoria).filter(Boolean)).size} categorías</span></div>
    <div class="kpi"><span class="lbl">Inventario a costo</span><span class="val">${$u(valorCosto)}</span><span class="det">A precio de venta: ${$u(valorVenta)}</span></div>
    <div class="kpi ${bajos.length ? 'alerta' : ''}"><span class="lbl">Para reponer</span><span class="val">${bajos.length}</span><span class="det">${sin} sin stock</span></div>`;

  const rep = bajos.sort((a, b) => (a.stock / (a.minimo || 1)) - (b.stock / (b.minimo || 1))).slice(0, 7);
  $('#panel-reponer').innerHTML = rep.length
    ? `<ul class="lista">${rep.map((p) => `
        <li>
          <div class="izq"><div class="nom">${esc(p.nombre)}</div>
          <div class="meta">${n(p.stock)} de mín. ${n(p.minimo)} ${esc(p.unidad)} · ${esc(nombreProv(p.proveedorId) || 'Sin proveedor')}</div></div>
          <button class="btn sm verde-suave" type="button" data-accion="entrada" data-id="${p.id}">+ Sumar stock</button>
        </li>`).join('')}</ul>`
    : '<p class="vacio">Todo el stock está por encima del mínimo.</p>';

  const ult = [...db.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 7);
  $('#panel-movs').innerHTML = ult.length
    ? `<ul class="lista">${ult.map((m) => `
        <li>
          <div class="izq"><div class="nom">${esc(m.producto)}</div><div class="meta">${fechaHora(m.fecha)} · ${esc(m.nota || etiquetaTipo(m))}</div></div>
          <span class="num ${m.cantidad >= 0 ? 'mas' : 'menos'}">${m.cantidad >= 0 ? '+' : '−'}${n(Math.abs(m.cantidad))} ${esc(m.unidad)}</span>
        </li>`).join('')}</ul>`
    : '<p class="vacio">Todavía no hay movimientos.</p>';
}

/* ---------- Caja ---------- */

let ticket = []; // { productoId, cantidad, precio }

function medioActual() { return ($('input[name="medio"]:checked') || {}).value || 'Efectivo'; }
function descuentoActual() { const x = Number($('#caja-desc').value); return x > 0 && x <= 100 ? x : 0; }
function subtotalTicket() { return red2(ticket.reduce((s, it) => s + it.cantidad * it.precio, 0)); }
function totalTicket() { const s = subtotalTicket(); return red2(s - red2(s * descuentoActual() / 100)); }

function agregarAlTicket(id, cant = 1) {
  const p = producto(id);
  if (!p) return;
  const linea = ticket.find((it) => it.productoId === id);
  const enTicket = linea ? linea.cantidad : 0;
  if (enTicket + cant > p.stock + 1e-9) {
    toast(`No hay más stock de ${p.nombre} (quedan ${n(p.stock)} ${p.unidad}).`);
    return;
  }
  if (linea) linea.cantidad = red(linea.cantidad + cant);
  else ticket.push({ productoId: id, cantidad: cant, precio: p.precio });
  $('#caja-err').textContent = '';
  renderTicket();
}

function renderCaja() {
  $('#ticket-num').textContent = `N.º ${String((db.numVenta || 0) + 1).padStart(4, '0')}`;
  renderFiltrosCaja();
  renderResultados();
  renderTicket();
  renderVentasHoy();
}

/* Filtros de la lista de productos al vender */
const SIN_CATEGORIA = 'Sin categoría';
const PASO_LISTA = 24;
let cajaCat = '';
let cajaLimite = PASO_LISTA;

function renderFiltrosCaja() {
  const cuenta = {};
  db.productos.forEach((p) => { const c = p.categoria || SIN_CATEGORIA; cuenta[c] = (cuenta[c] || 0) + 1; });
  const cats = Object.keys(cuenta).sort((a, b) => (a === SIN_CATEGORIA) - (b === SIN_CATEGORIA) || a.localeCompare(b));
  if (cajaCat && !cuenta[cajaCat]) cajaCat = '';
  $('#caja-cat').innerHTML = '<option value="">Todas las categorías</option>'
    + cats.map((c) => `<option value="${esc(c)}"${c === cajaCat ? ' selected' : ''}>${esc(c)} (${cuenta[c]})</option>`).join('');
  $('#caja-filtros').hidden = !db.productos.length;
  const sel = $('#caja-prov');
  const actual = sel.value;
  sel.innerHTML = opcionesProv(actual, 'Todos los proveedores');
  if (actual && !proveedor(actual)) sel.value = '';
}

function hayFiltrosCaja() { return !!(cajaCat || $('#caja-prov').value || $('#caja-constock').checked); }

function quitarFiltrosCaja() {
  cajaCat = '';
  $('#caja-prov').value = '';
  $('#caja-constock').checked = false;
  cajaLimite = PASO_LISTA;
  renderFiltrosCaja();
  renderResultados();
}

function renderResultados() {
  const texto = $('#caja-buscar').value.trim();
  const q = normal(texto);
  const prov = $('#caja-prov').value;
  const conStock = $('#caja-constock').checked;
  const orden = $('#caja-orden').value;
  const provs = new Map(db.proveedores.map((v) => [v.id, v.nombre]));
  let lista = db.productos.filter((p) => (!cajaCat || (p.categoria || SIN_CATEGORIA) === cajaCat)
    && (!prov || p.proveedorId === prov)
    && (!conStock || p.stock > 0)
    && (!q || normal(`${p.codigo} ${p.nombre} ${p.categoria} ${provs.get(p.proveedorId) || ''} ${p.ubicacion}`).includes(q)));

  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre);
  if (orden === 'vendidos') {
    const veces = {};
    db.ventas.forEach((v) => { if (!v.anulada) v.items.forEach((it) => { veces[it.productoId] = (veces[it.productoId] || 0) + 1; }); });
    lista.sort((a, b) => (veces[b.id] || 0) - (veces[a.id] || 0) || porNombre(a, b));
  } else if (orden === 'precio-asc') lista.sort((a, b) => a.precio - b.precio || porNombre(a, b));
  else if (orden === 'precio-desc') lista.sort((a, b) => b.precio - a.precio || porNombre(a, b));
  else lista.sort(porNombre);

  const total = lista.length;
  const filtros = hayFiltrosCaja();
  $('#caja-limpiar').hidden = !filtros;
  $('#caja-cuenta').textContent = db.productos.length && (q || filtros) ? `${total} ${total === 1 ? 'producto' : 'productos'}` : '';
  lista = lista.slice(0, cajaLimite);
  $('#caja-resultados').innerHTML = lista.length
    ? lista.map((p) => `
      <button class="prod-btn" type="button" data-agregar="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
        <span class="nom">${esc(p.nombre)}</span>
        <span class="fila"><span class="mono">${esc(p.codigo)}</span><span>${p.stock <= 0 ? 'Sin stock' : `Stock ${n(p.stock)} ${esc(p.unidad)}`}</span></span>
        <span class="precio">${$u(p.precio)}</span>
      </button>`).join('') + (total > lista.length ? `<button class="btn ver-mas" type="button" data-ver-mas>Ver más productos (faltan ${total - lista.length})</button>` : '')
    : `<div class="vacio sin-resultado">
        <p>${q ? `No encontré ningún producto con «${esc(texto)}»${filtros ? ' con esos filtros' : ''}.` : (filtros ? 'No hay productos con esos filtros.' : 'Todavía no hay productos cargados.')}</p>
        ${filtros ? '<button class="btn" type="button" data-quitar-filtros>Quitar filtros</button>' : ''}
        ${q || !filtros ? '<button class="btn verde" type="button" data-alta>Agregar como producto nuevo</button>' : ''}
      </div>`;
}

function renderTicket() {
  ticket = ticket.filter((it) => producto(it.productoId));
  $('#ticket-items').innerHTML = ticket.length
    ? ticket.map((it, i) => {
      const p = producto(it.productoId);
      return `<div class="ticket-linea">
        <span class="nom">${esc(p.nombre)}</span>
        <span class="sub-t">${$u(it.cantidad * it.precio)}</span>
        <div class="ctrl">
          <span class="qty">
            <button type="button" data-menos="${i}" aria-label="Restar uno">−</button>
            <input type="number" min="0" step="any" inputmode="decimal" value="${it.cantidad}" data-cant="${i}" aria-label="Cantidad de ${esc(p.nombre)}">
            <button type="button" data-mas="${i}" aria-label="Sumar uno">+</button>
          </span>
          <span>${esc(p.unidad)} × ${$u(it.precio)}</span>
          <button class="btn sm danger quitar" type="button" data-quitar="${i}" aria-label="Quitar ${esc(p.nombre)}">Quitar</button>
        </div>
      </div>`;
    }).join('')
    : '<p class="vacio">Agregá productos tocándolos en la lista o escaneando su código.</p>';
  $('#ticket-total').textContent = $u(totalTicket());
  const pct = descuentoActual();
  const det = $('#ticket-desc-det');
  det.hidden = !(pct && ticket.length);
  det.textContent = pct ? `Subtotal ${$u(subtotalTicket())} · Descuento −${$u(red2(subtotalTicket() * pct / 100))}` : '';
  actualizarVuelto();
  $('#btn-cobrar').disabled = !ticket.length;
  $('#btn-cobrar').textContent = ticket.length ? `Cobrar ${$u(totalTicket())}` : 'Cobrar';
}

function actualizarVuelto() {
  const ef = medioActual() === 'Efectivo';
  $('#bloque-efectivo').hidden = !ef;
  const rec = $('#caja-recibido').value;
  const v = $('#caja-vuelto');
  if (!ef || rec === '') { v.textContent = '—'; v.style.color = ''; return; }
  const dif = Number(rec) - totalTicket();
  v.textContent = dif >= 0 ? $u(dif) : `Faltan ${$u(-dif)}`;
  v.style.color = dif >= 0 ? '' : 'var(--danger)';
}

function fechaVentas() { return (esAdmin() && $('#ventas-fecha').value) || isoLocal(); }

function renderVentasHoy() {
  const dia = fechaVentas();
  const esHoy = dia === isoLocal();
  const lista = ventasDelDia(dia).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const validas = lista.filter((v) => !v.anulada);
  const total = validas.reduce((s, v) => s + v.total, 0);
  const porMedio = {};
  validas.forEach((v) => { porMedio[v.medio] = (porMedio[v.medio] || 0) + v.total; });
  $('#ventas-hoy-resumen').textContent = validas.length
    ? `${validas.length} ${validas.length === 1 ? 'venta' : 'ventas'} · ${$u(total)} · ` + Object.entries(porMedio).map(([m, t]) => `${m} ${$u(t)}`).join(' · ')
    : (esHoy ? 'Todavía no hay ventas hoy.' : 'No hubo ventas ese día.');
  $('#btn-cierre').disabled = !validas.length;
  $('#ventas-hoy').innerHTML = lista.length
    ? `<div class="table-wrap"><table class="tabla">
        <thead><tr><th>N.º</th><th>Hora</th><th>Detalle</th><th>Pago</th><th class="num">Total</th><th class="num"></th></tr></thead>
        <tbody>${lista.map((v) => `
          <tr${v.anulada ? ' class="muted"' : ''}>
            <td class="mono">${String(v.numero).padStart(4, '0')}</td>
            <td class="num">${hora(v.fecha)}${v.usuario ? `<div class="meta">${esc(v.usuario)}</div>` : ''}</td>
            <td><div>${v.items.map((it) => `${n(it.cantidad)} × ${esc(it.nombre)}`).join('<br>')}</div>${v.cliente ? `<div class="meta">${esc(v.cliente)}</div>` : ''}</td>
            <td>${esc(v.medio)}${v.vuelto != null ? `<div class="meta">Vuelto ${$u(v.vuelto)}</div>` : ''}</td>
            <td class="num"><strong>${$u(v.total)}</strong>${v.descuento ? `<div class="meta">Descuento ${n(v.descuentoPct)} %</div>` : ''}</td>
            <td class="acc">${puedeImprimir() ? `<button class="btn sm" type="button" data-ticket="${v.id}">Imprimir</button>` : ''}${v.anulada ? '<span class="chip neutro">Anulada</span>' : (esAdmin() ? `<button class="btn sm danger" type="button" data-anular="${v.id}">Anular</button>` : '')}</td>
          </tr>`).join('')}</tbody>
      </table></div>`
    : '';
}

/* ---------- Impresión de ticket y cierre ---------- */

const puedeImprimir = () => typeof window !== 'undefined' && typeof window.print === 'function' && !window.SIN_IMPRESION && tieneModulo('impresion');

function encabezadoNegocio() {
  const g = db.negocio || {};
  return `<div class="t-c"><strong class="t-neg">${esc(g.nombre || 'Ferretería')}</strong>
    ${g.direccion ? `<div>${esc(g.direccion)}</div>` : ''}${g.telefono ? `<div>Tel. ${esc(g.telefono)}</div>` : ''}${g.rut ? `<div>RUT ${esc(g.rut)}</div>` : ''}</div>`;
}

function htmlTicket(v) {
  const g = db.negocio || {};
  const fila = (a, b, cls = '') => `<div class="t-fila ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `${encabezadoNegocio()}<hr>
    ${fila(`Venta N.º ${String(v.numero).padStart(4, '0')}`, fechaHora(v.fecha))}
    ${v.cliente ? `<div>Cliente: ${esc(v.cliente)}</div>` : ''}
    ${v.usuario ? `<div>Atendió: ${esc(v.usuario)}</div>` : ''}
    ${v.anulada ? '<div class="t-c"><strong>VENTA ANULADA</strong></div>' : ''}<hr>
    ${v.items.map((it) => `<div>${esc(it.nombre)}</div>${fila(`${n(it.cantidad)} ${esc(it.unidad)} × ${$u(it.precio)}`, $u(it.subtotal))}`).join('')}<hr>
    ${v.descuento ? fila('Subtotal', $u(v.subtotal)) + fila(`Descuento ${n(v.descuentoPct)} %`, '−' + $u(v.descuento)) : ''}
    ${fila('TOTAL', $u(v.total), 't-total')}
    ${fila('Pago', esc(v.medio))}
    ${v.recibido != null ? fila('Recibido', $u(v.recibido)) + fila('Vuelto', $u(v.vuelto)) : ''}<hr>
    <div class="t-c">${esc(g.pie || '¡Gracias por su compra!')}</div>
    <div class="t-c t-chico">Comprobante interno. No válido como factura.</div>`;
}

function htmlCierre(dia) {
  const lista = ventasDelDia(dia);
  const validas = lista.filter((v) => !v.anulada);
  const porMedio = {};
  validas.forEach((v) => { porMedio[v.medio] = (porMedio[v.medio] || 0) + v.total; });
  const fila = (a, b, cls = '') => `<div class="t-fila ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `${encabezadoNegocio()}<hr>
    <div class="t-c"><strong>CIERRE DE CAJA</strong><div>${new Date(dia + 'T12:00:00').toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div><hr>
    ${fila('Ventas cobradas', validas.length)}
    ${fila('Ventas anuladas', lista.length - validas.length)}<hr>
    ${Object.entries(porMedio).map(([m, t]) => fila(esc(m), $u(t))).join('')}<hr>
    ${fila('TOTAL', $u(validas.reduce((s, v) => s + v.total, 0)), 't-total')}
    <div class="t-c t-chico">Impreso el ${fechaHora(new Date().toISOString())}</div>`;
}

function imprimir(html) {
  $('#impresion').innerHTML = html;
  window.print();
}

/* Producto que no está cargado: se agrega con nombre y precio sin salir de la venta */
function codigoLibre() {
  const usados = new Set(db.productos.map((p) => p.codigo));
  let i = 0, c;
  do { i++; c = 'P-' + String(i).padStart(4, '0'); } while (usados.has(c));
  return c;
}

function abrirAltaRapida(texto) {
  const esCodigo = !!texto && !/\s/.test(texto) && /\d/.test(texto);
  $('#ar-codigo').value = esCodigo ? texto.toUpperCase() : '';
  $('#ar-nombre').value = esCodigo ? '' : texto;
  $('#ar-precio').value = '';
  $('#ar-stock').value = '';
  $('#ar-err').textContent = '';
  $('#ar-sub').textContent = esCodigo
    ? `El código ${texto} no está cargado. Poné el nombre y el precio para venderlo ahora.`
    : 'Poné el nombre y el precio para venderlo ahora.';
  $('#dlg-rapido').showModal();
  (esCodigo || !texto ? $('#ar-nombre') : $('#ar-precio')).focus();
}

function iniciarAltaRapida() {
  $('#form-rapido').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = (t) => { $('#ar-err').textContent = t; };
    const nombre = $('#ar-nombre').value.trim();
    const precio = Number($('#ar-precio').value);
    const codigo = $('#ar-codigo').value.trim().toUpperCase() || codigoLibre();
    const stockTxt = $('#ar-stock').value;
    const stock = stockTxt === '' ? 1 : Number(stockTxt);
    if (!nombre) return err('Escribí el nombre del producto.');
    if (!(precio > 0)) return err('Escribí el precio de venta.');
    if (!(stock > 0)) return err('El stock tiene que ser 1 o más para poder venderlo.');
    if (db.productos.some((p) => p.codigo === codigo)) return err(`El código ${codigo} ya lo usa otro producto.`);
    const p = { id: uid(), codigo, nombre, categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: '', costo: 0, precio, minimo: 0, stock: 0 };
    db.productos.push(p);
    registrar(db, { tipo: 'entrada', productoId: p.id, cantidad: stock, costoUnit: 0, nota: 'Agregado desde la venta' });
    guardar();
    $('#dlg-rapido').close();
    $('#caja-buscar').value = '';
    agregarAlTicket(p.id);
    render();
    toast(`${p.nombre} quedó cargado y agregado a la venta.`);
    $('#caja-buscar').focus();
  });
}

function iniciarCaja() {
  iniciarAltaRapida();
  const buscar = $('#caja-buscar');
  const refiltrar = () => { cajaLimite = PASO_LISTA; renderResultados(); };
  buscar.addEventListener('input', refiltrar);
  ['#caja-prov', '#caja-constock', '#caja-orden'].forEach((sel) => $(sel).addEventListener('input', refiltrar));
  $('#caja-limpiar').addEventListener('click', quitarFiltrosCaja);
  $('#caja-cat').addEventListener('input', () => { cajaCat = $('#caja-cat').value; refiltrar(); });
  $('#caja-mas-filtros').addEventListener('click', () => {
    const extra = $('#caja-filtros-extra');
    extra.hidden = !extra.hidden;
    $('#caja-mas-filtros').setAttribute('aria-expanded', String(!extra.hidden));
    $('#caja-mas-filtros').textContent = extra.hidden ? 'Más filtros' : 'Menos filtros';
  });
  buscar.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = buscar.value.trim();
    if (!q) return;
    const exacto = db.productos.find((p) => normal(p.codigo) === normal(q));
    const cand = exacto ? [exacto] : db.productos.filter((p) => normal(`${p.codigo} ${p.nombre}`).includes(normal(q)));
    if (cand.length === 1) {
      agregarAlTicket(cand[0].id);
      buscar.value = '';
      renderResultados();
    } else if (!cand.length) {
      abrirAltaRapida(q);
    } else {
      toast('Hay varios productos que coinciden. Tocá el que corresponda.');
    }
  });
  $('#caja-resultados').addEventListener('click', (e) => {
    if (e.target.closest('[data-alta]')) { abrirAltaRapida(buscar.value.trim()); return; }
    if (e.target.closest('[data-quitar-filtros]')) { quitarFiltrosCaja(); return; }
    if (e.target.closest('[data-ver-mas]')) { cajaLimite += PASO_LISTA; renderResultados(); return; }
    const b = e.target.closest('[data-agregar]');
    if (b) { agregarAlTicket(b.dataset.agregar); buscar.focus(); }
  });
  $('#ticket-items').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.quitar != null) { ticket.splice(+t.dataset.quitar, 1); renderTicket(); }
    if (t.dataset.mas != null) agregarAlTicket(ticket[+t.dataset.mas].productoId, 1);
    if (t.dataset.menos != null) {
      const it = ticket[+t.dataset.menos];
      it.cantidad = red(it.cantidad - 1);
      if (it.cantidad <= 0) ticket.splice(+t.dataset.menos, 1);
      renderTicket();
    }
  });
  $('#ticket-items').addEventListener('change', (e) => {
    const i = e.target.dataset.cant;
    if (i == null) return;
    const it = ticket[+i];
    const p = producto(it.productoId);
    let q = Number(e.target.value);
    if (!(q > 0)) { ticket.splice(+i, 1); renderTicket(); return; }
    if (q > p.stock) { q = p.stock; toast(`Solo hay ${n(p.stock)} ${p.unidad} de ${p.nombre}.`); }
    it.cantidad = red(q);
    renderTicket();
  });
  $('#ticket-vaciar').addEventListener('click', () => { ticket = []; $('#caja-recibido').value = ''; $('#caja-desc').value = ''; renderTicket(); });
  $('#caja-desc').addEventListener('input', renderTicket);
  $('#ventas-fecha').value = isoLocal();
  $('#ventas-fecha').addEventListener('input', renderVentasHoy);
  $('#btn-cierre').addEventListener('click', () => imprimir(htmlCierre(fechaVentas())));
  $('#ventas-hoy').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ticket]');
    const v = b && db.ventas.find((x) => x.id === b.dataset.ticket);
    if (v) imprimir(htmlTicket(v));
  });
  // Si el lector de códigos escribe sin que el cursor esté en el buscador, se lleva el cursor ahí
  document.addEventListener('keydown', (e) => {
    if (!sesion || vistaActual() !== 'caja' || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1 || e.key === ' ') return;
    if (document.querySelector('dialog[open]')) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'radio') return;
    $('#caja-buscar').focus();
  });
  $('#medios').addEventListener('change', actualizarVuelto);
  $('#caja-recibido').addEventListener('input', actualizarVuelto);

  $('#btn-cobrar').addEventListener('click', () => {
    const r = cobrar(db, ticket, medioActual(), $('#caja-recibido').value, $('#caja-cliente').value.trim(), undefined, Number($('#caja-desc').value) || 0);
    if (r.error) { $('#caja-err').textContent = r.error; return; }
    guardar();
    ticket = [];
    $('#caja-recibido').value = '';
    $('#caja-cliente').value = '';
    $('#caja-desc').value = '';
    $('#ventas-fecha').value = isoLocal();
    $('#caja-err').textContent = '';
    render();
    const v = r.venta;
    mostrarVentaCobrada(v);
  });

  $('#ventas-hoy').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-anular]');
    if (!b || !esAdmin()) return;
    const v = db.ventas.find((x) => x.id === b.dataset.anular);
    if (!(await confirmar(`¿Anular la venta N.º ${v.numero} por ${$u(v.total)}? Los productos vuelven al stock.`, 'Anular venta', true))) return;
    const err = anularVenta(db, v.id);
    if (err) { toast(err); return; }
    guardar();
    render();
    toast(`Venta N.º ${v.numero} anulada. El stock se repuso.`);
  });
}

/* ---------- Productos ---------- */

function renderProductos() {
  const cats = [...new Set(db.productos.map((p) => p.categoria).filter(Boolean))].sort();
  const selCat = $('#prod-cat');
  const actual = selCat.value;
  selCat.innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option${c === actual ? ' selected' : ''}>${esc(c)}</option>`).join('');
  $('#lista-cat').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');

  const q = normal($('#prod-buscar').value.trim());
  const cat = selCat.value;
  const est = $('#prod-estado').value;
  const lista = db.productos
    .filter((p) => !q || normal(`${p.codigo} ${p.nombre} ${p.ubicacion} ${nombreProv(p.proveedorId)}`).includes(q))
    .filter((p) => !cat || p.categoria === cat)
    .filter((p) => !est || (est === 'bajo' ? estado(p) === 'bajo' : estado(p) === est))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  $('#prod-sub').textContent = `${db.productos.length} productos cargados${lista.length !== db.productos.length ? ` · mostrando ${lista.length}` : ''}.`;
  const visibles = lista.slice(0, 300);
  $('#tabla-prod').innerHTML = lista.length
    ? visibles.map((p) => `
      <tr>
        <td><div class="nom">${esc(p.nombre)}</div><div class="meta"><span class="mono">${esc(p.codigo)}</span> · ${[p.categoria || 'Sin categoría', p.ubicacion, nombreProv(p.proveedorId)].filter(Boolean).map(esc).join(' · ')}</div></td>
        <td class="num"><strong>${n(p.stock)}</strong> <span class="u">${esc(p.unidad)}</span></td>
        <td class="num">${n(p.minimo)}</td>
        <td>${chipEstado(p)}</td>
        <td class="num solo-admin">${$u(p.costo)}</td>
        <td class="num">${$u(p.precio)}</td>
        <td class="acc">
          <button class="btn sm verde-suave" type="button" data-accion="entrada" data-id="${p.id}">+ Sumar stock</button>
          <button class="btn sm danger" type="button" data-accion="salida" data-id="${p.id}">− Restar</button>
          <button class="btn sm ghost" type="button" data-accion="editar" data-id="${p.id}">Editar</button>
        </td>
      </tr>`).join('') + (lista.length > visibles.length ? `<tr><td colspan="7" class="vacio">Se muestran ${visibles.length} de ${lista.length} productos. Usá el buscador para encontrar el resto.</td></tr>` : '')
    : `<tr><td colspan="7" class="vacio">${db.productos.length ? 'Ningún producto coincide con los filtros.' : 'Todavía no cargaste productos. Usá «Nuevo producto» para agregar el primero.'}</td></tr>`;
}

let editandoProd = null;

function abrirProducto(id) {
  editandoProd = id || null;
  const p = id ? producto(id) : { codigo: '', nombre: '', categoria: '', unidad: 'unidad', proveedorId: '', ubicacion: '', costo: '', precio: '', minimo: '' };
  $('#prod-titulo').textContent = id ? 'Editar producto' : 'Nuevo producto';
  $('#p-codigo').value = p.codigo;
  $('#p-nombre').value = p.nombre;
  $('#p-categoria').value = p.categoria;
  $('#p-unidad').value = p.unidad;
  $('#p-proveedor').innerHTML = opcionesProv(p.proveedorId);
  $('#p-ubicacion').value = p.ubicacion;
  $('#p-costo').value = p.costo;
  $('#p-precio').value = p.precio;
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

function actualizarMargen() {
  const c = Number($('#p-costo').value), pr = Number($('#p-precio').value);
  $('#p-margen').textContent = c > 0 && pr > 0 ? `Margen: ${n(((pr - c) / c) * 100)} % sobre costo` : '';
}

function iniciarProductos() {
  $('#btn-nuevo-prod').addEventListener('click', () => abrirProducto());
  ['#prod-buscar', '#prod-cat', '#prod-estado'].forEach((s) => $(s).addEventListener('input', renderProductos));
  ['#p-costo', '#p-precio'].forEach((s) => $(s).addEventListener('input', actualizarMargen));

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const { accion, id } = b.dataset;
    if (accion === 'editar') abrirProducto(id);
    else abrirMovRapido(accion, id);
  });

  $('#form-prod').addEventListener('submit', (e) => {
    e.preventDefault();
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
    };
    if (!datos.codigo) return err('Escribí un código para el producto.');
    if (!datos.nombre) return err('Escribí el nombre del producto.');
    if (db.productos.some((p) => p.codigo === datos.codigo && p.id !== editandoProd)) return err(`El código ${datos.codigo} ya lo usa otro producto.`);
    if (editandoProd) {
      Object.assign(producto(editandoProd), datos);
      toast('Producto guardado.');
    } else {
      const p = { id: uid(), ...datos, stock: 0 };
      db.productos.push(p);
      const ini = Number($('#p-stock').value);
      if (ini > 0) registrar(db, { tipo: 'entrada', productoId: p.id, cantidad: ini, costoUnit: datos.costo, proveedorId: datos.proveedorId, nota: 'Stock inicial' });
      toast(`Producto agregado: ${p.nombre}.`);
    }
    guardar();
    $('#dlg-prod').close();
    render();
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
  $('#qm-cant').value = tipo === 'entrada' && p.stock <= p.minimo ? red(Math.max(p.minimo * 2 - p.stock, 1)) : '';
  $('#qm-costo').value = p.costo;
  $('#qm-costo-wrap').hidden = tipo !== 'entrada';
  $('#qm-nota').value = '';
  $('#qm-nota').placeholder = tipo === 'entrada' ? 'Ej.: Factura A-1234' : 'Ej.: Rotura, uso interno';
  $('#qm-ok').textContent = tipo === 'entrada' ? 'Sumar al stock' : 'Restar del stock';
  $('#qm-ok').className = 'btn ' + (tipo === 'entrada' ? 'verde' : 'rojo');
  $('#qm-err').textContent = '';
  $('#dlg-mov').showModal();
  $('#qm-cant').focus();
}

function iniciarMovRapido() {
  $('#form-qm').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = producto(movRapido.id);
    const err = registrar(db, {
      tipo: movRapido.tipo, productoId: p.id, cantidad: $('#qm-cant').value,
      costoUnit: $('#qm-costo').value, proveedorId: movRapido.tipo === 'entrada' ? p.proveedorId : '', nota: $('#qm-nota').value.trim(),
    });
    if (err) { $('#qm-err').textContent = err; return; }
    guardar();
    $('#dlg-mov').close();
    render();
    toast(`${movRapido.tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada. Stock de ${p.nombre}: ${n(p.stock)} ${p.unidad}.`);
  });
}

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
  $$('.solo-entrada').forEach((el) => { el.hidden = t !== 'entrada'; });
  $('#mov-cant-label').textContent = { entrada: '¿Cuántos llegaron?', salida: '¿Cuántos sacás?', ajuste: '¿Cuántos contaste?' }[t];
  $('#mov-submit').textContent = { entrada: 'Sumar al stock', salida: 'Restar del stock', ajuste: 'Corregir el stock' }[t];
  $('#mov-submit').className = 'btn ' + { entrada: 'verde', salida: 'rojo', ajuste: 'primary' }[t];
  $('#mov-explica').textContent = {
    entrada: 'Elegí el producto y anotá cuántos llegaron. Se suman al stock.',
    salida: 'Para productos que se rompieron, se usaron en el local o se devolvieron al proveedor. Las ventas no van acá: se hacen en Vender.',
    ajuste: 'Contá cuántos hay en el estante y anotá ese número. El programa corrige el stock a esa cantidad.',
  }[t];
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
    .filter((p) => !q || normal(`${p.codigo} ${p.nombre} ${p.categoria} ${provs.get(p.proveedorId) || ''} ${p.ubicacion}`).includes(q))
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
      const exacto = db.productos.find((p) => normal(p.codigo) === normal(texto));
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
  ['#mov-desde', '#mov-hasta', '#mov-tipo', '#mov-buscar'].forEach((s) => $(s).addEventListener('input', renderMovimientos));
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
      costoUnit: $('#mov-costo').value, proveedorId: tipo === 'entrada' ? $('#mov-prov').value : '', nota: $('#mov-nota').value.trim(),
    });
    if (err) { $('#mov-err').textContent = err; return; }
    $('#mov-err').textContent = '';
    $('#mov-cant').value = '';
    $('#mov-nota').value = '';
    guardar();
    render();
    toast(`Listo. Stock de ${p.nombre}: ${n(p.stock)} ${p.unidad}.`);
  });
}

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

/* ---------- Reportes ---------- */

function sugerido(p) { return red(Math.max(p.minimo * 2 - p.stock, 0)); }

function ventasPeriodo() {
  const a = inicioDia($('#rep-desde').value), b = finDia($('#rep-hasta').value);
  return db.ventas.filter((v) => { const t = Date.parse(v.fecha); return t >= a && t <= b; });
}

function renderReportes() {
  renderUsuarios();
  renderRespaldoExtra();
  if (!$('#form-negocio').contains(document.activeElement)) {
    ['nombre', 'direccion', 'telefono', 'rut', 'pie'].forEach((k) => { $('#n-' + k).value = (db.negocio || {})[k] || ''; });
  }
  // Período
  const ventas = ventasPeriodo();
  const validas = ventas.filter((v) => !v.anulada);
  const total = validas.reduce((s, v) => s + v.total, 0);
  const costoVendido = validas.reduce((s, v) => s + v.items.reduce((t, it) => t + it.cantidad * (it.costo || 0), 0), 0);
  const a = inicioDia($('#rep-desde').value), b = finDia($('#rep-hasta').value);
  const movs = db.movimientos.filter((m) => { const t = Date.parse(m.fecha); return t >= a && t <= b; });
  const compras = movs.filter((m) => m.tipo === 'entrada' && !m.ventaId).reduce((s, m) => s + m.cantidad * m.costoUnit, 0);
  const porMedio = {};
  validas.forEach((v) => { porMedio[v.medio] = (porMedio[v.medio] || 0) + v.total; });
  const masVendidos = {};
  validas.forEach((v) => v.items.forEach((it) => {
    const k = it.productoId;
    masVendidos[k] = masVendidos[k] || { nombre: it.nombre, unidad: it.unidad, cant: 0, total: 0 };
    masVendidos[k].cant += it.cantidad;
    masVendidos[k].total += it.subtotal;
  }));
  const top = Object.values(masVendidos).sort((x, y) => y.total - x.total).slice(0, 5);
  $('#rep-periodo').innerHTML = `
    <div class="resumen">
      <div><div class="lbl">Ventas</div><div class="val">${validas.length}</div></div>
      <div><div class="lbl">Total vendido</div><div class="val">${$u(total)}</div></div>
      <div><div class="lbl">Ganancia bruta</div><div class="val">${$u(total - costoVendido)}</div></div>
      <div><div class="lbl">Compras</div><div class="val">${$u(compras)}</div></div>
    </div>
    ${Object.keys(porMedio).length ? `<p class="subt">Por medio de pago</p>
      <ul class="lista">${Object.entries(porMedio).sort((x, y) => y[1] - x[1]).map(([m, t]) => `<li><span>${esc(m)}</span><span class="num">${$u(t)}</span></li>`).join('')}</ul>` : ''}
    ${top.length ? `<p class="subt">Más vendidos</p>
      <ul class="lista">${top.map((t) => `<li><div class="izq"><div class="nom">${esc(t.nombre)}</div><div class="meta">${n(t.cant)} ${esc(t.unidad)}</div></div><span class="num">${$u(t.total)}</span></li>`).join('')}</ul>`
      : '<p class="vacio">No hubo ventas por la caja en este período.</p>'}`;

  // Reposición
  const rep = db.productos.filter((p) => estado(p) !== 'ok').sort((x, y) => nombreProv(x.proveedorId).localeCompare(nombreProv(y.proveedorId)) || x.nombre.localeCompare(y.nombre));
  $('#rep-reposicion').innerHTML = rep.length
    ? `<div class="table-wrap"><table class="tabla">
        <thead><tr><th>Producto</th><th>Proveedor</th><th class="num">Stock</th><th class="num">Pedir</th><th class="num">Costo est.</th></tr></thead>
        <tbody>${rep.map((p) => `<tr>
          <td><div class="nom">${esc(p.nombre)}</div><div class="meta mono">${esc(p.codigo)}</div></td>
          <td>${esc(nombreProv(p.proveedorId)) || '<span class="muted">—</span>'}</td>
          <td class="num">${n(p.stock)} / ${n(p.minimo)}</td>
          <td class="num"><strong>${n(sugerido(p))}</strong> <span class="u">${esc(p.unidad)}</span></td>
          <td class="num">${$u(sugerido(p) * p.costo)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total estimado del pedido</td><td class="num">${$u(rep.reduce((s, p) => s + sugerido(p) * p.costo, 0))}</td></tr></tfoot>
      </table></div>`
    : '<p class="vacio">No hay productos para reponer.</p>';

  // Valorización
  const cats = {};
  db.productos.forEach((p) => {
    const c = p.categoria || 'Sin categoría';
    cats[c] = cats[c] || { items: 0, costo: 0, venta: 0 };
    cats[c].items++;
    cats[c].costo += Math.max(p.stock, 0) * p.costo;
    cats[c].venta += Math.max(p.stock, 0) * p.precio;
  });
  const filas = Object.entries(cats).sort((x, y) => y[1].costo - x[1].costo);
  const max = Math.max(1, ...filas.map(([, v]) => v.costo));
  const tc = filas.reduce((s, [, v]) => s + v.costo, 0), tv = filas.reduce((s, [, v]) => s + v.venta, 0);
  $('#rep-valorizacion').innerHTML = filas.length
    ? `<div class="table-wrap"><table class="tabla">
        <thead><tr><th>Categoría</th><th class="num">Productos</th><th class="num">A costo</th><th class="num">A venta</th></tr></thead>
        <tbody>${filas.map(([c, v]) => `<tr>
          <td>${esc(c)}<div class="barra"><i style="width:${(v.costo / max) * 100}%"></i></div></td>
          <td class="num">${v.items}</td><td class="num">${$u(v.costo)}</td><td class="num">${$u(v.venta)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${db.productos.length}</td><td class="num">${$u(tc)}</td><td class="num">${$u(tv)}</td></tr></tfoot>
      </table></div>`
    : '<p class="vacio">Sin productos cargados.</p>';
}

/* ---------- Exportar a Excel ---------- */

function descargarBlob(contenido, tipo, nombre) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function descargarExcel(filas, hoja, base) {
  if (!filas.length) { toast('No hay datos para exportar.'); return; }
  const nombre = `${base}_${isoLocal()}`;
  try {
    if (window.XLSX) {
      const ws = XLSX.utils.json_to_sheet(filas);
      ws['!cols'] = Object.keys(filas[0]).map((k) => ({ wch: Math.min(50, Math.max(k.length, ...filas.map((f) => String(f[k] ?? '').length)) + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
      XLSX.writeFile(wb, nombre + '.xlsx');
      toast(`Descargando ${nombre}.xlsx`);
    } else {
      // Sin conexión a internet: se descarga un CSV que Excel también abre
      const cols = Object.keys(filas[0]);
      const csv = [cols.join(';'), ...filas.map((f) => cols.map((c) => `"${String(f[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');
      descargarBlob('﻿' + csv, 'text/csv;charset=utf-8', nombre + '.csv');
      toast(`Descargando ${nombre}.csv (se abre con Excel)`);
    }
  } catch (e) {
    toast('No se pudo generar el archivo. Probá de nuevo.');
  }
}

function exportar(tipo) {
  const f = (iso) => new Date(iso).toLocaleString('es-UY');
  if (tipo === 'inventario') {
    descargarExcel([...db.productos].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({
      'Código': p.codigo, 'Producto': p.nombre, 'Categoría': p.categoria, 'Unidad': p.unidad, 'Proveedor': nombreProv(p.proveedorId),
      'Ubicación': p.ubicacion, 'Stock': p.stock, 'Stock mínimo': p.minimo, 'Estado': { ok: 'En stock', bajo: 'Bajo mínimo', sin: 'Sin stock' }[estado(p)],
      'Costo': p.costo, 'Precio': p.precio, 'Valor a costo': red(Math.max(p.stock, 0) * p.costo), 'Valor a venta': red(Math.max(p.stock, 0) * p.precio),
    })), 'Inventario', 'inventario');
  } else if (tipo === 'reposicion') {
    descargarExcel(db.productos.filter((p) => estado(p) !== 'ok').map((p) => ({
      'Proveedor': nombreProv(p.proveedorId), 'Código': p.codigo, 'Producto': p.nombre, 'Unidad': p.unidad,
      'Stock': p.stock, 'Stock mínimo': p.minimo, 'Cantidad a pedir': sugerido(p), 'Costo unitario': p.costo, 'Costo estimado': red(sugerido(p) * p.costo),
    })), 'Reposición', 'reposicion');
  } else if (tipo === 'valorizacion') {
    const cats = {};
    db.productos.forEach((p) => {
      const c = p.categoria || 'Sin categoría';
      cats[c] = cats[c] || { 'Categoría': c, 'Productos': 0, 'Valor a costo': 0, 'Valor a venta': 0 };
      cats[c]['Productos']++;
      cats[c]['Valor a costo'] = red(cats[c]['Valor a costo'] + Math.max(p.stock, 0) * p.costo);
      cats[c]['Valor a venta'] = red(cats[c]['Valor a venta'] + Math.max(p.stock, 0) * p.precio);
    });
    descargarExcel(Object.values(cats), 'Valorización', 'valorizacion');
  } else if (tipo === 'movimientos') {
    descargarExcel(movimientosFiltrados().map((m) => ({
      'Fecha': f(m.fecha), 'Tipo': etiquetaTipo(m), 'Código': m.codigo, 'Producto': m.producto, 'Cantidad': m.cantidad, 'Unidad': m.unidad,
      'Stock antes': m.stockAntes, 'Stock después': m.stockDespues, 'Costo unitario': m.costoUnit, 'Proveedor': nombreProv(m.proveedorId), 'Usuario': m.usuario || '', 'Nota': m.nota,
    })), 'Movimientos', 'movimientos');
  } else if (tipo === 'ventas') {
    const filas = [];
    ventasPeriodo().forEach((v) => v.items.forEach((it) => filas.push({
      'Venta N.º': v.numero, 'Fecha': f(v.fecha), 'Estado': v.anulada ? 'Anulada' : 'Cobrada', 'Medio de pago': v.medio, 'Vendedor': v.usuario || '', 'Cliente': v.cliente,
      'Código': it.codigo, 'Producto': it.nombre, 'Cantidad': it.cantidad, 'Unidad': it.unidad, 'Precio': it.precio, 'Subtotal': it.subtotal, 'Descuento %': v.descuentoPct || 0, 'Total venta': v.total,
    })));
    descargarExcel(filas, 'Ventas', 'ventas');
  }
}

/* ---------- Respaldo ---------- */

/** Cambia todos los datos. Los usuarios y los datos del negocio se mantienen salvo que el archivo nuevo traiga los suyos. */
function reemplazarDatos(nuevo, conservarUsuarios = true) {
  const usuarios = db.usuarios, negocio = db.negocio;
  const propio = { licencia: db.licencia, licUltimaFecha: db.licUltimaFecha, desarrollador: db.desarrollador, equipoNavegador: db.equipoNavegador };
  db = nuevo;
  Object.assign(db, propio);
  if (conservarUsuarios) db.usuarios = usuarios;
  if (!db.negocio || !db.negocio.nombre) db.negocio = negocio;
  asegurarUsuarios(db);
  if (!db.usuarios.some((u) => u.id === sesion.id)) sesion = null;
  else sesion = db.usuarios.find((u) => u.id === sesion.id);
  guardar({ completo: true });
  ticket = [];
  if (!sesion) mostrarLogin(); else { aplicarPermisos(); render(); }
}

/** Lee una copia: .json, o .json.gz (los respaldos automáticos diarios). */
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

function iniciarRespaldo() {
  if (escritorio()) {
    const info = window.almacen.info();
    $('#respaldo-texto').textContent = `Los cambios se guardan solos en esta PC. Una vez por día se hace un respaldo comprimido en ${info.respaldos} y se guardan los últimos 60 días.`;
    $('#btn-abrir-respaldos').hidden = false;
    $('#btn-abrir-respaldos').addEventListener('click', () => window.almacen.abrirRespaldos());
    if (window.almacen.elegirCarpetaExtra) {
      $('#respaldo-extra').hidden = false;
      const usar = async (accion, aviso) => {
        $$('#respaldo-extra button').forEach((x) => { x.disabled = true; });
        try { const r = await accion(); renderRespaldoExtra(r); if (aviso) toast(aviso(r)); } finally { $$('#respaldo-extra button').forEach((x) => { x.disabled = false; }); }
      };
      $('#btn-extra-elegir').addEventListener('click', () => usar(window.almacen.elegirCarpetaExtra, (r) => (r && r.estadoExtra && r.estadoExtra.ok ? 'Copia guardada en la carpeta elegida.' : '')));
      $('#btn-extra-quitar').addEventListener('click', () => usar(window.almacen.quitarCarpetaExtra, () => 'Se dejó de copiar a la carpeta extra.'));
      $('#btn-respaldar-ahora').addEventListener('click', () => usar(window.almacen.respaldarAhora, (r) => (r && r.error ? 'No se pudo hacer la copia.' : 'Copia de seguridad hecha.')));
    }
  }
  $('#btn-respaldo').addEventListener('click', () => {
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
      reemplazarDatos(Object.assign(baseVacia(), datos), !Array.isArray(datos.usuarios) || !datos.usuarios.length);
      toast('Copia restaurada.');
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

/* ---------- Arranque ---------- */

let ultimaVenta = null;
function mostrarVentaCobrada(v) {
  ultimaVenta = v;
  $('#venta-total').textContent = $u(v.total);
  $('#venta-medio').textContent = `Pagó con ${v.medio.toLowerCase()} · Venta N.º ${String(v.numero).padStart(4, '0')}`;
  $('#venta-vuelto-box').hidden = v.vuelto == null;
  $('#venta-vuelto').textContent = $u(v.vuelto);
  $('#dlg-venta').showModal();
  $('#venta-nueva').focus();
}

/* Tamaño de letra, recordado en esta PC */
const CLAVE_LETRA = 'ferreteria-letra';
function aplicarLetra(f) {
  if (escritorio() && window.almacen.zoom) window.almacen.zoom(Number(f));
  else {
    document.body.style.zoom = f;
    document.documentElement.style.setProperty('--zoom', f);
  }
  $$('[data-letra]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.letra === String(f))));
}
function iniciarLetra() {
  let f = '1';
  try { f = localStorage.getItem(CLAVE_LETRA) || '1'; } catch (e) { /* sin almacenamiento */ }
  aplicarLetra(f);
  $$('[data-letra]').forEach((b) => b.addEventListener('click', () => {
    aplicarLetra(b.dataset.letra);
    try { localStorage.setItem(CLAVE_LETRA, b.dataset.letra); } catch (e) { /* sin almacenamiento */ }
  }));
}

/* ---------- Importar desde Excel ---------- */

let planImp = null;

function mostrarPlan(nombreArchivo) {
  const r = $('#imp-resumen');
  $('#imp-ok').disabled = true;
  if (!planImp || planImp.error) { $('#imp-err').textContent = (planImp && planImp.error) || ''; r.innerHTML = ''; return; }
  $('#imp-err').textContent = '';
  const total = planImp.nuevos.length + planImp.actualizados.length;
  if (!total) { $('#imp-err').textContent = 'La planilla no tiene productos para importar.'; r.innerHTML = ''; return; }
  const muestra = planImp.nuevos.concat(planImp.actualizados).slice(0, 4);
  r.innerHTML = `
    <p><strong>${esc(nombreArchivo)}</strong></p>
    <ul class="lista">
      <li><span>Productos nuevos que se agregan</span><strong>${planImp.nuevos.length}</strong></li>
      <li><span>Productos que ya existen y se actualizan</span><strong>${planImp.actualizados.length}</strong></li>
      ${planImp.salteadas ? `<li><span>Filas que se saltean (sin nombre o repetidas)</span><strong>${planImp.salteadas}</strong></li>` : ''}
    </ul>
    <p class="muted">Columnas reconocidas: ${planImp.columnas.map(esc).join(', ')}.</p>
    <div class="table-wrap"><table class="tabla"><thead><tr><th>Código</th><th>Producto</th><th class="num">Stock</th><th class="num">Precio</th></tr></thead>
      <tbody>${muestra.map((m) => `<tr><td class="mono">${esc(m.codigo)}</td><td>${esc(m.datos.nombre)}</td><td class="num">${m.datos.stock == null ? '—' : n(m.datos.stock)}</td><td class="num">${m.datos.precio == null ? '—' : $u(m.datos.precio)}</td></tr>`).join('')}
      ${total > muestra.length ? `<tr><td colspan="4" class="muted">… y ${total - muestra.length} más</td></tr>` : ''}</tbody></table></div>
    ${planImp.actualizados.length ? '<p class="muted">En los productos que ya existen, si la planilla trae otro stock, se corrige a ese número.</p>' : ''}
    ${db.ejemplo ? '<p class="nota-edit">Estás con los datos de ejemplo: lo importado se va a mezclar con ellos. Si no querés eso, cancelá y tocá primero «Empezar de cero».</p>' : ''}`;
  $('#imp-ok').disabled = false;
}

function iniciarImportacion() {
  $('#btn-importar').addEventListener('click', () => {
    planImp = null;
    $('#imp-resumen').innerHTML = '';
    $('#imp-err').textContent = '';
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
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const libro = XLSX.read(new Uint8Array(lector.result), { type: 'array', codepage: 65001 });
        const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '' });
        planImp = planImportacion(db, filas);
      } catch (err) {
        planImp = { error: 'No pude leer el archivo. Tiene que ser una planilla de Excel (.xlsx) o un archivo .csv.' };
      }
      mostrarPlan(file.name);
    };
    lector.readAsArrayBuffer(file);
  });
  $('#imp-ok').addEventListener('click', () => {
    if (!planImp || planImp.error) return;
    const r = aplicarImportacion(db, planImp);
    planImp = null;
    guardar();
    $('#dlg-import').close();
    render();
    toast(`Importación lista: ${r.nuevos} productos nuevos y ${r.actualizados} actualizados.`);
  });
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
  const p = lista.find((x) => x.precio > 0) || lista[0];
  const nuevo = redondearPrecio(p.precio * (1 + o.pct / 100), o.redondeo);
  prev.innerHTML = `Se ${o.pct > 0 ? 'suben' : 'bajan'} <strong>${lista.length} productos</strong>. Ejemplo: ${esc(p.nombre)} pasa de ${$u(p.precio)} a <strong>${$u(nuevo)}</strong>.`;
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
    const r = actualizarPrecios(db, o.filtro, o.pct, o);
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
    guardar();
    render();
    toast('Datos del negocio guardados.');
  });
}

/* ---------- Ingreso ---------- */

let loginUsuario = null;

function mostrarLogin() {
  sesion = null;
  document.body.classList.remove('rol-empleado', 'rol-admin');
  $$('dialog[open]').forEach((d) => d.close());
  $('#login-negocio').textContent = (db.negocio && db.negocio.nombre) || 'Stock Ferretería';
  const lista = [...db.usuarios].sort((a, b) => (a.rol === 'admin') - (b.rol === 'admin') || a.nombre.localeCompare(b.nombre));
  $('#login-usuarios').innerHTML = lista.map((u) => `
    <button type="button" class="login-user" data-usuario="${u.id}">
      <span>${esc(u.nombre)}</span><small>${ROLES[u.rol]}</small>
    </button>`).join('');
  $('#login-paso1').hidden = false;
  $('#login-paso2').hidden = true;
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
  devAbierto = false;
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
    if (!verificarPin(loginUsuario, pin)) {
      $('#login-err').textContent = 'El PIN no es correcto. Probá de nuevo.';
      $('#login-pin').value = '';
      $('#login-pin').focus();
      return;
    }
    entrar(loginUsuario);
  });
  $('#btn-salir').addEventListener('click', () => { devAbierto = false; arrancar(); });
  $('#banner-pin-ir').addEventListener('click', () => {
    location.hash = '#reportes';
    setTimeout(() => $('#card-usuarios').scrollIntoView({ block: 'start' }), 50);
  });
}

/* ---------- Usuarios (solo administrador) ---------- */

let editandoUsuario = null;

function renderUsuarios() {
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

function iniciarUsuarios() {
  $('#btn-nuevo-usuario').addEventListener('click', () => abrirUsuario());
  $('#tabla-usuarios').addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar-usuario]');
    if (b) abrirUsuario(b.dataset.editarUsuario);
  });
  ['#u-pin', '#u-pin2'].forEach((sel) => $(sel).addEventListener('input', () => { $(sel).value = $(sel).value.replace(/\D/g, '').slice(0, 6); }));
  $('#form-usuario').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!esAdmin()) return;
    const pin = $('#u-pin').value;
    if (pin !== $('#u-pin2').value) { $('#usr-err').textContent = 'Los dos PIN no coinciden.'; return; }
    const r = guardarUsuario(db, { nombre: $('#u-nombre').value, rol: $('#u-rol').value, pin }, editandoUsuario);
    if (r.error) { $('#usr-err').textContent = r.error; return; }
    guardar();
    $('#dlg-usuario').close();
    if (r.usuario.id === sesion.id) { sesion = r.usuario; aplicarPermisos(); }
    mostrarVista();
    toast(editandoUsuario ? 'Usuario guardado.' : `Usuario ${r.usuario.nombre} creado.`);
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

/* ---------- Bloqueo por licencia ---------- */

function contactoCorto() {
  const d = db.desarrollador || {};
  if (d.nombre && d.telefono) return `${esc(d.nombre)} al ${esc(d.telefono)}`;
  if (d.telefono) return `tu proveedor al ${esc(d.telefono)}`;
  return d.nombre ? esc(d.nombre) : 'tu proveedor';
}

function contactoHtml() {
  const d = db.desarrollador || {};
  if (!d.nombre && !d.telefono && !d.email) return '<p>Comunicate con la persona que te instaló el programa.</p>';
  return `${d.nombre ? `<strong class="ct-nombre">${esc(d.nombre)}</strong>` : ''}
    ${d.telefono ? `<span class="ct-tel">${esc(d.telefono)}</span>` : ''}
    ${d.email ? `<span>${esc(d.email)}</span>` : ''}
    ${d.mensaje ? `<p class="ct-msg">${esc(d.mensaje)}</p>` : ''}`;
}

function mostrarBloqueo(r) {
  sesion = null;
  devAbierto = false;
  $$('dialog[open]').forEach((d) => d.close());
  $('#login').hidden = true;
  const textos = {
    sin: ['Activá el programa', 'Para empezar a usarlo hace falta un código de activación. Pedíselo a tu proveedor y pasale el código de esta computadora.'],
    vencido: ['La licencia venció', `La licencia venció el ${r.lic ? fechaLarga(r.lic.h) : ''}. Para seguir usando el programa, comunicate con tu proveedor.`],
    equipo: ['Licencia de otra computadora', 'El código guardado es de otra computadora. Pedile a tu proveedor un código nuevo con el código de esta computadora.'],
    reloj: ['La fecha de la computadora está mal', `La computadora dice que hoy es ${fechaLarga(isoLocal())}, pero el programa ya se usó el ${fechaLarga(r.ultima || isoLocal())}. Corregí la fecha y la hora de Windows y volvé a abrir el programa.`],
  };
  const [titulo, texto] = textos[r.motivo] || ['Licencia no válida', 'El código guardado no es válido. Comunicate con tu proveedor.'];
  $('#bloq-titulo').textContent = titulo;
  $('#bloq-texto').textContent = texto;
  $('#bloq-contacto').innerHTML = contactoHtml();
  $('#bloq-id').textContent = idEquipo();
  $('#bloq-form').hidden = r.motivo === 'reloj';
  $('#bloq-codigo').value = '';
  $('#bloq-err').textContent = '';
  $('#bloq-respaldo').hidden = !db.productos.length && !db.ventas.length;
  $('#bloqueo').hidden = false;
}

async function arrancar() {
  const r = await comprobarLicencia();
  if (!r.ok) { mostrarBloqueo(r); return; }
  $('#bloqueo').hidden = true;
  aplicarModulos();
  if (!tieneModulo('usuarios')) entrar(db.usuarios.find((u) => u.rol === 'admin'));
  else mostrarLogin();
}

function copiarTexto(texto, aviso) {
  const ok = () => toast(aviso || 'Copiado.');
  try { navigator.clipboard.writeText(texto).then(ok, () => toast(`No se pudo copiar. Anotalo: ${texto}`)); } catch (e) { toast(`Anotalo: ${texto}`); }
}

function iniciarBloqueo() {
  $('#bloq-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await activarCodigo($('#bloq-codigo').value);
    if (r.error) { $('#bloq-err').textContent = r.error; return; }
    toast(r.lic.h === PERMANENTE ? 'Programa activado sin vencimiento.' : `Programa activado hasta el ${fechaLarga(r.lic.h)}.`);
    arrancar();
  });
  $('#bloq-copiar').addEventListener('click', () => copiarTexto(idEquipo(), 'Código de la computadora copiado.'));
  $('#bloq-respaldo').addEventListener('click', () => descargarBlob(JSON.stringify(db), 'application/json', `respaldo_stock_${isoLocal()}.json`));
  // Se vuelve a revisar cada media hora, por si el programa queda abierto varios días
  setInterval(async () => {
    if (!$('#bloqueo').hidden) return;
    const r = await comprobarLicencia();
    if (!r.ok) mostrarBloqueo(r);
    else if (sesion) { aplicarModulos(); render(); }
  }, 30 * 60 * 1000);
}

/* ---------- Pestaña Desarrollador ---------- */

let devAbierto = false;

function renderDesarrollador() {
  const d = db.desarrollador || {};
  const tieneClave = !!d.claveHash;
  $('#dev-cerrado').hidden = devAbierto;
  $('#dev-abierto').hidden = !devAbierto;
  if (!devAbierto) {
    $('#dev-clave-titulo').textContent = tieneClave ? 'Escribí tu clave de desarrollador' : 'Creá tu clave de desarrollador';
    $('#dev-clave-sub').textContent = tieneClave
      ? 'Esta parte es solo para quien instaló el programa.'
      : 'Es la primera vez que entrás. Elegí una clave de al menos 6 letras o números; el cliente no tiene que saberla.';
    $('#dev-clave2-wrap').hidden = tieneClave;
    $('#dev-olvide').hidden = !tieneClave;
    return;
  }
  const lic = licenciaActual;
  const est = estadoLicencia(lic, isoLocal(), diasAviso());
  const chip = {
    sin: '<span class="chip danger">Sin activar</span>',
    activa: `<span class="chip ok">Activa, faltan ${est.dias} días</span>`,
    'por-vencer': `<span class="chip warn">Vence en ${est.dias} días</span>`,
    vencida: '<span class="chip danger">Vencida</span>',
    permanente: '<span class="chip ok">Sin vencimiento</span>',
  }[est.estado];
  $('#dev-id').textContent = idEquipo();
  $('#dev-lic').innerHTML = (LICENCIA_ACTIVADA ? '' : '<li><span>Licencia</span><span class="chip warn">Desactivada en esta versión: funciona sin código</span></li>') + `
    <li><span>Estado</span>${chip}</li>
    <li><span>Válida hasta</span><strong>${lic ? fechaLarga(lic.h) : '—'}</strong></li>
    ${lic && lic.c ? `<li><span>Cliente</span><strong>${esc(lic.c)}</strong></li>` : ''}
    ${lic && lic.f ? `<li><span>Código generado el</span><span>${fechaLarga(lic.f)}</span></li>` : ''}
    ${db.licencia && db.licencia.activada ? `<li><span>Activado en esta computadora</span><span>${fechaHora(db.licencia.activada)}</span></li>` : ''}`;
  $('#dev-modulos').innerHTML = `<li class="mod-si">Stock, productos y proveedores (siempre)</li>`
    + MODULOS.map((m) => `<li class="${tieneModulo(m.clave) ? 'mod-si' : 'mod-no'}">${esc(m.nombre)}</li>`).join('');
  if (!$('#form-dev-contacto').contains(document.activeElement)) {
    ['nombre', 'telefono', 'email', 'mensaje'].forEach((k) => { $('#dc-' + k).value = d[k] || ''; });
    $('#dc-aviso').value = diasAviso();
  }
}

function iniciarDesarrollador() {
  $('#form-dev-clave').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = db.desarrollador || (db.desarrollador = {});
    const clave = $('#dev-clave').value;
    const err = (t) => { $('#dev-clave-err').textContent = t; };
    if (!d.claveHash) {
      if (clave.length < 6) return err('La clave tiene que tener al menos 6 letras o números.');
      if (clave !== $('#dev-clave2').value) return err('Las dos claves no coinciden.');
      d.claveSal = uid();
      d.claveHash = hashPin(clave, d.claveSal);
      guardar();
      toast('Clave de desarrollador creada.');
    } else if (hashPin(clave, d.claveSal) !== d.claveHash) {
      $('#dev-clave').value = '';
      return err('La clave no es correcta.');
    }
    err('');
    $('#dev-clave').value = '';
    $('#dev-clave2').value = '';
    devAbierto = true;
    render();
  });
  $('#dev-olvide').addEventListener('click', () => { $('#form-dev-olvide').hidden = false; $('#dev-olvide-codigo').focus(); });
  $('#form-dev-olvide').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await verificarCodigo($('#dev-olvide-codigo').value, idEquipo(), isoLocal());
    if (!r.ok && r.motivo !== 'vencido') { $('#dev-olvide-err').textContent = mensajeMotivo(r); return; }
    db.desarrollador.claveHash = '';
    db.desarrollador.claveSal = '';
    guardar();
    $('#form-dev-olvide').hidden = true;
    $('#dev-olvide-codigo').value = '';
    $('#dev-olvide-err').textContent = '';
    toast('Se borró la clave. Creá una nueva.');
    render();
  });
  $('#form-dev-codigo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await activarCodigo($('#dev-codigo').value);
    if (r.error) { $('#dev-codigo-err').textContent = r.error; return; }
    $('#dev-codigo').value = '';
    $('#dev-codigo-err').textContent = '';
    aplicarModulos();
    render();
    toast(r.lic.h === PERMANENTE ? 'Licencia activada sin vencimiento.' : `Licencia activada hasta el ${fechaLarga(r.lic.h)}.`);
  });
  $('#dev-copiar').addEventListener('click', () => copiarTexto(idEquipo(), 'Código de la computadora copiado.'));
  $('#form-dev-contacto').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = db.desarrollador || (db.desarrollador = {});
    ['nombre', 'telefono', 'email', 'mensaje'].forEach((k) => { d[k] = $('#dc-' + k).value.trim(); });
    d.diasAviso = Math.min(60, Math.max(1, Number($('#dc-aviso').value) || 7));
    guardar();
    render();
    toast('Datos de contacto guardados.');
  });
  $('#form-dev-nueva').addEventListener('submit', (e) => {
    e.preventDefault();
    const c1 = $('#dn-clave').value, c2 = $('#dn-clave2').value;
    if (c1.length < 6) { $('#dn-err').textContent = 'La clave tiene que tener al menos 6 letras o números.'; return; }
    if (c1 !== c2) { $('#dn-err').textContent = 'Las dos claves no coinciden.'; return; }
    db.desarrollador.claveSal = uid();
    db.desarrollador.claveHash = hashPin(c1, db.desarrollador.claveSal);
    guardar();
    $('#dn-clave').value = '';
    $('#dn-clave2').value = '';
    $('#dn-err').textContent = '';
    toast('Clave de desarrollador cambiada.');
  });
  $('#dev-salir').addEventListener('click', () => { devAbierto = false; render(); });
  $('#banner-licencia-ir').addEventListener('click', () => { location.hash = '#desarrollador'; });
}

function iniciar() {
  iniciarBloqueo();
  iniciarDesarrollador();
  iniciarLogin();
  iniciarUsuarios();
  iniciarLetra();
  iniciarImportacion();
  iniciarPrecios();
  iniciarNegocio();
  if (typeof window.print !== 'function' || window.SIN_IMPRESION) $$('[data-imprime]').forEach((b) => { b.hidden = true; });
  $('#venta-imprimir').addEventListener('click', () => { if (ultimaVenta) imprimir(htmlTicket(ultimaVenta)); });
  $('#dlg-venta').addEventListener('close', () => $('#caja-buscar').focus());
  $('#venta-nueva').addEventListener('click', () => $('#dlg-venta').close());
  cargar();
  $('#fecha-hoy').textContent = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#rep-desde').value = isoLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  $('#rep-hasta').value = isoLocal();
  ['#rep-desde', '#rep-hasta'].forEach((s) => $(s).addEventListener('input', renderReportes));
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => exportar(b.dataset.export)));
  $$('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  iniciarCaja();
  iniciarProductos();
  iniciarMovRapido();
  iniciarMovimientos();
  iniciarProveedores();
  iniciarRespaldo();
  window.addEventListener('hashchange', mostrarVista);
  window.addEventListener('storage', (e) => { if (e.key === CLAVE) { cargar(); render(); } });
  arrancar();
}

if (typeof module !== 'undefined') {
  module.exports = { registrar, cobrar, anularVenta, semilla, baseVacia, estado, parseNum, planImportacion, aplicarImportacion, actualizarPrecios, redondearPrecio, sha256, crearUsuario, asegurarUsuarios, verificarPin, guardarUsuario, eliminarUsuario, verificarCodigo, idDesdeHex, fotoDe, calcularCambios, normalizarId, sumarMeses, estadoLicencia, aB64url, deB64url, MODULOS, PERMANENTE };
} else {
  document.addEventListener('DOMContentLoaded', iniciar);
}

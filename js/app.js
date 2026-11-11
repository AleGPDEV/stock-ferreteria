/* Stock Ferretería — control de stock y caja.
 * En la versión de escritorio los datos van a una base SQLite (electron/datos.js);
 * abierto en un navegador, a localStorage (solo para probar).
 */
'use strict';

const CLAVE = 'ferreteria-stock-v1';
const VISTAS = ['panel', 'caja', 'productos', 'movimientos', 'proveedores', 'reportes'];
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

const vistaInicio = () => 'caja';

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
  if (b.fallos >= INTENTOS_PIN) { b.hasta = ahora + ESPERA_PIN; return ESPERA_PIN; }
  return 0;
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
  return { productos: [], proveedores: [], movimientos: [], ventas: [], numVenta: 0, cajas: [], numCaja: 0, ejemplo: false, negocio: { nombre: '', direccion: '', telefono: '', rut: '', pie: '' } };
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

// Si los datos guardados existen pero no se pueden leer, no se toca nada: se muestra la pantalla de datos dañados.
let datosDanados = null;

function cargar() {
  datosDanados = null;
  let raw = null;
  try {
    raw = escritorio() ? window.almacen.leer() : localStorage.getItem(CLAVE);
  } catch (e) {
    if (escritorio()) raw = { error: 'base', detalle: String(e.message || e) };
    // En el navegador sin almacenamiento se usa el ejemplo en memoria
  }
  if (raw && typeof raw === 'object') { marcarDanados(raw); return false; }
  if (raw) {
    let datos;
    try { datos = JSON.parse(raw); } catch (e) { datos = null; }
    if (!datos || typeof datos !== 'object' || !Array.isArray(datos.productos)) {
      if (escritorio() && window.almacen.marcarDanada) window.almacen.marcarDanada();
      marcarDanados({ error: 'json', detalle: 'El texto guardado no se puede leer.' });
      return false;
    }
    db = Object.assign(baseVacia(), datos);
    // Por si se perdió el número de la última venta, nunca se repite uno
    db.numVenta = Math.max(Number(db.numVenta) || 0, ...db.ventas.map((v) => Number(v.numero) || 0));
    fotoGuardada = guardaEnBase() ? fotoDe(db) : null;
    if (asegurarUsuarios(db)) guardar();
    return true;
  }
  db = semilla();
  fotoGuardada = null;
  asegurarUsuarios(db);
  guardar();
  return true;
}

function marcarDanados(info) {
  datosDanados = info;
  db = baseVacia();
  asegurarUsuarios(db);
  fotoGuardada = null;
}

// Si no se puede guardar, queda un aviso fijo y no se puede cobrar hasta que se arregle
let errorGuardado = '';
function guardar(opc = {}) {
  if (datosDanados && !opc.completo) return false;
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
    if (errorGuardado) { errorGuardado = ''; avisoGuardado(); }
    return true;
  } catch (e) {
    errorGuardado = String((e && e.message) || e || 'error');
    avisoGuardado();
    return false;
  }
}

function avisoGuardado() {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('banner-guardado');
  if (b) b.hidden = !errorGuardado;
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
    if (!m.permitirNegativo && q > p.stock + 1e-9) return `No alcanza el stock de ${p.nombre}: hay ${n(p.stock)} ${p.unidad}.`;
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
    origen: m.origen || '',
    ventaId: m.ventaId || '',
    usuario: m.usuario || (sesion ? sesion.nombre : ''),
    stockAntes: antes,
    stockDespues: p.stock,
  });
  return null;
}

/** Monto recibido que no tiene sentido (por ejemplo, un código de barras escrito en ese campo). */
const recibidoRaro = (recibido, total) => recibido > total + 100000 && recibido > total * 10;

/**
 * Cobra un ticket: valida stock, precios y descuento, descuenta cada línea y guarda la venta.
 * opc.sinStock: vender aunque no alcance el stock (queda en negativo; se confirma antes en la pantalla).
 * opc.topeDescuento: descuento máximo sin autorización; opc.autorizo: administrador que autorizó uno mayor.
 */
function cobrar(d, items, medio, recibido, cliente, fecha, descuentoPct = 0, opc = {}) {
  if (!items.length) return { error: 'El ticket está vacío.' };
  // Validar todo antes de tocar el stock
  const porProducto = {};
  for (const it of items) porProducto[it.productoId] = (porProducto[it.productoId] || 0) + Number(it.cantidad);
  const faltan = [];
  for (const [id, q] of Object.entries(porProducto)) {
    const p = d.productos.find((x) => x.id === id);
    if (!p) return { error: 'Un producto del ticket ya no existe.' };
    if (!(q > 0)) return { error: `Revisá la cantidad de ${p.nombre}.` };
    if (q > p.stock + 1e-9) faltan.push({ id, nombre: p.nombre, hay: p.stock, pide: q, unidad: p.unidad });
  }
  for (const it of items) {
    if (!(Number(it.precio) > 0)) {
      const p = d.productos.find((x) => x.id === it.productoId);
      return { error: `${p.nombre} no tiene precio. Poné un precio mayor a 0.` };
    }
  }
  if (faltan.length && !opc.sinStock) {
    const f = faltan[0];
    return { error: `No alcanza el stock de ${f.nombre}: hay ${n(f.hay)} ${f.unidad}.`, faltan };
  }
  const pct = Number(descuentoPct) || 0;
  if (pct < 0 || pct > 100) return { error: 'El descuento tiene que estar entre 0 y 100.' };
  if (opc.topeDescuento != null && pct > opc.topeDescuento && !opc.autorizo) {
    return { error: `Un descuento de más del ${n(opc.topeDescuento)} % lo tiene que autorizar un administrador.`, autorizar: true };
  }
  const subtotal = red2(items.reduce((s, it) => s + it.cantidad * it.precio, 0));
  const descuento = red2(subtotal * pct / 100);
  const total = red2(subtotal - descuento);
  if (medio === 'Efectivo' && recibido !== '' && recibido != null && Number(recibido) < total) {
    return { error: `El efectivo recibido no alcanza: faltan ${$u(total - Number(recibido))}.` };
  }
  if (medio === 'Efectivo' && recibido !== '' && recibido != null && recibidoRaro(Number(recibido), total)) {
    return { error: `Revisá el efectivo recibido: ${$u(Number(recibido))} es mucho más que el total.` };
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
    descuentoAutorizo: pct > 0 && opc.autorizo ? opc.autorizo : '',
    total,
    medio,
    recibido: medio === 'Efectivo' && recibido !== '' && recibido != null ? Number(recibido) : null,
    vuelto: medio === 'Efectivo' && recibido !== '' && recibido != null ? red(Number(recibido) - total) : null,
    cliente: cliente || '',
    usuario: sesion ? sesion.nombre : '',
    cajaId: (cajaAbierta(d) || {}).id || '',
    anulada: false,
  };
  for (const it of venta.items) {
    const sinStock = faltan.some((f) => f.id === it.productoId);
    registrar(d, { tipo: 'salida', productoId: it.productoId, cantidad: it.cantidad, precioUnit: it.precio, nota: `Venta N.º ${venta.numero}${sinStock ? ' (vendido sin stock)' : ''}`, ventaId: venta.id, fecha: venta.fecha, permitirNegativo: true });
  }
  if (faltan.length) venta.sinStock = faltan.map((f) => f.nombre);
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



/* ---------- Apertura y cierre de caja ---------- */

const cajaAbierta = (d) => (Array.isArray(d.cajas) ? d.cajas.find((c) => !c.cerrada) : null) || null;

function abrirCaja(d, monto, usuario, fecha) {
  if (!Array.isArray(d.cajas)) d.cajas = [];
  if (cajaAbierta(d)) return { error: 'La caja ya está abierta.' };
  const inicial = monto === '' || monto == null ? 0 : Number(monto);
  if (!Number.isFinite(inicial) || inicial < 0) return { error: 'Escribí el efectivo con el que empezás (puede ser 0).' };
  d.numCaja = (d.numCaja || 0) + 1;
  const caja = { id: uid(), numero: d.numCaja, abierta: fecha || new Date().toISOString(), abiertaPor: usuario || '', inicial: red2(inicial), movs: [], cerrada: null };
  d.cajas.push(caja);
  return { caja };
}

/** Retiro (pago a un proveedor, llevar a depósito…) o ingreso (más cambio) de efectivo. */
function movimientoCaja(d, tipo, monto, motivo, usuario, fecha) {
  const caja = cajaAbierta(d);
  if (!caja) return 'La caja está cerrada.';
  if (tipo !== 'retiro' && tipo !== 'ingreso') return 'Elegí si es un retiro o un ingreso.';
  const m = Number(monto);
  if (!(m > 0)) return 'Escribí el monto.';
  if (!String(motivo || '').trim()) return 'Escribí el motivo, por ejemplo «Pago a proveedor».';
  caja.movs.push({ id: uid(), fecha: fecha || new Date().toISOString(), tipo, monto: red2(m), motivo: String(motivo).trim(), usuario: usuario || '' });
  return null;
}

/** Cuánto efectivo debería haber y cuánto se vendió por cada medio de pago. */
function resumenCaja(d, caja) {
  const ventas = d.ventas.filter((v) => v.cajaId === caja.id);
  const validas = ventas.filter((v) => !v.anulada);
  const porMedio = {};
  validas.forEach((v) => { porMedio[v.medio] = red2((porMedio[v.medio] || 0) + v.total); });
  const ventasEfectivo = porMedio.Efectivo || 0;
  const ingresos = red2(caja.movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0));
  const retiros = red2(caja.movs.filter((m) => m.tipo === 'retiro').reduce((s, m) => s + m.monto, 0));
  return {
    inicial: caja.inicial,
    ventas: validas.length,
    anuladas: ventas.length - validas.length,
    total: red2(validas.reduce((s, v) => s + v.total, 0)),
    porMedio,
    ventasEfectivo,
    ingresos,
    retiros,
    esperado: red2(caja.inicial + ventasEfectivo + ingresos - retiros),
  };
}

function cerrarCaja(d, contado, usuario, nota, fecha) {
  const caja = cajaAbierta(d);
  if (!caja) return { error: 'La caja ya está cerrada.' };
  if (contado === '' || contado == null) return { error: 'Contá el efectivo que hay en la caja y escribí el total.' };
  const c = Number(contado);
  if (!Number.isFinite(c) || c < 0) return { error: 'Escribí cuánto efectivo hay en la caja.' };
  const resumen = resumenCaja(d, caja);
  Object.assign(caja, {
    cerrada: fecha || new Date().toISOString(),
    cerradaPor: usuario || '',
    contado: red2(c),
    resumen,
    diferencia: red2(c - resumen.esperado),
    nota: String(nota || '').trim(),
  });
  return { caja };
}

/* ---------- Actualizar precios por porcentaje ---------- */

function productosDeFiltro(d, filtro) {
  if (!filtro) return d.productos;
  const tipo = filtro[0], valor = filtro.slice(2);
  return d.productos.filter((p) => (tipo === 'c' ? (p.categoria || '') === valor : p.proveedorId === valor));
}

/* ---------- Historial de cambios de precio ---------- */
const MAX_HISTORIAL_PRECIOS = 5000;

/** Anota un cambio de precio de un producto (quién, cuándo, de cuánto a cuánto). */
function anotarPrecio(d, p, nuevo, motivo = '') {
  if (!p || red2(nuevo) === red2(p.precio)) return;
  anotarHistorial(d, { productoId: p.id, codigo: p.codigo, producto: p.nombre, antes: p.precio, despues: red2(nuevo), motivo });
}
function anotarHistorial(d, x) {
  d.historialPrecios = Array.isArray(d.historialPrecios) ? d.historialPrecios : [];
  d.historialPrecios.push({ id: uid(), fecha: new Date().toISOString(), usuario: sesion ? sesion.nombre : '', ...x });
  if (d.historialPrecios.length > MAX_HISTORIAL_PRECIOS) d.historialPrecios.splice(0, d.historialPrecios.length - MAX_HISTORIAL_PRECIOS);
}

/**
 * Redondea un precio nuevo al más cercano. El paso (1, 5, 10) se usa solo si el precio es al menos
 * 20 veces el paso, así el redondeo nunca mueve el precio más de un 2,5 %; si no, se redondea a 1
 * (precios de 10 o más) o a 2 decimales. Un artículo de $ 2 no pasa a $ 10.
 */
function redondearPrecio(x, paso) {
  if (!(x > 0)) return 0;
  let p = Number(paso) || 0;
  if (p > 0 && x < p * 20) p = x >= 10 ? 1 : 0;
  if (!(p > 0)) return red2(x);
  const r = Math.round(red2(x / p)) * p;
  return r > 0 ? r : red2(x);
}

/** Precio nuevo al subir o bajar un porcentaje: redondeado, y sin ir nunca en la dirección contraria. */
function precioConAumento(precio, pct, paso) {
  let nuevo = redondearPrecio(precio * (1 + pct / 100), paso);
  if (pct > 0 && nuevo < precio) nuevo = precio;
  if (pct < 0 && nuevo > precio) nuevo = precio;
  return nuevo;
}

/** Sube o baja precios. op: { redondeo: 0|1|5|10, costo: true para cambiar también el costo }. */
function actualizarPrecios(d, filtro, pct, op = {}) {
  const f = 1 + Number(pct) / 100;
  if (!Number.isFinite(f) || Number(pct) === 0) return { error: 'Escribí un porcentaje, por ejemplo 10.' };
  if (f <= 0) return { error: 'No se puede bajar un 100 % o más.' };
  const lista = productosDeFiltro(d, filtro);
  if (!lista.length) return { error: 'No hay productos en ese grupo.' };
  let cambiados = 0;
  lista.forEach((p) => {
    const nuevo = precioConAumento(p.precio, Number(pct), op.redondeo || 0);
    if (nuevo !== p.precio) cambiados++;
    p.precio = nuevo;
    if (op.costo) p.costo = red2(p.costo * f);
  });
  anotarHistorial(d, { masivo: true, producto: `${lista.length} productos (${op.grupo || (filtro ? filtro.slice(2) : 'todos')})`, pct: Number(pct), motivo: `Actualizar precios ${Number(pct) > 0 ? '+' : ''}${n(Number(pct))} %` });
  return { cantidad: lista.length, cambiados };
}

/* ---------- Importar productos desde una planilla ---------- */

const COLUMNAS = {
  codigo: ['codigo', 'cod', 'codigo de barras', 'sku', 'code'],
  nombre: ['producto', 'nombre', 'descripcion', 'articulo', 'detalle'],
  categoria: ['categoria', 'rubro', 'familia'],
  unidad: ['unidad', 'um', 'unidad de medida'],
  proveedor: ['proveedor'],
  ubicacion: ['ubicacion', 'estante', 'lugar'],
  stock: ['stock', 'stock actual', 'existencia', 'existencias'],
  minimo: ['stock minimo', 'minimo', 'stock min', 'min'],
  costo: ['costo', 'precio de costo', 'costo unitario', 'precio costo'],
  precio: ['precio', 'precio de venta', 'precio venta', 'pvp', 'venta'],
  entrada: ['llego', 'entrada', 'cantidad que llego', 'sumar al stock', 'llegada'],
  factura: ['factura', 'comprobante', 'documento'],
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

/** Campos que se pueden cambiar en los productos que ya existen al importar. */
const CAMPOS_IMPORTAR = { precio: true, costo: true, stock: false, nombre: false, otros: false, entrada: true };

/** Lee las filas de la planilla y arma qué se agregaría y qué se actualizaría, sin tocar los datos.
 *  Si la planilla no tiene columna «Producto» pero sí «Código», solo actualiza productos que ya existen. */
function planImportacion(d, filas) {
  const plan = { nuevos: [], actualizados: [], salteadas: 0, sinProducto: 0, columnas: [], soloActualiza: false };
  const mapa = {};
  const claves = new Set();
  filas.forEach((f) => Object.keys(f).forEach((k) => claves.add(k)));
  for (const k of claves) {
    const nk = normCol(k);
    for (const [campo, alias] of Object.entries(COLUMNAS)) if (!mapa[campo] && alias.includes(nk)) mapa[campo] = k;
  }
  plan.columnas = Object.values(mapa);
  if (!mapa.nombre && !mapa.codigo) {
    plan.error = 'No encontré la columna «Producto» ni la columna «Código». La primera fila de la planilla tiene que tener los títulos de las columnas.';
    return plan;
  }
  plan.soloActualiza = !mapa.nombre;
  plan.conEntrada = !!mapa.entrada;
  plan.deFactura = !!mapa.factura;
  const porCodigo = new Map(d.productos.map((p) => [String(p.codigo).toUpperCase(), p]));
  const porNombre = new Map(d.productos.map((p) => [normal(p.nombre), p]));
  const vistos = new Set();
  let sec = 0;
  const codigoNuevo = () => { let c; do { sec++; c = 'P-' + String(sec).padStart(4, '0'); } while (porCodigo.has(c) || vistos.has(c)); return c; };
  for (const f of filas) {
    const txt = (c) => (mapa[c] ? String(f[mapa[c]] ?? '').trim() : '');
    const num = (c) => (mapa[c] ? parseNum(f[mapa[c]]) : null);
    const nombre = txt('nombre');
    let codigo = txt('codigo').toUpperCase();
    if (plan.soloActualiza ? !codigo : !nombre) { plan.salteadas++; continue; }
    const existente = codigo ? porCodigo.get(codigo) : porNombre.get(normal(nombre));
    if (plan.soloActualiza && !existente) { plan.sinProducto++; continue; }
    const clave = existente ? existente.codigo : (codigo || 'n:' + normal(nombre));
    if (vistos.has(clave)) { plan.salteadas++; continue; }
    vistos.add(clave);
    const datos = {
      nombre, categoria: txt('categoria'), unidad: txt('unidad') ? normUnidad(txt('unidad')) : '', proveedor: txt('proveedor'),
      ubicacion: txt('ubicacion'), stock: num('stock'), minimo: num('minimo'), costo: num('costo'), precio: num('precio'),
      entrada: num('entrada'), factura: txt('factura'),
    };
    if (existente) plan.actualizados.push({ id: existente.id, codigo: existente.codigo, nombreActual: existente.nombre, stockActual: existente.stock, precioActual: existente.precio, datos });
    else {
      if (!codigo) { codigo = codigoNuevo(); vistos.add(codigo); }
      plan.nuevos.push({ codigo, datos });
    }
  }
  return plan;
}

/** Cambios de stock que haría la importación en productos que ya existen (para mostrarlos antes de confirmar). */
function cambiosStockImportacion(plan) {
  return plan.actualizados
    .filter((a) => a.datos.stock != null && a.datos.stock >= 0 && red(a.datos.stock) !== a.stockActual)
    .map((a) => ({ codigo: a.codigo, nombre: a.nombreActual, antes: a.stockActual, despues: red(a.datos.stock) }));
}

/** campos: qué se cambia en los productos que ya existen ({ precio, costo, stock, nombre, otros }).
 *  Sin campos, se cambia todo (comportamiento de las versiones anteriores). Los productos nuevos se cargan completos. */
function aplicarImportacion(d, plan, campos) {
  const c = campos || { precio: true, costo: true, stock: true, nombre: true, otros: true, entrada: true };
  let llegadas = 0;
  // Mercadería que llegó (columna «Llegó»): se suma al stock como una entrada, con su costo y su factura
  const sumarLlegada = (p, x) => {
    if (!(c.entrada && x.entrada > 0)) return;
    const err = registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: x.entrada, costoUnit: c.costo && x.costo > 0 ? x.costo : '', proveedorId: p.proveedorId, nota: x.factura ? `Factura ${x.factura}` : 'Llegó (importado)' });
    if (!err) llegadas++;
  };
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
    if (x.stock > 0) registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: x.stock, costoUnit: p.costo, proveedorId: p.proveedorId, nota: 'Stock inicial (importado)', origen: 'inicial' });
    sumarLlegada(p, x);
  }
  for (const act of plan.actualizados) {
    const p = d.productos.find((q) => q.id === act.id);
    if (!p) continue;
    const x = act.datos;
    if (c.nombre && x.nombre) p.nombre = x.nombre;
    if (c.otros) {
      if (x.categoria) p.categoria = x.categoria;
      if (x.unidad) p.unidad = x.unidad;
      if (x.ubicacion) p.ubicacion = x.ubicacion;
      if (x.proveedor) p.proveedorId = provId(x.proveedor);
      if (pos(x.minimo) != null) p.minimo = x.minimo;
    }
    if (c.costo && pos(x.costo) != null) p.costo = x.costo;
    if (c.precio && x.precio > 0 && x.precio !== p.precio) { anotarPrecio(d, p, x.precio, 'Importación'); p.precio = x.precio; }
    if (c.stock && pos(x.stock) != null && red(x.stock) !== p.stock) registrar(d, { tipo: 'ajuste', productoId: p.id, cantidad: x.stock, nota: 'Corrección por importación' });
    sumarLlegada(p, x);
  }
  return { nuevos: plan.nuevos.length, actualizados: plan.actualizados.length, llegadas };
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
    registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: inicial, costoUnit: costo, proveedorId: prov[pi].id, nota: 'Stock inicial', origen: 'inicial', fecha: new Date(ahora - 24 * DIA).toISOString() });
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
  abrirCaja(d, 2000, 'Administrador', hace(-5));
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

const VISTAS_ADMIN = ['panel', 'reportes'];
const esAdmin = () => !!sesion && sesion.rol === 'admin';

function vistaActual() {
  const h = location.hash.slice(1);
  const inicio = vistaInicio();
  if (!VISTAS.includes(h)) return inicio;
  if (VISTAS_ADMIN.includes(h) && !esAdmin()) return inicio;
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

/* ---------- Alerta de stock ---------- */

let alertaOcultaFirma = '';

function paraReponer() {
  const sin = [], bajo = [];
  db.productos.forEach((p) => { const e = estado(p); if (e === 'sin') sin.push(p); else if (e === 'bajo') bajo.push(p); });
  return { sin, bajo };
}

const plural = (cant, uno, varios) => `${cant} ${cant === 1 ? uno : varios}`;

function renderAlertaStock() {
  const { sin, bajo } = paraReponer();
  const total = sin.length + bajo.length;
  const badge = $('#badge-bajo');
  badge.hidden = !total;
  badge.textContent = total;
  badge.classList.toggle('danger', sin.length > 0);
  badge.title = `${plural(total, 'producto', 'productos')} para reponer`;

  const firma = sin.map((p) => p.id).join(',') + '|' + bajo.map((p) => p.id).join(',');
  const banner = $('#banner-stock');
  banner.hidden = !total || firma === alertaOcultaFirma || vistaActual() === 'productos' && $('#prod-estado').value === 'reponer';
  if (banner.hidden) return;
  banner.classList.toggle('urgente', sin.length > 0);
  const partes = [];
  if (sin.length) partes.push(`<strong>${plural(sin.length, 'producto sin stock', 'productos sin stock')}</strong>`);
  if (bajo.length) partes.push(`<strong>${plural(bajo.length, 'producto bajo el mínimo', 'productos bajo el mínimo')}</strong>`);
  const ejemplos = sin.concat(bajo).slice(0, 3).map((p) => esc(p.nombre)).join(', ');
  $('#banner-stock-texto').innerHTML = `Hay ${partes.join(' y ')}. ${ejemplos}${total > 3 ? ' y otros' : ''}.`;
}

function verParaReponer() {
  $('#prod-buscar').value = '';
  $('#prod-cat').value = '';
  $('#prod-estado').value = 'reponer';
  if (location.hash !== '#productos') location.hash = '#productos';
  else render();
}

/** Aviso corto para mostrar después de vender o sacar del stock. */
function avisoStock(p) {
  const e = estado(p);
  if (e === 'sin') return `${p.nombre} se quedó sin stock.`;
  if (e === 'bajo') return `${p.nombre} quedó bajo el mínimo: quedan ${n(p.stock)} ${p.unidad} (mínimo ${n(p.minimo)}).`;
  return '';
}

function render() {
  if (!sesion) return;
  $('#banner-ejemplo').hidden = !db.ejemplo;
  $('#banner-pin').hidden = !(esAdmin() && db.usuarios.some((u) => u.pinPorDefecto));
  $('#banner-recuperacion').hidden = !(esAdmin() && !(db.recuperacion && db.recuperacion.hash) && !db.ejemplo);
  $('#marca-nombre').textContent = (db.negocio && db.negocio.nombre) || 'Stock Ferretería';
  renderAlertaStock();
  // Solo se dibuja la pantalla que se está viendo
  ({ panel: renderPanel, caja: renderCaja, productos: renderProductos, movimientos: renderMovimientos, proveedores: renderProveedores, reportes: renderReportes })[vistaActual()]();
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

const CANTIDAD_MAX = 9999;
let ticket = []; // { productoId, cantidad, precio }

const topeDescuentoEmpleado = () => {
  const x = Number((db.negocio || {}).descuentoMaxEmpleado);
  return Number.isFinite(x) && (db.negocio || {}).descuentoMaxEmpleado !== '' && (db.negocio || {}).descuentoMaxEmpleado != null ? x : 10;
};

/** Pide el PIN de un administrador. Devuelve el usuario administrador o null si se cancela. */
function pedirAdmin(texto) {
  return new Promise((res) => {
    const d = $('#dlg-autorizar');
    const admins = db.usuarios.filter((u) => u.rol === 'admin');
    $('#aut-usuario').innerHTML = admins.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
    $('#aut-texto').textContent = texto;
    $('#aut-pin').value = '';
    $('#aut-err').textContent = '';
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; d.close(); res(v); };
    $('#aut-cancel').onclick = () => fin(null);
    d.oncancel = () => fin(null);
    $('#form-autorizar').onsubmit = (e) => {
      e.preventDefault();
      const u = admins.find((x) => x.id === $('#aut-usuario').value);
      if (!u) return;
      const espera = esperaPin(db, u.id);
      if (espera) { $('#aut-err').textContent = `Demasiados intentos. Esperá ${textoEspera(espera)}.`; return; }
      if (!verificarPin(u, $('#aut-pin').value)) {
        const b = fallarPin(db, u.id); guardar();
        $('#aut-err').textContent = b ? `PIN incorrecto. Esperá ${textoEspera(b)}.` : 'El PIN no es correcto.';
        $('#aut-pin').value = '';
        return;
      }
      if (acertarPin(db, u.id)) guardar();
      fin(u);
    };
    d.showModal();
    $('#aut-pin').focus();
  });
}

/* Lector de códigos con el cursor en otro campo de la caja (efectivo, descuento, cliente, cantidad):
 * una tira de 6 o más caracteres escritos muy rápido y seguidos de Enter es un escaneo, no algo que
 * escribió una persona. Se deja el campo como estaba y el producto se agrega al ticket. */
const rafaga = { el: null, antes: '', texto: '', ult: 0 };
const esCampoCaja = (el) => !!el && (el.id === 'caja-recibido' || el.id === 'caja-desc' || el.id === 'caja-cliente' || (el.dataset && el.dataset.cant != null));
function vigilarEscaner(e) {
  const el = e.target;
  if (!esCampoCaja(el)) return;
  const ahora = (typeof performance !== 'undefined' ? performance : Date).now();
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (rafaga.el !== el || ahora - rafaga.ult > 60) { rafaga.el = el; rafaga.antes = el.value; rafaga.texto = ''; }
    rafaga.texto += e.key;
    rafaga.ult = ahora;
    return;
  }
  if (e.key === 'Enter' && rafaga.el === el && /^[0-9A-Za-z.\-]{6,}$/.test(rafaga.texto) && /\d/.test(rafaga.texto) && ahora - rafaga.ult < 100) {
    e.preventDefault();
    e.stopPropagation();
    const codigo = rafaga.texto.trim();
    el.value = rafaga.antes;
    rafaga.el = null;
    if (el.id === 'caja-recibido') actualizarVuelto();
    if (el.id === 'caja-desc') renderTicket();
    const p = db.productos.find((x) => normal(x.codigo) === normal(codigo));
    if (p) { agregarAlTicket(p.id); toast(`Se escaneó ${p.nombre} con el cursor en otro campo: se agregó al ticket.`); }
    else abrirAltaRapida(codigo);
    $('#caja-buscar').focus();
  }
}

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
    toast(p.stock > 0 ? `Ojo: según el programa quedan ${n(p.stock)} ${p.unidad} de ${p.nombre}.` : `Ojo: según el programa no hay stock de ${p.nombre}. Al cobrar se pide confirmar.`);
  }
  if (linea) linea.cantidad = red(linea.cantidad + cant);
  else ticket.push({ productoId: id, cantidad: cant, precio: p.precio });
  $('#caja-err').textContent = '';
  renderTicket();
}

function renderEstadoCaja() {
  const caja = cajaAbierta(db);
  $('#caja-cerrada').hidden = !!caja;
  $('#caja-abierta').hidden = !caja;
  $('#caja-barra').hidden = !caja;
  if (!caja) {
    const ultima = [...(db.cajas || [])].reverse().find((c) => c.cerrada);
    $('#caja-ultimo-cierre').textContent = ultima ? `Último cierre: ${fechaHora(ultima.cerrada)}${ultima.cerradaPor ? ` por ${ultima.cerradaPor}` : ''}.` : '';
    return false;
  }
  const deOtroDia = isoLocal(new Date(caja.abierta)) !== isoLocal();
  $('#caja-barra-texto').innerHTML = `Caja N.º ${caja.numero} abierta ${deOtroDia ? `el ${fechaHora(caja.abierta)}` : `a las ${hora(caja.abierta)}`}${caja.abiertaPor ? ` por ${esc(caja.abiertaPor)}` : ''} · empezó con ${$u(caja.inicial)}`
    + (caja.movs.length ? ` · ${plural(caja.movs.length, 'movimiento de efectivo', 'movimientos de efectivo')}` : '');
  $('#caja-barra-estado').className = 'chip ' + (deOtroDia ? 'warn' : 'ok');
  $('#caja-barra-estado').textContent = deOtroDia ? 'Abierta desde otro día: cerrala' : 'Caja abierta';
  return true;
}

function renderCaja() {
  const abierta = renderEstadoCaja();
  renderVentasHoy();
  if (!abierta) return;
  $('#ticket-num').textContent = `N.º ${String((db.numVenta || 0) + 1).padStart(4, '0')}`;
  renderFiltrosCaja();
  renderResultados();
  renderTicket();
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
      <button class="prod-btn${p.stock <= 0 ? ' sin-stock' : ''}${tieneFoto(p) ? ' tiene-foto' : ''}" type="button" data-agregar="${p.id}">
        ${tieneFoto(p) ? `<img class="foto pb-foto" src="${esc(fotoUrl(p))}" alt="" loading="lazy">` : ''}
        <span class="nom">${esc(p.nombre)}</span>
        <span class="fila"><span class="mono">${esc(p.codigo)}</span><span class="${estado(p) === 'bajo' ? 'stock-bajo' : ''}">${p.stock <= 0 ? 'Sin stock' : estado(p) === 'bajo' ? `Quedan ${n(p.stock)} ${esc(p.unidad)}` : `Stock ${n(p.stock)} ${esc(p.unidad)}`}</span></span>
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
        <span class="nom">${miniatura(p, 'mini tl-foto')}${esc(p.nombre)}</span>
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

const puedeImprimir = () => typeof window !== 'undefined' && typeof window.print === 'function' && !window.SIN_IMPRESION;

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
    registrar(db, { tipo: 'entrada', productoId: p.id, cantidad: stock, costoUnit: 0, nota: 'Agregado desde la venta', origen: 'inicial' });
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
    if (q > CANTIDAD_MAX) { e.target.value = it.cantidad; toast(`Revisá la cantidad: ${n(q)} es demasiado.`); return; }
    if (q > p.stock) toast(`Ojo: según el programa hay ${n(p.stock)} ${p.unidad} de ${p.nombre}.`);
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
    if (!sesion || vistaActual() !== 'caja' || !cajaAbierta(db) || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1 || e.key === ' ') return;
    if (document.querySelector('dialog[open]')) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'radio') return;
    $('#caja-buscar').focus();
  });
  document.addEventListener('keydown', vigilarEscaner, true);
  $('#medios').addEventListener('change', actualizarVuelto);
  $('#caja-recibido').addEventListener('input', actualizarVuelto);

  let cobrando = false;
  $('#btn-cobrar').addEventListener('click', async () => {
    if (cobrando) return;
    if (!cajaAbierta(db)) { $('#caja-err').textContent = 'Abrí la caja antes de cobrar.'; render(); return; }
    if (errorGuardado && !guardar({ completo: true })) {
      $('#caja-err').textContent = 'No se puede cobrar: los cambios no se están guardando. Descargá una copia y avisá a quien instaló el programa.';
      return;
    }
    cobrando = true;
    try {
      const opc = { topeDescuento: esAdmin() ? null : topeDescuentoEmpleado() };
      const intentar = () => cobrar(db, ticket, medioActual(), $('#caja-recibido').value, $('#caja-cliente').value.trim(), undefined, Number($('#caja-desc').value) || 0, opc);
      let r = intentar();
      if (r.autorizar) {
        const adm = await pedirAdmin(`El descuento de ${n(Number($('#caja-desc').value))} % supera el máximo de ${n(opc.topeDescuento)} % para empleados.`);
        if (!adm) { $('#caja-err').textContent = r.error; return; }
        opc.autorizo = adm.nombre;
        r = intentar();
      }
      if (r.faltan) {
        const lista = r.faltan.map((f) => `${f.nombre} (hay ${n(f.hay)}, se venden ${n(f.pide)})`).join('; ');
        if (!(await confirmar(`Según el programa no alcanza el stock de: ${lista}. ¿Vender igual? El stock va a quedar en negativo; después corregilo contando lo que hay.`, 'Vender igual'))) { $('#caja-err').textContent = r.error; return; }
        opc.sinStock = true;
        r = intentar();
      }
      if (r.error) { $('#caja-err').textContent = r.error; return; }
      if (!guardar()) toast('La venta quedó registrada en pantalla pero NO se pudo guardar. Descargá una copia.');
      cobrarListo(r);
    } finally { cobrando = false; }
  });
  function cobrarListo(r) {
    ticket = [];
    $('#caja-recibido').value = '';
    $('#caja-cliente').value = '';
    $('#caja-desc').value = '';
    $('#ventas-fecha').value = isoLocal();
    $('#caja-err').textContent = '';
    render();
    const v = r.venta;
    mostrarVentaCobrada(v);
  }

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
    .filter((p) => !est || (est === 'reponer' ? estado(p) !== 'ok' : est === 'sincosto' ? !(p.costo > 0) : est === 'sinprecio' ? !(p.precio > 0) : est === 'sinfoto' ? !tieneFoto(p) : estado(p) === est))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  $('#prod-sub').textContent = `${db.productos.length} productos cargados${lista.length !== db.productos.length ? ` · mostrando ${lista.length}` : ''}.`;
  const visibles = lista.slice(0, 300);
  $('#tabla-prod').innerHTML = lista.length
    ? visibles.map((p) => `
      <tr>
        <td><div class="con-foto">${miniatura(p)}<div><div class="nom">${esc(p.nombre)}</div><div class="meta"><span class="mono">${esc(p.codigo)}</span> · ${[p.categoria || 'Sin categoría', p.ubicacion, nombreProv(p.proveedorId)].filter(Boolean).map(esc).join(' · ')}</div></div></div></td>
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

/* ---------- Fotos de los productos ----------
 * En la versión de escritorio cada foto es un archivo .jpg (unos 900 px) en la carpeta Fotos y el producto
 * guarda solo el nombre (p.foto). En el navegador, que es para probar, se guarda una foto chica dentro de los
 * datos (p.fotoData). */
let fotosUrlBase = null;
function fotoUrl(p) {
  if (!p) return '';
  if (p.foto && escritorio()) {
    if (fotosUrlBase == null) { try { fotosUrlBase = window.almacen.info().fotosUrl || ''; } catch (e) { fotosUrlBase = ''; } }
    return fotosUrlBase ? fotosUrlBase + encodeURIComponent(p.foto) : '';
  }
  return p.fotoData || '';
}
const tieneFoto = (p) => !!(p.foto || p.fotoData);
function miniatura(p, cls = 'mini') {
  const u = fotoUrl(p);
  return u ? `<img class="foto ${cls}" src="${esc(u)}" alt="" loading="lazy" data-ver-foto="${p.id}">` : '';
}

function verFoto(id) {
  const p = producto(id);
  const u = fotoUrl(p);
  if (!u) return;
  $('#foto-titulo').textContent = p.nombre;
  $('#foto-sub').textContent = `${p.codigo} · ${$u(p.precio)}${p.ubicacion ? ' · ' + p.ubicacion : ''}`;
  $('#foto-grande').src = u;
  $('#dlg-foto').showModal();
}

/** Achica una imagen a JPEG. Devuelve un Blob, o tira un Error con un texto para la persona. */
async function achicarFoto(file, max = 900, calidad = 0.82) {
  if (/\.hei[cf]$/i.test(file.name) || /heic|heif/i.test(file.type)) {
    throw new Error('Esa foto está en formato HEIC (iPhone) y no se puede abrir. En el iPhone: Ajustes → Cámara → Formatos → «Más compatible», o pasala a la PC como JPG.');
  }
  if (file.size > 40 * 1048576) throw new Error('La foto es demasiado grande (más de 40 MB).');
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new Error('No pude abrir esa imagen. Tiene que ser una foto JPG o PNG.');
  }
  const f = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * f)), h = Math.max(1, Math.round(img.height * f));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', calidad));
  if (!blob) throw new Error('No se pudo achicar la foto.');
  return blob;
}

const leerComoDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

// Foto elegida en el formulario y todavía no guardada: { blob, url } o 'quitar'
let fotoPendiente = null;
function mostrarFotoForm(url) {
  $('#p-foto-prev').innerHTML = url ? `<img src="${esc(url)}" alt="Foto del producto">` : '<span>Sin foto</span>';
  $('#p-foto-quitar').hidden = !url;
  $('#p-foto-elegir').textContent = url ? 'Cambiar foto' : 'Elegir foto';
}
async function elegirFotoForm(file) {
  $('#p-foto-err').textContent = '';
  if (!file) return;
  $('#p-foto-prev').innerHTML = '<span>Preparando…</span>';
  try {
    const blob = await achicarFoto(file);
    if (fotoPendiente && fotoPendiente.url) URL.revokeObjectURL(fotoPendiente.url);
    fotoPendiente = { blob, url: URL.createObjectURL(blob) };
    mostrarFotoForm(fotoPendiente.url);
  } catch (e) {
    $('#p-foto-err').textContent = e.message;
    mostrarFotoForm(fotoPendiente && fotoPendiente.url ? fotoPendiente.url : (fotoPendiente === 'quitar' ? '' : fotoUrl(producto(editandoProd))));
  }
}

/** Guarda la foto pendiente en el producto. Devuelve un texto de error o null. */
async function aplicarFotoPendiente(p) {
  if (!fotoPendiente) return null;
  if (fotoPendiente === 'quitar') { delete p.foto; delete p.fotoData; fotoPendiente = null; return null; }
  if (escritorio() && window.almacen.guardarFoto) {
    const nombre = `${String(p.id).replace(/[^\w-]/g, '').slice(0, 40)}-${Date.now()}.jpg`;
    const bytes = new Uint8Array(await fotoPendiente.blob.arrayBuffer());
    const r = await window.almacen.guardarFoto(nombre, bytes);
    if (!r || r.error) return 'No se pudo guardar la foto' + (r && r.error ? `: ${r.error}` : '.');
    p.foto = r.nombre;
    delete p.fotoData;
  } else {
    // Navegador: una foto chica dentro de los datos
    const bmp = await createImageBitmap(fotoPendiente.blob);
    const f = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    p.fotoData = c.toDataURL('image/jpeg', 0.7);
    delete p.foto;
  }
  URL.revokeObjectURL(fotoPendiente.url);
  fotoPendiente = null;
  return null;
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
  $('#p-nombre').value = p.nombre;
  $('#p-categoria').value = p.categoria;
  $('#p-unidad').value = p.unidad;
  $('#p-proveedor').innerHTML = opcionesProv(p.proveedorId);
  $('#p-ubicacion').value = p.ubicacion;
  $('#p-costo').value = p.costo;
  $('#p-precio').value = p.precio;
  // Solo el administrador cambia el precio de un producto que ya existe (queda anotado en el historial)
  const bloqueaPrecio = !!id && !esAdmin();
  $('#p-precio').disabled = bloqueaPrecio;
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
    };
    if (!datos.codigo) return err('Escribí un código para el producto.');
    if (!datos.nombre) return err('Escribí el nombre del producto.');
    const actual = editandoProd ? producto(editandoProd) : null;
    if (actual && !esAdmin()) { datos.precio = actual.precio; datos.costo = actual.costo; }
    if (!actual && !esAdmin()) datos.costo = 0;
    if (!(datos.precio > 0)) return err('Escribí el precio de venta (mayor a 0).');
    if (datos.costo < 0 || datos.minimo < 0) return err('El costo y el stock mínimo no pueden ser negativos.');
    if (db.productos.some((p) => p.codigo === datos.codigo && p.id !== editandoProd)) return err(`El código ${datos.codigo} ya lo usa otro producto.`);
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
    if (actual) {
      anotarPrecio(db, actual, datos.precio, 'Editar producto');
      Object.assign(actual, datos);
      toast('Producto guardado.');
    } else {
      const p = { id: nuevoId, ...datos, stock: 0 };
      db.productos.push(p);
      const ini = Number($('#p-stock').value);
      if (ini > 0) registrar(db, { tipo: 'entrada', productoId: p.id, cantidad: ini, costoUnit: datos.costo, proveedorId: datos.proveedorId, nota: 'Stock inicial', origen: 'inicial' });
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
  $$('.solo-entrada').forEach((el) => { el.hidden = t !== 'entrada' || (el.classList.contains('solo-admin') && !esAdmin()); });
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
      costoUnit: esAdmin() ? $('#mov-costo').value : '', proveedorId: tipo === 'entrada' ? $('#mov-prov').value : '', nota: $('#mov-nota').value.trim(),
    });
    if (err) { $('#mov-err').textContent = err; return; }
    $('#mov-err').textContent = '';
    $('#mov-cant').value = '';
    $('#mov-nota').value = '';
    guardar();
    render();
    toast(avisoStock(p) ? `Listo. Atención: ${avisoStock(p)}` : `Listo. Stock de ${p.nombre}: ${n(p.stock)} ${p.unidad}.`);
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

/** Ganancia de las ventas, sin contar los productos que no tienen costo (darían 100 % de ganancia). */
function gananciaBruta(ventas) {
  let ganancia = 0, vendidoSinCosto = 0;
  const sinCosto = new Set();
  ventas.forEach((v) => {
    const factor = v.subtotal > 0 ? v.total / v.subtotal : 1; // reparte el descuento entre los productos
    v.items.forEach((it) => {
      const neto = it.subtotal * factor;
      if (it.costo > 0) ganancia += neto - it.cantidad * it.costo;
      else { vendidoSinCosto += neto; sinCosto.add(it.productoId); }
    });
  });
  return { ganancia: red2(ganancia), vendidoSinCosto: red2(vendidoSinCosto), sinCosto: sinCosto.size };
}

/** Lo que entró por compras: sin stock inicial, importaciones, altas desde la venta ni anulaciones. */
const esCarga = (m) => m.origen === 'inicial' || /^(Stock inicial|Agregado desde la venta)/.test(m.nota || '');
function totalCompras(movs) {
  return red2(movs.filter((m) => m.tipo === 'entrada' && !m.ventaId && !esCarga(m)).reduce((s, m) => s + m.cantidad * m.costoUnit, 0));
}

function cambiosPrecioPeriodo() {
  const a = inicioDia($('#rep-desde').value), b = finDia($('#rep-hasta').value);
  return (db.historialPrecios || []).filter((h) => { const t = Date.parse(h.fecha); return t >= a && t <= b; }).reverse();
}

function renderCambiosPrecio() {
  const lista = cambiosPrecioPeriodo();
  $('#rep-precios').innerHTML = lista.length
    ? `<div class="table-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Producto</th><th class="num">Antes</th><th class="num">Ahora</th><th>Quién</th></tr></thead>
      <tbody>${lista.slice(0, 200).map((h) => `<tr><td class="num">${fechaHora(h.fecha)}</td>
        <td><div class="nom">${esc(h.producto)}</div><div class="meta">${esc(h.motivo || '')}${h.codigo ? ` · <span class="mono">${esc(h.codigo)}</span>` : ''}</div></td>
        <td class="num">${h.masivo ? '—' : $u(h.antes)}</td><td class="num">${h.masivo ? '—' : `<strong>${$u(h.despues)}</strong>`}</td><td>${esc(h.usuario || '')}</td></tr>`).join('')}
      ${lista.length > 200 ? `<tr><td colspan="5" class="muted">… y ${lista.length - 200} más (exportá a Excel para verlos todos)</td></tr>` : ''}</tbody></table></div>`
    : '<p class="vacio">No hubo cambios de precio en este período.</p>';
}

function renderReportes() {
  renderUsuarios();
  renderCambiosPrecio();
  renderCierresCaja();
  renderRespaldoExtra();
  if (!$('#form-negocio').contains(document.activeElement)) {
    ['nombre', 'direccion', 'telefono', 'rut', 'pie'].forEach((k) => { $('#n-' + k).value = (db.negocio || {})[k] || ''; });
    $('#n-descmax').value = topeDescuentoEmpleado();
  }
  // Período
  const ventas = ventasPeriodo();
  const validas = ventas.filter((v) => !v.anulada);
  const total = validas.reduce((s, v) => s + v.total, 0);
  const g = gananciaBruta(validas);
  const a = inicioDia($('#rep-desde').value), b = finDia($('#rep-hasta').value);
  const movs = db.movimientos.filter((m) => { const t = Date.parse(m.fecha); return t >= a && t <= b; });
  const compras = totalCompras(movs);
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
      <div><div class="lbl">Ganancia bruta</div><div class="val">${$u(g.ganancia)}</div></div>
      <div><div class="lbl">Compras</div><div class="val">${$u(compras)}</div></div>
    </div>
    ${g.sinCosto ? `<p class="nota-edit">La ganancia no cuenta ${$u(g.vendidoSinCosto)} vendidos de ${g.sinCosto} producto${g.sinCosto === 1 ? '' : 's'} sin costo cargado. Cargales el costo (en Productos, filtro «Sin costo») para que la ganancia sea exacta.</p>` : ''}
    <p class="muted">Compras: mercadería que llegó en el período. No incluye el stock inicial ni lo importado de una planilla.</p>
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
  } else if (tipo === 'cajas') {
    descargarExcel((db.cajas || []).map((c) => {
      const r = c.resumen || resumenCaja(db, c);
      return {
        'Caja N.º': c.numero, 'Abierta': f(c.abierta), 'Abrió': c.abiertaPor, 'Cerrada': c.cerrada ? f(c.cerrada) : 'Abierta', 'Cerró': c.cerradaPor || '',
        'Efectivo inicial': r.inicial, 'Ventas': r.ventas, 'Total vendido': r.total, 'Ventas en efectivo': r.ventasEfectivo,
        'Débito': r.porMedio['Débito'] || 0, 'Crédito': r.porMedio['Crédito'] || 0, 'Transferencia': r.porMedio.Transferencia || 0,
        'Ingresos': r.ingresos, 'Retiros': r.retiros, 'Debería haber': r.esperado, 'Se contó': c.cerrada ? c.contado : '', 'Diferencia': c.cerrada ? c.diferencia : '', 'Nota': c.nota || '',
      };
    }), 'Cierres de caja', 'cierres_de_caja');
  } else if (tipo === 'precios') {
    descargarExcel(cambiosPrecioPeriodo().map((h) => ({
      'Fecha': f(h.fecha), 'Usuario': h.usuario || '', 'Código': h.codigo || '', 'Producto': h.producto, 'Precio antes': h.masivo ? '' : h.antes, 'Precio nuevo': h.masivo ? '' : h.despues, 'Motivo': h.motivo || '',
    })), 'Cambios de precio', 'cambios_de_precio');
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
    $('#respaldo-texto').textContent = `Los cambios se guardan solos en esta PC. Cada día se hace un respaldo comprimido en ${info.respaldos} (al abrir, al cerrar la caja y al cerrar el programa) y se guardan los últimos 60 días. Las fotos de los productos se copian a la carpeta Fotos que está ahí mismo.`;
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
  const avisos = [...new Set(v.items.map((it) => it.productoId))].map(producto).filter(Boolean).map((p) => ({ p, e: estado(p) })).filter((x) => x.e !== 'ok');
  $('#venta-alerta').hidden = !avisos.length;
  $('#venta-alerta').innerHTML = avisos.length ? `<strong>Hay que reponer</strong><ul>${avisos.map(({ p, e }) => `<li><span>${esc(p.nombre)}</span>${e === 'sin'
    ? '<span class="chip danger">Sin stock</span>' : `<span class="chip warn">Quedan ${n(p.stock)} · mín. ${n(p.minimo)}</span>`}</li>`).join('')}</ul>` : '';
  $('#dlg-venta').showModal();
  $('#venta-nueva').focus();
}

/* ---------- Importar desde Excel ---------- */

let planImp = null;
const MAX_PLANILLA = 15 * 1048576; // planillas más grandes no son de productos y pueden trabar el programa

const camposImportar = () => {
  const c = {};
  $$('#imp-campos [data-campo]').forEach((x) => { c[x.dataset.campo] = x.checked; });
  return c;
};

function mostrarCambiosStock() {
  const caja = $('#imp-stock');
  if (!planImp || planImp.error || !camposImportar().stock) { caja.innerHTML = ''; return; }
  const cambios = cambiosStockImportacion(planImp);
  caja.innerHTML = cambios.length
    ? `<p class="nota-edit">Se va a cambiar el stock de <strong>${cambios.length} producto${cambios.length === 1 ? '' : 's'}</strong>. Revisá que la columna sea el stock real y no la cantidad por paquete.</p>
      <div class="table-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="num">Ahora</th><th class="num">Queda</th></tr></thead>
      <tbody>${cambios.slice(0, 50).map((c) => `<tr><td>${esc(c.nombre)}<div class="meta mono">${esc(c.codigo)}</div></td><td class="num">${n(c.antes)}</td><td class="num"><strong>${n(c.despues)}</strong></td></tr>`).join('')}
      ${cambios.length > 50 ? `<tr><td colspan="3" class="muted">… y ${cambios.length - 50} más</td></tr>` : ''}</tbody></table></div>`
    : '<p class="muted">La planilla no cambia el stock de ningún producto que ya existe.</p>';
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
    ${db.ejemplo ? '<p class="nota-edit">Estás con los datos de ejemplo: lo importado se va a mezclar con ellos. Si no querés eso, cancelá y tocá primero «Empezar de cero».</p>' : ''}`;
  $$('#imp-campos [data-campo]').forEach((x) => { x.checked = !!CAMPOS_IMPORTAR[x.dataset.campo]; });
  // Planilla del Lector de facturas: el precio de venta de los que ya existen no se toca
  if (planImp.deFactura) $('#imp-campos [data-campo=precio]').checked = false;
  $('#imp-entrada').hidden = !planImp.conEntrada;
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
        const libro = XLSX.read(new Uint8Array(lector.result), { type: 'array', codepage: 65001, raw: true });
        const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '' });
        planImp = planImportacion(db, filas);
      } catch (err) {
        planImp = { error: 'No pude leer el archivo. Tiene que ser una planilla de Excel (.xlsx) o un archivo .csv.' };
      }
      mostrarPlan(file.name);
    };
    lector.readAsArrayBuffer(file);
  });
  $$('#imp-campos [data-campo]').forEach((x) => x.addEventListener('change', mostrarCambiosStock));
  $$('[data-herramienta]').forEach((b) => b.addEventListener('click', () => { if (escritorio() && window.almacen.abrirHerramienta) window.almacen.abrirHerramienta(b.dataset.herramienta); }));
  $('#imp-ok').addEventListener('click', () => {
    if (!planImp || planImp.error) return;
    const r = aplicarImportacion(db, planImp, camposImportar());
    planImp = null;
    guardar();
    $('#dlg-import').close();
    render();
    toast(`Importación lista: ${r.nuevos} productos nuevos y ${r.actualizados} actualizados${r.llegadas ? `; mercadería sumada a ${r.llegadas}` : ''}.`);
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
    + (ej ? ` Ejemplo: ${esc(p.nombre)} pasa de ${$u(p.precio)} a <strong>${$u(ej.nuevo)}</strong>.` : '')
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
    if (espera) { $('#login-err').textContent = `Demasiados intentos. Esperá ${textoEspera(espera)} y probá de nuevo.`; $('#login-pin').value = ''; return; }
    if (!verificarPin(loginUsuario, pin)) {
      const bloq = fallarPin(db, loginUsuario.id);
      guardar();
      $('#login-err').textContent = bloq ? `PIN incorrecto. Por seguridad, esperá ${textoEspera(bloq)} antes de volver a probar.` : 'El PIN no es correcto. Probá de nuevo.';
      $('#login-pin').value = '';
      $('#login-pin').focus();
      return;
    }
    if (acertarPin(db, loginUsuario.id)) guardar();
    entrar(loginUsuario);
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
  $('#banner-pin-ir').addEventListener('click', () => {
    location.hash = '#reportes';
    setTimeout(() => $('#card-usuarios').scrollIntoView({ block: 'start' }), 50);
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
    ? `<span class="chip ok">Creada el ${fechaHora(r.creada)}</span>`
    : '<span class="chip warn">Todavía no se creó</span>';
  $('#btn-rec-crear').textContent = r && r.hash ? 'Crear una nueva' : 'Crear clave de recuperación';
}

function iniciarRecuperacion() {
  $('#btn-rec-crear').addEventListener('click', async () => {
    if (!esAdmin()) return;
    if (db.recuperacion && db.recuperacion.hash
      && !(await confirmar('¿Crear una clave de recuperación nueva? La anterior deja de servir.', 'Crear una nueva'))) return;
    const clave = nuevaClaveRecuperacion(db);
    if (!guardar()) { toast('No se pudo guardar la clave.'); return; }
    $('#rec-clave').textContent = clave;
    $('#dlg-rec').showModal();
    render();
  });
  $('#rec-clave-copiar').addEventListener('click', () => copiarTexto($('#rec-clave').textContent, 'Clave copiada. Anotala también en papel.'));
  $('#dlg-rec').addEventListener('close', () => { $('#rec-clave').textContent = ''; });
  $('#banner-recuperacion-ir').addEventListener('click', () => {
    location.hash = '#reportes';
    setTimeout(() => $('#card-usuarios').scrollIntoView({ block: 'start' }), 50);
  });
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

function arrancar() {
  if (datosDanados) { mostrarDanado(); return; }
  mostrarLogin();
}

function copiarTexto(texto, aviso) {
  const ok = () => toast(aviso || 'Copiado.');
  try { navigator.clipboard.writeText(texto).then(ok, () => toast(`No se pudo copiar. Anotalo: ${texto}`)); } catch (e) { toast(`Anotalo: ${texto}`); }
}

/* ---------- Pantallas de apertura, movimientos y cierre de caja ---------- */

function htmlArqueo(caja) {
  const r = caja.resumen || resumenCaja(db, caja);
  const fila = (a, b2, cls = '') => `<div class="t-fila ${cls}"><span>${a}</span><span>${b2}</span></div>`;
  const dif = caja.diferencia;
  return `${encabezadoNegocio()}<hr>
    <div class="t-c"><strong>CIERRE DE CAJA N.º ${caja.numero}</strong></div>
    ${fila('Abierta', fechaHora(caja.abierta))}${caja.abiertaPor ? fila('Abrió', esc(caja.abiertaPor)) : ''}
    ${caja.cerrada ? fila('Cerrada', fechaHora(caja.cerrada)) : ''}${caja.cerradaPor ? fila('Cerró', esc(caja.cerradaPor)) : ''}<hr>
    ${fila('Efectivo inicial', $u(r.inicial))}
    ${fila('+ Ventas en efectivo', $u(r.ventasEfectivo))}
    ${r.ingresos ? fila('+ Ingresos', $u(r.ingresos)) : ''}
    ${r.retiros ? fila('− Retiros', $u(r.retiros)) : ''}
    ${fila('Debería haber', $u(r.esperado), 't-total')}
    ${caja.cerrada ? fila('Se contó', $u(caja.contado)) + fila(dif === 0 ? 'Diferencia' : dif > 0 ? 'Sobrante' : 'Faltante', $u(Math.abs(dif)), 't-total') : ''}<hr>
    ${fila('Ventas', r.ventas)}${r.anuladas ? fila('Anuladas', r.anuladas) : ''}
    ${Object.entries(r.porMedio).map(([m, t]) => fila(esc(m), $u(t))).join('')}
    ${fila('Total vendido', $u(r.total))}
    ${caja.movs.length ? '<hr>' + caja.movs.map((m) => fila(`${m.tipo === 'retiro' ? 'Retiro' : 'Ingreso'}: ${esc(m.motivo)}`, (m.tipo === 'retiro' ? '−' : '+') + $u(m.monto))).join('') : ''}
    ${caja.nota ? `<hr><div>Nota: ${esc(caja.nota)}</div>` : ''}
    <div class="t-c t-chico">Impreso el ${fechaHora(new Date().toISOString())}</div>`;
}

function chipDiferencia(dif) {
  if (dif == null) return '';
  if (Math.abs(dif) < 0.005) return '<span class="chip ok">Justo</span>';
  return dif > 0 ? `<span class="chip warn">Sobran ${$u(dif)}</span>` : `<span class="chip danger">Faltan ${$u(-dif)}</span>`;
}

function renderCierreEnVivo() {
  const caja = cajaAbierta(db);
  if (!caja) return;
  const r = resumenCaja(db, caja);
  $('#cc-resumen').innerHTML = `
    <li><span>Efectivo inicial</span><span>${$u(r.inicial)}</span></li>
    <li><span>+ Ventas en efectivo</span><span>${$u(r.ventasEfectivo)}</span></li>
    ${r.ingresos ? `<li><span>+ Ingresos de efectivo</span><span>${$u(r.ingresos)}</span></li>` : ''}
    ${r.retiros ? `<li><span>− Retiros de efectivo</span><span>${$u(r.retiros)}</span></li>` : ''}
    <li class="cc-total"><span>Debería haber en efectivo</span><strong>${$u(r.esperado)}</strong></li>
    ${Object.entries(r.porMedio).filter(([m]) => m !== 'Efectivo').map(([m, t]) => `<li class="muted"><span>${esc(m)} (no es efectivo)</span><span>${$u(t)}</span></li>`).join('')}
    <li class="muted"><span>Ventas cobradas</span><span>${r.ventas}${r.anuladas ? ` · ${r.anuladas} anuladas` : ''}</span></li>`;
  const v = $('#cc-contado').value;
  $('#cc-diferencia').innerHTML = v === '' ? '' : chipDiferencia(red2(Number(v) - r.esperado));
}

function mostrarResultadoCierre(caja) {
  $('#cr-titulo').textContent = `Caja N.º ${caja.numero} cerrada`;
  $('#cr-detalle').innerHTML = esAdmin()
    ? `<ul class="lista"><li><span>Debería haber</span><strong>${$u(caja.resumen.esperado)}</strong></li>
       <li><span>Se contó</span><strong>${$u(caja.contado)}</strong></li>
       <li><span>Resultado</span>${chipDiferencia(caja.diferencia)}</li></ul>`
    : `<p>Se guardó el conteo: <strong>${$u(caja.contado)}</strong> en efectivo. El administrador revisa el cierre.</p>`;
  cajaParaImprimir = caja;
  $('#dlg-caja-resultado').showModal();
}

let cajaParaImprimir = null;

function renderCierresCaja() {
  const lista = [...(db.cajas || [])].reverse().slice(0, 60);
  $('#tabla-cajas').innerHTML = lista.length ? lista.map((c) => {
    const r = c.resumen || resumenCaja(db, c);
    return `<tr>
      <td class="mono">${String(c.numero).padStart(3, '0')}</td>
      <td>${fechaHora(c.abierta)}<div class="meta">${esc(c.abiertaPor || '')}</div></td>
      <td>${c.cerrada ? `${fechaHora(c.cerrada)}<div class="meta">${esc(c.cerradaPor || '')}</div>` : '<span class="chip ok">Abierta</span>'}</td>
      <td class="num">${r.ventas}</td>
      <td class="num">${$u(r.total)}</td>
      <td class="num">${$u(r.esperado)}</td>
      <td class="num">${c.cerrada ? $u(c.contado) : '—'}</td>
      <td>${c.cerrada ? chipDiferencia(c.diferencia) : ''}</td>
      <td class="acc">${puedeImprimir() ? `<button class="btn sm" type="button" data-imprimir-caja="${c.id}">Imprimir</button>` : ''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" class="vacio">Todavía no se abrió ninguna caja.</td></tr>';
}

function iniciarAperturaCaja() {
  $('#form-abrir-caja').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = abrirCaja(db, $('#ac-monto').value, sesion ? sesion.nombre : '');
    if (r.error) { $('#ac-err').textContent = r.error; return; }
    $('#ac-err').textContent = '';
    $('#ac-monto').value = '';
    guardar();
    render();
    toast(`Caja abierta con ${$u(r.caja.inicial)}. Ya se puede vender.`);
    $('#caja-buscar').focus();
  });

  // Retiro o ingreso de efectivo
  $('#btn-caja-mov').addEventListener('click', () => {
    $('#cm-monto').value = '';
    $('#cm-motivo').value = '';
    $('#cm-err').textContent = '';
    $('#dlg-caja-mov').showModal();
    $('#cm-monto').focus();
  });
  $('#form-caja-mov').addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = ($('input[name="cm-tipo"]:checked') || {}).value;
    const err = movimientoCaja(db, tipo, $('#cm-monto').value, $('#cm-motivo').value, sesion ? sesion.nombre : '');
    if (err) { $('#cm-err').textContent = err; return; }
    guardar();
    $('#dlg-caja-mov').close();
    render();
    toast(`${tipo === 'retiro' ? 'Retiro' : 'Ingreso'} de ${$u(Number($('#cm-monto').value))} anotado.`);
  });

  // Cierre
  $('#btn-cerrar-caja').addEventListener('click', () => {
    if (ticket.length) { toast('Hay productos en el ticket. Cobrá o borrá la venta antes de cerrar la caja.'); return; }
    $('#cc-contado').value = '';
    $('#cc-nota').value = '';
    $('#cc-err').textContent = '';
    renderCierreEnVivo();
    $('#dlg-cerrar-caja').showModal();
    $('#cc-contado').focus();
  });
  $('#cc-contado').addEventListener('input', renderCierreEnVivo);
  $('#form-cerrar-caja').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = cerrarCaja(db, $('#cc-contado').value, sesion ? sesion.nombre : '', $('#cc-nota').value);
    if (r.error) { $('#cc-err').textContent = r.error; return; }
    guardar();
    // Respaldo al cerrar la caja, así la copia del pendrive incluye las ventas del día
    if (escritorio() && window.almacen.respaldarAhora) window.almacen.respaldarAhora().catch(() => {});
    $('#dlg-cerrar-caja').close();
    render();
    mostrarResultadoCierre(r.caja);
  });
  $('#cr-imprimir').addEventListener('click', () => { if (cajaParaImprimir) imprimir(htmlArqueo(cajaParaImprimir)); });
  $('#cr-listo').addEventListener('click', () => $('#dlg-caja-resultado').close());
  $('#tabla-cajas').addEventListener('click', (e) => {
    const bt = e.target.closest('[data-imprimir-caja]');
    const c = bt && (db.cajas || []).find((x) => x.id === bt.dataset.imprimirCaja);
    if (c) imprimir(htmlArqueo(c));
  });
}

function iniciar() {
  document.body.classList.toggle('es-escritorio', escritorio() && !!window.almacen.abrirHerramienta);
  iniciarAperturaCaja();
  $('#banner-stock-ver').addEventListener('click', verParaReponer);
  $('#banner-stock-ocultar').addEventListener('click', () => {
    const { sin, bajo } = paraReponer();
    alertaOcultaFirma = sin.map((p) => p.id).join(',') + '|' + bajo.map((p) => p.id).join(',');
    $('#banner-stock').hidden = true;
  });
  iniciarDanado();
  $('#banner-guardado-reintentar').addEventListener('click', () => { if (guardar({ completo: true })) toast('Listo, se guardó.'); else toast('Sigue sin poder guardar.'); });
  $('#banner-guardado-copia').addEventListener('click', () => descargarBlob(JSON.stringify(db), 'application/json', `respaldo_stock_${isoLocal()}.json`));
  iniciarLogin();
  iniciarUsuarios();
  iniciarRecuperacion();
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
  window.addEventListener('storage', (e) => { if (e.key === CLAVE && !datosDanados) { if (cargar()) render(); else mostrarDanado(); } });
  arrancar();
}

if (typeof module !== 'undefined') {
  module.exports = { registrar, cobrar, anularVenta, semilla, baseVacia, estado, abrirCaja, cajaAbierta, movimientoCaja, resumenCaja, cerrarCaja, parseNum, planImportacion, aplicarImportacion, actualizarPrecios, redondearPrecio, sha256, crearUsuario, asegurarUsuarios, verificarPin, guardarUsuario, eliminarUsuario, fotoDe, calcularCambios, nuevaClaveRecuperacion, verificarRecuperacion, precioConAumento, cambiosStockImportacion, CAMPOS_IMPORTAR, gananciaBruta, totalCompras, esperaPin, fallarPin, acertarPin, anotarPrecio };
} else {
  document.addEventListener('DOMContentLoaded', iniciar);
}

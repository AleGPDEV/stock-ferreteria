/* Datos y guardado: base vacía, cargar al abrir y guardar solo lo que cambió (calcularCambios → SQLite
 * en escritorio, localStorage en el navegador). Si los datos están dañados, no se escribe nada. */
'use strict';

/* ---------- Datos ---------- */

// El nombre que se ve si en Configuración → Datos del negocio no se escribió otro
const NOMBRE_NEGOCIO = 'Grupo Muros';
function baseVacia() {
  return { productos: [], proveedores: [], movimientos: [], ventas: [], numVenta: 0, cajas: [], numCaja: 0, ejemplo: false, negocio: { nombre: '', direccion: '', telefono: '', rut: '', pie: '' } };
}

// En la versión de escritorio (Electron) existe window.almacen y los datos van a un archivo.
// En el navegador se usa localStorage.
const escritorio = () => typeof window !== 'undefined' && window.almacen && window.almacen.escritorio;

/* ---------- Registro de errores ----------
 * En escritorio, los errores de la pantalla van al registro.log (ver electron/registro.js).
 * Se anotan como mucho 50 por sesión y no se repite el mismo seguido, para no llenar el archivo. */
const registroPantalla = { anotados: 0, ultimo: '' };
function anotarErrorPantalla(area, mensaje, detalle) {
  if (!escritorio() || !window.almacen.anotar) return;
  const clave = `${area}|${mensaje}`;
  if (registroPantalla.anotados >= 50 || clave === registroPantalla.ultimo) return;
  registroPantalla.anotados++;
  registroPantalla.ultimo = clave;
  try { window.almacen.anotar('ERROR', area, String(mensaje || ''), String(detalle || '')); } catch (e) { /* nada */ }
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('error', (ev) => {
    const err = ev.error;
    anotarErrorPantalla('error', ev.message || (err && err.message) || 'Error', (err && err.stack) || `${ev.filename || ''}:${ev.lineno || ''}:${ev.colno || ''}`);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    anotarErrorPantalla('promesa', (r && r.message) || String(r), r && r.stack);
  });
}

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
  anotarErrorPantalla('datos', `Los datos guardados están dañados (${(info && info.error) || '?'})`, info && (info.detalle || (info.filas && `${info.filas.length} filas`)));
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

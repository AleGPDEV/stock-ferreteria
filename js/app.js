/* Stock Ferretería — control de stock y caja.
 * Todo funciona en el navegador; los datos se guardan en localStorage.
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

/* ---------- Datos ---------- */

function baseVacia() {
  return { productos: [], proveedores: [], movimientos: [], ventas: [], numVenta: 0, ejemplo: false, negocio: { nombre: '', direccion: '', telefono: '', rut: '', pie: '' } };
}

// En la versión de escritorio (Electron) existe window.almacen y los datos van a un archivo.
// En el navegador se usa localStorage.
const escritorio = () => typeof window !== 'undefined' && window.almacen && window.almacen.escritorio;

function cargar() {
  try {
    const raw = escritorio() ? window.almacen.leer() : localStorage.getItem(CLAVE);
    if (raw) {
      db = Object.assign(baseVacia(), JSON.parse(raw));
      return;
    }
  } catch (e) { /* sin almacenamiento: se usa el ejemplo en memoria */ }
  db = semilla();
  guardar();
}

let avisoErrorGuardado = false;
function guardar() {
  try {
    const texto = JSON.stringify(db);
    if (escritorio()) {
      const err = window.almacen.guardar(texto);
      if (err) throw new Error(err);
    } else {
      localStorage.setItem(CLAVE, texto);
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

function confirmar(texto, okTexto = 'Confirmar') {
  return new Promise((res) => {
    const d = $('#dlg-conf');
    $('#conf-texto').textContent = texto;
    $('#conf-ok').textContent = okTexto;
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; d.close(); res(v); };
    $('#conf-ok').onclick = () => fin(true);
    $('#conf-cancel').onclick = () => fin(false);
    d.oncancel = () => fin(false);
    d.showModal();
  });
}

function vistaActual() {
  const h = location.hash.slice(1);
  return VISTAS.includes(h) ? h : 'caja';
}

function mostrarVista() {
  const v = vistaActual();
  $$('.vista').forEach((s) => { s.hidden = s.id !== 'v-' + v; });
  $$('.nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false'));
  render();
  if (v === 'caja') setTimeout(() => $('#caja-buscar').focus(), 0);
}

function render() {
  $('#banner-ejemplo').hidden = !db.ejemplo;
  $('#marca-nombre').textContent = (db.negocio && db.negocio.nombre) || 'Stock Ferretería';
  const bajos = db.productos.filter((p) => estado(p) !== 'ok').length;
  const b = $('#badge-bajo');
  b.hidden = !bajos;
  b.textContent = bajos;
  b.title = `${bajos} productos para reponer`;
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
          <button class="btn sm" type="button" data-accion="entrada" data-id="${p.id}">+ Sumar stock</button>
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
  renderResultados();
  renderTicket();
  renderVentasHoy();
}

function renderResultados() {
  const q = normal($('#caja-buscar').value.trim());
  let lista = db.productos;
  if (q) lista = lista.filter((p) => normal(`${p.codigo} ${p.nombre} ${p.categoria}`).includes(q));
  else lista = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
  lista = lista.slice(0, 18);
  $('#caja-resultados').innerHTML = lista.length
    ? lista.map((p) => `
      <button class="prod-btn" type="button" data-agregar="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
        <span class="nom">${esc(p.nombre)}</span>
        <span class="fila"><span class="mono">${esc(p.codigo)}</span><span>${p.stock <= 0 ? 'Sin stock' : `Stock ${n(p.stock)} ${esc(p.unidad)}`}</span></span>
        <span class="precio">${$u(p.precio)}</span>
      </button>`).join('')
    : `<div class="vacio sin-resultado">
        <p>${q ? `No encontré ningún producto con «${esc($('#caja-buscar').value.trim())}».` : 'Todavía no hay productos cargados.'}</p>
        <button class="btn primary" type="button" data-alta>Agregar como producto nuevo</button>
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

function fechaVentas() { return $('#ventas-fecha').value || isoLocal(); }

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
            <td class="num">${hora(v.fecha)}</td>
            <td><div>${v.items.map((it) => `${n(it.cantidad)} × ${esc(it.nombre)}`).join('<br>')}</div>${v.cliente ? `<div class="meta">${esc(v.cliente)}</div>` : ''}</td>
            <td>${esc(v.medio)}${v.vuelto != null ? `<div class="meta">Vuelto ${$u(v.vuelto)}</div>` : ''}</td>
            <td class="num"><strong>${$u(v.total)}</strong>${v.descuento ? `<div class="meta">Descuento ${n(v.descuentoPct)} %</div>` : ''}</td>
            <td class="acc">${puedeImprimir() ? `<button class="btn sm" type="button" data-ticket="${v.id}">Imprimir</button>` : ''}${v.anulada ? '<span class="chip neutro">Anulada</span>' : `<button class="btn sm danger" type="button" data-anular="${v.id}">Anular</button>`}</td>
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
  buscar.addEventListener('input', renderResultados);
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
    if (vistaActual() !== 'caja' || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1 || e.key === ' ') return;
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
    if (!b) return;
    const v = db.ventas.find((x) => x.id === b.dataset.anular);
    if (!(await confirmar(`¿Anular la venta N.º ${v.numero} por ${$u(v.total)}? Los productos vuelven al stock.`, 'Anular venta'))) return;
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
        <td class="mono">${esc(p.codigo)}</td>
        <td><div class="nom">${esc(p.nombre)}</div><div class="meta">${esc(p.categoria || 'Sin categoría')} · ${esc(p.ubicacion || 'Sin ubicación')}</div></td>
        <td>${esc(nombreProv(p.proveedorId)) || '<span class="muted">—</span>'}</td>
        <td class="num"><strong>${n(p.stock)}</strong> <span class="u">${esc(p.unidad)}</span></td>
        <td class="num">${n(p.minimo)}</td>
        <td>${chipEstado(p)}</td>
        <td class="num">${$u(p.costo)}</td>
        <td class="num">${$u(p.precio)}</td>
        <td class="acc">
          <button class="btn sm" type="button" data-accion="entrada" data-id="${p.id}">+ Sumar stock</button>
          <button class="btn sm" type="button" data-accion="salida" data-id="${p.id}">− Restar</button>
          <button class="btn sm ghost" type="button" data-accion="editar" data-id="${p.id}">Editar</button>
        </td>
      </tr>`).join('') + (lista.length > visibles.length ? `<tr><td colspan="9" class="vacio">Se muestran ${visibles.length} de ${lista.length} productos. Usá el buscador para encontrar el resto.</td></tr>` : '')
    : `<tr><td colspan="9" class="vacio">${db.productos.length ? 'Ningún producto coincide con los filtros.' : 'Todavía no cargaste productos. Usá «Nuevo producto» para agregar el primero.'}</td></tr>`;
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
    if (!(await confirmar(`¿Eliminar ${p.nombre}? Su historial de movimientos y ventas se conserva.`, 'Eliminar'))) return;
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
  $('#mov-explica').textContent = {
    entrada: 'Elegí el producto y anotá cuántos llegaron. Se suman al stock.',
    salida: 'Para productos que se rompieron, se usaron en el local o se devolvieron al proveedor. Las ventas no van acá: se hacen en Vender.',
    ajuste: 'Contá cuántos hay en el estante y anotá ese número. El programa corrige el stock a esa cantidad.',
  }[t];
  const p = producto($('#mov-prod').value);
  $('#mov-hint').textContent = p ? `Stock actual: ${n(p.stock)} ${p.unidad}` : '';
}

function renderMovimientos() {
  const sel = $('#mov-prod');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Elegí un producto</option>' + [...db.productos].sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => `<option value="${p.id}"${p.id === actual ? ' selected' : ''}>${esc(p.nombre)} — ${esc(p.codigo)}</option>`).join('');
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
        <td>${esc(m.nota)}${m.proveedorId ? `<div class="meta">${esc(nombreProv(m.proveedorId))}</div>` : ''}</td>
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

function iniciarMovimientos() {
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
    if (!(await confirmar(`¿Eliminar ${v.nombre}?${cant ? ` Sus ${cant} productos quedan sin proveedor asignado.` : ''}`, 'Eliminar'))) return;
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
      'Stock antes': m.stockAntes, 'Stock después': m.stockDespues, 'Costo unitario': m.costoUnit, 'Proveedor': nombreProv(m.proveedorId), 'Nota': m.nota,
    })), 'Movimientos', 'movimientos');
  } else if (tipo === 'ventas') {
    const filas = [];
    ventasPeriodo().forEach((v) => v.items.forEach((it) => filas.push({
      'Venta N.º': v.numero, 'Fecha': f(v.fecha), 'Estado': v.anulada ? 'Anulada' : 'Cobrada', 'Medio de pago': v.medio, 'Cliente': v.cliente,
      'Código': it.codigo, 'Producto': it.nombre, 'Cantidad': it.cantidad, 'Unidad': it.unidad, 'Precio': it.precio, 'Subtotal': it.subtotal, 'Descuento %': v.descuentoPct || 0, 'Total venta': v.total,
    })));
    descargarExcel(filas, 'Ventas', 'ventas');
  }
}

/* ---------- Respaldo ---------- */

function iniciarRespaldo() {
  if (escritorio()) {
    const info = window.almacen.info();
    $('#respaldo-texto').textContent = `Los cambios se guardan solos en esta PC. Cada día se hace un respaldo automático en ${info.respaldos} (se guardan los últimos 60 días). Igual conviene copiar esa carpeta a un pendrive o a la nube de vez en cuando.`;
    $('#btn-abrir-respaldos').hidden = false;
    $('#btn-abrir-respaldos').addEventListener('click', () => window.almacen.abrirRespaldos());
  }
  $('#btn-respaldo').addEventListener('click', () => {
    descargarBlob(JSON.stringify(db, null, 2), 'application/json', `respaldo_stock_${isoLocal()}.json`);
    toast('Descargando la copia de seguridad.');
  });
  $('#input-restaurar').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const lector = new FileReader();
    lector.onload = async () => {
      let datos;
      try { datos = JSON.parse(lector.result); } catch (err) { toast('El archivo no es una copia válida.'); return; }
      if (!datos || !Array.isArray(datos.productos) || !Array.isArray(datos.movimientos)) { toast('El archivo no es una copia de Stock Ferretería.'); return; }
      if (!(await confirmar(`¿Reemplazar los datos actuales por la copia (${datos.productos.length} productos)? Lo que no esté en la copia se pierde.`, 'Restaurar'))) return;
      db = Object.assign(baseVacia(), datos);
      guardar();
      ticket = [];
      render();
      toast('Copia restaurada.');
    };
    lector.readAsText(file);
  });
  $('#btn-cargar-ejemplo').addEventListener('click', async () => {
    if (!(await confirmar('¿Reemplazar todos los datos por los de ejemplo?', 'Cargar ejemplo'))) return;
    db = semilla(); guardar(); ticket = []; render(); toast('Datos de ejemplo cargados.');
  });
  $('#btn-borrar-todo').addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar todos los productos, proveedores, ventas y movimientos? Descargá una copia antes si la vas a necesitar.', 'Borrar todo'))) return;
    db = baseVacia(); guardar(); ticket = []; render(); toast('Se borraron todos los datos.');
  });
  $('#btn-vaciar').addEventListener('click', async () => {
    if (!(await confirmar('¿Borrar los datos de ejemplo y empezar con tu ferretería?', 'Empezar de cero'))) return;
    db = baseVacia(); guardar(); ticket = []; render(); location.hash = '#productos';
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

function iniciar() {
  iniciarLetra();
  iniciarImportacion();
  iniciarPrecios();
  iniciarNegocio();
  if (!puedeImprimir()) $$('[data-imprime]').forEach((b) => { b.hidden = true; });
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
  mostrarVista();
}

if (typeof module !== 'undefined') {
  module.exports = { registrar, cobrar, anularVenta, semilla, baseVacia, estado, parseNum, planImportacion, aplicarImportacion, actualizarPrecios, redondearPrecio };
} else {
  document.addEventListener('DOMContentLoaded', iniciar);
}

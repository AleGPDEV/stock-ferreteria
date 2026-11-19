/* Productos (sin pantalla): códigos propios, de barras y de proveedor, buscar por código, unir productos
 * repetidos, estado del stock, historial de precios y actualizar precios por porcentaje. */
'use strict';

const producto = (id) => db.productos.find((p) => p.id === id);

/* Códigos de un producto: el código propio (por ejemplo el del proveedor, LH-5563) y los códigos de barras
 * del paquete (p.barras), que es lo que lee el lector. Un producto puede tener varios códigos de barras. */
const codigosDe = (p) => [p.codigo].concat(Array.isArray(p.barras) ? p.barras : []).filter(Boolean);
/** Códigos que usan los proveedores para el producto: [{ proveedorId, codigo }]. Son aparte del código propio. */
const codigosProvDe = (p) => (Array.isArray(p.codigosProv) ? p.codigosProv : []);
const textoCodigos = (p) => codigosDe(p).concat(codigosProvDe(p).map((x) => x.codigo)).join(' ');
/** desc: cómo lo llama ese proveedor en sus facturas (sirve para reconocerlo aunque en el programa tenga otro nombre). */
function anotarCodigoProv(p, proveedorId, codigo, desc = '') {
  const c = normCodigo(codigo);
  if (!proveedorId || !c) return;
  const antes = codigosProvDe(p).find((x) => x.proveedorId === proveedorId);
  p.codigosProv = codigosProvDe(p).filter((x) => x.proveedorId !== proveedorId); // un código por proveedor: el último manda
  const x = { proveedorId, codigo: c };
  const dsc = String(desc || '').trim() || (antes && antes.codigo === c ? antes.desc || '' : '');
  if (dsc) x.desc = dsc;
  p.codigosProv.push(x);
}
function quitarCodigoProv(p, proveedorId) {
  p.codigosProv = codigosProvDe(p).filter((x) => x.proveedorId !== proveedorId);
}

/**
 * Une dos fichas del mismo producto (por ejemplo, el mismo artículo cargado dos veces porque se compró a dos
 * proveedores). Queda «destino»: se le suma el stock del otro, pasan sus códigos (el propio queda como código de
 * barras), sus códigos de proveedor y todo su historial (ventas, movimientos y precios). El otro se borra.
 * Hay que guardar con { completo: true } porque cambian ventas y movimientos viejos.
 */
function unirProductos(d, destinoId, origenId) {
  const a = d.productos.find((p) => p.id === destinoId), b = d.productos.find((p) => p.id === origenId);
  if (!a || !b) return { error: 'No encontré uno de los dos productos.' };
  if (a.id === b.id) return { error: 'Elegí otro producto: es el mismo.' };
  a.stock = red((Number(a.stock) || 0) + (Number(b.stock) || 0));
  for (const m of d.movimientos) if (m.productoId === b.id) m.productoId = a.id;
  for (const v of d.ventas) for (const it of v.items || []) if (it.productoId === b.id) it.productoId = a.id;
  for (const h of d.historialPrecios || []) if (h.productoId === b.id) h.productoId = a.id;
  const propios = new Set(codigosDe(a).map(normCodigo));
  const barras = [...(a.barras || [])];
  for (const c of [b.codigo, ...(b.barras || [])].map(normCodigo)) if (c && !propios.has(c)) { barras.push(c); propios.add(c); }
  if (barras.length) a.barras = barras;
  for (const x of codigosProvDe(b)) if (!codigosProvDe(a).some((y) => y.proveedorId === x.proveedorId)) a.codigosProv = codigosProvDe(a).concat([{ ...x }]);
  if (!a.proveedorId && b.proveedorId) a.proveedorId = b.proveedorId;
  if (!a.ubicacion && b.ubicacion) a.ubicacion = b.ubicacion;
  if (!a.categoria && b.categoria) a.categoria = b.categoria;
  if (!a.foto && b.foto) a.foto = b.foto;
  if (!a.fotoData && b.fotoData) a.fotoData = b.fotoData;
  if (!(a.costo > 0) && b.costo > 0) a.costo = b.costo;
  d.productos = d.productos.filter((p) => p.id !== b.id);
  return { producto: a, unido: b };
}

/**
 * ¿Dos descripciones pueden ser el mismo producto? Comparte al menos una palabra (o el comienzo de una:
 * «TORN» y «tornillo»). Sin palabras para comparar, se da por buena. Sirve para no pisar un tornillo con un esmalte
 * que vino con el mismo código.
 */
// Palabras que no dicen qué producto es (presentación, colores, materiales, medidas): no alcanzan para decir que son el mismo
const PALABRAS_COMUNES = new Set(('caja cajas bolsa bolsas blister unidad unidades und uni paquete paquetes pack set kit juego rollo rollos '
  + 'metro metros litro litros kilo kilos gramos par pares docena para con sin del los las por tipo modelo marca '
  + 'blanco blanca negro negra gris rojo roja azul verde amarillo amarilla marron naranja transparente cromado plateado dorado '
  + 'pvc acero hierro plastico metal metalico galvanizado inox madera nylon aluminio bronce cobre goma').split(' '));
function seParecen(a, b) {
  const todas = (t) => normal(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d/.test(w) && !/^x\d/.test(w));
  const importantes = (t) => { const w = todas(t); const f = w.filter((x) => !PALABRAS_COMUNES.has(x)); return f.length ? f : w; };
  const pa = importantes(a), pb = importantes(b);
  if (!pa.length || !pb.length) return true;
  return pa.some((x) => pb.some((y) => x === y || (x.length >= 3 && y.startsWith(x)) || (y.length >= 3 && x.startsWith(y))));
}
const normCodigo = (c) => String(c || '').trim().toUpperCase();
/** Solo letras y números: «PIN-ROD22» y «PIN'ROD22» quedan iguales. */
const codigoSinSignos = (c) => normCodigo(c).replace(/[^A-Z0-9Ñ]/g, '');
function buscarPorCodigo(d, texto) {
  const c = normCodigo(texto);
  if (!c) return null;
  const exacto = d.productos.find((p) => codigosDe(p).some((x) => normCodigo(x) === c));
  if (exacto) return exacto;
  // Un lector configurado con teclado en inglés en un Windows en español cambia los signos
  // («PIN-ROD22» llega como «PIN'ROD22»). Se compara sin signos, solo si hay un único producto así.
  const s = codigoSinSignos(c);
  if (s.length < 3) return null;
  const parecidos = d.productos.filter((p) => codigosDe(p).some((x) => codigoSinSignos(x) === s));
  return parecidos.length === 1 ? parecidos[0] : null;
}
/** ¿Algún otro producto ya usa ese código (como código propio o de barras)? Devuelve ese producto o null. */
function codigoUsado(d, texto, exceptoId) {
  const c = normCodigo(texto);
  return d.productos.find((p) => p.id !== exceptoId && codigosDe(p).some((x) => normCodigo(x) === c)) || null;
}
/** Le agrega un código de barras a un producto. Devuelve un texto de error o null. */
function asignarBarras(d, p, texto) {
  const c = normCodigo(texto);
  if (!c) return 'El código está vacío.';
  const otro = codigoUsado(d, c, p.id);
  if (otro) return `El código ${c} ya es de «${otro.nombre}».`;
  if (codigosDe(p).some((x) => normCodigo(x) === c)) return null;
  p.barras = (Array.isArray(p.barras) ? p.barras : []).concat(c);
  return null;
}

/* Ficha del producto: además de «Código», el producto se reconoce por otros códigos (p.barras), que se agregan
 * solos desde Vender y desde el celular. En la ficha se editan sobre una copia de la lista y se guardan con «Guardar». */
/** Agrega un código a la lista. Devuelve { lista } (una lista nueva, con el código agregado) o { error }. */
function agregarCodigoExtra(d, lista, texto, codigoPrincipal, exceptoId) {
  const c = normCodigo(texto);
  if (!c) return { error: 'Escaneá o escribí el código.' };
  if (/\s/.test(c)) return { error: 'Un código no lleva espacios: agregalos de a uno.' };
  if (c === normCodigo(codigoPrincipal)) return { error: `${c} ya es el código de este producto.` };
  if (lista.some((x) => normCodigo(x) === c)) return { error: `${c} ya está en la lista.` };
  const otro = codigoUsado(d, c, exceptoId);
  if (otro) return { error: `El código ${c} ya es de «${otro.nombre}».` };
  return { lista: lista.concat(c) };
}
/** Saca un código de la lista. Devuelve una lista nueva. */
function quitarCodigoExtra(lista, codigo) {
  const c = normCodigo(codigo);
  return lista.filter((x) => normCodigo(x) !== c);
}
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

/* ---------- Actualizar precios por porcentaje ---------- */

function productosDeFiltro(d, filtro) {
  if (!filtro) return d.productos;
  const tipo = filtro[0], valor = filtro.slice(2);
  return d.productos.filter((p) => (tipo === 'c' ? (p.categoria || '') === valor : p.proveedorId === valor));
}

/* ---------- Historial de cambios de precio ---------- */
const MAX_HISTORIAL_PRECIOS = 5000;

/** Anota un cambio de precio de un producto (quién, cuándo, de cuánto a cuánto). */
function anotarPrecio(d, p, nuevo, motivo = '', moneda = esUSD(p) ? 'USD' : 'UYU') {
  if (!p || (red2(nuevo) === red2(p.precio) && moneda === (esUSD(p) ? 'USD' : 'UYU'))) return;
  anotarHistorial(d, { productoId: p.id, codigo: p.codigo, producto: p.nombre, antes: p.precio, despues: red2(nuevo), motivo,
    ...(esUSD(p) ? { monedaAntes: 'USD' } : {}), ...(moneda === 'USD' ? { moneda: 'USD' } : {}) });
}
/** Precio de venta igual o menor al costo: se vende sin ganar o perdiendo plata. */
const precioBajoCosto = (p) => p.costo > 0 && p.precio > 0 && p.precio <= p.costo;

/**
 * Producto nuevo cargado a mano (no por importación): queda quién lo creó y su precio en el historial.
 * Si lo creó un empleado, queda «para revisar» hasta que un administrador lo edite.
 */
function marcarProductoNuevo(d, p, usuario, rol, origen = 'Nuevo producto') {
  p.creadoPor = usuario || '';
  p.creadoEl = new Date().toISOString();
  if (rol !== 'admin') p.revisar = true;
  if (p.precio > 0) anotarHistorial(d, { productoId: p.id, codigo: p.codigo, producto: p.nombre, antes: null, despues: red2(p.precio), motivo: `Producto nuevo (${origen})`, usuario: usuario || '' });
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

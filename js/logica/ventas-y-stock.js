/* Ventas y stock (sin pantalla): registrar movimientos de stock, cobrar una venta y anularla. */
'use strict';

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
  // De qué conteo del celular viene (para no contarlo dos veces si el celular corrige ese conteo)
  if (m.conteoId) d.movimientos[d.movimientos.length - 1].conteoId = String(m.conteoId);
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
  // Un ticket es todo en pesos o todo en dólares (los productos en dólares se cobran en dólares)
  const monedas = new Set(items.map((it) => (esUSD(d.productos.find((x) => x.id === it.productoId)) ? 'USD' : 'UYU')));
  if (monedas.size > 1) return { error: 'El ticket tiene productos en pesos y en dólares. Cobralos en dos ventas: primero unos y después los otros.' };
  const moneda = monedas.has('USD') ? 'USD' : 'UYU';
  const cotizacion = Number(opc.cotizacion) || 0;
  if (moneda === 'USD' && !(cotizacion > 0)) return { error: 'Escribí la cotización del dólar de hoy.', cotizacion: true };
  const $v = (x) => $m(x, moneda);
  const pct = Number(descuentoPct) || 0;
  if (pct < 0 || pct > 100) return { error: 'El descuento tiene que estar entre 0 y 100.' };
  if (opc.topeDescuento != null && pct > opc.topeDescuento && !opc.autorizo) {
    return { error: `Un descuento de más del ${n(opc.topeDescuento)} % lo tiene que autorizar un administrador.`, autorizar: true };
  }
  const subtotal = red2(items.reduce((s, it) => s + it.cantidad * it.precio, 0));
  const descuento = red2(subtotal * pct / 100);
  const total = red2(subtotal - descuento);
  if (medio === 'Efectivo' && recibido !== '' && recibido != null && Number(recibido) < total) {
    return { error: `El efectivo recibido no alcanza: faltan ${$v(total - Number(recibido))}.` };
  }
  if (medio === 'Efectivo' && recibido !== '' && recibido != null && recibidoRaro(Number(recibido), total)) {
    return { error: `Revisá el efectivo recibido: ${$v(Number(recibido))} es mucho más que el total.` };
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
    ...(moneda === 'USD' ? { moneda, cotizacion } : {}),
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

/**
 * Una venta en efectivo de una caja que ya se cerró: si se le devuelve la plata al cliente, sale de la caja abierta
 * y hay que anotarlo ahí (si es de la caja abierta, el cierre ya la descuenta solo).
 */
function devolucionEnOtraCaja(d, v) {
  if (!v || v.anulada || v.medio !== 'Efectivo') return null;
  const caja = cajaAbierta(d);
  if (caja && v.cajaId === caja.id) return null;
  return { caja, monto: v.total, ...(esUSD(v) ? { moneda: 'USD' } : {}) };
}

/** opc.devolucion: anota un retiro «Devolución venta N.º X» en la caja abierta (para ventas en efectivo de otra caja). */
function anularVenta(d, ventaId, opc = {}) {
  const v = d.ventas.find((x) => x.id === ventaId);
  if (!v || v.anulada) return 'La venta no existe o ya está anulada.';
  if (opc.devolucion) {
    const dev = devolucionEnOtraCaja(d, v);
    if (!dev || !dev.caja) return 'No hay una caja abierta para anotar la devolución.';
  }
  for (const it of v.items) {
    if (d.productos.some((p) => p.id === it.productoId)) {
      registrar(d, { tipo: 'entrada', productoId: it.productoId, cantidad: it.cantidad, costoUnit: 0, nota: `Anulación venta N.º ${v.numero}`, ventaId: v.id });
    }
  }
  v.anulada = true;
  v.anuladaEl = new Date().toISOString();
  if (opc.devolucion) {
    movimientoCaja(d, 'retiro', v.total, `Devolución venta N.º ${v.numero}`, opc.usuario || '', undefined, esUSD(v) ? 'USD' : 'UYU');
    v.devolucionCajaId = cajaAbierta(d).id;
  }
  return null;
}

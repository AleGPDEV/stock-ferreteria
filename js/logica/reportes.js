/* Reportes (sin pantalla, para poder probarlo): ganancia, compras, análisis de ventas, series para
 * los gráficos, mercadería parada, períodos y comparaciones, resumen de un día. */
'use strict';

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

/* ---------- Análisis de ventas (sin pantalla, para poder probarlo) ---------- */

const SIN_CAT = 'Sin categoría';
/** Una venta en dólares pasada a pesos con la cotización de ese día (para sumarla en los reportes). En pesos, queda igual. */
function enPesos(v) {
  if (!esUSD(v)) return v;
  const k = Number(v.cotizacion) || 0;
  const x = (y) => red2((Number(y) || 0) * k);
  return { ...v, usd: v.total, subtotal: x(v.subtotal), descuento: x(v.descuento), total: x(v.total),
    items: v.items.map((it) => ({ ...it, precio: x(it.precio), costo: x(it.costo), subtotal: x(it.subtotal) })) };
}
/** La cotización que se usa hoy: la de la caja abierta o la última que se escribió. */
const cotizacionActual = (d) => (cajaAbierta(d) || {}).cotizacion || d.cotizacion || null;
/** Un producto en pesos (para valorizar el stock): los de dólares, a la cotización actual. */
const factorPesos = (d, p) => (esUSD(p) ? Number(cotizacionActual(d)) || 0 : 1);
/** Todo lo que se necesita para los reportes de un período: totales, por medio, vendedor, día, categoría y producto. */
function analisisVentas(d, desde, hasta) {
  const prods = new Map(d.productos.map((p) => [p.id, p]));
  const ventas = d.ventas.filter((v) => { const t = Date.parse(v.fecha); return !v.anulada && t >= desde && t <= hasta; }).map(enPesos);
  // Las ventas en dólares se suman en pesos (a la cotización de su día); aparte se dice cuánto fue en U$S
  const enUSD = ventas.filter((v) => v.usd != null);
  const r = { usd: { cant: enUSD.length, total: red2(enUSD.reduce((s, v) => s + v.usd, 0)), enPesos: red2(enUSD.reduce((s, v) => s + v.total, 0)) }, cantidad: ventas.length, total: 0, descuentos: 0, porMedio: {}, porVendedor: {}, porDia: {}, porDiaCant: {}, porHora: {}, porHoraCant: {}, porCategoria: {}, porProducto: {}, ventas };
  ventas.forEach((v) => {
    r.total += v.total;
    r.descuentos += v.descuento || 0;
    const m = r.porMedio[v.medio] || (r.porMedio[v.medio] = { cant: 0, total: 0 });
    m.cant++; m.total += v.total;
    const u = v.usuario || 'Sin nombre';
    const ve = r.porVendedor[u] || (r.porVendedor[u] = { cant: 0, total: 0, descuentos: 0 });
    ve.cant++; ve.total += v.total; ve.descuentos += v.descuento || 0;
    const dia = isoLocal(new Date(v.fecha));
    r.porDia[dia] = (r.porDia[dia] || 0) + v.total;
    r.porDiaCant[dia] = (r.porDiaCant[dia] || 0) + 1;
    const hora = new Date(v.fecha).getHours();
    r.porHora[hora] = (r.porHora[hora] || 0) + v.total;
    r.porHoraCant[hora] = (r.porHoraCant[hora] || 0) + 1;
    const factor = v.subtotal > 0 ? v.total / v.subtotal : 1; // reparte el descuento entre los productos
    v.items.forEach((it) => {
      const p = prods.get(it.productoId);
      const neto = it.subtotal * factor;
      const costo = it.costo > 0 ? it.cantidad * it.costo : null;
      const pr = r.porProducto[it.productoId] || (r.porProducto[it.productoId] = { id: it.productoId, nombre: it.nombre, codigo: it.codigo || (p && p.codigo) || '', unidad: it.unidad, categoria: (p && p.categoria) || SIN_CAT, cant: 0, vendido: 0, costo: 0, vendidoConCosto: 0 });
      pr.cant += it.cantidad; pr.vendido += neto;
      if (costo != null) { pr.costo += costo; pr.vendidoConCosto += neto; }
      const c = r.porCategoria[pr.categoria] || (r.porCategoria[pr.categoria] = { categoria: pr.categoria, vendido: 0, costo: 0, vendidoConCosto: 0 });
      c.vendido += neto;
      if (costo != null) { c.costo += costo; c.vendidoConCosto += neto; }
    });
  });
  const lista = (o) => Object.values(o);
  [...lista(r.porProducto), ...lista(r.porCategoria)].forEach((x) => {
    x.ganancia = red2(x.vendidoConCosto - x.costo);
    x.margen = x.vendidoConCosto > 0 ? x.ganancia / x.vendidoConCosto * 100 : null;
    x.vendido = red2(x.vendido);
  });
  const g = gananciaBruta(ventas);
  r.total = red2(r.total);
  r.descuentos = red2(r.descuentos);
  r.ganancia = g.ganancia;
  r.vendidoSinCosto = g.vendidoSinCosto;
  r.productosSinCosto = g.sinCosto;
  r.costoVendido = red2(lista(r.porCategoria).reduce((s, c) => s + c.costo, 0));
  r.vendidoConCosto = red2(lista(r.porCategoria).reduce((s, c) => s + c.vendidoConCosto, 0));
  r.margen = r.vendidoConCosto > 0 ? r.ganancia / r.vendidoConCosto * 100 : null;
  r.ticketPromedio = r.cantidad ? red2(r.total / r.cantidad) : 0;
  return r;
}

/* ---------- Totales por día (calculados una vez) ----------
 * El tablero compara muchos tramos (día, semana, mes y año contra su tramo anterior, 8 semanas por día de la semana).
 * En vez de recorrer todas las ventas para cada uno, se arma una vez el total de cada día y se suman días.
 * Es el único lugar que recorre la historia para esto: «cargar solo los últimos 12 meses» (Base y guardado)
 * va a pedir acá la historia vieja. */
const cacheTotalesDia = { ventas: null, cant: -1, ultima: null, anuladas: -1, mapa: null };
/** Mapa día (AAAA-MM-DD, hora local) → { cant, total, descuentos, costo, ganancia, vendidoSinCosto, porMedio, usd }.
 * Mismas cuentas que analisisVentas: sin anuladas, en pesos (lo de dólares a la cotización de su día) y las
 * devoluciones con su total negativo. Se reutiliza mientras no cambien las ventas. */
function totalesPorDia(d) {
  const ventas = d.ventas || [];
  let anuladas = 0;
  for (let i = 0; i < ventas.length; i++) if (ventas[i].anulada) anuladas++; // anular no cambia la cantidad ni la última
  const ultima = ventas.length ? ventas[ventas.length - 1].id : null;
  const c = cacheTotalesDia;
  if (c.mapa && c.ventas === ventas && c.cant === ventas.length && c.ultima === ultima && c.anuladas === anuladas) return c.mapa;
  const mapa = new Map();
  ventas.forEach((v0) => {
    if (v0.anulada) return;
    const v = enPesos(v0);
    const dia = isoLocal(new Date(v.fecha));
    let t = mapa.get(dia);
    if (!t) mapa.set(dia, t = { cant: 0, total: 0, descuentos: 0, costo: 0, ganancia: 0, vendidoSinCosto: 0, porMedio: {}, usd: { cant: 0, total: 0, enPesos: 0 } });
    t.cant++;
    t.total += v.total;
    t.descuentos += v.descuento || 0;
    const m = t.porMedio[v.medio] || (t.porMedio[v.medio] = { cant: 0, total: 0 });
    m.cant++; m.total += v.total;
    if (v.usd != null) { t.usd.cant++; t.usd.total += v.usd; t.usd.enPesos += v.total; }
    const factor = v.subtotal > 0 ? v.total / v.subtotal : 1; // reparte el descuento entre los productos
    v.items.forEach((it) => {
      const neto = it.subtotal * factor;
      if (it.costo > 0) { t.costo += it.cantidad * it.costo; t.ganancia += neto - it.cantidad * it.costo; } else t.vendidoSinCosto += neto;
    });
  });
  Object.assign(c, { ventas, cant: ventas.length, ultima, anuladas, mapa });
  return mapa;
}
/** Los totales de los días entre desde y hasta (AAAA-MM-DD, los dos incluidos), sumados. */
function totalesEntre(d, desde, hasta) {
  const mapa = totalesPorDia(d);
  const r = { cantidad: 0, total: 0, descuentos: 0, costoVendido: 0, ganancia: 0, vendidoSinCosto: 0, porMedio: {}, usd: { cant: 0, total: 0, enPesos: 0 } };
  for (let k = desde; k <= hasta; k = sumarDias(k, 1)) {
    const t = mapa.get(k);
    if (!t) continue;
    r.cantidad += t.cant; r.total += t.total; r.descuentos += t.descuentos; r.costoVendido += t.costo; r.ganancia += t.ganancia; r.vendidoSinCosto += t.vendidoSinCosto;
    Object.entries(t.porMedio).forEach(([medio, x]) => { const m = r.porMedio[medio] || (r.porMedio[medio] = { cant: 0, total: 0 }); m.cant += x.cant; m.total += x.total; });
    r.usd.cant += t.usd.cant; r.usd.total += t.usd.total; r.usd.enPesos += t.usd.enPesos;
  }
  ['total', 'descuentos', 'costoVendido', 'ganancia', 'vendidoSinCosto'].forEach((k) => { r[k] = red2(r[k]); });
  Object.values(r.porMedio).forEach((m) => { m.total = red2(m.total); });
  r.usd.total = red2(r.usd.total); r.usd.enPesos = red2(r.usd.enPesos);
  return r;
}

/** Barras del gráfico: por hora si es un solo día; por día si el período es de hasta 62 días; si no, por mes. */
function serieVentas(porDia, desde, hasta, porDiaCant = {}, porHora = null, porHoraCant = {}) {
  const ini = new Date(desde); ini.setHours(0, 0, 0, 0);
  const fin = new Date(hasta);
  const dias = Math.round((fin - ini) / DIA) + 1;
  const serie = [];
  if (isoLocal(ini) === isoLocal(fin) && porHora) {
    // De 8 a 19 h, o más si hubo ventas fuera de ese horario
    const horas = Object.keys(porHora).map(Number);
    const de = Math.min(8, ...horas), a = Math.max(19, ...horas);
    for (let h = de; h <= a; h++) {
      const f = new Date(ini); f.setHours(h);
      serie.push({ clave: String(h), hora: h, fecha: f, total: red2(porHora[h] || 0), cant: porHoraCant[h] || 0 });
    }
    return { escala: 'hora', serie };
  }
  if (dias <= 62) {
    for (let t = new Date(ini); t <= fin; t.setDate(t.getDate() + 1)) {
      const k = isoLocal(t);
      serie.push({ clave: k, fecha: new Date(t), total: red2(porDia[k] || 0), cant: porDiaCant[k] || 0 });
    }
    // Los domingos sin ventas (local cerrado) no ocupan lugar en el gráfico
    return { escala: 'día', serie: serie.filter((x) => x.total > 0 || x.fecha.getDay() !== 0) };
  }
  const meses = {}, cants = {};
  Object.entries(porDia).forEach(([k, v]) => { meses[k.slice(0, 7)] = (meses[k.slice(0, 7)] || 0) + v; });
  Object.entries(porDiaCant).forEach(([k, v]) => { cants[k.slice(0, 7)] = (cants[k.slice(0, 7)] || 0) + v; });
  for (let t = new Date(ini.getFullYear(), ini.getMonth(), 1); t <= fin; t.setMonth(t.getMonth() + 1)) {
    const k = isoLocal(t).slice(0, 7);
    serie.push({ clave: k, fecha: new Date(t), total: red2(meses[k] || 0), cant: cants[k] || 0 });
  }
  return { escala: 'mes', serie };
}

/** Productos con stock que no se vendieron en los últimos «dias» días (y que no se cargaron hace menos). */
function mercaderiaParada(d, dias, ahora = Date.now()) {
  const limite = ahora - dias * DIA;
  const ultima = {}, primera = {};
  d.ventas.forEach((v) => { if (v.anulada) return; const t = Date.parse(v.fecha); v.items.forEach((it) => { if (!(ultima[it.productoId] >= t)) ultima[it.productoId] = t; }); });
  d.movimientos.forEach((m) => { const t = Date.parse(m.fecha); if (!(primera[m.productoId] <= t)) primera[m.productoId] = t; });
  return d.productos
    .filter((p) => p.stock > 0 && !(ultima[p.id] >= limite) && !(primera[p.id] >= limite))
    .map((p) => ({ p, ultimaVenta: ultima[p.id] || null, diasSinVenta: ultima[p.id] ? Math.floor((ahora - ultima[p.id]) / DIA) : null, valorCosto: red2(p.stock * p.costo * factorPesos(d, p)), valorVenta: red2(p.stock * p.precio * factorPesos(d, p)) }))
    .sort((a, b) => b.valorCosto - a.valorCosto || b.valorVenta - a.valorVenta);
}

/* ---------- Períodos: moverse día a día y con qué comparar ---------- */

const fechaDe = (iso) => new Date(iso + 'T12:00:00');
/** Suma (o resta) días a una fecha AAAA-MM-DD. */
const sumarDias = (iso, dias) => { const f = fechaDe(iso); f.setDate(f.getDate() + dias); return isoLocal(f); };
const diasEntre = (a, b) => Math.round((fechaDe(b) - fechaDe(a)) / DIA);
const ultimoDelMes = (y, m) => new Date(y, m + 1, 0).getDate();
/** «desde» es el 1 y «hasta» el último día del mes (o hoy, si es el mes en curso). */
function esMesEntero(desde, hasta, hoy = isoLocal()) {
  const a = fechaDe(desde), b = fechaDe(hasta);
  if (a.getDate() !== 1 || a.getMonth() !== b.getMonth() || a.getFullYear() !== b.getFullYear()) return false;
  return b.getDate() === ultimoDelMes(b.getFullYear(), b.getMonth()) || hasta === hoy;
}

/**
 * Corre el período su mismo largo hacia atrás (dir −1) o adelante (dir 1): un día pasa al día siguiente,
 * un mes entero al mes siguiente y una franja a la franja siguiente. No pasa de hoy; devuelve null si no se puede.
 */
function moverPeriodo(desde, hasta, dir, hoy = isoLocal()) {
  let d, h;
  if (desde !== hasta && esMesEntero(desde, hasta, hoy)) {
    const a = fechaDe(desde);
    const ini = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    d = isoLocal(ini);
    h = isoLocal(new Date(ini.getFullYear(), ini.getMonth(), ultimoDelMes(ini.getFullYear(), ini.getMonth())));
  } else {
    const largo = diasEntre(desde, hasta) + 1;
    d = sumarDias(desde, dir * largo);
    h = sumarDias(hasta, dir * largo);
  }
  if (d > hoy) return null;
  return { desde: d, hasta: h > hoy ? hoy : h };
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Con qué se compara un período. Un día, con el mismo día de la semana anterior (un sábado con otro sábado);
 * un mes, con el mismo tramo del mes anterior; cualquier otra franja, con los días de antes del mismo largo.
 */
function periodoComparable(desde, hasta, hoy = isoLocal()) {
  if (desde === hasta) {
    const ant = sumarDias(desde, -7);
    return { desde: ant, hasta: ant, texto: `vs. el ${DIAS_SEMANA[fechaDe(desde).getDay()]} anterior` };
  }
  if (esMesEntero(desde, hasta, hoy)) {
    const a = fechaDe(desde), b = fechaDe(hasta);
    const y = a.getFullYear(), m = a.getMonth() - 1;
    const ini = new Date(y, m, 1);
    const tope = ultimoDelMes(ini.getFullYear(), ini.getMonth());
    const entero = b.getDate() === ultimoDelMes(b.getFullYear(), b.getMonth());
    const fin = new Date(ini.getFullYear(), ini.getMonth(), entero ? tope : Math.min(b.getDate(), tope));
    return { desde: isoLocal(ini), hasta: isoLocal(fin), texto: entero ? `vs. ${MESES[ini.getMonth()]}` : `vs. el 1 al ${fin.getDate()} de ${MESES[ini.getMonth()]}` };
  }
  const largo = diasEntre(desde, hasta) + 1;
  return { desde: sumarDias(desde, -largo), hasta: sumarDias(desde, -1), texto: `vs. los ${largo} días anteriores` };
}

/** Día, semana, mes y año hasta «fecha», cada uno contra su tramo comparable de antes. */
function tramosCrecimiento(fecha) {
  const f = fechaDe(fecha);
  const lunes = sumarDias(fecha, -((f.getDay() + 6) % 7));
  const y = f.getFullYear(), m = f.getMonth(), dd = f.getDate();
  const mesAnt = new Date(y, m - 1, 1);
  const finMesAnt = new Date(y, m - 1, Math.min(dd, ultimoDelMes(mesAnt.getFullYear(), mesAnt.getMonth())));
  const finAnioAnt = new Date(y - 1, m, Math.min(dd, ultimoDelMes(y - 1, m)));
  return [
    { clave: 'dia', nombre: 'El día', desde: fecha, hasta: fecha, antDesde: sumarDias(fecha, -7), antHasta: sumarDias(fecha, -7), textoAnt: `el ${DIAS_SEMANA[f.getDay()]} anterior` },
    { clave: 'semana', nombre: 'La semana', desde: lunes, hasta: fecha, antDesde: sumarDias(lunes, -7), antHasta: sumarDias(fecha, -7), textoAnt: 'los mismos días de la semana anterior' },
    { clave: 'mes', nombre: 'El mes', desde: isoLocal(new Date(y, m, 1)), hasta: fecha, antDesde: isoLocal(mesAnt), antHasta: isoLocal(finMesAnt), textoAnt: `del 1 al ${finMesAnt.getDate()} de ${MESES[mesAnt.getMonth()]}` },
    { clave: 'anio', nombre: 'El año', desde: `${y}-01-01`, hasta: fecha, antDesde: `${y - 1}-01-01`, antHasta: isoLocal(finAnioAnt), textoAnt: `hasta el ${finAnioAnt.getDate()} de ${MESES[m]} de ${y - 1}` },
  ];
}

/** Qué subió y qué bajó entre dos períodos. grupos: { clave: { nombre, vendido } }. Ordenado de la mayor suba a la mayor baja. */
function subasYBajas(ahora, antes) {
  const claves = new Set([...Object.keys(ahora), ...Object.keys(antes)]);
  return [...claves].map((k) => {
    const a = ahora[k] ? ahora[k].vendido : 0, b = antes[k] ? antes[k].vendido : 0;
    return { clave: k, nombre: (ahora[k] || antes[k]).nombre || (ahora[k] || antes[k]).categoria, ahora: red2(a), antes: red2(b), dif: red2(a - b), pct: b ? (a - b) / b * 100 : null };
  }).filter((x) => Math.abs(x.dif) >= 0.01).sort((x, y) => y.dif - x.dif);
}

/** Promedio vendido por día de la semana en las «semanas» semanas que terminan en «hasta» (AAAA-MM-DD). */
function promedioPorDiaSemana(d, hasta, semanas = 8) {
  const desde = sumarDias(hasta, -(semanas * 7 - 1));
  const porDia = totalesPorDia(d);
  const suma = [0, 0, 0, 0, 0, 0, 0], dias = [0, 0, 0, 0, 0, 0, 0];
  for (let k = desde; k <= hasta; k = sumarDias(k, 1)) {
    const w = fechaDe(k).getDay();
    suma[w] += (porDia.get(k) || {}).total || 0;
    dias[w]++;
  }
  // Lunes primero; el domingo solo si hubo ventas
  return [1, 2, 3, 4, 5, 6, 0].map((w) => ({ dia: w, nombre: DIAS_SEMANA[w], promedio: dias[w] ? red2(suma[w] / dias[w]) : 0, total: red2(suma[w]) }))
    .filter((x) => x.dia !== 0 || x.total > 0);
}

/** Todo lo de un día: análisis, comparación con el mismo día de la semana anterior, ventas (también anuladas) y cajas. */
function resumenDia(d, dia) {
  const a = analisisVentas(d, inicioDia(dia), finDia(dia));
  const comp = periodoComparable(dia, dia);
  const ant = analisisVentas(d, inicioDia(comp.desde), finDia(comp.hasta));
  const ventas = d.ventas.filter((v) => isoLocal(new Date(v.fecha)) === dia).sort((x, y) => x.fecha.localeCompare(y.fecha));
  const anuladas = ventas.filter((v) => v.anulada);
  const cajas = (d.cajas || []).filter((c) => isoLocal(new Date(c.abierta)) === dia || (c.cerrada && isoLocal(new Date(c.cerrada)) === dia));
  return { dia, a, ant, comp, ventas, anuladas, totalAnulado: red2(anuladas.reduce((s, v) => s + enPesos(v).total, 0)), cajas };
}

/* ---------- Pedido al proveedor (desde «Para reponer») ---------- */

/** Cuánto pedir de un producto: mínimo × 2 − stock, redondeado hacia arriba. Al menos 1: un producto que está para
 * reponer (sin stock, aunque tenga mínimo 0) se pide. */
function cantidadPedido(p) {
  const falta = Number(p.minimo || 0) * 2 - Number(p.stock || 0);
  return Math.max(Math.ceil(Math.round(falta * 1000) / 1000), 1); // el redondeo evita que 2,0000001 pase a 3
}

/** Lo que hay que reponer, agrupado por proveedor (ordenados por nombre; los productos sin proveedor, al final).
 * cantidades: { [productoId]: número } para lo que se cambió a mano; 0 saca el producto del pedido.
 * Devuelve [{ proveedorId, proveedor, nombre, items: [{ producto, sugerida, cantidad, costo }], total }].
 * costo y total, en pesos (lo de dólares, a la cotización de hoy). */
function armarPedidos(d, cantidades = {}) {
  const grupos = new Map();
  d.productos.filter((p) => estado(p) !== 'ok').forEach((p) => {
    const prov = d.proveedores.find((x) => x.id === p.proveedorId) || null;
    const clave = prov ? prov.id : '';
    if (!grupos.has(clave)) grupos.set(clave, { proveedorId: clave, proveedor: prov, nombre: prov ? prov.nombre : 'Sin proveedor', items: [], total: 0 });
    const sugerida = cantidadPedido(p);
    const cantidad = Object.prototype.hasOwnProperty.call(cantidades, p.id) ? Math.max(Number(cantidades[p.id]) || 0, 0) : sugerida;
    const costo = red(cantidad * Number(p.costo || 0) * factorPesos(d, p));
    grupos.get(clave).items.push({ producto: p, sugerida, cantidad, costo });
  });
  const lista = [...grupos.values()];
  lista.forEach((g) => {
    g.items.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, 'es'));
    g.total = red(g.items.reduce((s, it) => s + it.costo, 0));
  });
  return lista.sort((a, b) => (!a.proveedorId) - (!b.proveedorId) || a.nombre.localeCompare(b.nombre, 'es'));
}

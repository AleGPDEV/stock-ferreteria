/* Exportar a Excel (con formato) los reportes, listas y cierres. */
'use strict';

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

/* Formato de los Excel (vendor/xlsx-estilo.min.js guarda negrita, colores y bordes).
 * Los colores son los del programa: el azul de --accent y el rojo y naranja de los avisos. */
const XL = {
  azul: '1C5A8C', azulOscuro: '164A75', azulSuave: 'E0EBF5', rayado: 'F3F7FB', linea: 'C9D3DD', gris: '666666', rojo: 'B3261E', naranja: '8F5400',
  plata: '"$" #,##0.00;[Red]-"$" #,##0.00', entero: '#,##0', pct: '0.0" %"', fecha: 'dd/mm/yyyy hh:mm', dia: 'dd/mm/yyyy',
};
/** Fecha de JavaScript → número de fecha de Excel, con la hora de esta PC. */
const fechaExcel = (f) => (Date.UTC(f.getFullYear(), f.getMonth(), f.getDate(), f.getHours(), f.getMinutes(), f.getSeconds()) / 86400000) + 25569;

/**
 * Arma una hoja de Excel con formato a partir de filas { columna: valor }.
 * opc: titulo, subtitulo e info (renglones de arriba; sin titulo, los nombres de columna quedan en la fila 1
 * para poder volver a importarla), y listas de columnas: plata, entero, pct, texto (códigos), fecha, dia, totales.
 * resaltar(fila) puede devolver 'rojo' o 'naranja' para pintar la letra de esa fila.
 */
function hojaExcel(X, filas, opc = {}) {
  const cols = Object.keys(filas[0] || {});
  const en = (lista, c) => (opc[lista] || []).includes(c);
  const borde = (color) => { const b = { style: 'thin', color: { rgb: color } }; return { top: b, bottom: b, left: b, right: b }; };
  const ws = {};
  const celda = (r, c, cel) => { ws[X.utils.encode_cell({ r, c })] = cel; };
  const ultCol = Math.max(cols.length - 1, 0);
  const merges = [];
  let r = 0;
  if (opc.titulo) {
    [[opc.titulo, { bold: true, sz: 16, color: { rgb: XL.azul } }], [opc.subtitulo, { bold: true, sz: 12 }], [opc.info, { italic: true, sz: 10, color: { rgb: XL.gris } }]]
      .forEach(([texto, font]) => {
        if (!texto) return;
        celda(r, 0, { t: 's', v: String(texto), s: { font } });
        if (ultCol > 0) merges.push({ s: { r, c: 0 }, e: { r, c: ultCol } });
        r++;
      });
    r++; // renglón en blanco antes de la tabla
  }
  const filaTitulos = r;
  cols.forEach((c, i) => celda(r, i, { t: 's', v: c, s: {
    font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: XL.azul } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borde(XL.azulOscuro),
  } }));
  filas.forEach((f, k) => {
    r++;
    const color = opc.resaltar ? opc.resaltar(f) : '';
    cols.forEach((c, i) => {
      const v = f[c];
      const s = { border: borde(XL.linea), alignment: { vertical: 'center' } };
      if (k % 2) s.fill = { patternType: 'solid', fgColor: { rgb: XL.rayado } };
      if (color) s.font = { color: { rgb: XL[color] || color } };
      let cel;
      if (v instanceof Date && !Number.isNaN(v.getTime())) cel = { t: 'n', v: fechaExcel(v), z: en('dia', c) ? XL.dia : XL.fecha };
      else if (typeof v === 'number' && Number.isFinite(v) && !en('texto', c)) {
        cel = { t: 'n', v };
        if (en('plata', c)) cel.z = XL.plata;
        else if (en('entero', c)) cel.z = XL.entero;
        else if (en('pct', c)) cel.z = XL.pct;
      } else {
        cel = { t: 's', v: v == null ? '' : String(v) };
        if (en('texto', c)) cel.z = '@';
      }
      if (cel.t === 'n' && !en('fecha', c) && !en('dia', c)) s.alignment.horizontal = 'right';
      cel.s = s;
      celda(r, i, cel);
    });
  });
  const ultFila = r;
  if (opc.totales && opc.totales.length && filas.length) {
    r++;
    const sTotal = (extra = {}) => ({ font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: XL.azulSuave } },
      border: { top: { style: 'medium', color: { rgb: XL.azul } }, bottom: { style: 'thin', color: { rgb: XL.linea } } }, ...extra });
    cols.forEach((c, i) => {
      if (opc.totales.includes(c)) {
        const suma = filas.reduce((s, f) => s + (typeof f[c] === 'number' && Number.isFinite(f[c]) ? f[c] : 0), 0);
        const rango = `${X.utils.encode_cell({ r: filaTitulos + 1, c: i })}:${X.utils.encode_cell({ r: ultFila, c: i })}`;
        // SUBTOTAL suma solo lo que queda visible al usar los filtros
        celda(r, i, { t: 'n', v: red2(suma), f: `SUBTOTAL(109,${rango})`, z: en('plata', c) ? XL.plata : (en('entero', c) ? XL.entero : undefined), s: sTotal({ alignment: { horizontal: 'right' } }) });
      } else celda(r, i, { t: 's', v: i === 0 ? 'Total' : '', s: sTotal() });
    });
  }
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: ultCol } });
  if (merges.length) ws['!merges'] = merges;
  if (filas.length) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: filaTitulos, c: 0 }, e: { r: ultFila, c: ultCol } }) };
  const largo = (c, v) => {
    if (v instanceof Date) return en('dia', c) ? 10 : 16;
    if (typeof v === 'number' && en('plata', c)) return numero.format(Math.round(v)).length + 6;
    return String(v ?? '').length;
  };
  ws['!cols'] = cols.map((c) => ({ wch: Math.min(50, Math.max(Math.min(c.length, 18), 8, ...filas.map((f) => largo(c, f[c]))) + 3) }));
  const filasAlto = [];
  if (opc.titulo) filasAlto[0] = { hpt: 24 };
  filasAlto[filaTitulos] = { hpt: 32 };
  ws['!rows'] = filasAlto;
  return ws;
}

function descargarExcel(filas, hoja, base, opc = {}) {
  if (!filas.length) { toast('No hay datos para exportar.'); return; }
  const nombre = `${base}_${isoLocal()}`;
  try {
    if (window.XLSX) {
      const info = `Hecho el ${new Date().toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${sesion ? ` por ${sesion.nombre}` : ''}`;
      const titulo = opc.titulo ? ((db.negocio && db.negocio.nombre) || NOMBRE_NEGOCIO) : '';
      const ws = hojaExcel(XLSX, filas, { ...opc, titulo, subtitulo: opc.titulo, info: opc.titulo ? [opc.subtitulo, info].filter(Boolean).join(' · ') : '' });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
      XLSX.writeFile(wb, nombre + '.xlsx');
      toast(`Descargando ${nombre}.xlsx`);
    } else {
      // Sin conexión a internet: se descarga un CSV que Excel también abre
      const cols = Object.keys(filas[0]);
      const txt = (v) => (v instanceof Date ? v.toLocaleString('es-UY') : String(v ?? ''));
      const csv = [cols.join(';'), ...filas.map((f) => cols.map((c) => `"${txt(f[c]).replace(/"/g, '""')}"`).join(';'))].join('\r\n');
      descargarBlob('﻿' + csv, 'text/csv;charset=utf-8', nombre + '.csv');
      toast(`Descargando ${nombre}.csv (se abre con Excel)`);
    }
  } catch (e) {
    toast('No se pudo generar el archivo. Probá de nuevo.');
  }
}

/** «Del 01/11/2026 al 11/11/2026», a partir de dos fechas AAAA-MM-DD (vacío si no hay ninguna). */
function textoPeriodo(desde, hasta) {
  const d = (s) => (s ? s.split('-').reverse().join('/') : '');
  if (desde && hasta) return desde === hasta ? `Día ${d(desde)}` : `Del ${d(desde)} al ${d(hasta)}`;
  if (desde) return `Desde el ${d(desde)}`;
  return hasta ? `Hasta el ${d(hasta)}` : '';
}

function exportar(tipo) {
  const f = (iso) => new Date(iso);
  const periodo = () => textoPeriodo($('#rep-desde').value, $('#rep-hasta').value);
  const COLOR_ESTADO = { sin: 'rojo', bajo: 'naranja' };
  if (tipo === 'inventario') {
    descargarExcel([...db.productos].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({
      'Código': p.codigo, 'Códigos de barras': (p.barras || []).join(' '), 'Producto': p.nombre, 'Categoría': p.categoria, 'Unidad': p.unidad, 'Proveedor': nombreProv(p.proveedorId),
      'Ubicación': p.ubicacion, 'Stock': p.stock, 'Stock mínimo': p.minimo, 'Estado': { ok: 'En stock', bajo: 'Bajo mínimo', sin: 'Sin stock' }[estado(p)],
      'Moneda': esUSD(p) ? 'USD' : 'UYU', 'Costo': p.costo, 'Precio': p.precio, 'Valor a costo': red(Math.max(p.stock, 0) * p.costo), 'Valor a venta': red(Math.max(p.stock, 0) * p.precio),
    })), 'Inventario', 'inventario', {
      // Sin renglones de título: este Excel se vuelve a importar (Productos y Cargador de productos)
      texto: ['Código', 'Códigos de barras'], plata: ['Costo', 'Precio', 'Valor a costo', 'Valor a venta'],
      resaltar: (x) => ({ 'Sin stock': 'rojo', 'Bajo mínimo': 'naranja' }[x['Estado']] || ''),
    });
  } else if (tipo === 'reposicion') {
    descargarExcel(db.productos.filter((p) => estado(p) !== 'ok').map((p) => ({
      'Proveedor': nombreProv(p.proveedorId), 'Código': p.codigo, 'Producto': p.nombre, 'Unidad': p.unidad,
      'Stock': p.stock, 'Stock mínimo': p.minimo, 'Cantidad a pedir': sugerido(p), 'Costo unitario': p.costo, 'Costo estimado': red(sugerido(p) * p.costo),
    })), 'Reposición', 'reposicion', {
      titulo: 'Productos para reponer', texto: ['Código'], plata: ['Costo unitario', 'Costo estimado'], totales: ['Costo estimado'],
      resaltar: (x) => (x['Stock'] <= 0 ? 'rojo' : ''),
    });
  } else if (tipo === 'valorizacion') {
    const cats = {};
    db.productos.forEach((p) => {
      const c = p.categoria || 'Sin categoría';
      cats[c] = cats[c] || { 'Categoría': c, 'Productos': 0, 'Valor a costo': 0, 'Valor a venta': 0 };
      cats[c]['Productos']++;
      cats[c]['Valor a costo'] = red(cats[c]['Valor a costo'] + Math.max(p.stock, 0) * p.costo * factorPesos(db, p));
      cats[c]['Valor a venta'] = red(cats[c]['Valor a venta'] + Math.max(p.stock, 0) * p.precio * factorPesos(db, p));
    });
    descargarExcel(Object.values(cats).sort((x, y) => y['Valor a costo'] - x['Valor a costo']), 'Valorización', 'valorizacion', {
      titulo: 'Valor del inventario por categoría', entero: ['Productos'], plata: ['Valor a costo', 'Valor a venta'], totales: ['Productos', 'Valor a costo', 'Valor a venta'],
    });
  } else if (tipo === 'movimientos') {
    descargarExcel(movimientosFiltrados().map((m) => ({
      'Fecha': f(m.fecha), 'Tipo': etiquetaTipo(m), 'Código': m.codigo, 'Producto': m.producto, 'Cantidad': m.cantidad, 'Unidad': m.unidad,
      'Stock antes': m.stockAntes, 'Stock después': m.stockDespues, 'Costo unitario': m.costoUnit, 'Proveedor': nombreProv(m.proveedorId), 'Usuario': m.usuario || '', 'Nota': m.nota,
    })), 'Movimientos', 'movimientos', {
      titulo: 'Movimientos de stock', subtitulo: textoPeriodo($('#mov-desde').value, $('#mov-hasta').value), texto: ['Código'], plata: ['Costo unitario'],
    });
  } else if (tipo === 'cajas') {
    descargarExcel((db.cajas || []).map((c) => {
      const r = c.resumen || resumenCaja(db, c);
      return {
        'Caja N.º': c.numero, 'Abierta': f(c.abierta), 'Abrió': c.abiertaPor, 'Cerrada': c.cerrada ? f(c.cerrada) : 'Abierta', 'Cerró': c.cerradaPor || '',
        'Efectivo inicial': r.inicial, 'Ventas': r.ventas, 'Total vendido': r.total, 'Ventas en efectivo': r.ventasEfectivo,
        'Débito': r.porMedio['Débito'] || 0, 'Crédito': r.porMedio['Crédito'] || 0, 'Transferencia': r.porMedio.Transferencia || 0,
        'Ingresos': r.ingresos, 'Retiros': r.retiros, 'Debería haber': r.esperado, 'Se contó': c.cerrada ? c.contado : '', 'Diferencia': c.cerrada ? c.diferencia : '', 'Nota': c.nota || '',
      };
    }), 'Cierres de caja', 'cierres_de_caja', {
      titulo: 'Cierres de caja', entero: ['Caja N.º', 'Ventas'],
      plata: ['Efectivo inicial', 'Total vendido', 'Ventas en efectivo', 'Débito', 'Crédito', 'Transferencia', 'Ingresos', 'Retiros', 'Debería haber', 'Se contó', 'Diferencia'],
      totales: ['Ventas', 'Total vendido', 'Ventas en efectivo', 'Débito', 'Crédito', 'Transferencia', 'Ingresos', 'Retiros', 'Diferencia'],
      resaltar: (x) => (typeof x['Diferencia'] === 'number' && Math.abs(x['Diferencia']) >= 0.01 ? 'rojo' : ''),
    });
  } else if (tipo === 'vendedores' || tipo === 'masvendidos' || tipo === 'ganancias') {
    const per = periodoReportes();
    const a = analisisVentas(db, per.desde, per.hasta);
    if (tipo === 'vendedores') {
      descargarExcel(Object.entries(a.porVendedor).sort((x, y) => y[1].total - x[1].total).map(([u, v]) => ({
        'Vendedor': u, 'Ventas': v.cant, 'Total': red2(v.total), 'Promedio por venta': red2(v.total / v.cant), 'Descuentos': red2(v.descuentos),
      })), 'Por vendedor', 'ventas_por_vendedor', {
        titulo: 'Ventas por vendedor', subtitulo: periodo(), entero: ['Ventas'], plata: ['Total', 'Promedio por venta', 'Descuentos'], totales: ['Ventas', 'Total', 'Descuentos'],
      });
    } else {
      descargarExcel(Object.values(a.porProducto).sort((x, y) => (tipo === 'ganancias' ? y.ganancia - x.ganancia : y.vendido - x.vendido)).map((x) => ({
        'Código': x.codigo, 'Producto': x.nombre, 'Categoría': x.categoria, 'Cantidad': red(x.cant), 'Unidad': x.unidad, 'Vendido': x.vendido,
        'Costo': x.vendidoConCosto > 0 ? red2(x.costo) : '', 'Ganancia': x.vendidoConCosto > 0 ? x.ganancia : '', 'Margen %': x.margen == null ? 'sin costo' : Math.round(x.margen * 10) / 10,
      })), tipo === 'ganancias' ? 'Ganancias' : 'Más vendidos', tipo === 'ganancias' ? 'ganancia_por_producto' : 'mas_vendidos', {
        titulo: tipo === 'ganancias' ? 'Ganancia por producto' : 'Productos más vendidos', subtitulo: periodo(),
        texto: ['Código'], plata: ['Vendido', 'Costo', 'Ganancia'], pct: ['Margen %'], totales: ['Vendido', 'Costo', 'Ganancia'],
      });
    }
  } else if (tipo === 'parada') {
    const dias = Number($('#rep-parada-dias').value) || 90;
    descargarExcel(mercaderiaParada(db, dias).map((x) => ({
      'Código': x.p.codigo, 'Producto': x.p.nombre, 'Categoría': x.p.categoria, 'Proveedor': nombreProv(x.p.proveedorId), 'Ubicación': x.p.ubicacion,
      'Stock': x.p.stock, 'Unidad': x.p.unidad, 'Última venta': x.ultimaVenta ? new Date(x.ultimaVenta) : 'Nunca',
      'Días sin vender': x.diasSinVenta ?? '', 'Valor a costo': x.valorCosto, 'Valor a venta': x.valorVenta,
    })), 'Mercadería parada', `mercaderia_parada_${dias}_dias`, {
      titulo: 'Mercadería parada', subtitulo: `Con stock y sin ventas en ${dias} días`, texto: ['Código'], entero: ['Días sin vender'], dia: ['Última venta'],
      plata: ['Valor a costo', 'Valor a venta'], totales: ['Valor a costo', 'Valor a venta'],
    });
  } else if (tipo === 'precios') {
    descargarExcel(cambiosPrecioPeriodo().map((h) => ({
      'Fecha': f(h.fecha), 'Usuario': h.usuario || '', 'Código': h.codigo || '', 'Producto': h.producto, 'Precio antes': h.masivo ? '' : h.antes, 'Precio nuevo': h.masivo ? '' : h.despues, 'Moneda': h.moneda === 'USD' ? 'USD' : 'UYU', 'Motivo': h.motivo || '',
    })), 'Cambios de precio', 'cambios_de_precio', {
      titulo: 'Cambios de precio', subtitulo: periodo(), texto: ['Código'], plata: ['Precio antes', 'Precio nuevo'],
    });
  } else if (tipo === 'ventas') {
    const filas = [];
    ventasPeriodo().forEach((v) => v.items.forEach((it) => filas.push({
      'Venta N.º': v.numero, 'Fecha': f(v.fecha), 'Estado': v.anulada ? 'Anulada' : 'Cobrada', 'Medio de pago': v.medio, 'Vendedor': v.usuario || '', 'Cliente': v.cliente,
      'Código': it.codigo, 'Producto': it.nombre, 'Cantidad': it.cantidad, 'Unidad': it.unidad, 'Precio': it.precio, 'Subtotal': it.subtotal, 'Descuento %': v.descuentoPct || 0, 'Total venta': v.total,
      'Moneda': esUSD(v) ? 'USD' : 'UYU', 'Dólar del día': esUSD(v) ? v.cotizacion : '', 'Total en pesos': enPesos(v).total,
    })));
    descargarExcel(filas, 'Ventas', 'ventas', {
      titulo: 'Ventas', subtitulo: periodo(), entero: ['Venta N.º'], texto: ['Código'], plata: ['Precio', 'Subtotal', 'Total venta', 'Dólar del día', 'Total en pesos'], pct: ['Descuento %'],
      resaltar: (x) => (x['Estado'] === 'Anulada' ? 'rojo' : ''),
    });
  }
}

/* Caja (sin pantalla): abrir, retiros e ingresos de efectivo, resumen y cierre con arqueo. */
'use strict';

/* ---------- Apertura y cierre de caja ---------- */

const cajaAbierta = (d) => (Array.isArray(d.cajas) ? d.cajas.find((c) => !c.cerrada) : null) || null;

/** extra: { inicialUSD, cotizacion } — los dólares para dar cambio y el dólar de hoy (si se venden productos en U$S). */
function abrirCaja(d, monto, usuario, fecha, extra = {}) {
  if (!Array.isArray(d.cajas)) d.cajas = [];
  if (cajaAbierta(d)) return { error: 'La caja ya está abierta.' };
  const inicial = monto === '' || monto == null ? 0 : Number(monto);
  if (!Number.isFinite(inicial) || inicial < 0) return { error: 'Escribí el efectivo con el que empezás (puede ser 0).' };
  const inicialUSD = extra.inicialUSD === '' || extra.inicialUSD == null ? 0 : Number(extra.inicialUSD);
  if (!Number.isFinite(inicialUSD) || inicialUSD < 0) return { error: 'Revisá los dólares con los que empezás (puede ser 0).' };
  const cot = extra.cotizacion === '' || extra.cotizacion == null ? null : Number(extra.cotizacion);
  if (cot != null && !(cot > 0 && cot < 1000)) return { error: 'Revisá la cotización del dólar (por ejemplo 40,50).' };
  d.numCaja = (d.numCaja || 0) + 1;
  const caja = { id: uid(), numero: d.numCaja, abierta: fecha || new Date().toISOString(), abiertaPor: usuario || '', inicial: red2(inicial), movs: [], cerrada: null };
  if (inicialUSD > 0) caja.inicialUSD = red2(inicialUSD);
  if (cot) { caja.cotizacion = red2(cot); d.cotizacion = caja.cotizacion; }
  d.cajas.push(caja);
  return { caja };
}

/** Retiro (pago a un proveedor, llevar a depósito…) o ingreso (más cambio) de efectivo. */
function movimientoCaja(d, tipo, monto, motivo, usuario, fecha, moneda = 'UYU') {
  const caja = cajaAbierta(d);
  if (!caja) return 'La caja está cerrada.';
  if (tipo !== 'retiro' && tipo !== 'ingreso') return 'Elegí si es un retiro o un ingreso.';
  const m = Number(monto);
  if (!(m > 0)) return 'Escribí el monto.';
  if (!String(motivo || '').trim()) return 'Escribí el motivo, por ejemplo «Pago a proveedor».';
  caja.movs.push({ id: uid(), fecha: fecha || new Date().toISOString(), tipo, monto: red2(m), motivo: String(motivo).trim(), usuario: usuario || '', ...(moneda === 'USD' ? { moneda } : {}) });
  return null;
}

/** Cuánto efectivo debería haber y cuánto se vendió por cada medio de pago. */
function resumenCaja(d, caja) {
  const ventas = d.ventas.filter((v) => v.cajaId === caja.id);
  const todas = ventas.filter((v) => !v.anulada);
  // Pesos y dólares van por separado: cada uno tiene su efectivo para contar
  const validas = todas.filter((v) => !esUSD(v));
  const enUSD = todas.filter(esUSD);
  const porMedio = {};
  validas.forEach((v) => { porMedio[v.medio] = red2((porMedio[v.medio] || 0) + v.total); });
  const ventasEfectivo = porMedio.Efectivo || 0;
  const movs = (tipo, usd) => red2(caja.movs.filter((m) => m.tipo === tipo && (m.moneda === 'USD') === usd).reduce((s, m) => s + m.monto, 0));
  const ingresos = movs('ingreso', false), retiros = movs('retiro', false);
  const porMedioUSD = {};
  enUSD.forEach((v) => { porMedioUSD[v.medio] = red2((porMedioUSD[v.medio] || 0) + v.total); });
  const usd = enUSD.length || caja.inicialUSD || caja.movs.some((m) => m.moneda === 'USD') ? {
    inicial: caja.inicialUSD || 0,
    ventas: enUSD.filter((v) => !esDevolucion(v)).length,
    total: red2(enUSD.reduce((s, v) => s + v.total, 0)),
    porMedio: porMedioUSD,
    ventasEfectivo: porMedioUSD.Efectivo || 0,
    ingresos: movs('ingreso', true),
    retiros: movs('retiro', true),
  } : null;
  if (usd) usd.esperado = red2(usd.inicial + usd.ventasEfectivo + usd.ingresos - usd.retiros);
  return {
    usd,
    inicial: caja.inicial,
    ventas: todas.filter((v) => !esDevolucion(v)).length,
    devoluciones: todas.filter(esDevolucion).length,
    anuladas: ventas.length - todas.length,
    total: red2(validas.reduce((s, v) => s + v.total, 0)),
    porMedio,
    ventasEfectivo,
    ingresos,
    retiros,
    esperado: red2(caja.inicial + ventasEfectivo + ingresos - retiros),
  };
}

function cerrarCaja(d, contado, usuario, nota, fecha, contadoUSD) {
  const caja = cajaAbierta(d);
  if (!caja) return { error: 'La caja ya está cerrada.' };
  if (contado === '' || contado == null) return { error: 'Contá el efectivo que hay en la caja y escribí el total.' };
  const c = Number(contado);
  if (!Number.isFinite(c) || c < 0) return { error: 'Escribí cuánto efectivo hay en la caja.' };
  const resumen = resumenCaja(d, caja);
  if (resumen.usd) {
    if (contadoUSD === '' || contadoUSD == null) return { error: 'Contá también los dólares que hay en la caja.', usd: true };
    const cu = Number(contadoUSD);
    if (!Number.isFinite(cu) || cu < 0) return { error: 'Escribí cuántos dólares hay en la caja.', usd: true };
    caja.contadoUSD = red2(cu);
    caja.diferenciaUSD = red2(cu - resumen.usd.esperado);
  }
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

/* App del celular (Etiquetador) por el WiFi del local: lo que la PC le contesta (consultas) y lo que
 * el celular guarda en la PC (fase 2: altas, conteos, estantes y fotos). El servidor que recibe los pedidos
 * está en electron/servidor-celular.js; la ventana para vincular el celular, en pantallas/celular.js. */
'use strict';

/* ---------- App del celular (Etiquetador) por el WiFi del local ----------
 * El servidor de la PC (electron/servidor-celular.js) le pregunta a la pantalla, que es la dueña de los datos.
 * Consultas acá; lo que el celular guarda, más abajo («fase 2»). Nunca recibe costos (un empleado puede tener el celular) ni nada de ventas,
 * caja o usuarios. Funciona aunque nadie haya entrado al programa: el celular se usa en el depósito mientras la PC
 * del mostrador puede estar en la pantalla de ingreso. */
function datosParaCelular(d, p) {
  return { codigo: p.codigo, barras: codigosDe(p).filter((c) => c !== p.codigo), nombre: p.nombre, categoria: p.categoria || '', unidad: p.unidad || '',
    proveedor: nombreProveedorDe(d, p.proveedorId), ubicacion: p.ubicacion || '', stock: p.stock, minimo: p.minimo, precio: p.precio, moneda: esUSD(p) ? 'USD' : 'UYU', foto: !!(p.foto || p.fotoData) };
}
/** Por código propio, de barras o de proveedor. { producto } (null si no está). */
function productoCelular(d, codigo) {
  const c = normCodigo(codigo);
  if (!c) return { producto: null };
  const p = buscarPorCodigo(d, c) || d.productos.find((x) => codigosProvDe(x).some((k) => normCodigo(k.codigo) === c));
  return { producto: p ? datosParaCelular(d, p) : null };
}
/** Por nombre o código, todas las palabras en cualquier orden y sin importar tildes; primero los que empiezan con lo escrito. */
function productosCelular(d, texto, max = 20) {
  const q = normal(String(texto || '').trim());
  const pal = q.split(/\s+/).filter(Boolean);
  if (pal.join('').length < 2) return { productos: [] };
  const lista = d.productos
    .map((p) => ({ p, t: normal(`${p.nombre} ${textoCodigos(p)} ${p.categoria || ''} ${p.ubicacion || ''}`) }))
    .filter((x) => pal.every((w) => x.t.includes(w)))
    .sort((a, b) => (normal(b.p.nombre).startsWith(q) - normal(a.p.nombre).startsWith(q)) || ordenNatural(a.p.nombre, b.p.nombre));
  return { productos: lista.slice(0, max).map((x) => datosParaCelular(d, x.p)), mas: Math.max(0, lista.length - max) };
}
const estantesCelular = (d) => ({ estantes: ubicacionesDe(d).map((u) => ({ codigo: u.ubicacion, categoria: u.categoria || '' })) });
const SIN_DATOS_CELULAR = { error: 'Los datos del programa están dañados: hay que restaurar una copia en la PC.', noListo: true };

/* ---------- Lo que guarda el celular en la PC (fase 2) ----------
 * El celular ya no arma un Excel: cada producto nuevo, conteo o estante se guarda acá en el momento. Si no hay
 * conexión, el celular no registra nada. Todo es «idempotente»: si el WiFi se corta y el celular reintenta (o corrige
 * lo que mandó), se actualiza lo mismo en lugar de duplicarlo. El celular trabaja como un empleado: no pone costos ni
 * cambia el precio o el nombre de un producto que ya existía, y lo nuevo queda «Nuevo · revisar». */
const MAX_CANT_CELULAR = 99999;
const SEMANA = 7 * 24 * 3600 * 1000;
const equipoCelular = (e) => { const x = String(e || '').trim().toUpperCase(); return /^[A-Z][A-Z0-9]{0,3}$/.test(x) && x !== 'P' ? x : ''; };
const usuarioCelular = (e) => `Celular ${equipoCelular(e) || '?'}`;
/** Cuándo se contó, con el reloj de la PC: el celular manda hace cuántos ms (así no importa si su reloj está corrido). */
const contadoElDesde = (hace, ahora = Date.now()) => new Date(ahora - Math.min(Math.max(Number(hace) || 0, 0), SEMANA)).toISOString();
/**
 * Stock real a partir de un conteo: lo contado más todo lo que cambió después de contar (ventas, llegadas, otras
 * correcciones). No cuenta los movimientos de este mismo conteo (conteoId), así se puede corregir sin duplicar.
 */
function stockDesdeConteo(d, productoId, contado, contadoEl, conteoId) {
  const desde = Date.parse(contadoEl);
  const neto = d.movimientos
    .filter((m) => m.productoId === productoId && Date.parse(m.fecha) > desde && !(conteoId && m.conteoId === conteoId))
    .reduce((s, m) => s + ((Number(m.stockDespues) - Number(m.stockAntes)) || 0), 0);
  return red(Number(contado) + neto);
}
/** Lee una cantidad que manda el celular: null si viene vacía; { error } si no tiene sentido. */
function cantidadCelular(v) {
  if (v === '' || v == null) return null;
  const c = Number(v);
  if (!Number.isFinite(c) || c < 0) return { error: 'Revisá la cantidad.' };
  if (c > MAX_CANT_CELULAR) return { error: `${n(c)} es demasiado. Revisá la cantidad.` };
  return red(c);
}
/** Aplica un conteo del celular a un producto (ajuste del stock). Devuelve un texto de error o null. */
function aplicarConteoCelular(d, p, contado, hace, conteoId, usuario) {
  const objetivo = Math.max(0, stockDesdeConteo(d, p.id, contado, contadoElDesde(hace), conteoId));
  if (red(objetivo) === red(p.stock)) return null;
  return registrar(d, { tipo: 'ajuste', productoId: p.id, cantidad: objetivo, nota: `Conteo del celular: ${n(contado)} ${p.unidad || ''}`.trim(), usuario, conteoId });
}
const estanteExistente = (d, ubic) => ubicacionesDe(d).find((u) => u.clave === claveUbic(ubic));
/** Producto nuevo desde el celular (o corrección de uno que cargó ese mismo celular y nadie revisó todavía). */
function altaDesdeCelularEn(d, x) {
  x = x || {};
  const idCel = String(x.idCelular || '').slice(0, 60);
  const equipo = equipoCelular(x.equipo);
  if (!idCel || !equipo) return { error: 'Falta el nombre del celular (Ajustes).' };
  const usuario = usuarioCelular(equipo);
  const nombre = String(x.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const precio = Number(x.precio);
  const cant = cantidadCelular(x.cantidad);
  if (!nombre) return { error: 'Escribí el nombre del producto.' };
  if (!(precio > 0)) return { error: 'Poné el precio de venta.' };
  if (cant && cant.error) return cant;
  const ubic = String(x.ubicacion || '').trim();
  const est = ubic ? estanteExistente(d, ubic) : null;
  if (ubic && !est) return { error: `El estante ${ubic} no está en el programa. Elegilo de la lista o crealo.` };
  const moneda = x.moneda === 'USD' ? 'USD' : 'UYU';
  const unidad = String(x.unidad || 'unidad').slice(0, 20) || 'unidad';
  const minimo = Math.max(0, Number(x.minimo) || 0);
  const categoria = (est && est.categoria) || String(x.categoria || '').trim().slice(0, 60);
  const prov = d.proveedores.find((v) => normal(v.nombre) === normal(String(x.proveedor || '').trim()));
  const barrasPedidas = [...new Set((Array.isArray(x.barras) ? x.barras : []).map(normCodigo).filter(Boolean))];

  const ya = d.productos.find((p) => p.idCelular === idCel);
  if (ya) {
    // Reintento (se cortó el WiFi) o corrección desde el mismo celular. Si el administrador ya lo revisó, sus datos no se tocan.
    if (ya.revisar) {
      if (precio !== ya.precio || moneda !== (esUSD(ya) ? 'USD' : 'UYU')) { anotarPrecio(d, ya, precio, 'Corregido desde el celular', moneda); ya.precio = precio; }
      if (moneda === 'USD') ya.moneda = 'USD'; else delete ya.moneda;
      Object.assign(ya, { nombre, unidad, minimo, categoria, ubicacion: est ? est.ubicacion : '' });
      if (prov) ya.proveedorId = prov.id;
      for (const b of barrasPedidas) { const e = asignarBarras(d, ya, b); if (e) return { error: e }; }
    }
    if (cant != null) { const e = aplicarConteoCelular(d, ya, cant, x.hace, idCel, usuario); if (e) return { error: e }; }
    return { producto: datosParaCelular(d, ya), productoId: ya.id, existia: true, revisado: !ya.revisar };
  }
  const codigo = normCodigo(x.codigo);
  if (!codigo) return { error: 'Falta el código.' };
  const otro = codigoUsado(d, codigo);
  if (otro) return { error: `El código ${codigo} ya es de «${otro.nombre}».`, codigoUsado: true, producto: datosParaCelular(d, otro) };
  const barras = barrasPedidas.filter((b) => b !== codigo);
  for (const b of barras) { const o = codigoUsado(d, b); if (o) return { error: `El código de barras ${b} ya es de «${o.nombre}».`, codigoUsado: true, producto: datosParaCelular(d, o) }; }
  const p = { id: uid(), codigo, barras, nombre, categoria, unidad, proveedorId: prov ? prov.id : '', ubicacion: est ? est.ubicacion : '', costo: 0, precio, minimo, stock: 0, idCelular: idCel };
  if (moneda === 'USD') p.moneda = 'USD';
  d.productos.push(p);
  marcarProductoNuevo(d, p, usuario, 'empleado', `cargado desde el celular ${equipo}`);
  p.revisar = true;
  if (cant > 0) registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: cant, nota: `Stock inicial (celular ${equipo})`, origen: 'inicial', usuario, conteoId: idCel });
  return { producto: datosParaCelular(d, p), productoId: p.id, existia: false };
}
/** Conteo (y estante o código de barras nuevo) de un producto que ya estaba en el programa. */
function conteoDesdeCelularEn(d, x) {
  x = x || {};
  const id = String(x.conteoId || '').slice(0, 60);
  const equipo = equipoCelular(x.equipo);
  if (!id || !equipo) return { error: 'Falta el nombre del celular (Ajustes).' };
  const usuario = usuarioCelular(equipo);
  const p = (x.productoId && d.productos.find((q) => q.id === x.productoId)) || buscarPorCodigo(d, x.codigo);
  if (!p) return { error: 'Ese producto ya no está en el programa.' };
  const cant = cantidadCelular(x.contado);
  if (cant && cant.error) return cant;
  const ubic = x.ubicacion == null ? null : String(x.ubicacion).trim();
  if (ubic && claveUbic(ubic) !== claveUbic(p.ubicacion)) {
    if (!estanteExistente(d, ubic)) return { error: `El estante ${ubic} no está en el programa.` };
    const e = ubicarProducto(d, p.id, ubic);
    if (e) return { error: e };
  }
  if (x.barra) { const e = asignarBarras(d, p, x.barra); if (e) return { error: e }; }
  if (cant != null) { const e = aplicarConteoCelular(d, p, cant, x.hace, id, usuario); if (e) return { error: e }; }
  return { producto: datosParaCelular(d, p), productoId: p.id };
}
/** Foto sacada con el celular: el archivo ya está en la carpeta Fotos (lo guardó el servidor); acá se le asigna al producto. */
function fotoDesdeCelularEn(d, x) {
  x = x || {};
  if (!equipoCelular(x.equipo)) return { error: 'Falta el nombre del celular (Ajustes).' };
  if (!/^[\w-]{1,80}\.jpg$/.test(String(x.foto || ''))) return { error: 'La foto no es válida.' };
  const p = (x.productoId && d.productos.find((q) => q.id === x.productoId)) || buscarPorCodigo(d, x.codigo);
  if (!p) return { error: 'Ese producto ya no está en el programa.' };
  const anterior = p.foto || '';
  p.foto = x.foto;
  delete p.fotoData;
  return { producto: datosParaCelular(d, p), productoId: p.id, reemplazo: !!anterior };
}
/** Próximo código libre para un producto sin código de ese celular: C1-0001, C1-0002… */
function codigoLibreCelular(d, equipo) {
  const pre = equipoCelular(equipo);
  if (!pre) return { error: 'Poné el nombre de este celular en Ajustes (por ejemplo C1).' };
  const re = new RegExp(`^${pre}-(\\d+)$`);
  const usados = new Set(d.productos.flatMap(codigosDe).map(normCodigo));
  let i = Math.max(0, ...[...usados].map((c) => re.exec(c)).filter(Boolean).map((m) => Number(m[1])));
  let c;
  do { i++; c = `${pre}-${String(i).padStart(4, '0')}`; } while (usados.has(c));
  return { codigo: c };
}
/** Guarda lo que cambió el celular. Si no se puede guardar, el celular recibe el error (y reintenta igual, sin duplicar). */
function guardarDesdeCelular(r, productoId) {
  if (!r || r.error) return r;
  if (!guardar()) return { error: 'No se pudo guardar en la PC. En la PC aparece un aviso: avisale a quien la usa.' };
  if (sesion) render();
  // Si en la PC está abierta la ficha de ese producto, se avisa: al guardarla podría volver el estante viejo
  try { if (productoId && editandoProd === productoId && $('#dlg-prod').open) toast('El celular acaba de cambiar este producto: cerrá la ficha y abrila de nuevo para ver lo último.'); } catch (e) { /* sin pantalla */ }
  return r;
}
const productoDesdeCelular = (x) => (datosDanados ? SIN_DATOS_CELULAR : (() => { const r = altaDesdeCelularEn(db, x); return guardarDesdeCelular(r, r && r.productoId); })());
const conteoDesdeCelular = (x) => (datosDanados ? SIN_DATOS_CELULAR : (() => { const r = conteoDesdeCelularEn(db, x); return guardarDesdeCelular(r, r && r.productoId); })());
const fotoDesdeCelular = (x) => (datosDanados ? SIN_DATOS_CELULAR : (() => { const r = fotoDesdeCelularEn(db, x); return guardarDesdeCelular(r, r && r.productoId); })());
const codigoLibreParaCelular = (equipo) => (datosDanados ? SIN_DATOS_CELULAR : codigoLibreCelular(db, equipo));
function estadoParaCelular() { return datosDanados ? { ...SIN_DATOS_CELULAR, listo: false } : { listo: true, productos: db.productos.length }; }
const productoParaCelular = (codigo) => (datosDanados ? SIN_DATOS_CELULAR : productoCelular(db, codigo));
const productosParaCelular = (texto) => (datosDanados ? SIN_DATOS_CELULAR : productosCelular(db, texto));
const estantesParaCelular = () => (datosDanados ? SIN_DATOS_CELULAR : estantesCelular(db));

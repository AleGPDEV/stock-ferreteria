/* Puente con el Cargador de productos (herramientas/): estantes y productos para consultar, y crear
 * estantes. Lo llama electron/main.js con preguntarAlPrograma. */
'use strict';

/** Para el Cargador de productos (abierto desde el menú Herramientas): los estantes con su categoría. */
/* Puente con el Cargador: solo con alguien adentro del programa, y el costo solo para el administrador
 * (el empleado no ve costos). Sin sesión, el Cargador trabaja como si estuviera abierto con doble clic. */
const SIN_SESION_HERRAMIENTA = { error: 'Entrá al programa con tu usuario para que el Cargador use sus datos.', sinSesion: true };
function estantesParaHerramienta() {
  if (!sesion) return SIN_SESION_HERRAMIENTA;
  return ubicacionesDe(db).map((u) => ({ codigo: u.ubicacion, categoria: u.categoria || '' }));
}
/** Lo que el Cargador necesita de un producto ya cargado (los mismos datos que el Excel del inventario). */
function datosParaHerramienta(p) {
  return { codigo: p.codigo, barras: codigosDe(p).filter((c) => c !== p.codigo), nombre: p.nombre, categoria: p.categoria || '', unidad: p.unidad || '', proveedor: nombreProv(p.proveedorId),
    ubicacion: p.ubicacion || '', stock: p.stock, minimo: p.minimo, costo: esAdmin() ? p.costo : null, precio: p.precio, moneda: esUSD(p) ? 'USD' : 'UYU' };
}
/** El Cargador escaneó un código: ¿es de un producto que ya está cargado? (código propio, de barras o de proveedor) */
function productoParaHerramienta(codigo) {
  if (!sesion) return SIN_SESION_HERRAMIENTA;
  const p = buscarPorCodigo(db, codigo) || db.productos.find((x) => codigosProvDe(x).some((c) => normCodigo(c.codigo) === normCodigo(codigo)));
  return p ? datosParaHerramienta(p) : null;
}
/** Búsqueda por nombre o código para «¿Ya está en el programa con otro código?» del Cargador. */
function productosParaHerramienta(texto) {
  if (!sesion) return [];
  const pal = normal(String(texto || '').trim()).split(/\s+/).filter(Boolean);
  if (!pal.length || pal.join('').length < 2) return [];
  return db.productos.filter((p) => { const t = normal(`${p.nombre} ${textoCodigos(p)} ${p.categoria || ''}`); return pal.every((w) => t.includes(w)); })
    .slice(0, 8).map(datosParaHerramienta);
}

/** El Cargador crea un estante: queda guardado en el programa igual que si se creara en Depósito. */
function nuevoEstanteDesdeHerramienta(x) {
  if (!sesion) return SIN_SESION_HERRAMIENTA;
  const r = guardarEstante(db, x || {});
  if (r.error) return { error: r.error };
  guardar();
  if (sesion) render();
  return { estante: { codigo: r.estante.codigo, categoria: r.estante.categoria || '' } };
}

/* Depósito (sin pantalla): ubicaciones y estantes, dónde está cada producto, alta y recepción de
 * mercadería en el depósito, sugerencias del buscador. La pantalla está en pantallas/deposito.js. */
'use strict';

/* ---------- Depósito: dónde está cada producto y etiquetas con código de barras ----------
 * Lógica pura (dondeEsta, ubicacionesDe, htmlEtiquetas…) probada en tests/logica.test.js; la pantalla, más abajo.
 * El dibujo del código de barras (Code 128) está en js/codigo-barras.js. */
const barras128 = () => (typeof CodigoBarras !== 'undefined' ? CodigoBarras : require('./codigo-barras.js'));
// Lo que lleva el código de barras de una etiqueta de ubicación: «UBIC A-3». Así se distingue de un producto.
const PREFIJO_UBIC = 'UBIC ';
/** Ubicación para comparar y para el código de barras: sin tildes, en mayúsculas, sin espacios de más. */
const claveUbic = (u) => String(u || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const ordenNatural = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/** Ubicaciones cargadas, con sus productos: [{ ubicacion, clave, productos }], ordenadas (A-2 antes que A-10). */
function ubicacionesDe(d) {
  const mapa = new Map();
  // Primero los estantes cargados (con su categoría), aunque todavía no tengan productos
  for (const e of estantesDe(d)) {
    const k = claveUbic(e.codigo);
    if (k && !mapa.has(k)) mapa.set(k, { ubicacion: e.codigo, clave: k, categoria: e.categoria || '', estanteId: e.id, corto: idEstante(e), productos: [] });
  }
  for (const p of d.productos) {
    const k = claveUbic(p.ubicacion);
    if (!k) continue;
    if (!mapa.has(k)) mapa.set(k, { ubicacion: String(p.ubicacion).trim(), clave: k, categoria: '', estanteId: '', corto: '', productos: [] });
    mapa.get(k).productos.push(p);
  }
  const lista = [...mapa.values()];
  lista.forEach((u) => u.productos.sort((a, b) => ordenNatural(a.nombre, b.nombre)));
  return lista.sort((a, b) => ordenNatural(a.ubicacion, b.ubicacion));
}

/* Estantes: las ubicaciones se cargan de antemano, cada una con su categoría («A-1 · Sanitaria»).
 * El producto guarda en p.ubicacion el nombre del estante. Se guardan en db.estantes (configuración). */
const estantesDe = (d) => (Array.isArray(d.estantes) ? d.estantes : []);

/**
 * Las opciones para elegir el estante de un producto: los estantes cargados (agrupados por categoría) y, si el
 * producto ya tenía escrito uno que no está en la lista, ese también (para no perderlo al editar).
 * Devuelve [{ grupo, opciones: [{ valor, texto, elegido }] }]; el valor es el nombre del estante.
 */
function opcionesEstanteProducto(d, actual) {
  const k = claveUbic(actual);
  const est = estantesDe(d).filter((e) => claveUbic(e.codigo));
  const grupos = new Map();
  for (const e of est) {
    const g = e.categoria || 'Sin categoría';
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push({ valor: e.codigo, texto: e.codigo, elegido: !!k && claveUbic(e.codigo) === k });
  }
  const orden = [...grupos.keys()].sort((x, y) => (x === 'Sin categoría') - (y === 'Sin categoría') || ordenNatural(x, y));
  const lista = orden.map((g) => ({ grupo: g, opciones: grupos.get(g).sort((a, b) => ordenNatural(a.texto, b.texto)) }));
  if (k && !est.some((e) => claveUbic(e.codigo) === k)) lista.unshift({ grupo: 'No está en la lista de estantes', opciones: [{ valor: String(actual).trim(), texto: `${String(actual).trim()} (no está en la lista)`, elegido: true }] });
  return lista;
}
/* Cada estante tiene un número fijo y corto (U1, U2…): es lo que lleva el código de barras de su etiqueta.
 * Así la etiqueta se lee aunque el nombre sea largo («Herramientas eléctricas 12»). No se vuelve a usar. */
const idEstante = (e) => (e && Number(e.num) > 0 ? `U${e.num}` : '');
const RE_ID_ESTANTE = /^U(\d{1,6})$/i;
/** Les da número a los estantes que no tienen (los cargados antes de esto). Devuelve true si cambió algo. */
function numerarEstantes(d) {
  d.estantes = estantesDe(d);
  let max = Math.max(Number(d.numEstante) || 0, ...d.estantes.map((e) => Number(e.num) || 0));
  let cambio = false;
  for (const e of d.estantes) if (!(Number(e.num) > 0)) { e.num = ++max; cambio = true; }
  if ((Number(d.numEstante) || 0) !== max) { d.numEstante = max; cambio = true; }
  return cambio;
}
/** Las ubicaciones que solo están escritas en los productos (sin estante cargado) pasan a ser estantes, para tener su número. */
function completarEstantes(d) {
  let cambio = false;
  for (const u of ubicacionesDe(d)) if (!u.estanteId) { estantesDe(d).length || (d.estantes = []); d.estantes.push({ id: uid(), codigo: u.ubicacion, categoria: '' }); cambio = true; }
  return numerarEstantes(d) || cambio;
}
/** Crea o cambia un estante. Si cambia el nombre, los productos de ese estante pasan al nombre nuevo. Devuelve { estante } o { error }. */
function guardarEstante(d, datos, id) {
  const codigo = String(datos.codigo || '').replace(/\s+/g, ' ').trim();
  // Como está en la lista de categorías (js/logica/categorias.js): «tornilleria» queda «Tornillería»
  const categoria = typeof categoriaComoEnLista === 'function' ? categoriaComoEnLista(d, datos.categoria) : String(datos.categoria || '').replace(/\s+/g, ' ').trim();
  if (!codigo) return { error: 'Escribí el nombre del estante, por ejemplo A-1.' };
  if (!claveUbic(codigo)) return { error: 'Usá letras y números para el nombre del estante, por ejemplo A-1.' };
  const repetido = estantesDe(d).find((e) => e.id !== id && claveUbic(e.codigo) === claveUbic(codigo));
  if (repetido) return { error: `Ya hay un estante ${repetido.codigo}${repetido.categoria ? ' (' + repetido.categoria + ')' : ''}.` };
  d.estantes = estantesDe(d);
  if (!id) { const e = { id: uid(), codigo, categoria }; d.estantes.push(e); numerarEstantes(d); return { estante: e }; }
  const e = d.estantes.find((x) => x.id === id);
  if (!e) return { error: 'Ese estante ya no existe.' };
  const antes = claveUbic(e.codigo);
  if (antes !== claveUbic(codigo)) d.productos.forEach((p) => { if (claveUbic(p.ubicacion) === antes) p.ubicacion = codigo; });
  e.codigo = codigo;
  e.categoria = categoria;
  return { estante: e };
}
/** Si el estante no existe, lo crea con esa categoría (al importar lo que se cargó con el Cargador). Devuelve true si lo creó. */
function asegurarEstante(d, ubicacion, categoria) {
  const k = claveUbic(ubicacion);
  if (!k || estantesDe(d).some((e) => claveUbic(e.codigo) === k)) return false;
  return !guardarEstante(d, { codigo: ubicacion, categoria }).error;
}

/** Borra un estante de la lista. Los productos no cambian: siguen diciendo que están ahí. */
function eliminarEstante(d, id) {
  d.estantes = estantesDe(d).filter((e) => e.id !== id);
}
/** Pone un producto en un estante (o ubicación). Devuelve un texto de error o null. */
function ubicarProducto(d, productoId, ubicacion) {
  const p = d.productos.find((x) => x.id === productoId);
  if (!p) return 'Ese producto ya no existe.';
  const u = ubicacionesDe(d).find((x) => x.clave === claveUbic(ubicacion));
  if (!u) return 'Elegí el estante.';
  p.ubicacion = u.ubicacion;
  return null;
}
/** Un código que no es de ningún producto, al recibir mercadería: nombre y estante; la categoría es la del estante.
 * Queda marcado para revisar (falta el precio). Devuelve { producto } o { error }. */
function altaEnDeposito(d, datos, usuario, rol) {
  const nombre = String(datos.nombre || '').replace(/\s+/g, ' ').trim();
  // Producto suelto, sin código de barras: el programa le da uno propio (P-0001…) para imprimir su etiqueta
  const codigo = datos.sinCodigo ? codigoLibreDe(d) : normCodigo(datos.codigo);
  if (!codigo) return { error: 'Falta el código.' };
  if (!nombre) return { error: 'Escribí el nombre del producto.' };
  const u = ubicacionesDe(d).find((x) => x.clave === claveUbic(datos.ubicacion));
  if (!u) return { error: 'Elegí el estante donde va.' };
  const otro = codigoUsado(d, codigo);
  if (otro) return { error: `El código ${codigo} ya es de «${otro.nombre}».` };
  const p = { id: uid(), codigo, barras: [], nombre, categoria: u.categoria || '', unidad: 'unidad', proveedorId: '', ubicacion: u.ubicacion, costo: 0, precio: 0, minimo: 0, stock: 0 };
  d.productos.push(p);
  marcarProductoNuevo(d, p, usuario, rol, 'cargado en el depósito');
  p.revisar = true; // falta el precio: lo completa el administrador en Productos
  return { producto: p };
}
/** «¿Cuántos llegaron?» en el depósito: es opcional; si se escribe, entra al stock como llegada de mercadería. */
const TOPE_DEPOSITO = 10000; // más que esto de una vez no se acepta (un código escaneado en la cantidad, por ejemplo)
const CONFIRMAR_DEPOSITO = 500; // más que esto se pide confirmar
/** Revisa lo escrito en «¿Cuántos llegaron?». Vacío → { cantidad: 0 } (es opcional). { error } o { cantidad, grande }. */
function revisarCantidadDeposito(texto) {
  if (texto == null || String(texto).trim() === '') return { cantidad: 0 };
  const c = typeof texto === 'number' ? texto : parseNum(String(texto));
  if (!(c > 0)) return { error: 'Escribí cuántos llegaron, con números.' };
  if (c > TOPE_DEPOSITO) return { error: `${n(c)} es demasiado: más de ${n(TOPE_DEPOSITO)} de una vez no se acepta. Revisá la cantidad.` };
  return { cantidad: c, grande: c > CONFIRMAR_DEPOSITO };
}
function recibirEnDeposito(d, productoId, cantidad) {
  const c = Number(cantidad);
  if (!(c > 0)) return 'Escribí cuántos llegaron.';
  if (c > TOPE_DEPOSITO) return `Más de ${n(TOPE_DEPOSITO)} de una vez no se acepta. Revisá la cantidad.`;
  return registrar(d, { tipo: 'entrada', productoId, cantidad: c, nota: 'Llegó (Depósito)' });
}

/** Código que va en el código de barras de la etiqueta de un producto: su código de barras, si tiene, o el código del programa. */
/** ¿Trae código de barras de fábrica (EAN/UPC: solo números, de 8 a 14)? Los que no, necesitan etiqueta para escanearlos. */
function tieneCodigoFabrica(p) {
  return codigosDe(p).some((c) => /^\d{8,14}$/.test(String(c).trim()));
}
function codigoEtiqueta(p) {
  return codigosDe(p).slice(1).concat(p.codigo).find((c) => barras128().sePuede(c)) || '';
}

/**
 * ¿Dónde está? A partir de lo que se escaneó o escribió:
 * { tipo: 'producto', producto } · { tipo: 'ubicacion', ubicacion } · { tipo: 'lista', productos } · { tipo: 'nada' } · { tipo: 'vacio' }
 */
function dondeEsta(d, texto) {
  const t = String(texto || '').trim();
  if (!t) return { tipo: 'vacio' };
  const k = claveUbic(t);
  const ubics = ubicacionesDe(d);
  // Ubicación igual, o igual sin signos (el lector puede cambiar «A-01» por «A'01»), si es una sola
  const buscarUbic = (clave) => {
    const u = ubics.find((x) => x.clave === clave);
    if (u) return u;
    const s = codigoSinSignos(clave);
    const parecidas = s ? ubics.filter((x) => codigoSinSignos(x.clave) === s) : [];
    return parecidas.length === 1 ? parecidas[0] : null;
  };
  // Primero lo exacto: un estante que se llama así (aunque sea «U1») o un producto con ese código (aunque sea «U12»)
  const estanteExacto = ubics.find((x) => x.clave === k);
  if (estanteExacto) return { tipo: 'ubicacion', ubicacion: estanteExacto };
  const codigoExacto = d.productos.find((p) => codigosDe(p).some((x) => claveCodigo(x) === claveCodigo(t)));
  if (codigoExacto) return { tipo: 'producto', producto: codigoExacto };
  // Etiqueta de estante: el número corto (U12); las impresas antes llevan «UBIC nombre» y siguen andando
  const mU = RE_ID_ESTANTE.exec(t);
  const porNumero = mU && ubics.find((x) => x.corto && x.corto.toUpperCase() === `U${Number(mU[1])}`);
  if (porNumero) return { tipo: 'ubicacion', ubicacion: porNumero };
  if (k.startsWith(PREFIJO_UBIC)) {
    const u = buscarUbic(k.slice(PREFIJO_UBIC.length).trim());
    return u ? { tipo: 'ubicacion', ubicacion: u } : { tipo: 'nada' };
  }
  const p = buscarPorCodigo(d, t) || d.productos.find((q) => codigosProvDe(q).some((x) => normCodigo(x.codigo) === normCodigo(t)));
  if (p) return { tipo: 'producto', producto: p };
  const u = buscarUbic(k);
  if (u) return { tipo: 'ubicacion', ubicacion: u };
  const productos = d.productos.filter((x) => coincide(`${textoCodigos(x)} ${x.nombre} ${x.categoria} ${x.ubicacion}`, t))
    .sort((a, b) => ordenNatural(a.nombre, b.nombre));
  if (productos.length === 1) return { tipo: 'producto', producto: productos[0] };
  if (productos.length) return { tipo: 'lista', productos };
  // Parece un código escaneado (sin espacios, con números) que no es de ningún producto: se puede cargar
  if (/^\S{6,}$/.test(t) && /\d/.test(t)) return { tipo: 'nuevo', codigo: normCodigo(t) };
  return { tipo: 'nada' };
}

/**
 * Sugerencias mientras se escribe en «¿Dónde está?» (como un buscador): estantes y productos que tienen todas las palabras,
 * primero los que empiezan con lo escrito. Devuelve hasta `max` de [{ tipo: 'ubicacion', ubicacion } | { tipo: 'producto', producto }].
 */
function sugerenciasDeposito(d, texto, max = 8) {
  const q = normal(String(texto || '').trim());
  if (!q) return [];
  const pal = q.split(/\s+/);
  const puntaje = (nombre, resto) => {
    const nom = normal(nombre), todo = `${nom} ${normal(resto)}`;
    if (!pal.every((w) => todo.includes(w))) return -1;
    if (nom.startsWith(q)) return 3;                                   // el nombre empieza con lo escrito
    if (pal.every((w) => nom.split(/[\s\-\/.,()]+/).some((x) => x.startsWith(w)))) return 2; // cada palabra empieza una del nombre
    if (pal.every((w) => nom.includes(w))) return 1;                   // está en el nombre
    return 0;                                                          // está en el código, la categoría o el estante
  };
  const est = ubicacionesDe(d).map((u) => ({ tipo: 'ubicacion', ubicacion: u, p: puntaje(u.ubicacion, `${u.categoria} ${u.corto}`), nombre: u.ubicacion }));
  const prods = d.productos.map((x) => ({ tipo: 'producto', producto: x, p: puntaje(x.nombre, `${textoCodigos(x)} ${x.categoria || ''} ${x.ubicacion || ''}`), nombre: x.nombre }));
  const orden = (a, b) => b.p - a.p || ordenNatural(a.nombre, b.nombre);
  // Los estantes van primero solo si su nombre coincide de verdad (no por la categoría de un producto)
  const estantes = est.filter((x) => x.p >= 2).sort(orden).slice(0, 3);
  return estantes.concat(prods.filter((x) => x.p >= 0).sort(orden)).slice(0, max).map(({ p, nombre, ...x }) => x);
}

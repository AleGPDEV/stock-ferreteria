/* Categorías de productos y estantes: una lista para crear, renombrar y borrar.
 * Cada producto y cada estante guarda el nombre de su categoría (opcional). La lista es db.categorias (nombres)
 * más las que ya usan productos y estantes, así ninguna se pierde. Renombrar o borrar cambia todos los que la usan.
 * Subcategorías (solo de productos, opcional): db.subcategorias = { claveDeLaCategoría: [nombres] }, más las que ya
 * usan los productos de esa categoría. El producto guarda p.subcategoria (de su categoría). */
'use strict';

/** Las categorías de una ferretería con las que arranca la lista (las armó Ale; cada una tiene subcategorías de ejemplo). */
const CATEGORIAS_PREDETERMINADAS = [
  'Herramientas manuales', 'Herramientas eléctricas', 'Accesorios para herramientas', 'Medición y trazado',
  'Tornillería y fijaciones', 'Cerrajería y herrajes', 'Electricidad', 'Iluminación', 'Pinturería', 'Sanitaria', 'Gas',
  'Materiales de construcción', 'Adhesivos y selladores', 'Jardín y exterior', 'Seguridad industrial',
  'Escaleras y elevación', 'Metales y perfiles', 'Maderas y tableros', 'Limpieza y mantenimiento',
  'Climatización y ventilación', 'Varios',
];

/** Las subcategorías de cada categoría predeterminada (de la planilla de Ale). */
const SUBCATEGORIAS_PREDETERMINADAS = {
  "Herramientas manuales": ["Martillos y mazas", "Destornilladores", "Llaves fijas y combinadas", "Llaves de tubo y crique", "Llaves Allen y Torx", "Pinzas y alicates", "Serruchos y sierras manuales", "Formones, cepillos y limas", "Cuchillas y cutters", "Juegos y cajas de herramientas"],
  "Herramientas eléctricas": ["Taladros y atornilladores", "Amoladoras", "Sierras eléctricas", "Lijadoras", "Rotomartillos y demoledores", "Soldadoras", "Hidrolavadoras y aspiradoras", "Compresores y neumática", "Baterías y cargadores"],
  "Accesorios para herramientas": ["Mechas y brocas", "Discos de corte y desbaste", "Hojas de sierra", "Puntas y adaptadores", "Lijas y abrasivos", "Cepillos de alambre"],
  "Medición y trazado": ["Cintas métricas", "Niveles", "Escuadras y reglas", "Medidores láser y digitales", "Trazado y marcado"],
  "Tornillería y fijaciones": ["Tornillos para madera", "Tornillos autoperforantes", "Tornillos para techo", "Bulones, tuercas y arandelas", "Tarugos y anclajes", "Clavos", "Remaches", "Varillas roscadas y espárragos", "Grampas y abrazaderas"],
  "Cerrajería y herrajes": ["Cerraduras", "Candados", "Cilindros y llaves vírgenes", "Bisagras", "Manijas y pomos", "Pasadores y cerrojos", "Correderas y guías", "Herrajes para muebles", "Cierrapuertas y topes"],
  "Electricidad": ["Cables y conductores", "Llaves y tomacorrientes", "Tableros y protecciones", "Caños y cajas eléctricas", "Extensiones y zapatillas", "Fichas y adaptadores", "Cintas y terminales", "Timbres y porteros"],
  "Iluminación": ["Lámparas LED", "Tubos y paneles LED", "Reflectores", "Apliques y luminarias", "Linternas", "Pilas y baterías"],
  "Pinturería": ["Pinturas látex", "Esmaltes sintéticos", "Barnices y protectores de madera", "Impermeabilizantes", "Antióxidos y fondos", "Aerosoles", "Rodillos, pinceles y bandejas", "Diluyentes y removedores", "Enduidos y masillas", "Cintas y protección"],
  "Sanitaria": ["Caños y conexiones de agua", "Desagüe PVC", "Grifería", "Loza y accesorios de baño", "Llaves y válvulas", "Flexibles y conectores", "Tanques y bombas", "Agua caliente", "Repuestos sanitarios"],
  "Gas": ["Caños y conexiones de gas", "Reguladores y flexibles de gas", "Llaves de gas"],
  "Materiales de construcción": ["Cemento, cal y portland", "Áridos en bolsa", "Adhesivos cerámicos y pastinas", "Hierro y mallas", "Ladrillos y bloques", "Impermeabilización", "Yeso y placas", "Perfilería drywall"],
  "Adhesivos y selladores": ["Pegamentos de contacto", "Adhesivos instantáneos y epoxi", "Siliconas", "Espumas de poliuretano", "Selladores y masillas", "Cintas adhesivas"],
  "Jardín y exterior": ["Herramientas de jardín", "Mangueras y conexiones", "Riego", "Máquinas de jardín", "Macetas y jardineras", "Tierra, abonos y semillas", "Control de plagas"],
  "Seguridad industrial": ["Guantes", "Protección ocular y facial", "Protección auditiva y respiratoria", "Calzado de seguridad", "Cascos y arneses", "Ropa de trabajo"],
  "Escaleras y elevación": ["Escaleras", "Caballetes y andamios", "Carretillas", "Gatos y aparejos", "Cadenas, cuerdas y eslingas"],
  "Metales y perfiles": ["Caños estructurales", "Perfiles y planchuelas", "Chapas", "Alambres", "Tejidos y mallas"],
  "Maderas y tableros": ["Tirantes y listones", "Tableros", "Fenólicos y terciados", "Molduras y zócalos"],
  "Limpieza y mantenimiento": ["Lubricantes", "Escobas y cepillos", "Productos de limpieza", "Bolsas y residuos"],
  "Climatización y ventilación": ["Ventiladores", "Estufas y calefactores", "Extractores"],
  "Varios": ["Ruedas y garruchas", "Ganchos y colgadores", "Burletes y aislantes", "Mosquiteros y cerramientos", "Señalización"],
};

/**
 * Agrega una sola vez las categorías predeterminadas que falten (d.categoriasIniciales queda marcado: si después
 * se borra o se renombra una, no vuelve). Devuelve cuántas agregó.
 */
function sembrarCategorias(d) {
  if (d.categoriasIniciales) return 0;
  const hay = new Set(categoriasDe(d).map((c) => claveCategoria(c.nombre)));
  if (!Array.isArray(d.categorias)) d.categorias = [];
  let n = 0;
  for (const c of CATEGORIAS_PREDETERMINADAS) if (!hay.has(claveCategoria(c))) { d.categorias.push(c); n++; }
  d.categoriasIniciales = true;
  return n;
}

/** El nombre limpio (sin espacios de más). */
const nombreCategoria = (t) => String(t || '').replace(/\s+/g, ' ').trim();
/** Para comparar sin importar mayúsculas ni tildes: «Tornillería» = «tornilleria». */
const claveCategoria = (t) => nombreCategoria(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todas las categorías, ordenadas, con cuántos productos y estantes usa cada una: [{ nombre, productos, estantes }]. */
function categoriasDe(d) {
  const mapa = new Map();
  const sumar = (nombre, campo) => {
    const n = nombreCategoria(nombre);
    if (!n) return;
    const k = claveCategoria(n);
    if (!mapa.has(k)) mapa.set(k, { nombre: n, productos: 0, estantes: 0 });
    if (campo) mapa.get(k)[campo]++;
  };
  (Array.isArray(d.categorias) ? d.categorias : []).forEach((c) => sumar(c, null));
  (d.productos || []).forEach((p) => sumar(p.categoria, 'productos'));
  (Array.isArray(d.estantes) ? d.estantes : []).forEach((e) => sumar(e.categoria, 'estantes'));
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }));
}
/** Solo los nombres. */
const nombresCategorias = (d) => categoriasDe(d).map((c) => c.nombre);

/** La categoría tal como está en la lista (con sus mayúsculas y tildes), o el nombre limpio si es nueva. */
function categoriaComoEnLista(d, nombre) {
  const k = claveCategoria(nombre);
  if (!k) return '';
  const c = categoriasDe(d).find((x) => claveCategoria(x.nombre) === k);
  return c ? c.nombre : nombreCategoria(nombre);
}

/** Agrega una categoría a la lista. Devuelve { nombre } o { error }. */
function crearCategoria(d, nombre) {
  const n = nombreCategoria(nombre);
  if (!n) return { error: 'Escribí el nombre de la categoría.' };
  if (n.length > 60) return { error: 'El nombre es muy largo (hasta 60 letras).' };
  const ya = categoriasDe(d).find((c) => claveCategoria(c.nombre) === claveCategoria(n));
  if (ya) return { error: `Ya existe la categoría ${ya.nombre}.` };
  if (!Array.isArray(d.categorias)) d.categorias = [];
  d.categorias.push(n);
  return { nombre: n };
}

/**
 * Cambia el nombre de una categoría en la lista y en todos los productos y estantes que la usan.
 * Si el nombre nuevo ya es otra categoría, se unen (los de las dos quedan en la nueva).
 * Devuelve { productos, estantes, unidas } (cuántos cambiaron) o { error }.
 */
function renombrarCategoria(d, viejo, nuevo) {
  const n = nombreCategoria(nuevo);
  const kv = claveCategoria(viejo);
  if (!kv) return { error: 'Falta la categoría.' };
  if (!n) return { error: 'Escribí el nombre nuevo.' };
  if (n.length > 60) return { error: 'El nombre es muy largo (hasta 60 letras).' };
  const otra = categoriasDe(d).find((c) => claveCategoria(c.nombre) === claveCategoria(n) && claveCategoria(c.nombre) !== kv);
  const destino = otra ? otra.nombre : n;
  let productos = 0, estantes = 0;
  (d.productos || []).forEach((p) => { if (claveCategoria(p.categoria) === kv && p.categoria !== destino) { p.categoria = destino; productos++; } });
  (Array.isArray(d.estantes) ? d.estantes : []).forEach((e) => { if (claveCategoria(e.categoria) === kv && e.categoria !== destino) { e.categoria = destino; estantes++; } });
  const lista = (Array.isArray(d.categorias) ? d.categorias : []).filter((c) => claveCategoria(c) !== kv && claveCategoria(c) !== claveCategoria(destino));
  lista.push(destino);
  d.categorias = lista;
  // Sus subcategorías se van con ella (si se unen, quedan las de las dos)
  const subs = mapaSubcategorias(d);
  const kd = claveCategoria(destino);
  if (subs[kv] && kv !== kd) {
    const juntas = (subs[kd] || []).slice();
    for (const n of subs[kv]) if (!juntas.some((x) => claveCategoria(x) === claveCategoria(n))) juntas.push(n);
    subs[kd] = juntas;
    delete subs[kv];
  }
  return { productos, estantes, unidas: !!otra, nombre: destino };
}

/** Borra una categoría: sale de la lista y los productos y estantes que la usaban quedan sin categoría. */
function borrarCategoria(d, nombre) {
  const k = claveCategoria(nombre);
  if (!k) return { error: 'Falta la categoría.' };
  let productos = 0, estantes = 0;
  (d.productos || []).forEach((p) => { if (claveCategoria(p.categoria) === k) { p.categoria = ''; delete p.subcategoria; productos++; } });
  (Array.isArray(d.estantes) ? d.estantes : []).forEach((e) => { if (claveCategoria(e.categoria) === k) { e.categoria = ''; estantes++; } });
  d.categorias = (Array.isArray(d.categorias) ? d.categorias : []).filter((c) => claveCategoria(c) !== k);
  delete mapaSubcategorias(d)[k];
  return { productos, estantes };
}

/* ---------- Subcategorías ---------- */
/** db.subcategorias (lo crea si no está). */
function mapaSubcategorias(d) {
  if (!d.subcategorias || typeof d.subcategorias !== 'object' || Array.isArray(d.subcategorias)) d.subcategorias = {};
  return d.subcategorias;
}
/** Las subcategorías de una categoría, ordenadas, con cuántos productos usa cada una: [{ nombre, productos }]. */
function subcategoriasDe(d, categoria) {
  const kc = claveCategoria(categoria);
  if (!kc) return [];
  const mapa = new Map();
  const sumar = (nombre, cuenta) => {
    const n = nombreCategoria(nombre);
    if (!n) return;
    const k = claveCategoria(n);
    if (!mapa.has(k)) mapa.set(k, { nombre: n, productos: 0 });
    if (cuenta) mapa.get(k).productos++;
  };
  const guardadas = (d.subcategorias && !Array.isArray(d.subcategorias) && d.subcategorias[kc]) || [];
  (Array.isArray(guardadas) ? guardadas : []).forEach((n) => sumar(n, false));
  (d.productos || []).forEach((p) => { if (claveCategoria(p.categoria) === kc) sumar(p.subcategoria, true); });
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }));
}
const nombresSubcategorias = (d, categoria) => subcategoriasDe(d, categoria).map((s) => s.nombre);
/** La subcategoría tal como está en la lista de esa categoría, o el nombre limpio si es nueva. */
function subcategoriaComoEnLista(d, categoria, nombre) {
  const k = claveCategoria(nombre);
  if (!k) return '';
  const s = subcategoriasDe(d, categoria).find((x) => claveCategoria(x.nombre) === k);
  return s ? s.nombre : nombreCategoria(nombre);
}
/** Agrega una subcategoría a una categoría que existe. Devuelve { nombre } o { error }. */
function crearSubcategoria(d, categoria, nombre) {
  const cat = categoriasDe(d).find((c) => claveCategoria(c.nombre) === claveCategoria(categoria));
  if (!cat) return { error: 'Esa categoría no existe.' };
  const n = nombreCategoria(nombre);
  if (!n) return { error: 'Escribí el nombre de la subcategoría.' };
  if (n.length > 60) return { error: 'El nombre es muy largo (hasta 60 letras).' };
  const ya = subcategoriasDe(d, cat.nombre).find((s) => claveCategoria(s.nombre) === claveCategoria(n));
  if (ya) return { error: `${cat.nombre} ya tiene la subcategoría ${ya.nombre}.` };
  const subs = mapaSubcategorias(d);
  const kc = claveCategoria(cat.nombre);
  subs[kc] = (Array.isArray(subs[kc]) ? subs[kc] : []).concat(n);
  return { nombre: n };
}
/** Cambia el nombre de una subcategoría (y en sus productos). Si ya existe otra con ese nombre, se unen. */
function renombrarSubcategoria(d, categoria, viejo, nuevo) {
  const kc = claveCategoria(categoria);
  const kv = claveCategoria(viejo);
  const n = nombreCategoria(nuevo);
  if (!kc || !kv) return { error: 'Falta la subcategoría.' };
  if (!n) return { error: 'Escribí el nombre nuevo.' };
  if (n.length > 60) return { error: 'El nombre es muy largo (hasta 60 letras).' };
  const otra = subcategoriasDe(d, categoria).find((s) => claveCategoria(s.nombre) === claveCategoria(n) && claveCategoria(s.nombre) !== kv);
  const destino = otra ? otra.nombre : n;
  let productos = 0;
  (d.productos || []).forEach((p) => {
    if (claveCategoria(p.categoria) === kc && claveCategoria(p.subcategoria) === kv && p.subcategoria !== destino) { p.subcategoria = destino; productos++; }
  });
  const subs = mapaSubcategorias(d);
  const lista = (Array.isArray(subs[kc]) ? subs[kc] : []).filter((x) => claveCategoria(x) !== kv && claveCategoria(x) !== claveCategoria(destino));
  lista.push(destino);
  subs[kc] = lista;
  return { productos, unidas: !!otra, nombre: destino };
}
/** Borra una subcategoría: sus productos quedan solo con la categoría. */
function borrarSubcategoria(d, categoria, nombre) {
  const kc = claveCategoria(categoria);
  const k = claveCategoria(nombre);
  if (!kc || !k) return { error: 'Falta la subcategoría.' };
  let productos = 0;
  (d.productos || []).forEach((p) => { if (claveCategoria(p.categoria) === kc && claveCategoria(p.subcategoria) === k) { delete p.subcategoria; productos++; } });
  const subs = mapaSubcategorias(d);
  if (Array.isArray(subs[kc])) subs[kc] = subs[kc].filter((x) => claveCategoria(x) !== k);
  return { productos };
}
/** Si el producto viene con una subcategoría que su categoría no tiene en la lista, se agrega (al importar). */
function asegurarSubcategoria(d, categoria, nombre) {
  if (!claveCategoria(categoria) || !claveCategoria(nombre)) return '';
  const ya = subcategoriasDe(d, categoria).find((s) => claveCategoria(s.nombre) === claveCategoria(nombre));
  if (ya) return ya.nombre;
  const subs = mapaSubcategorias(d);
  const kc = claveCategoria(categoria);
  subs[kc] = (Array.isArray(subs[kc]) ? subs[kc] : []).concat(nombreCategoria(nombre));
  return nombreCategoria(nombre);
}
/**
 * Agrega una sola vez las subcategorías predeterminadas a las categorías predeterminadas que estén en la lista
 * (d.subcategoriasIniciales queda marcado). Devuelve cuántas agregó.
 */
function sembrarSubcategorias(d) {
  if (d.subcategoriasIniciales) return 0;
  let n = 0;
  const hay = categoriasDe(d);
  for (const [cat, subs] of Object.entries(SUBCATEGORIAS_PREDETERMINADAS)) {
    const c = hay.find((x) => claveCategoria(x.nombre) === claveCategoria(cat));
    if (!c) continue;
    const ya = new Set(nombresSubcategorias(d, c.nombre).map(claveCategoria));
    for (const s of subs) if (!ya.has(claveCategoria(s))) { asegurarSubcategoria(d, c.nombre, s); n++; }
  }
  d.subcategoriasIniciales = true;
  return n;
}

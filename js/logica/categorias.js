/* Categorías de productos y estantes: una lista para crear, renombrar y borrar.
 * Cada producto y cada estante guarda el nombre de su categoría (opcional). La lista es db.categorias (nombres)
 * más las que ya usan productos y estantes, así ninguna se pierde. Renombrar o borrar cambia todos los que la usan. */
'use strict';

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
  return { productos, estantes, unidas: !!otra, nombre: destino };
}

/** Borra una categoría: sale de la lista y los productos y estantes que la usaban quedan sin categoría. */
function borrarCategoria(d, nombre) {
  const k = claveCategoria(nombre);
  if (!k) return { error: 'Falta la categoría.' };
  let productos = 0, estantes = 0;
  (d.productos || []).forEach((p) => { if (claveCategoria(p.categoria) === k) { p.categoria = ''; productos++; } });
  (Array.isArray(d.estantes) ? d.estantes : []).forEach((e) => { if (claveCategoria(e.categoria) === k) { e.categoria = ''; estantes++; } });
  d.categorias = (Array.isArray(d.categorias) ? d.categorias : []).filter((c) => claveCategoria(c) !== k);
  return { productos, estantes };
}

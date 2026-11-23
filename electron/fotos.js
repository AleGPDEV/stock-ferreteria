// Fotos de los productos: qué fotos ya no usa ningún producto y se pueden borrar.
// Sin Electron, para poder probarlo con node.

/** Nombres de foto que usan los productos de la base (texto JSON completo de los datos). */
function fotosEnUso(textoDatos) {
  const usadas = new Set();
  try {
    const d = JSON.parse(textoDatos);
    for (const p of (d && d.productos) || []) if (p && typeof p.foto === 'string' && p.foto) usadas.add(p.foto);
  } catch (e) {
    return null; // si no se pudo leer, no se borra nada
  }
  return usadas;
}

/**
 * Una foto que ningún producto usa (porque se reemplazó o se borró el producto) no se borra enseguida:
 * un respaldo de hace unos días puede todavía usarla. Se anota desde cuándo está sin usar y se borra
 * recién cuando pasaron más días que los respaldos que se guardan.
 *
 * huerfanas: { nombre: fechaISO desde que no se usa } (lo anotado la vez anterior)
 * Devuelve { huerfanas (lo que hay que anotar ahora), borrar: [nombres] }.
 */
function planLimpiezaFotos(huerfanas, enUso, presentes, ahora, dias) {
  const nuevas = {};
  const borrar = [];
  const limite = ahora - dias * 864e5;
  for (const f of presentes) {
    if (enUso.has(f)) continue; // se volvió a usar (por ejemplo, al restaurar un respaldo)
    const desde = huerfanas && huerfanas[f] ? Date.parse(huerfanas[f]) : ahora;
    if (desde <= limite) borrar.push(f);
    else nuevas[f] = new Date(desde).toISOString();
  }
  return { huerfanas: nuevas, borrar };
}

/* ---------- Fotos válidas ---------- */
// Nombre de archivo de una foto: letras, números, - y _, terminado en .jpg o .webp (las nuevas son WebP, más livianas).
const NOMBRE_FOTO = /^[\w-]{1,80}\.(jpg|webp)$/;
const MAX_FOTO = 5 * 1024 * 1024;
const esNombreFoto = (n) => NOMBRE_FOTO.test(String(n || ''));
/** ¿Los bytes son una imagen JPEG o WebP (y del formato que dice el nombre, si se pasa)? */
function esImagenFoto(bytes, nombre) {
  if (!bytes || bytes.length < 12 || bytes.length > MAX_FOTO) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  if (nombre && /\.webp$/.test(nombre)) return webp;
  if (nombre && /\.jpg$/.test(nombre)) return jpeg;
  return jpeg || webp;
}

/* ---------- Fotos dentro de una copia ----------
 * «Descargar copia» guarda las fotos que usan los productos dentro del mismo archivo, en fotosIncluidas
 * ({ nombre: base64 }), para poder llevar todo a otra PC en un solo archivo. */

/** Arma fotosIncluidas con las fotos en uso que se encuentren (leer(nombre) → Buffer o null). */
function empaquetarFotos(enUso, leer) {
  const incluidas = {};
  const faltan = [];
  for (const n of [...(enUso || [])].sort()) {
    if (!esNombreFoto(n)) continue;
    const b = leer(n);
    if (b && esImagenFoto(b, n)) incluidas[n] = b.toString('base64'); else faltan.push(n);
  }
  return { incluidas, faltan };
}

/** De una copia ya leída, las fotos incluidas válidas: [[nombre, Buffer]]. Las que no sirven se cuentan aparte. */
function fotosDeCopia(datos) {
  const fuera = datos && datos.fotosIncluidas;
  const fotos = [];
  let malas = 0;
  if (!fuera || typeof fuera !== 'object') return { fotos, malas };
  for (const [n, b64] of Object.entries(fuera)) {
    let b = null;
    if (esNombreFoto(n) && typeof b64 === 'string') { try { b = Buffer.from(b64, 'base64'); } catch (e) { b = null; } }
    if (b && esImagenFoto(b, n)) fotos.push([n, b]); else malas++;
  }
  return { fotos, malas };
}

module.exports = { fotosEnUso, planLimpiezaFotos, NOMBRE_FOTO, MAX_FOTO, esNombreFoto, esImagenFoto, empaquetarFotos, fotosDeCopia };

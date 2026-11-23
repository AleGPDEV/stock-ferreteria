/* Fotos de los productos: mostrar, achicar y guardar la foto de la ficha. */
'use strict';

/* ---------- Fotos de los productos ----------
 * En la versión de escritorio cada foto es un archivo .webp (o .jpg las de antes, unos 800-900 px) en la carpeta Fotos y el producto
 * guarda solo el nombre (p.foto). En el navegador, que es para probar, se guarda una foto chica dentro de los
 * datos (p.fotoData). */
let fotosUrlBase = null;
function fotoUrl(p) {
  if (!p) return '';
  if (p.foto && escritorio()) {
    if (fotosUrlBase == null) { try { fotosUrlBase = window.almacen.info().fotosUrl || ''; } catch (e) { fotosUrlBase = ''; } }
    return fotosUrlBase ? fotosUrlBase + encodeURIComponent(p.foto) : '';
  }
  return p.fotoData || '';
}
const tieneFoto = (p) => !!(p.foto || p.fotoData);
function miniatura(p, cls = 'mini') {
  const u = fotoUrl(p);
  return u ? `<img class="foto ${cls}" src="${esc(u)}" alt="" loading="lazy" data-ver-foto="${p.id}">` : '';
}

function verFoto(id) {
  const p = producto(id);
  const u = fotoUrl(p);
  if (!u) return;
  $('#foto-titulo').textContent = p.nombre;
  $('#foto-sub').textContent = `${p.codigo} · ${$m(p.precio, p.moneda)}${p.ubicacion ? ' · ' + p.ubicacion : ''}`;
  $('#foto-grande').src = u;
  $('#dlg-foto').showModal();
}

/**
 * Achica una imagen a 800 px, en WebP o JPEG: el que pese menos (WebP suele ser bastante más liviano). Devuelve un Blob, o tira un Error con un texto para la persona.
 */
async function achicarFoto(file, max = 800, calidad = 0.8) {
  if (/\.hei[cf]$/i.test(file.name) || /heic|heif/i.test(file.type)) {
    throw new Error('Esa foto está en formato HEIC (iPhone) y no se puede abrir. En el iPhone: Ajustes → Cámara → Formatos → «Más compatible», o pasala a la PC como JPG.');
  }
  if (file.size > 40 * 1048576) throw new Error('La foto es demasiado grande (más de 40 MB).');
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new Error('No pude abrir esa imagen. Tiene que ser una foto JPG o PNG.');
  }
  const f = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * f)), h = Math.max(1, Math.round(img.height * f));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  // Se prueban WebP y JPEG y queda el más liviano (WebP suele pesar un 30 % menos; en fotos con mucho detalle, no)
  const webp = await new Promise((res) => c.toBlob(res, 'image/webp', calidad));
  const jpeg = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
  const blob = webp && webp.type === 'image/webp' && (!jpeg || webp.size <= jpeg.size) ? webp : jpeg;
  if (!blob) throw new Error('No se pudo achicar la foto.');
  return blob;
}

const leerComoDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

// Foto elegida en el formulario y todavía no guardada: { blob, url } o 'quitar'
let fotoPendiente = null;
function mostrarFotoForm(url) {
  $('#p-foto-prev').innerHTML = url ? `<img src="${esc(url)}" alt="Foto del producto">` : '<span>Sin foto</span>';
  $('#p-foto-quitar').hidden = !url;
  $('#p-foto-elegir').textContent = url ? 'Cambiar foto' : 'Elegir foto';
}
async function elegirFotoForm(file) {
  $('#p-foto-err').textContent = '';
  if (!file) return;
  $('#p-foto-prev').innerHTML = '<span>Preparando…</span>';
  try {
    const blob = await achicarFoto(file);
    if (fotoPendiente && fotoPendiente.url) URL.revokeObjectURL(fotoPendiente.url);
    fotoPendiente = { blob, url: URL.createObjectURL(blob) };
    mostrarFotoForm(fotoPendiente.url);
  } catch (e) {
    $('#p-foto-err').textContent = e.message;
    mostrarFotoForm(fotoPendiente && fotoPendiente.url ? fotoPendiente.url : (fotoPendiente === 'quitar' ? '' : fotoUrl(producto(editandoProd))));
  }
}

/** Guarda la foto pendiente en el producto. Devuelve un texto de error o null. */
async function aplicarFotoPendiente(p) {
  if (!fotoPendiente) return null;
  if (fotoPendiente === 'quitar') { delete p.foto; delete p.fotoData; fotoPendiente = null; return null; }
  if (escritorio() && window.almacen.guardarFoto) {
    const nombre = `${String(p.id).replace(/[^\w-]/g, '').slice(0, 40)}-${Date.now()}.${fotoPendiente.blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
    const bytes = new Uint8Array(await fotoPendiente.blob.arrayBuffer());
    const r = await window.almacen.guardarFoto(nombre, bytes);
    if (!r || r.error) return 'No se pudo guardar la foto' + (r && r.error ? `: ${r.error}` : '.');
    p.foto = r.nombre;
    delete p.fotoData;
  } else {
    // Navegador: una foto chica dentro de los datos
    const bmp = await createImageBitmap(fotoPendiente.blob);
    const f = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    p.fotoData = c.toDataURL('image/jpeg', 0.7);
    delete p.foto;
  }
  URL.revokeObjectURL(fotoPendiente.url);
  fotoPendiente = null;
  return null;
}

// Proceso principal de la versión de escritorio (Windows).
// Guarda los datos en una base SQLite y hace un respaldo comprimido por día,
// con copia opcional a una carpeta extra (pendrive o nube).
const { app, BrowserWindow, ipcMain, shell, Menu, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { promisify } = require('util');
const { pathToFileURL } = require('url');
const { Almacen } = require('./datos');
const { fotosEnUso, planLimpiezaFotos } = require('./fotos');
const { imprimirCrudo } = require('./etiquetadora');
const { crearServidorCelular, datosVinculo, ipsLocales, nuevoToken, nuevoPcId } = require('./servidor-celular');
const { crearRegistro, informeSoporte } = require('./registro');
const { PATRON_RESPALDO, respaldosAConservar, diasDelMasViejo, comprobarRespaldo } = require('./respaldos');

const CARPETA_EXTRA = 'Stock Ferreteria - Respaldos';
const gzip = promisify(zlib.gzip);

// Carpeta de datos propia y sin tildes. Con "Ferretería" en el nombre, Electron guardaba todo
// suelto en la raíz de AppData\Roaming; las versiones anteriores pueden tener datos.json ahí.
const APPDATA = app.getPath('appData');
app.setPath('userData', path.join(APPDATA, 'Stock Ferreteria'));

// Registro de errores: %APPDATA%\Stock Ferreteria\registro.log (ver electron/registro.js)
const registro = crearRegistro(app.getPath('userData'));
/** Anota un error en el registro y lo muestra en la consola (para cuando se prueba con npm start). */
function anotarError(area, mensaje, e) {
  console.error(mensaje, e || '');
  registro.error(area, mensaje, e);
}
// Un error no atrapado no debe cerrar el programa con la caja abierta: se anota y se sigue.
process.on('uncaughtException', (e) => anotarError('programa', 'Error no atrapado', e));
process.on('unhandledRejection', (e) => anotarError('programa', 'Promesa rechazada sin atrapar', e));

let ventana = null;
let almacen = null;
// Si la base tiene filas que no se pueden leer, no se escribe nada ni se hacen respaldos
// hasta que se restaure una copia o se reparen, para no pisar los respaldos buenos.
let danada = null;

function rutas() {
  const base = app.getPath('userData');
  return {
    base,
    datos: path.join(base, 'datos.sqlite'),
    // Donde pudo quedar el datos.json de versiones anteriores
    jsonViejos: [path.join(base, 'datos.json'), path.join(APPDATA, 'datos.json'), path.join(APPDATA, 'Stock Ferretería', 'datos.json')],
    respaldos: path.join(app.getPath('documents'), 'Stock Ferreteria', 'Respaldos'),
    fotos: path.join(base, 'Fotos'),
  };
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- Base de datos ---------- */

function abrirBase() {
  const r = rutas();
  fs.mkdirSync(r.base, { recursive: true });
  const inicio = Date.now();
  almacen = new Almacen(r.datos);
  let peso = 0;
  try { peso = fs.statSync(r.datos).size; } catch (e) { /* base nueva */ }
  registro.info('inicio', `Abre la versión ${app.getVersion()}: base abierta en ${Date.now() - inicio} ms, datos.sqlite pesa ${(peso / 1024 / 1024).toFixed(1)} MB`);
  // Versiones anteriores guardaban todo en datos.json: se pasa a SQLite una sola vez
  if (almacen.vacia()) {
    for (const archivo of r.jsonViejos.flatMap((a) => [a, a + '.bak'])) {
      let texto;
      try {
        texto = fs.readFileSync(archivo, 'utf8');
        const d = JSON.parse(texto);
        if (!d || !Array.isArray(d.productos) || !Array.isArray(d.movimientos)) continue; // no es de este programa
      } catch (e) { continue; }
      almacen.importarJson(texto);
      // Se deja una copia con otro nombre, por las dudas
      try { fs.copyFileSync(archivo, path.join(r.base, 'datos-antes-de-sqlite.json')); } catch (e) { /* nada */ }
      try { fs.renameSync(archivo.replace(/\.bak$/, ''), archivo.replace(/(\.bak)?$/, '.migrado')); } catch (e) { /* nada */ }
      break;
    }
  }
}

/* ---------- Respaldos ---------- */

let respaldando = false;
let ultimoIntentoExtra = 0;

/** Borra los respaldos que ya no hacen falta: quedan 7 diarios, 4 semanales y 12 mensuales (ver electron/respaldos.js). */
function podar(carpeta) {
  const lista = fs.readdirSync(carpeta).filter((f) => PATRON_RESPALDO.test(f));
  const quedan = new Set(respaldosAConservar(lista, hoy()));
  lista.filter((f) => !quedan.has(f)).forEach((f) => {
    try { fs.unlinkSync(path.join(carpeta, f)); } catch (e) { /* nada */ }
  });
}

/**
 * Escribe el respaldo comprimido en un archivo temporal, lo comprueba (se descomprime y se lee entero) y recién
 * entonces reemplaza al del día. Si la comprobación falla, el del día y los viejos quedan como estaban.
 */
function escribirRespaldo(archivo, comprimido) {
  fs.writeFileSync(archivo + '.tmp', comprimido);
  const problema = comprobarRespaldo(fs.readFileSync(archivo + '.tmp'));
  if (problema) {
    try { fs.unlinkSync(archivo + '.tmp'); } catch (e) { /* nada */ }
    throw new Error(`El respaldo se escribió mal: ${problema}.`);
  }
  fs.renameSync(archivo + '.tmp', archivo);
}

/** Anota cómo salió el respaldo y, si falló, avisa en la pantalla. */
function estadoRespaldo(error) {
  const estado = error ? { ok: false, fecha: new Date().toISOString(), error: String(error.message || error) } : { ok: true, fecha: new Date().toISOString() };
  try { if (almacen) almacen.ponerAjuste('estadoRespaldo', estado); } catch (e) { /* nada */ }
  if (error && ventana && !ventana.isDestroyed()) ventana.webContents.send('respaldo:fallo', estado);
}

/** Días que hay que guardar una foto que ningún producto usa: hasta el respaldo más viejo que se conserva, más 7. */
function diasFotosHuerfanas() {
  const r = rutas();
  let dias = 0;
  for (const c of [r.respaldos, carpetaExtraRespaldos()]) {
    try { if (c && fs.existsSync(c)) dias = Math.max(dias, diasDelMasViejo(fs.readdirSync(c), hoy())); } catch (e) { /* nada */ }
  }
  return dias + 7;
}
function carpetaExtraRespaldos() {
  const carpeta = almacen && almacen.ajuste('carpetaExtra');
  return carpeta ? path.join(carpeta, CARPETA_EXTRA) : null;
}

function copiarAExtra(archivo) {
  const carpeta = almacen.ajuste('carpetaExtra');
  if (!carpeta) return null;
  ultimoIntentoExtra = Date.now();
  const estado = { fecha: new Date().toISOString(), dia: hoy() };
  try {
    if (!fs.existsSync(carpeta)) throw Object.assign(new Error(), { code: 'SIN_CARPETA' });
    const destino = path.join(carpeta, CARPETA_EXTRA);
    fs.mkdirSync(destino, { recursive: true });
    fs.copyFileSync(archivo, path.join(destino, path.basename(archivo)));
    podar(destino);
    respaldarFotos(destino);
    estado.ok = true;
  } catch (e) {
    estado.ok = false;
    estado.error = e.code === 'SIN_CARPETA'
      ? 'No se encontró la carpeta. Si es un pendrive, puede que no esté enchufado.'
      : `No se pudo copiar (${e.code || e.message}).`;
  }
  almacen.ponerAjuste('estadoExtra', estado);
  return estado;
}

/* ---------- Fotos de los productos ----------
 * Cada foto es un .jpg achicado en la carpeta Fotos de los datos. No van en la base (la harían pesada);
 * se copian a Respaldos\Fotos y a la carpeta extra. Si en esta PC falta una foto que está en
 * Respaldos\Fotos (por ejemplo, al pasar a una PC nueva), se trae de ahí. */
const NOMBRE_FOTO = /^[\w-]{1,80}\.jpg$/;

/** Copia a destino las fotos que no tiene (solo las de «solo», si se pasa). Devuelve cuántas copió. */
function sincronizarFotos(origen, destino, solo = null) {
  if (!fs.existsSync(origen)) return 0;
  fs.mkdirSync(destino, { recursive: true });
  const hay = new Set(fs.readdirSync(destino));
  let n = 0;
  for (const f of fs.readdirSync(origen)) {
    if (!NOMBRE_FOTO.test(f) || hay.has(f) || (solo && !solo.has(f))) continue;
    try { fs.copyFileSync(path.join(origen, f), path.join(destino, f)); n++; } catch (e) { /* se reintenta en el próximo respaldo */ }
  }
  return n;
}

/** Fotos en la carpeta extra (pendrive o nube), si está configurada y conectada. */
function carpetaFotosExtra() {
  const c = almacen && almacen.ajuste('carpetaExtra');
  if (!c || !fs.existsSync(c)) return null;
  return path.join(c, CARPETA_EXTRA, 'Fotos');
}

const fotosUsadasAhora = () => { try { return almacen ? fotosEnUso(almacen.leerJson() || '') : null; } catch (e) { return null; } };

/**
 * Trae a esta PC las fotos que usan los productos y faltan (PC nueva o disco cambiado): primero de
 * Respaldos\Fotos y después de la carpeta extra. Solo las que se usan, así no vuelven fotos ya borradas.
 */
function traerFotosQueFaltan(enUso = fotosUsadasAhora()) {
  if (!enUso || !enUso.size) return 0;
  const r = rutas();
  let n = sincronizarFotos(path.join(r.respaldos, 'Fotos'), r.fotos, enUso);
  const extra = carpetaFotosExtra();
  if (extra) n += sincronizarFotos(extra, r.fotos, enUso);
  return n;
}

function respaldarFotos(carpetaExtraDestino) {
  const r = rutas();
  try {
    traerFotosQueFaltan();
    sincronizarFotos(r.fotos, path.join(r.respaldos, 'Fotos'));
    if (carpetaExtraDestino) sincronizarFotos(r.fotos, path.join(carpetaExtraDestino, 'Fotos'));
  } catch (e) { anotarError('fotos', 'No se pudieron copiar las fotos', e); }
}

/** Borra las fotos que ningún producto usa desde hace más días que los respaldos guardados. */
function limpiarFotos(textoDatos) {
  const enUso = fotosEnUso(textoDatos);
  if (!enUso) return;
  const r = rutas();
  const carpetas = [r.fotos, path.join(r.respaldos, 'Fotos'), carpetaFotosExtra()].filter((c) => c && fs.existsSync(c));
  const presentes = new Set(carpetas.flatMap((c) => fs.readdirSync(c).filter((f) => NOMBRE_FOTO.test(f))));
  const plan = planLimpiezaFotos(almacen.ajuste('fotosHuerfanas') || {}, enUso, presentes, Date.now(), diasFotosHuerfanas());
  for (const f of plan.borrar) for (const c of carpetas) { try { fs.unlinkSync(path.join(c, f)); } catch (e) { /* no estaba */ } }
  almacen.ponerAjuste('fotosHuerfanas', plan.huerfanas);
}

/** Hace el respaldo del día si todavía no existe (o siempre, si forzar) y lo copia a la carpeta extra. */
async function hacerRespaldo(forzar = false) {
  if (respaldando || !almacen || danada) return null;
  respaldando = true;
  try {
    const { respaldos } = rutas();
    fs.mkdirSync(respaldos, { recursive: true });
    const archivo = path.join(respaldos, `respaldo_${hoy()}.json.gz`);
    let nuevo = false;
    // Si falló hace poco, se espera 10 minutos antes de reintentar solo (para no avisar en cada guardado)
    const ultimo = almacen.ajuste('estadoRespaldo');
    const fallaReciente = ultimo && !ultimo.ok && Date.now() - Date.parse(ultimo.fecha) < 10 * 60 * 1000;
    if (forzar || (!fs.existsSync(archivo) && !fallaReciente)) {
      // Una vez por día, antes del respaldo: un archivo dañado no tiene que pisar los respaldos buenos
      const chequeo = almacen.ajuste('chequeoBase');
      if (!chequeo || chequeo.dia !== hoy()) {
        const problemas = chequearArchivo('del día');
        if (problemas.length) {
          if (ventana && !ventana.isDestroyed()) ventana.webContents.send('base:danada', infoArchivoDanado(problemas));
          return { error: 'El archivo de la base tiene partes dañadas.' };
        }
      }
      const texto = almacen.leerJson();
      if (!texto) return null;
      const comprimido = await gzip(texto, { level: 6 });
      escribirRespaldo(archivo, comprimido);
      estadoRespaldo(null);
      podar(respaldos);
      almacen.ponerAjuste('ultimoRespaldo', { fecha: new Date().toISOString(), archivo });
      nuevo = true;
      try { limpiarFotos(texto); } catch (e) { anotarError('fotos', 'No se pudieron limpiar las fotos', e); }
    }
    respaldarFotos();
    const extra = almacen.ajuste('estadoExtra');
    const pendiente = !extra || !extra.ok || extra.dia !== hoy();
    if (fs.existsSync(archivo) && (nuevo || (pendiente && Date.now() - ultimoIntentoExtra > 10 * 60 * 1000))) copiarAExtra(archivo);
    return infoRespaldos();
  } catch (e) {
    anotarError('respaldo', 'No se pudo hacer el respaldo', e);
    estadoRespaldo(e);
    return { error: String(e.message || e) };
  } finally {
    respaldando = false;
  }
}

function infoRespaldos() {
  return {
    carpetaExtra: almacen ? almacen.ajuste('carpetaExtra') : null,
    estadoExtra: almacen ? almacen.ajuste('estadoExtra') : null,
    ultimoRespaldo: almacen ? almacen.ajuste('ultimoRespaldo') : null,
    estadoRespaldo: almacen ? almacen.ajuste('estadoRespaldo') : null,
  };
}

/** Respaldo al cerrar el programa (sincrónico, porque la app se está cerrando). */
function respaldoAlCerrar() {
  if (!almacen || danada || respaldando) return;
  try {
    const { respaldos } = rutas();
    fs.mkdirSync(respaldos, { recursive: true });
    const archivo = path.join(respaldos, `respaldo_${hoy()}.json.gz`);
    const texto = almacen.leerJson();
    if (!texto) return;
    escribirRespaldo(archivo, zlib.gzipSync(texto, { level: 3 }));
    estadoRespaldo(null);
    podar(respaldos);
    almacen.ponerAjuste('ultimoRespaldo', { fecha: new Date().toISOString(), archivo });
    copiarAExtra(archivo);
  } catch (e) {
    anotarError('respaldo', 'No se pudo hacer el respaldo al cerrar', e);
    estadoRespaldo(e);
  }
}

let respaldoProgramado = null;
function programarRespaldo() {
  if (respaldoProgramado) return;
  respaldoProgramado = setTimeout(() => { respaldoProgramado = null; hacerRespaldo(); }, 3000);
}

/* ---------- Comunicación con la pantalla ---------- */

/** Copia la base dañada con otro nombre antes de tocarla. Devuelve la ruta de la copia. */
function apartarDanada() {
  const r = rutas();
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(r.base, `datos-danado-${sello}.sqlite`);
  try {
    almacen.copiarA(destino);
  } catch (e) {
    // Si SQLite no puede copiarla, se copian los archivos tal cual
    for (const suf of ['', '-wal', '-shm']) {
      try { fs.copyFileSync(r.datos + suf, destino + suf); } catch (err) { /* puede no existir */ }
    }
  }
  return destino;
}

/* Un guardado «completo» vacía todas las tablas y las vuelve a escribir (restaurar una copia, unir productos,
 * reintentar después de un error). Si un error en la pantalla mandara menos ventas o movimientos de los que hay,
 * se perdería historia sin aviso: por eso, antes de cada uno, se guarda una copia exacta de la base. */
const COPIAS_ANTES_DE_REEMPLAZAR = 10;
let ultimaCopiaReemplazo = 0;
function copiaAntesDeReemplazar() {
  if (!almacen || almacen.vacia()) return null;
  // Varios seguidos (por ejemplo, «Reintentar» varias veces) no llenan el disco: una copia por minuto alcanza
  if (Date.now() - ultimaCopiaReemplazo < 60 * 1000) return null;
  const carpeta = path.join(rutas().base, 'Copias antes de reemplazar');
  fs.mkdirSync(carpeta, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = path.join(carpeta, `datos-${sello}.sqlite`);
  almacen.copiarA(destino);
  ultimaCopiaReemplazo = Date.now();
  const viejas = fs.readdirSync(carpeta).filter((f) => /^datos-[\dT-]+\.sqlite$/.test(f)).sort();
  viejas.slice(0, Math.max(0, viejas.length - COPIAS_ANTES_DE_REEMPLAZAR)).forEach((f) => {
    try { fs.unlinkSync(path.join(carpeta, f)); } catch (e) { /* nada */ }
  });
  return destino;
}

/**
 * Chequeo rápido del archivo de la base (PRAGMA quick_check), al abrir y una vez por día antes del respaldo.
 * Si encuentra problemas, la base queda marcada como dañada (no se escribe nada ni se hacen respaldos)
 * y devuelve la lista; si está bien, devuelve [] y anota la fecha en ajustes.
 */
function chequearArchivo(momento) {
  const inicio = Date.now();
  let problemas;
  try { problemas = almacen.revisarArchivo(); } catch (err) { problemas = [String(err.message || err)]; }
  const ms = Date.now() - inicio;
  if (problemas.length) {
    danada = { tipo: 'archivo', problemas };
    registro.error('base', `El chequeo del archivo de la base (${momento}) encontró problemas`, problemas.join(' / '));
    return problemas;
  }
  registro.info('base', `Chequeo del archivo de la base (${momento}): bien, en ${ms} ms`);
  try { almacen.ponerAjuste('chequeoBase', { fecha: new Date().toISOString(), dia: hoy(), ms }); } catch (err) { /* nada */ }
  return [];
}
const infoArchivoDanado = (problemas) => ({ error: 'archivo', detalle: problemas.slice(0, 3).join(' · '), base: rutas().datos });

ipcMain.on('almacen:leer', (e) => {
  try {
    const problemas = chequearArchivo('al abrir');
    if (problemas.length) { e.returnValue = infoArchivoDanado(problemas); return; }
    const malas = almacen.revisar();
    if (malas.length) {
      danada = { tipo: 'filas', filas: malas };
      e.returnValue = { error: 'filas', filas: malas.slice(0, 50), cantidad: malas.length, configDanada: malas.some((m) => m.tabla === 'config'), base: rutas().datos };
      return;
    }
    danada = null;
    e.returnValue = almacen.leerJson();
  } catch (err) {
    danada = { tipo: 'base' };
    e.returnValue = { error: 'base', detalle: String(err.message || err), base: rutas().datos };
  }
});
ipcMain.on('almacen:marcarDanada', (e) => { danada = danada || { tipo: 'json' }; e.returnValue = null; });
// Repara quitando solo las filas dañadas, después de guardar una copia de la base como está
ipcMain.on('almacen:reparar', (e) => {
  try {
    if (!danada || danada.tipo !== 'filas') { e.returnValue = { error: 'No hay filas dañadas para quitar.' }; return; }
    const copia = apartarDanada();
    almacen.quitarDanadas(danada.filas);
    const quitadas = danada.filas.length;
    danada = null;
    e.returnValue = { ok: true, quitadas, copia };
  } catch (err) {
    e.returnValue = { error: String(err.message || err) };
  }
});
ipcMain.on('almacen:cambios', (e, cambios) => {
  try {
    if (danada) {
      // Con la base dañada solo se acepta reemplazar todo (restaurar una copia), y antes se aparta la base vieja
      if (!cambios || !cambios.completo) { e.returnValue = 'Los datos guardados están dañados: restaurá una copia antes de seguir.'; return; }
      if (danada.tipo === 'base' || danada.tipo === 'archivo') {
        // La base misma no se puede leer (o el chequeo del archivo falló): se cierra, se renombra y se empieza un archivo nuevo con la copia
        const r = rutas();
        const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        try { almacen.cerrar(); } catch (err) { /* puede fallar si está rota */ }
        for (const suf of ['', '-wal', '-shm']) {
          try { fs.renameSync(r.datos + suf, path.join(r.base, `datos-danado-${sello}.sqlite${suf}`)); } catch (err) { /* puede no existir */ }
        }
        almacen = new Almacen(r.datos);
      } else {
        apartarDanada();
      }
      danada = null;
    } else if (cambios && cambios.completo) {
      // Si la copia no se puede hacer (disco lleno…), se guarda igual: no se puede dejar la caja sin cobrar
      try { copiaAntesDeReemplazar(); } catch (err) { anotarError('guardado', 'No se pudo copiar la base antes de reemplazarla', err); }
    }
    almacen.aplicar(cambios);
    e.returnValue = null;
    if (cambios && cambios.completo) registro.info('guardado', 'Se reemplazaron todos los datos (restaurar copia, ejemplo o borrar todo)');
    // Al restaurar una copia completa, traer enseguida las fotos que use y falten en esta PC
    if (cambios && cambios.completo) setImmediate(() => { try { traerFotosQueFaltan(); } catch (err) { /* se reintenta en el respaldo */ } });
    const ult = almacen.ajuste('ultimoRespaldo');
    if (!ult || !String(ult.archivo || '').includes(hoy())) programarRespaldo();
  } catch (err) {
    anotarError('guardado', 'No se pudo guardar', err);
    e.returnValue = String(err.message || err);
  }
});
/* ---------- Registro de errores ---------- */
// Solo la ventana del programa puede anotar y pedir el informe (no las herramientas)
const esVentanaPrincipal = (e) => !!ventana && !ventana.isDestroyed() && e.sender === ventana.webContents;
ipcMain.on('registro:anotar', (e, nivel, area, mensaje, detalle) => {
  if (!esVentanaPrincipal(e)) return;
  registro.anotar(['INFO', 'AVISO', 'ERROR'].includes(nivel) ? nivel : 'ERROR', `pantalla/${String(area || '').slice(0, 40)}`, String(mensaje || '').slice(0, 1000), String(detalle || '').slice(0, 4000));
});
ipcMain.handle('registro:copiarInforme', (e) => {
  if (!esVentanaPrincipal(e)) return { error: 'No permitido.' };
  const lineas = registro.ultimas(200);
  clipboard.writeText(informeSoporte({ version: app.getVersion(), sistema: `${os.type()} ${os.release()} (${os.arch()})`, fecha: new Date(), lineas }));
  return { lineas: lineas.length };
});
ipcMain.on('almacen:info', (e) => {
  const r = rutas();
  e.returnValue = { datos: r.datos, respaldos: r.respaldos, fotos: r.fotos, fotosUrl: pathToFileURL(r.fotos).href + '/', version: app.getVersion(), ...infoRespaldos() };
});
/** Guarda una foto ya achicada (JPEG) en la carpeta Fotos. Devuelve { nombre } o { error }. */
function guardarFotoEnDisco(nombre, bytes) {
  try {
    if (!NOMBRE_FOTO.test(String(nombre))) return { error: 'Nombre de foto no válido.' };
    const datos = Buffer.from(bytes);
    if (datos.length > 5 * 1024 * 1024 || datos[0] !== 0xff || datos[1] !== 0xd8) return { error: 'La foto no es válida.' };
    const { fotos } = rutas();
    fs.mkdirSync(fotos, { recursive: true });
    fs.writeFileSync(path.join(fotos, nombre + '.tmp'), datos);
    fs.renameSync(path.join(fotos, nombre + '.tmp'), path.join(fotos, nombre));
    return { nombre };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}
/** Borra una foto que no se llegó a usar (el celular la mandó pero el producto no se encontró). */
function borrarFotoSinUso(nombre) {
  try { if (NOMBRE_FOTO.test(String(nombre))) fs.unlinkSync(path.join(rutas().fotos, nombre)); } catch (e) { /* nada */ }
}
// Guarda una foto ya achicada por la pantalla (JPEG). Devuelve el nombre del archivo o { error }.
ipcMain.handle('fotos:guardar', async (e, nombre, bytes) => guardarFotoEnDisco(nombre, bytes));
ipcMain.handle('almacen:abrirRespaldos', async () => {
  const { respaldos } = rutas();
  fs.mkdirSync(respaldos, { recursive: true });
  return shell.openPath(respaldos);
});
ipcMain.handle('almacen:elegirCarpetaExtra', async () => {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Elegí dónde guardar una copia extra (pendrive, Google Drive, OneDrive…)',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths.length) return infoRespaldos();
  almacen.ponerAjuste('carpetaExtra', r.filePaths[0]);
  almacen.ponerAjuste('estadoExtra', null);
  ultimoIntentoExtra = 0;
  return hacerRespaldo(true);
});
ipcMain.handle('almacen:quitarCarpetaExtra', async () => {
  almacen.ponerAjuste('carpetaExtra', null);
  almacen.ponerAjuste('estadoExtra', null);
  return infoRespaldos();
});
ipcMain.handle('almacen:respaldarAhora', async () => hacerRespaldo(true));

// Impresora de etiquetas directa (TSPL en crudo): la lista de impresoras de Windows y el envío
ipcMain.handle('etiquetadora:impresoras', async (e) => {
  try { return (await e.sender.getPrintersAsync()).map((p) => ({ nombre: p.name, nombreVisible: p.displayName || p.name, predeterminada: !!p.isDefault })); } catch (err) { return []; }
});
ipcMain.handle('etiquetadora:imprimir', async (e, impresora, tspl) => imprimirCrudo(impresora, tspl));

/* ---------- Ventana ---------- */

/* ---------- Herramientas aparte (Cargador de productos y Lector de facturas) ----------
 * Se abren en su propia ventana, sin acceso a los datos del programa: solo arman un Excel.
 * Excepciones: los estantes (leerlos y crear uno) y buscar productos ya cargados (solo leer), para que el Cargador
 * use los mismos estantes que el programa y reconozca lo que ya está cargado.
 * Si una falla, la caja sigue funcionando. */
const HERRAMIENTAS = {
  cargador: { archivo: 'Cargador-de-productos.html', titulo: 'Cargador de productos' },
  lector: { archivo: 'Lector-de-facturas.html', titulo: 'Lector de facturas' },
};
const abiertas = {};
function abrirHerramienta(nombre) {
  const h = HERRAMIENTAS[nombre];
  if (!h) return;
  if (abiertas[nombre] && !abiertas[nombre].isDestroyed()) { abiertas[nombre].show(); abiertas[nombre].focus(); return; }
  const w = new BrowserWindow({
    width: 1280, height: 860, minWidth: 700, minHeight: 500,
    title: h.titulo,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#e2e7ed',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: !app.isPackaged, preload: path.join(__dirname, 'herramientas-preload.js') },
  });
  w.setMenuBarVisibility(false);
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.loadFile(path.join(__dirname, '..', 'herramientas', h.archivo));
  abiertas[nombre] = w;
}
ipcMain.on('herramienta:abrir', (e, nombre) => abrirHerramienta(String(nombre)));
// Los estantes los tiene la ventana del programa (ahí están los datos): se le piden a ella.
const esHerramienta = (e) => Object.values(abiertas).some((w) => w && !w.isDestroyed() && w.webContents === e.sender);
async function preguntarAlPrograma(codigo) {
  if (!ventana || ventana.isDestroyed()) return { error: 'El programa no está abierto.', sinPrograma: true };
  try { return await ventana.webContents.executeJavaScript(codigo); } catch (err) { return { error: 'El programa no respondió.', sinPrograma: true }; }
}
ipcMain.handle('herramienta:estantes', (e) => (esHerramienta(e) ? preguntarAlPrograma('estantesParaHerramienta()') : null));
ipcMain.handle('herramienta:buscarProducto', (e, codigo) => (esHerramienta(e) ? preguntarAlPrograma(`productoParaHerramienta(${JSON.stringify(String(codigo || '').slice(0, 80))})`) : null));
ipcMain.handle('herramienta:buscarProductos', (e, texto) => (esHerramienta(e) ? preguntarAlPrograma(`productosParaHerramienta(${JSON.stringify(String(texto || '').slice(0, 80))})`) : []));
ipcMain.handle('herramienta:nuevoEstante', (e, x) => {
  if (!esHerramienta(e)) return { error: 'No permitido.' };
  const datos = { codigo: String((x && x.codigo) || '').slice(0, 60), categoria: String((x && x.categoria) || '').slice(0, 60) };
  return preguntarAlPrograma(`nuevoEstanteDesdeHerramienta(${JSON.stringify(datos)})`);
});

/* ---------- App del celular (Etiquetador) por el WiFi del local ----------
 * La PC abre el puerto 8765 solo después de que el administrador lo activa en «Vincular celular» (así a quien no
 * usa el celular Windows nunca le pregunta por el firewall). El celular se vincula escaneando un QR con las
 * direcciones de esta PC, un código secreto (token) y el pcId, que identifica a esta PC aunque otra quede con su IP.
 * Token y pcId van en «ajustes» (de esta PC): restaurar una copia de los datos no los cambia. */
let servidorCelular = null;
let errorCelular = null;
function claveCelular() {
  let c = almacen && almacen.ajuste('celular');
  if (!c || !c.token || !c.pcId) {
    c = { activo: false, ...(c || {}), token: (c && c.token) || nuevoToken(), pcId: (c && c.pcId) || nuevoPcId() };
    if (almacen) almacen.ponerAjuste('celular', c);
  }
  return c;
}
function infoCelular() {
  const c = claveCelular();
  const ips = ipsLocales();
  return {
    activo: !!(servidorCelular && servidorCelular.activo),
    quiereActivo: !!c.activo,
    error: errorCelular,
    puerto: servidorCelular ? servidorCelular.puerto : null,
    ips,
    vinculo: datosVinculo(c, ips),
    ultimoPedido: servidorCelular ? servidorCelular.ultimoPedido : null,
  };
}
async function prenderCelular() {
  if (!servidorCelular) servidorCelular = crearServidorCelular({ clave: claveCelular, preguntar: preguntarAlPrograma, version: app.getVersion(), guardarFoto: guardarFotoEnDisco, borrarFoto: borrarFotoSinUso, alError: (m, e) => anotarError('celular', m, e) });
  errorCelular = await servidorCelular.iniciar();
  return infoCelular();
}
async function apagarCelular() {
  if (servidorCelular) await servidorCelular.detener();
  errorCelular = null;
}
// Solo la ventana del programa (no las herramientas) maneja la vinculación; y la pantalla solo deja al administrador
const esVentana = (e) => ventana && !ventana.isDestroyed() && e.sender === ventana.webContents;
ipcMain.handle('celular:info', (e) => (esVentana(e) ? infoCelular() : null));
ipcMain.handle('celular:activar', async (e) => {
  if (!esVentana(e)) return null;
  almacen.ponerAjuste('celular', { ...claveCelular(), activo: true });
  return prenderCelular();
});
ipcMain.handle('celular:desactivar', async (e) => {
  if (!esVentana(e)) return null;
  almacen.ponerAjuste('celular', { ...claveCelular(), activo: false });
  await apagarCelular();
  return infoCelular();
});
// Código nuevo: los celulares vinculados dejan de entrar hasta que escaneen el QR nuevo
ipcMain.handle('celular:nuevoCodigo', (e) => {
  if (!esVentana(e)) return null;
  almacen.ponerAjuste('celular', { ...claveCelular(), token: nuevoToken() });
  return infoCelular();
});

/* Tamaño de la pantalla (Ver → Agrandar / Achicar), recordado en esta PC */
function cambiarZoom(paso) {
  const w = BrowserWindow.getFocusedWindow() || ventana;
  if (!w) return;
  const actual = w.webContents.getZoomFactor();
  const f = paso === 0 ? 1 : Math.min(2, Math.max(0.7, Math.round((actual + paso) * 10) / 10));
  w.webContents.setZoomFactor(f);
  if (w === ventana && almacen) { try { almacen.ponerAjuste('zoom', f); } catch (e) { /* nada */ } }
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Stock Ferretería',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#f1f3f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // En el programa instalado no se pueden abrir las herramientas de desarrollo
      devTools: !app.isPackaged,
    },
  });
  ventana.once('ready-to-show', () => { ventana.maximize(); ventana.show(); });
  ventana.loadFile(path.join(__dirname, '..', 'index.html'));
  ventana.webContents.on('did-finish-load', () => {
    let f = 1;
    try { f = Number(almacen && almacen.ajuste('zoom')) || 1; } catch (e) { /* nada */ }
    ventana.webContents.setZoomFactor(f);
  });
  // Si la pantalla se cae o se cuelga, queda anotado
  ventana.webContents.on('render-process-gone', (ev, d) => registro.error('pantalla', `La pantalla se cerró sola (${d.reason}, código ${d.exitCode})`));
  ventana.on('unresponsive', () => registro.aviso('pantalla', 'La pantalla dejó de responder'));
  ventana.on('responsive', () => registro.info('pantalla', 'La pantalla volvió a responder'));
  // Al cerrar el programa se cierran también las herramientas
  ventana.on('closed', () => app.quit());

  // Los enlaces externos se abren en el navegador
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  ventana.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });

  // Exportaciones a Excel y copias: preguntar dónde guardar
  // (la misma sesión la usan las herramientas, así que también vale para el Excel del Cargador)
  ventana.webContents.session.on('will-download', (e, item, wc) => {
    const nombre = item.getFilename();
    const ext = path.extname(nombre).toLowerCase(); // .xlsx, .json…
    const tipos = { '.xlsx': 'Planilla de Excel', '.xls': 'Planilla de Excel', '.csv': 'Planilla CSV', '.json': 'Copia de seguridad', '.pdf': 'PDF' };
    let destino = dialog.showSaveDialogSync((wc && BrowserWindow.fromWebContents(wc)) || ventana, {
      defaultPath: path.join(app.getPath('documents'), nombre),
      filters: ext ? [{ name: tipos[ext] || ext.slice(1).toUpperCase(), extensions: [ext.slice(1)] }] : [],
    });
    if (!destino) { item.cancel(); return; }
    // Si se escribe un nombre sin «.xlsx», se le agrega: sin la terminación, el programa no la encuentra al importar
    if (ext && path.extname(destino).toLowerCase() !== ext) destino += ext;
    item.setSavePath(destino);
  });
}

// Una sola ventana abierta a la vez, para no pisar los datos
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
  });
  app.whenReady().then(() => {
    try {
      abrirBase();
    } catch (e) {
      anotarError('inicio', 'No se pudo abrir la base de datos', e);
      dialog.showErrorBox('Stock Ferretería', `No se pudo abrir la base de datos.\n\n${e.message}\n\nComunicate con tu proveedor. Los respaldos están en Documentos > Stock Ferreteria > Respaldos.`);
      app.quit();
      return;
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Archivo',
        submenu: [
          { label: 'Abrir carpeta de respaldos', click: () => shell.openPath((fs.mkdirSync(rutas().respaldos, { recursive: true }), rutas().respaldos)) },
          { label: 'Abrir carpeta de fotos', click: () => shell.openPath((fs.mkdirSync(rutas().fotos, { recursive: true }), rutas().fotos)) },
          { type: 'separator' },
          { role: 'quit', label: 'Salir' },
        ],
      },
      {
        label: 'Herramientas',
        submenu: [
          { label: 'Lector de facturas (PDF → Excel)', click: () => abrirHerramienta('lector') },
          { label: 'Cargador de productos (con el lector de códigos)', click: () => abrirHerramienta('cargador') },
          { type: 'separator' },
          { label: 'Vincular celular (Etiquetador)…', click: () => { if (ventana && !ventana.isDestroyed()) ventana.webContents.send('celular:abrir'); } },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { label: 'Agrandar', accelerator: 'CmdOrCtrl+Plus', click: () => cambiarZoom(0.1) },
          { label: 'Agrandar', accelerator: 'CmdOrCtrl+=', visible: false, acceleratorWorksWhenHidden: true, click: () => cambiarZoom(0.1) },
          { label: 'Achicar', accelerator: 'CmdOrCtrl+-', click: () => cambiarZoom(-0.1) },
          { label: 'Tamaño normal', accelerator: 'CmdOrCtrl+0', click: () => cambiarZoom(0) },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
        ],
      },
    ]));
    // Fotos que falten en esta PC y estén en Respaldos\Fotos o en la carpeta extra (PC nueva)
    try { traerFotosQueFaltan(); } catch (e) { /* nada */ }
    crearVentana();
    // Si el celular ya estaba vinculado, la PC lo vuelve a atender sola al abrir el programa
    try { if (claveCelular().activo) prenderCelular(); } catch (e) { anotarError('celular', 'No se pudo prender la conexión del celular', e); }
    // Respaldo del día unos segundos después de abrir, sin demorar el arranque
    setTimeout(() => hacerRespaldo(), 8000);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', respaldoAlCerrar);
  app.on('will-quit', () => { if (servidorCelular) servidorCelular.detener(); if (almacen) { try { almacen.cerrar(); } catch (e) { /* nada */ } almacen = null; } });
}

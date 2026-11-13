// Proceso principal de la versión de escritorio (Windows).
// Guarda los datos en una base SQLite y hace un respaldo comprimido por día,
// con copia opcional a una carpeta extra (pendrive o nube).
const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { promisify } = require('util');
const { pathToFileURL } = require('url');
const { Almacen } = require('./datos');
const { fotosEnUso, planLimpiezaFotos } = require('./fotos');

const RESPALDOS_A_CONSERVAR = 60;
const PATRON_RESPALDO = /^respaldo_\d{4}-\d{2}-\d{2}\.json(\.gz)?$/;
const CARPETA_EXTRA = 'Stock Ferreteria - Respaldos';
const gzip = promisify(zlib.gzip);

// Carpeta de datos propia y sin tildes. Con "Ferretería" en el nombre, Electron guardaba todo
// suelto en la raíz de AppData\Roaming; las versiones anteriores pueden tener datos.json ahí.
const APPDATA = app.getPath('appData');
app.setPath('userData', path.join(APPDATA, 'Stock Ferreteria'));

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
  almacen = new Almacen(r.datos);
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

function podar(carpeta) {
  const lista = fs.readdirSync(carpeta).filter((f) => PATRON_RESPALDO.test(f)).sort();
  lista.slice(0, Math.max(0, lista.length - RESPALDOS_A_CONSERVAR)).forEach((f) => {
    try { fs.unlinkSync(path.join(carpeta, f)); } catch (e) { /* nada */ }
  });
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
  } catch (e) { console.error('No se pudieron copiar las fotos:', e); }
}

/** Borra las fotos que ningún producto usa desde hace más días que los respaldos guardados. */
function limpiarFotos(textoDatos) {
  const enUso = fotosEnUso(textoDatos);
  if (!enUso) return;
  const r = rutas();
  const carpetas = [r.fotos, path.join(r.respaldos, 'Fotos'), carpetaFotosExtra()].filter((c) => c && fs.existsSync(c));
  const presentes = new Set(carpetas.flatMap((c) => fs.readdirSync(c).filter((f) => NOMBRE_FOTO.test(f))));
  const plan = planLimpiezaFotos(almacen.ajuste('fotosHuerfanas') || {}, enUso, presentes, Date.now(), RESPALDOS_A_CONSERVAR + 7);
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
    if (forzar || !fs.existsSync(archivo)) {
      const texto = almacen.leerJson();
      if (!texto) return null;
      const comprimido = await gzip(texto, { level: 6 });
      fs.writeFileSync(archivo + '.tmp', comprimido);
      fs.renameSync(archivo + '.tmp', archivo);
      podar(respaldos);
      almacen.ponerAjuste('ultimoRespaldo', { fecha: new Date().toISOString(), archivo });
      nuevo = true;
      try { limpiarFotos(texto); } catch (e) { console.error('No se pudieron limpiar las fotos:', e); }
    }
    respaldarFotos();
    const extra = almacen.ajuste('estadoExtra');
    const pendiente = !extra || !extra.ok || extra.dia !== hoy();
    if (nuevo || (pendiente && Date.now() - ultimoIntentoExtra > 10 * 60 * 1000)) copiarAExtra(archivo);
    return infoRespaldos();
  } catch (e) {
    console.error('No se pudo hacer el respaldo:', e);
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
    fs.writeFileSync(archivo + '.tmp', zlib.gzipSync(texto, { level: 3 }));
    fs.renameSync(archivo + '.tmp', archivo);
    podar(respaldos);
    almacen.ponerAjuste('ultimoRespaldo', { fecha: new Date().toISOString(), archivo });
    copiarAExtra(archivo);
  } catch (e) {
    console.error('No se pudo hacer el respaldo al cerrar:', e);
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

ipcMain.on('almacen:leer', (e) => {
  try {
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
      if (danada.tipo === 'base') {
        // La base misma no se puede leer: se cierra, se renombra y se empieza un archivo nuevo con la copia
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
    }
    almacen.aplicar(cambios);
    e.returnValue = null;
    // Al restaurar una copia completa, traer enseguida las fotos que use y falten en esta PC
    if (cambios && cambios.completo) setImmediate(() => { try { traerFotosQueFaltan(); } catch (err) { /* se reintenta en el respaldo */ } });
    const ult = almacen.ajuste('ultimoRespaldo');
    if (!ult || !String(ult.archivo || '').includes(hoy())) programarRespaldo();
  } catch (err) {
    e.returnValue = String(err.message || err);
  }
});
ipcMain.on('almacen:info', (e) => {
  const r = rutas();
  e.returnValue = { datos: r.datos, respaldos: r.respaldos, fotos: r.fotos, fotosUrl: pathToFileURL(r.fotos).href + '/', version: app.getVersion(), ...infoRespaldos() };
});
// Guarda una foto ya achicada por la pantalla (JPEG). Devuelve el nombre del archivo o { error }.
ipcMain.handle('fotos:guardar', async (e, nombre, bytes) => {
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
});
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
  if (!ventana || ventana.isDestroyed()) return { error: 'El programa no está abierto.' };
  try { return await ventana.webContents.executeJavaScript(codigo); } catch (err) { return { error: 'El programa no respondió.' }; }
}
ipcMain.handle('herramienta:estantes', (e) => (esHerramienta(e) ? preguntarAlPrograma('estantesParaHerramienta()') : null));
ipcMain.handle('herramienta:buscarProducto', (e, codigo) => (esHerramienta(e) ? preguntarAlPrograma(`productoParaHerramienta(${JSON.stringify(String(codigo || '').slice(0, 80))})`) : null));
ipcMain.handle('herramienta:buscarProductos', (e, texto) => (esHerramienta(e) ? preguntarAlPrograma(`productosParaHerramienta(${JSON.stringify(String(texto || '').slice(0, 80))})`) : []));
ipcMain.handle('herramienta:nuevoEstante', (e, x) => {
  if (!esHerramienta(e)) return { error: 'No permitido.' };
  const datos = { codigo: String((x && x.codigo) || '').slice(0, 60), categoria: String((x && x.categoria) || '').slice(0, 60) };
  return preguntarAlPrograma(`nuevoEstanteDesdeHerramienta(${JSON.stringify(datos)})`);
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
  ventana.webContents.session.on('will-download', (e, item) => {
    const destino = dialog.showSaveDialogSync(ventana, {
      defaultPath: path.join(app.getPath('documents'), item.getFilename()),
    });
    if (destino) item.setSavePath(destino); else item.cancel();
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
    // Respaldo del día unos segundos después de abrir, sin demorar el arranque
    setTimeout(() => hacerRespaldo(), 8000);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', respaldoAlCerrar);
  app.on('will-quit', () => { if (almacen) { try { almacen.cerrar(); } catch (e) { /* nada */ } almacen = null; } });
}

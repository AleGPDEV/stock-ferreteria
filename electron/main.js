// Proceso principal de la versión de escritorio (Windows).
// Guarda los datos en una base SQLite y hace un respaldo comprimido por día,
// con copia opcional a una carpeta extra (pendrive o nube).
const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const { execSync } = require('child_process');
const { Almacen } = require('./datos');

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
    }
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

/* ---------- Identificador de la computadora ---------- */

// El MachineGuid de Windows (cambia solo si se reinstala Windows)
let idEquipo = '';
function calcularIdEquipo() {
  if (idEquipo) return idEquipo;
  let base = '';
  if (process.platform === 'win32') {
    try {
      const salida = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const m = salida.match(/MachineGuid\s+REG_SZ\s+([\w-]+)/i);
      if (m) base = m[1];
    } catch (e) { /* se usa el respaldo de abajo */ }
  }
  if (!base) base = [os.hostname(), os.platform(), (os.cpus()[0] || {}).model || ''].join('|');
  idEquipo = crypto.createHash('sha256').update('stock-ferreteria|' + base.toLowerCase()).digest('hex');
  return idEquipo;
}

/* ---------- Comunicación con la pantalla ---------- */

ipcMain.on('almacen:idEquipo', (e) => { e.returnValue = calcularIdEquipo(); });
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
    const ult = almacen.ajuste('ultimoRespaldo');
    if (!ult || !String(ult.archivo || '').includes(hoy())) programarRespaldo();
  } catch (err) {
    e.returnValue = String(err.message || err);
  }
});
ipcMain.on('almacen:info', (e) => {
  const r = rutas();
  e.returnValue = { datos: r.datos, respaldos: r.respaldos, version: app.getVersion(), ...infoRespaldos() };
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
          { type: 'separator' },
          { role: 'quit', label: 'Salir' },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'zoomIn', label: 'Agrandar' },
          { role: 'zoomOut', label: 'Achicar' },
          { role: 'resetZoom', label: 'Tamaño normal' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
        ],
      },
    ]));
    crearVentana();
    // Respaldo del día unos segundos después de abrir, sin demorar el arranque
    setTimeout(() => hacerRespaldo(), 8000);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', respaldoAlCerrar);
  app.on('will-quit', () => { if (almacen) { try { almacen.cerrar(); } catch (e) { /* nada */ } almacen = null; } });
}

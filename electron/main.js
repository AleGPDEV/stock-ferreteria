// Proceso principal de la versión de escritorio (Windows).
// Guarda los datos en un archivo JSON y hace un respaldo automático por día.
const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const RESPALDOS_A_CONSERVAR = 60;

let ventana = null;

function rutas() {
  const datos = path.join(app.getPath('userData'), 'datos.json');
  const respaldos = path.join(app.getPath('documents'), 'Stock Ferreteria', 'Respaldos');
  return { datos, respaldos };
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function leerDatos() {
  const { datos } = rutas();
  for (const archivo of [datos, datos + '.bak']) {
    try {
      const texto = fs.readFileSync(archivo, 'utf8');
      JSON.parse(texto); // valida
      return texto;
    } catch (e) { /* probar el siguiente */ }
  }
  return null;
}

// Escritura segura: se escribe a un temporal y se reemplaza, conservando la versión anterior en .bak
function guardarDatos(texto) {
  const { datos } = rutas();
  fs.mkdirSync(path.dirname(datos), { recursive: true });
  const tmp = datos + '.tmp';
  fs.writeFileSync(tmp, texto, 'utf8');
  if (fs.existsSync(datos)) fs.copyFileSync(datos, datos + '.bak');
  fs.renameSync(tmp, datos);
  respaldoDiario(texto);
}

function respaldoDiario(texto) {
  try {
    const { respaldos } = rutas();
    fs.mkdirSync(respaldos, { recursive: true });
    const archivo = path.join(respaldos, `respaldo_${hoy()}.json`);
    fs.writeFileSync(archivo, texto, 'utf8'); // el respaldo del día se actualiza con el último estado
    const viejos = fs.readdirSync(respaldos).filter((f) => /^respaldo_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    viejos.slice(0, Math.max(0, viejos.length - RESPALDOS_A_CONSERVAR)).forEach((f) => fs.unlinkSync(path.join(respaldos, f)));
  } catch (e) {
    console.error('No se pudo hacer el respaldo diario:', e);
  }
}

ipcMain.on('almacen:leer', (e) => { e.returnValue = leerDatos(); });
ipcMain.on('almacen:guardar', (e, texto) => {
  try { guardarDatos(texto); e.returnValue = null; } catch (err) { e.returnValue = String(err.message || err); }
});
ipcMain.on('almacen:info', (e) => { e.returnValue = { ...rutas(), version: app.getVersion() }; });
ipcMain.handle('almacen:abrirRespaldos', async () => {
  const { respaldos } = rutas();
  fs.mkdirSync(respaldos, { recursive: true });
  return shell.openPath(respaldos);
});

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
          { role: 'reload', label: 'Recargar' },
          { role: 'zoomIn', label: 'Agrandar' },
          { role: 'zoomOut', label: 'Achicar' },
          { role: 'resetZoom', label: 'Tamaño normal' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
          { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        ],
      },
    ]));
    crearVentana();
  });
  app.on('window-all-closed', () => app.quit());
}

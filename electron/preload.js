// Puente seguro entre la página y el disco. La página solo ve window.almacen.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('almacen', {
  escritorio: true,
  leer: () => ipcRenderer.sendSync('almacen:leer'),
  // Guarda solo lo que cambió (ver calcularCambios en js/app.js). Devuelve un error o null.
  cambios: (c) => ipcRenderer.sendSync('almacen:cambios', c),
  info: () => ipcRenderer.sendSync('almacen:info'),
  abrirRespaldos: () => ipcRenderer.invoke('almacen:abrirRespaldos'),
  elegirCarpetaExtra: () => ipcRenderer.invoke('almacen:elegirCarpetaExtra'),
  quitarCarpetaExtra: () => ipcRenderer.invoke('almacen:quitarCarpetaExtra'),
  respaldarAhora: () => ipcRenderer.invoke('almacen:respaldarAhora'),
  guardarFoto: (nombre, bytes) => ipcRenderer.invoke('fotos:guardar', nombre, bytes),
  reparar: () => ipcRenderer.sendSync('almacen:reparar'),
  marcarDanada: () => ipcRenderer.sendSync('almacen:marcarDanada'),
  // Tamaño de letra: zoom real de la ventana, para que toda la pantalla se acomode
  zoom: (factor) => webFrame.setZoomFactor(Math.min(2, Math.max(0.8, Number(factor) || 1))),
});

// Puente seguro entre la página y el disco. La página solo ve window.almacen.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('almacen', {
  escritorio: true,
  leer: () => ipcRenderer.sendSync('almacen:leer'),
  guardar: (texto) => ipcRenderer.sendSync('almacen:guardar', texto),
  info: () => ipcRenderer.sendSync('almacen:info'),
  idEquipo: () => ipcRenderer.sendSync('almacen:idEquipo'),
  abrirRespaldos: () => ipcRenderer.invoke('almacen:abrirRespaldos'),
  // Tamaño de letra: zoom real de la ventana, para que toda la pantalla se acomode
  zoom: (factor) => webFrame.setZoomFactor(Math.min(2, Math.max(0.8, Number(factor) || 1))),
});

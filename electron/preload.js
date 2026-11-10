// Puente seguro entre la página y el disco. La página solo ve window.almacen.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('almacen', {
  escritorio: true,
  leer: () => ipcRenderer.sendSync('almacen:leer'),
  guardar: (texto) => ipcRenderer.sendSync('almacen:guardar', texto),
  info: () => ipcRenderer.sendSync('almacen:info'),
  abrirRespaldos: () => ipcRenderer.invoke('almacen:abrirRespaldos'),
});

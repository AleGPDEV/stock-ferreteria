// Puente de las herramientas (Cargador de productos) con el programa abierto.
// Solo los estantes: leerlos y crear uno nuevo. Nada más de los datos del programa.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('programa', {
  estantes: () => ipcRenderer.invoke('herramienta:estantes'),
  nuevoEstante: (codigo, categoria) => ipcRenderer.invoke('herramienta:nuevoEstante', { codigo: String(codigo || ''), categoria: String(categoria || '') }),
});

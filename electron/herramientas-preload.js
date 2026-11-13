// Puente de las herramientas (Cargador de productos) con el programa abierto.
// Los estantes (leerlos y crear uno) y buscar productos ya cargados (nombre, códigos, precio y stock), solo para leer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('programa', {
  estantes: () => ipcRenderer.invoke('herramienta:estantes'),
  buscarProducto: (codigo) => ipcRenderer.invoke('herramienta:buscarProducto', String(codigo || '')),
  buscarProductos: (texto) => ipcRenderer.invoke('herramienta:buscarProductos', String(texto || '')),
  nuevoEstante: (codigo, categoria) => ipcRenderer.invoke('herramienta:nuevoEstante', { codigo: String(codigo || ''), categoria: String(categoria || '') }),
});

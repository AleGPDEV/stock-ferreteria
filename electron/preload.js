// Puente seguro entre la página y el disco. La página solo ve window.almacen.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('almacen', {
  escritorio: true,
  leer: () => ipcRenderer.sendSync('almacen:leer'),
  // Guarda solo lo que cambió (ver calcularCambios en js/base/datos-y-guardado.js). Devuelve un error o null.
  cambios: (c) => ipcRenderer.sendSync('almacen:cambios', c),
  info: () => ipcRenderer.sendSync('almacen:info'),
  abrirRespaldos: () => ipcRenderer.invoke('almacen:abrirRespaldos'),
  elegirCarpetaExtra: () => ipcRenderer.invoke('almacen:elegirCarpetaExtra'),
  quitarCarpetaExtra: () => ipcRenderer.invoke('almacen:quitarCarpetaExtra'),
  respaldarAhora: () => ipcRenderer.invoke('almacen:respaldarAhora'),
  guardarFoto: (nombre, bytes) => ipcRenderer.invoke('fotos:guardar', nombre, bytes),
  impresoras: () => ipcRenderer.invoke('etiquetadora:impresoras'),
  imprimirEtiquetadora: (impresora, tspl) => ipcRenderer.invoke('etiquetadora:imprimir', impresora, tspl),
  abrirHerramienta: (nombre) => ipcRenderer.send('herramienta:abrir', nombre),
  // App del celular por WiFi: estado, prender/apagar, código nuevo, y el menú Herramientas → Vincular celular
  celular: () => ipcRenderer.invoke('celular:info'),
  activarCelular: () => ipcRenderer.invoke('celular:activar'),
  desactivarCelular: () => ipcRenderer.invoke('celular:desactivar'),
  nuevoCodigoCelular: () => ipcRenderer.invoke('celular:nuevoCodigo'),
  alAbrirCelular: (fn) => { ipcRenderer.on('celular:abrir', () => fn()); },
  reparar: () => ipcRenderer.sendSync('almacen:reparar'),
  marcarDanada: () => ipcRenderer.sendSync('almacen:marcarDanada'),
});

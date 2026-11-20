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
  // Si el respaldo del día falla (no se pudo escribir o quedó mal), la PC avisa
  // Si el chequeo diario encuentra el archivo de la base dañado, la PC avisa (se muestra la pantalla de datos dañados)
  alDanarBase: (fn) => { ipcRenderer.on('base:danada', (e, info) => fn(info)); },
  alFallarRespaldo: (fn) => { ipcRenderer.on('respaldo:fallo', (e, estado) => fn(estado)); },
  // Registro de errores (registro.log): anotar desde la pantalla y copiar el informe para soporte
  anotar: (nivel, area, mensaje, detalle) => ipcRenderer.send('registro:anotar', nivel, area, mensaje, detalle),
  copiarInforme: () => ipcRenderer.invoke('registro:copiarInforme'),
  reparar: () => ipcRenderer.sendSync('almacen:reparar'),
  marcarDanada: () => ipcRenderer.sendSync('almacen:marcarDanada'),
});

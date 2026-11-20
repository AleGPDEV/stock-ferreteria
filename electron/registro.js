// Registro de errores en un archivo de texto (registro.log en la carpeta de datos).
// Sirve para saber qué pasó cuando algo falla en el local: el botón "Copiar informe para soporte"
// (Configuración → Copias de seguridad) copia las últimas líneas.
// Funciones puras y con fs inyectable para poder probarlas sin abrir el programa.
'use strict';
const fs = require('fs');
const path = require('path');

const TOPE_ARCHIVO = 2 * 1024 * 1024; // al pasar los 2 MB se rota a registro.1.log
const LARGO_LINEA = 2000;
const NIVELES = ['INFO', 'AVISO', 'ERROR'];

const dos = (n) => String(n).padStart(2, '0');
function fechaRegistro(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

/** Texto de un error o de cualquier valor, en una sola línea. */
function textoDe(x) {
  if (x == null) return '';
  if (x instanceof Error) return x.stack || `${x.name}: ${x.message}`;
  if (typeof x === 'object') { try { return JSON.stringify(x); } catch (e) { return String(x); } }
  return String(x);
}
const unaLinea = (t) => String(t).replace(/\s*[\r\n]+\s*/g, ' ⏎ ').replace(/\s+/g, ' ').trim();

/** "2026-11-19 22:58:01 ERROR guardado: mensaje | detalle", siempre en una línea y con largo máximo. */
function lineaRegistro(fecha, nivel, area, mensaje, detalle) {
  const n = NIVELES.includes(nivel) ? nivel : 'INFO';
  let texto = `${fechaRegistro(fecha)} ${n} ${unaLinea(area || 'programa')}: ${unaLinea(textoDe(mensaje))}`;
  const det = unaLinea(textoDe(detalle));
  if (det) texto += ` | ${det}`;
  if (texto.length > LARGO_LINEA) texto = texto.slice(0, LARGO_LINEA - 1) + '…';
  return texto;
}

/** Últimas `cuantas` líneas, juntando el archivo viejo y el actual. */
function ultimasLineas(textoViejo, textoActual, cuantas = 200) {
  const lineas = [textoViejo, textoActual].flatMap((t) => String(t || '').split(/\r?\n/)).filter((l) => l.trim());
  return lineas.slice(-cuantas);
}

/** Crea el registro para una carpeta. Nunca tira errores: si no puede escribir, sigue sin anotar. */
function crearRegistro(carpeta, opciones = {}) {
  const sistema = opciones.fs || fs;
  const ahora = opciones.ahora || (() => new Date());
  const tope = opciones.tope || TOPE_ARCHIVO;
  const actual = path.join(carpeta, 'registro.log');
  const viejo = path.join(carpeta, 'registro.1.log');
  const leer = (a) => { try { return sistema.readFileSync(a, 'utf8'); } catch (e) { return ''; } };

  function anotar(nivel, area, mensaje, detalle) {
    try {
      const linea = lineaRegistro(ahora(), nivel, area, mensaje, detalle) + '\n';
      sistema.mkdirSync(carpeta, { recursive: true });
      let tam = 0;
      try { tam = sistema.statSync(actual).size; } catch (e) { /* todavía no existe */ }
      if (tam && tam + Buffer.byteLength(linea) > tope) {
        try { sistema.unlinkSync(viejo); } catch (e) { /* no había */ }
        sistema.renameSync(actual, viejo);
      }
      sistema.appendFileSync(actual, linea);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    archivo: actual,
    anotar,
    info: (area, mensaje, detalle) => anotar('INFO', area, mensaje, detalle),
    aviso: (area, mensaje, detalle) => anotar('AVISO', area, mensaje, detalle),
    error: (area, mensaje, detalle) => anotar('ERROR', area, mensaje, detalle),
    ultimas: (cuantas = 200) => ultimasLineas(leer(viejo), leer(actual), cuantas),
  };
}

/** Texto para pegar en un mensaje a soporte: encabezado y últimas líneas. */
function informeSoporte({ version, sistema, fecha, lineas }) {
  const cab = [
    'Stock Ferretería — informe para soporte',
    `Versión: ${version || '?'}`,
    `Sistema: ${sistema || '?'}`,
    `Fecha: ${fechaRegistro(fecha || new Date())}`,
    '',
  ];
  const cuerpo = lineas && lineas.length ? lineas : ['(El registro está vacío: no se anotó ningún error.)'];
  return cab.concat(cuerpo).join('\n');
}

module.exports = { crearRegistro, lineaRegistro, ultimasLineas, informeSoporte, fechaRegistro, TOPE_ARCHIVO, LARGO_LINEA };

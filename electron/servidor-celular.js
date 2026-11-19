// Servidor para la app del celular (Etiquetador) en el WiFi del local.
// Todo pedido pasa por la pantalla del programa (preguntar), que es la dueña de los datos:
// nunca se lee ni se escribe SQLite por fuera de ella, así un guardado de la pantalla no pisa nada.
// En esta etapa es SOLO LECTURA: estado, buscar un producto por código o por nombre, y los estantes.
// Usa solo http y crypto de Node, sin dependencias.
const http = require('http');
const crypto = require('crypto');
const os = require('os');

const PUERTO = 8765;
const MAX_TEXTO = 80;

/** Un código nuevo para vincular celulares (24 bytes al azar). Cambiarlo desvincula a todos. */
const nuevoToken = () => crypto.randomBytes(24).toString('base64url');
const nuevoPcId = () => crypto.randomUUID();

/** Direcciones IPv4 de esta PC en la red del local (primero las de casa y oficina: 192.168…, 10…, 172.16-31…). */
function ipsLocales(interfaces = os.networkInterfaces()) {
  const privada = (ip) => /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const lista = [];
  for (const [nombre, dirs] of Object.entries(interfaces || {})) {
    for (const d of dirs || []) {
      const v4 = d && (d.family === 'IPv4' || d.family === 4);
      if (!v4 || d.internal || /^169\.254\./.test(d.address)) continue;
      // Adaptadores virtuales (VirtualBox, VMware, Hyper-V, WSL) no los ve el celular: van al final
      const virtual = /virtual|vmware|vbox|hyper-v|vethernet|wsl|docker|loopback/i.test(nombre);
      lista.push({ ip: d.address, orden: (privada(d.address) ? 0 : 2) + (virtual ? 1 : 0) });
    }
  }
  return [...new Set(lista.sort((a, b) => a.orden - b.orden).map((x) => x.ip))];
}

/** Lo que va en el QR de vinculación: el celular prueba las direcciones y se queda con la que responde con este pcId. */
function datosVinculo({ token, pcId }, ips = ipsLocales(), puerto = PUERTO) {
  return { t: 'stock-ferreteria', v: 1, urls: ips.map((ip) => `http://${ip}:${puerto}`), token, pcId };
}

/**
 * clave(): { token, pcId } vigentes (se leen en cada pedido, así cambiar el token desvincula enseguida).
 * preguntar(js): corre una función de la pantalla y devuelve su resultado (o { error }).
 */
function crearServidorCelular({ clave, preguntar, version = '', puerto = PUERTO, host = '0.0.0.0' }) {
  let servidor = null;
  let ultimoPedido = null; // { fecha, ip } del último celular que pidió algo bien
  const texto = (v) => JSON.stringify(String(v == null ? '' : v).slice(0, MAX_TEXTO));

  const autorizado = (req) => {
    const { token } = clave() || {};
    if (!token) return false;
    const h = String(req.headers.authorization || '');
    const dada = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
    const buena = Buffer.from(token);
    return dada.length === buena.length && crypto.timingSafeEqual(dada, buena);
  };
  const responder = (res, estado, cuerpo) => {
    res.writeHead(estado, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      // Para probar la app en el navegador de la PC; sin el código de vinculación igual no se lee nada
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    res.end(JSON.stringify(cuerpo == null ? null : cuerpo));
  };
  /** Lo que devuelve la pantalla: { error } si el programa no está abierto o no respondió. */
  const deLaPantalla = async (res, js) => {
    const r = await preguntar(js);
    if (!r || typeof r !== 'object') return responder(res, 503, { error: 'El programa no respondió.' });
    if (r.error) return responder(res, 503, { error: r.error });
    return responder(res, 200, r);
  };

  async function atender(req, res) {
    try {
      if (req.method === 'OPTIONS') return responder(res, 204, null);
      if (!autorizado(req)) return responder(res, 401, { error: 'Este celular no está vinculado con la PC. Escaneá el código QR de nuevo.' });
      if (req.method !== 'GET') return responder(res, 405, { error: 'Por ahora el celular solo puede consultar.' });
      const { pathname, searchParams } = new URL(req.url, 'http://local');
      ultimoPedido = { fecha: new Date().toISOString(), ip: String(req.socket.remoteAddress || '').replace(/^::ffff:/, '') };
      const { pcId } = clave() || {};
      switch (pathname) {
        case '/api/estado': {
          const r = await preguntar('estadoParaCelular()');
          const listo = !!(r && !r.error && r.listo);
          return responder(res, 200, { pcId, nombre: 'Stock Ferretería', version, listo, productos: listo ? r.productos : null, aviso: listo ? '' : (r && r.error) || 'El programa no está listo.' });
        }
        case '/api/producto': return deLaPantalla(res, `productoParaCelular(${texto(searchParams.get('codigo'))})`);
        case '/api/productos': return deLaPantalla(res, `productosParaCelular(${texto(searchParams.get('q'))})`);
        case '/api/estantes': return deLaPantalla(res, 'estantesParaCelular()');
        default: return responder(res, 404, { error: 'No existe.' });
      }
    } catch (err) {
      return responder(res, 400, { error: String((err && err.message) || err) });
    }
  }

  return {
    /** Abre el puerto. Devuelve null si quedó escuchando, o un texto con el problema. */
    iniciar() {
      if (servidor) return Promise.resolve(null);
      return new Promise((ok) => {
        const s = http.createServer(atender);
        s.requestTimeout = 10000;
        s.headersTimeout = 8000;
        s.keepAliveTimeout = 5000;
        s.once('error', (e) => {
          ok(e && e.code === 'EADDRINUSE'
            ? `El puerto ${puerto} lo está usando otro programa. Cerralo o reiniciá la PC.`
            : `No se pudo abrir la conexión para el celular (${(e && (e.code || e.message)) || 'error'}).`);
        });
        s.listen(puerto, host, () => { servidor = s; s.on('error', (e) => console.error('Servidor del celular:', e.message)); ok(null); });
      });
    },
    detener() {
      if (!servidor) return Promise.resolve();
      const s = servidor;
      servidor = null;
      return new Promise((ok) => { s.close(() => ok()); if (s.closeAllConnections) s.closeAllConnections(); });
    },
    get activo() { return !!servidor; },
    get ultimoPedido() { return ultimoPedido; },
    get puerto() { return servidor ? servidor.address().port : puerto; },
  };
}

module.exports = { crearServidorCelular, ipsLocales, datosVinculo, nuevoToken, nuevoPcId, PUERTO };

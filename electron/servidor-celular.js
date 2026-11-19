// Servidor para la app del celular (Etiquetador) en el WiFi del local.
// Todo pedido pasa por la pantalla del programa (preguntar), que es la dueña de los datos:
// nunca se lee ni se escribe SQLite por fuera de ella, así un guardado de la pantalla no pisa nada.
// Consultas: estado, buscar un producto por código o por nombre, estantes y el próximo código libre del celular.
// Escrituras (fase 2): producto nuevo, conteo de uno que ya existe y foto de un producto. Los estantes NO: se crean
// solo en la PC (el celular elige de la lista que le manda la PC). Son idempotentes (el celular
// manda un id propio): si el WiFi se corta y reintenta, no se duplica nada.
// Usa solo http y crypto de Node, sin dependencias.
const http = require('http');
const crypto = require('crypto');
const os = require('os');

const PUERTO = 8765;
const MAX_TEXTO = 80;
const MAX_CUERPO = 32 * 1024;
// Una foto: el celular la achica a ~900 px (unos 150 KB); en base64 ocupa un tercio más
const MAX_FOTO = 3 * 1024 * 1024;
const MAX_CUERPO_FOTO = Math.ceil(MAX_FOTO * 4 / 3) + 4096;

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
/**
 * guardarFoto(nombre, bytes): guarda el JPEG en la carpeta Fotos y devuelve { nombre } o { error }.
 * borrarFoto(nombre): la borra si al final no se usó.
 */
function crearServidorCelular({ clave, preguntar, version = '', puerto = PUERTO, host = '0.0.0.0', guardarFoto = null, borrarFoto = () => {} }) {
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
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify(cuerpo == null ? null : cuerpo));
  };
  /** Lo que devuelve la pantalla. 503: el programa no está abierto o no está listo; 422: el pedido no se pudo hacer (el celular muestra el motivo). */
  const deLaPantalla = async (res, js) => {
    const r = await preguntar(js);
    if (!r || typeof r !== 'object') return responder(res, 503, { error: 'El programa no respondió.' });
    if (r.error) return responder(res, r.sinPrograma || r.noListo ? 503 : 422, r);
    return responder(res, 200, r);
  };
  const leerCuerpo = (req, max = MAX_CUERPO) => new Promise((ok, mal) => {
    let largo = 0;
    const partes = [];
    // Si es demasiado grande se deja de juntar, pero se lee hasta el final para poder contestar
    req.on('data', (c) => { largo += c.length; if (largo <= max) partes.push(c); });
    req.on('end', () => {
      if (largo > max) { mal(new Error(max > MAX_CUERPO ? 'La foto es demasiado grande.' : 'El pedido es demasiado grande.')); return; }
      try {
        const v = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        ok(v);
      } catch (e) { mal(new Error('El pedido no se entiende.')); }
    });
    req.on('error', mal);
  });
  // Solo estos campos pasan a la pantalla, y como texto JSON (nunca se arma código con lo que manda el celular)
  const CAMPOS = ['idCelular', 'conteoId', 'equipo', 'productoId', 'codigo', 'barras', 'barra', 'nombre', 'precio', 'moneda', 'unidad', 'proveedor', 'minimo', 'categoria', 'ubicacion', 'cantidad', 'contado', 'hace'];
  const limpio = (x) => {
    const o = {};
    for (const k of CAMPOS) {
      if (x[k] == null) continue;
      if (k === 'barras') o[k] = (Array.isArray(x[k]) ? x[k] : []).slice(0, 20).map((b) => String(b).slice(0, MAX_TEXTO));
      else o[k] = typeof x[k] === 'number' ? x[k] : String(x[k]).slice(0, 120);
    }
    return o;
  };

  /** Foto de un producto: se guarda el archivo y después la pantalla se la asigna al producto. */
  async function recibirFoto(req, res) {
    if (!guardarFoto) return responder(res, 404, { error: 'Esta PC no guarda fotos.' });
    const x = await leerCuerpo(req, MAX_CUERPO_FOTO);
    const b64 = String(x.imagen || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return responder(res, 400, { error: 'La foto no se entiende.' });
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length < 100 || bytes.length > MAX_FOTO || bytes[0] !== 0xff || bytes[1] !== 0xd8) return responder(res, 400, { error: 'La foto tiene que ser un JPEG de hasta 3 MB.' });
    ultimoPedido = { fecha: new Date().toISOString(), ip: String(req.socket.remoteAddress || '').replace(/^::ffff:/, '') };
    const nombre = `cel-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`;
    const g = await guardarFoto(nombre, bytes);
    if (!g || g.error) return responder(res, 500, { error: `No se pudo guardar la foto en la PC${g && g.error ? `: ${g.error}` : '.'}` });
    const datos = limpio(x);
    datos.foto = g.nombre;
    const r = await preguntar(`fotoDesdeCelular(${JSON.stringify(datos)})`);
    if (!r || typeof r !== 'object' || r.error) borrarFoto(g.nombre); // no quedó en ningún producto
    if (!r || typeof r !== 'object') return responder(res, 503, { error: 'El programa no respondió.' });
    if (r.error) return responder(res, r.sinPrograma || r.noListo ? 503 : 422, r);
    return responder(res, 200, r);
  }

  async function atender(req, res) {
    try {
      if (req.method === 'OPTIONS') return responder(res, 204, null);
      if (!autorizado(req)) return responder(res, 401, { error: 'Este celular no está vinculado con la PC. Escaneá el código QR de nuevo.' });
      const { pathname, searchParams } = new URL(req.url, 'http://local');
      if (req.method === 'POST' && pathname === '/api/fotos') return recibirFoto(req, res);
      if (req.method === 'POST') {
        const fn = { '/api/productos': 'productoDesdeCelular', '/api/conteos': 'conteoDesdeCelular' }[pathname];
        if (!fn) return responder(res, 404, { error: 'No existe.' });
        const cuerpo = limpio(await leerCuerpo(req));
        ultimoPedido = { fecha: new Date().toISOString(), ip: String(req.socket.remoteAddress || '').replace(/^::ffff:/, '') };
        return deLaPantalla(res, `${fn}(${JSON.stringify(cuerpo)})`);
      }
      if (req.method !== 'GET') return responder(res, 405, { error: 'No se puede.' });
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
        case '/api/codigo-libre': return deLaPantalla(res, `codigoLibreParaCelular(${texto(searchParams.get('equipo'))})`);
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

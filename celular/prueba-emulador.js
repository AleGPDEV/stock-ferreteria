// Prueba de la app instalada en un emulador de Android (la corre GitHub, en «Probar la app en un emulador»).
// Entra a la página de la app (WebView) con Playwright y revisa que la impresora Bluetooth (complemento propio),
// los ajustes, cargar un producto y armar el Excel funcionen de verdad en Android.
const { _android: android } = require('playwright');
const { crearServidorCelular } = require('../electron/servidor-celular.js');
const app = require('../js/cargar-en-node.js');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Una PC de prueba: el servidor de verdad y las funciones de verdad del programa (js/, cargadas con js/cargar-en-node.js), con datos de prueba.
// El emulador la ve en 10.0.2.2.
const d = app.baseVacia();
d.productos.push({ id: 'a', codigo: 'MAR-16', barras: ['7790001112223'], nombre: 'Martillo 16 oz', categoria: 'Herramientas', unidad: 'unidad', proveedorId: '', ubicacion: 'B-9', costo: 390, precio: 620, minimo: 2, stock: 7 });
app.guardarEstante(d, { codigo: 'B-9', categoria: 'Herramientas' });
app.guardarEstante(d, { codigo: 'C-1', categoria: 'Herramientas' });
const pantalla = {
  estadoParaCelular: () => ({ listo: true, productos: d.productos.length }), productoParaCelular: (c) => app.productoCelular(d, c), productosParaCelular: (q) => app.productosCelular(d, q), estantesParaCelular: () => app.estantesCelular(d),
  productoDesdeCelular: (x) => app.altaDesdeCelularEn(d, x), conteoDesdeCelular: (x) => app.conteoDesdeCelularEn(d, x), codigoLibreParaCelular: (e) => app.codigoLibreCelular(d, e),
  fotoDesdeCelular: (x) => app.fotoDesdeCelularEn(d, x),
  moverDesdeCelular: (x) => app.moverDesdeCelularEn(d, x),
};
const fotosRecibidas = new Map();
const pantallaDePrueba = async (js) => Function(...Object.keys(pantalla), `return ${js}`)(...Object.values(pantalla));
const pcDePrueba = crearServidorCelular({ clave: () => ({ token: 'token-de-prueba', pcId: 'pc-de-prueba' }), preguntar: pantallaDePrueba, version: 'prueba', guardarFoto: (nombre, bytes) => { fotosRecibidas.set(nombre, bytes.length); return { nombre }; } });
(async () => {
  const errPC = await pcDePrueba.iniciar();
  if (errPC) throw new Error(errPC);
  console.log('Buscando el emulador…');
  const [device] = await android.devices({ omitDriverInstall: true });
  if (!device) throw new Error('No hay emulador');
  console.log('Emulador:', device.model());
  await device.shell('am start -n uy.grupomuros.etiquetador/.MainActivity');
  await espera(8000);
  console.log('WebViews:', JSON.stringify(device.webViews().map((w) => w.pkg())));
  const webview = await device.webView({ pkg: 'uy.grupomuros.etiquetador' }, { timeout: 60000 });
  console.log('WebView encontrada');
  const page = await webview.page();
  // En el emulador, el toque de Playwright cae unos píxeles más arriba: los botones se aprietan directo.
  const tocar = (sel) => page.$eval(sel, (b) => b.click());
  await page.waitForSelector('#sin-codigo', { timeout: 30000 });
  console.log('Página cargada');
  const r = {};
  r.plugins = await page.evaluate(() => Object.keys((window.Capacitor && window.Capacitor.Plugins) || {}).filter((k) => /Impresora|Filesystem|Share|BarcodeScanner/.test(k)));
  r.camara = await page.evaluate(async () => { try { return await window.Capacitor.Plugins.BarcodeScanner.isSupported(); } catch (e) { return 'error: ' + e.message; } });
  r.ajustesAbiertos = await page.evaluate(() => document.getElementById('dlg-ajustes').open);
  // Bluetooth: en el emulador no hay, pero el complemento tiene que contestar (no colgarse)
  r.listar = await page.evaluate(async () => { try { return await window.Capacitor.Plugins.ImpresoraBT.listar(); } catch (e) { return 'error: ' + e.message; } });
  r.estado = await page.evaluate(async () => window.Capacitor.Plugins.ImpresoraBT.estado());
  // Ajustes; sin la PC no se puede cargar nada
  await page.fill('#aj-equipo', 'c1');
  await tocar('#aj-guardar');
  r.bloqueadoSinPC = await page.evaluate(() => document.getElementById('sin-codigo').disabled);
  // La PC por WiFi: el pedido http:// sin cifrar tiene que salir por CapacitorHttp (no lo bloquea Android)
  r.http = await page.evaluate(async () => { try { const x = await window.Capacitor.Plugins.CapacitorHttp.get({ url: 'http://10.0.2.2:8765/api/estado', connectTimeout: 3000, readTimeout: 3000 }); return x.status; } catch (e) { return 'error: ' + e.message; } });
  r.pc = await page.evaluate(async () => {
    datos.pc = { urls: ['http://10.0.2.3:8765', 'http://10.0.2.2:8765'], url: 'http://10.0.2.3:8765', token: 'token-de-prueba', pcId: 'pc-de-prueba' };
    await revisarPC(); // la primera dirección no responde: tiene que encontrar la segunda
    await new Promise((ok) => setTimeout(ok, 1500)); // los estantes llegan aparte
    return { estado: pc.estado, url: datos.pc.url, estantes: datos.estantes.map((e) => e.codigo), habilitado: !document.getElementById('sin-codigo').disabled };
  });
  // Producto sin código: el código lo da la PC y se guarda en la PC (POST por CapacitorHttp)
  await tocar('#sin-codigo');
  await page.waitForSelector('#form:not([hidden])', { timeout: 15000 });
  r.codigo = await page.textContent('#form-codigo');
  // Los estantes vienen solo de la PC: la ficha no ofrece crear uno y la lista es la de la PC
  r.estantesFicha = await page.evaluate(() => [...document.querySelectorAll('#c-estante option')].map((o) => o.value).filter(Boolean));
  await page.fill('#c-nombre', 'Arandela plana 8 mm');
  await page.fill('#c-precio', '5');
  await page.fill('#c-cantidad', '12');
  await tocar('#btn-solo-guardar');
  await page.waitForFunction(() => document.getElementById('form').hidden, null, { timeout: 15000 });
  const nuevo = d.productos.find((p) => p.codigo === 'C1-0001');
  r.enLaPC = nuevo ? { nombre: nuevo.nombre, stock: nuevo.stock, revisar: nuevo.revisar, creadoPor: nuevo.creadoPor } : null;
  r.lista = await page.textContent('#lista');
  // Imprimir sin impresora: tiene que avisar, no colgarse
  await tocar('[data-etq]');
  await tocar('#di-imprimir');
  await espera(1500);
  r.errorImprimir = await page.textContent('#di-err');
  await tocar('#di-cerrar');
  // Contar un producto que ya estaba en el programa
  await page.evaluate(() => codigoEscrito('7790001112223'));
  await page.waitForSelector('#form:not([hidden])', { timeout: 15000 });
  r.existente = await page.evaluate(() => document.getElementById('form-titulo').textContent + ' | ' + document.getElementById('estado').textContent + ' | solo lectura: ' + document.getElementById('c-precio').readOnly);
  await page.fill('#c-cantidad', '3');
  await tocar('#btn-solo-guardar');
  await page.waitForFunction(() => document.getElementById('form').hidden, null, { timeout: 15000 });
  r.martilloEnLaPC = d.productos.find((p) => p.codigo === 'MAR-16').stock;
  // Foto: se achica en el celular y se manda a la PC (la cámara no se puede usar en la prueba: la foto se dibuja)
  r.foto = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
    const g = c.getContext('2d'); g.fillStyle = '#c84'; g.fillRect(0, 0, 2400, 1600); g.fillStyle = '#123'; g.fillRect(300, 300, 900, 600);
    const original = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.95));
    const chica = await achicarFoto(original);
    const x = datos.items.find((i) => i.codigo === 'MAR-16');
    const err = await subirFoto(x, chica);
    return { err, tam: chica.size, chip: document.getElementById('lista').textContent.includes('con foto') };
  });
  const fotoMartillo = d.productos.find((p) => p.codigo === 'MAR-16').foto;
  r.fotoEnLaPC = fotoMartillo ? fotosRecibidas.get(fotoMartillo) : 0;
  // Cambiar de estante: el producto y después la etiqueta del estante (con el número corto que lleva su código de barras)
  const cortoC1 = app.estantesCelular(d).estantes.find((e) => e.codigo === 'C-1').corto;
  r.mover = await page.evaluate(async (corto) => {
    abrirMover();
    const a = await pasoMover('7790001112223');
    const b = await pasoMover(corto);
    return { a, b, msj: document.getElementById('mv-msj').textContent };
  }, cortoC1);
  r.martilloUbicacion = d.productos.find((p) => p.codigo === 'MAR-16').ubicacion;
  r.sinToken = await page.evaluate(async () => { datos.pc.token = 'viejo'; await revisarPC(); const e = pc.estado; datos.pc.token = 'token-de-prueba'; return e; });
  // Lo cargado queda guardado al cerrar y volver a abrir la app
  await device.shell('am force-stop uy.grupomuros.etiquetador');
  await espera(1000);
  await device.shell('am start -n uy.grupomuros.etiquetador/.MainActivity');
  await espera(6000);
  const page2 = await (await device.webView({ pkg: 'uy.grupomuros.etiquetador' }, { timeout: 60000 })).page();
  await page2.waitForSelector('#lista li', { timeout: 30000 });
  r.despuesDeReabrir = await page2.textContent('#lista');
  await device.screenshot({ path: 'celular/captura-emulador.png' });
  console.log(JSON.stringify(r, null, 2));
  await pcDePrueba.detener();
  const okPC = (r.http === 200 || r.http === 401) && r.bloqueadoSinPC && r.pc.estado === 'ok' && r.pc.url === 'http://10.0.2.2:8765' && r.pc.estantes.includes('B-9') && r.pc.habilitado
    && r.enLaPC && r.enLaPC.stock === 12 && r.enLaPC.revisar === true && r.enLaPC.creadoPor === 'Celular C1'
    && /Producto del programa/.test(r.existente) && /solo lectura: true/.test(r.existente) && r.martilloEnLaPC === 3 && r.sinToken === 'token'
    && r.estantesFicha.length === 2 && r.estantesFicha.includes('B-9') && r.estantesFicha.includes('C-1')
    && r.mover.a && r.mover.b && /B-9 → C-1/.test(r.mover.msj) && r.martilloUbicacion === 'C-1'
    && r.foto.err === null && r.foto.chip && r.fotoEnLaPC > 1000 && r.fotoEnLaPC < 400000;
  const ok = okPC && r.plugins.includes('ImpresoraBT') && r.plugins.includes('BarcodeScanner') && /C1-0001/.test(r.codigo) && /Arandela/.test(r.despuesDeReabrir) && r.errorImprimir;
  await device.close();
  if (!ok) { console.error('LA PRUEBA FALLÓ'); process.exit(1); }
  console.log('PRUEBA OK');
})().catch((e) => { console.error(e); process.exit(1); });

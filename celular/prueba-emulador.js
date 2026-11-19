// Prueba de la app instalada en un emulador de Android (la corre GitHub, en «Probar la app en un emulador»).
// Entra a la página de la app (WebView) con Playwright y revisa que la impresora Bluetooth (complemento propio),
// los ajustes, cargar un producto y armar el Excel funcionen de verdad en Android.
const { _android: android } = require('playwright');
const { crearServidorCelular } = require('../electron/servidor-celular.js');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Una PC de mentira (el servidor de verdad, con datos de prueba): el emulador la ve en 10.0.2.2
const MARTILLO = { codigo: 'MAR-16', barras: ['7790001112223'], nombre: 'Martillo 16 oz', categoria: 'Herramientas', unidad: 'unidad', proveedor: '', ubicacion: 'B-9', stock: 7, minimo: 2, precio: 620, moneda: 'UYU' };
const pantallaDePrueba = async (js) => {
  if (js === 'estadoParaCelular()') return { listo: true, productos: 1 };
  if (js === 'estantesParaCelular()') return { estantes: [{ codigo: 'B-9', categoria: 'Herramientas' }] };
  if (js.startsWith('productoParaCelular(')) return { producto: js.includes('7790001112223') ? MARTILLO : null };
  if (js.startsWith('productosParaCelular(')) return { productos: [MARTILLO] };
  return { error: 'no' };
};
const pcDePrueba = crearServidorCelular({ clave: () => ({ token: 'token-de-prueba', pcId: 'pc-de-prueba' }), preguntar: pantallaDePrueba, version: 'prueba' });
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
  // Ajustes y un producto sin código
  await page.fill('#aj-equipo', 'c1');
  await tocar('#aj-guardar');
  await tocar('#sin-codigo');
  await espera(500);
  r.codigo = await page.textContent('#form-codigo');
  await page.fill('#c-nombre', 'Arandela plana 8 mm');
  await page.fill('#c-precio', '5');
  await tocar('#btn-solo-guardar');
  r.lista = await page.textContent('#lista');
  // Imprimir sin impresora: tiene que avisar, no colgarse
  await tocar('[data-etq]');
  await tocar('#di-imprimir');
  await espera(1500);
  r.errorImprimir = await page.textContent('#di-err');
  await tocar('#di-cerrar');
  // Excel: se arma y se guarda en el celular (el «Compartir» de Android no se puede tocar acá)
  r.excel = await page.evaluate(async () => {
    const P = window.Capacitor.Plugins;
    const b64 = XLSX.write(libroExcel(), { bookType: 'xlsx', type: 'base64' });
    const w = await P.Filesystem.writeFile({ path: 'prueba.xlsx', data: b64, directory: 'CACHE' });
    const s = await P.Filesystem.stat({ path: 'prueba.xlsx', directory: 'CACHE' });
    return { uri: w.uri, tamano: s.size };
  });
  // La PC por WiFi: el pedido http:// sin cifrar tiene que salir por CapacitorHttp (no lo bloquea Android)
  r.http = await page.evaluate(async () => { try { const x = await window.Capacitor.Plugins.CapacitorHttp.get({ url: 'http://10.0.2.2:8765/api/estado', connectTimeout: 3000, readTimeout: 3000 }); return x.status; } catch (e) { return 'error: ' + e.message; } });
  r.pc = await page.evaluate(async () => {
    datos.pc = { urls: ['http://10.0.2.3:8765', 'http://10.0.2.2:8765'], url: 'http://10.0.2.3:8765', token: 'token-de-prueba', pcId: 'pc-de-prueba' };
    await revisarPC(); // la primera dirección no responde: tiene que encontrar la segunda
    await new Promise((ok) => setTimeout(ok, 1500)); // los estantes llegan aparte
    return { estado: pc.estado, url: datos.pc.url, titulo: document.getElementById('pc-titulo').textContent, estantes: datos.estantes.map((e) => e.codigo) };
  });
  r.buscarEnPC = await page.evaluate(async () => {
    await codigoEscrito('7790001112223');
    return document.getElementById('form-titulo').textContent + ' | ' + document.getElementById('estado').textContent;
  });
  await tocar('#cancelar');
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
  const okPC = r.http === 200 || r.http === 401;
  const ok = okPC && r.pc.estado === 'ok' && r.pc.url === 'http://10.0.2.2:8765' && r.pc.estantes.includes('B-9') && /Producto del programa/.test(r.buscarEnPC) && /según la PC/.test(r.buscarEnPC) && r.sinToken === 'token'
    && r.plugins.includes('ImpresoraBT') && r.plugins.includes('BarcodeScanner') && /C1-0001/.test(r.codigo) && /Arandela/.test(r.despuesDeReabrir) && r.excel.tamano > 1000 && r.errorImprimir;
  await device.close();
  if (!ok) { console.error('LA PRUEBA FALLÓ'); process.exit(1); }
  console.log('PRUEBA OK');
})().catch((e) => { console.error(e); process.exit(1); });

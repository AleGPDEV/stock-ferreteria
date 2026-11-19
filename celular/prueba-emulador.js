// Prueba de la app instalada en un emulador de Android (la corre GitHub, en «Probar la app en un emulador»).
// Entra a la página de la app (WebView) con Playwright y revisa que la impresora Bluetooth (complemento propio),
// los ajustes, cargar un producto y armar el Excel funcionen de verdad en Android.
const { _android: android } = require('playwright');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
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
  await page.click('#aj-guardar');
  await page.click('#sin-codigo');
  await espera(500);
  r.codigo = await page.textContent('#form-codigo');
  await page.fill('#c-nombre', 'Arandela plana 8 mm');
  await page.fill('#c-precio', '5');
  await page.click('#btn-solo-guardar');
  r.lista = await page.textContent('#lista');
  // Imprimir sin impresora: tiene que avisar, no colgarse
  await page.click('[data-etq]');
  await espera(500);
  console.log('Diálogo:', JSON.stringify(await page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const b = document.querySelector('#di-imprimir').getBoundingClientRect();
    const enCentro = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { ventana: [innerWidth, innerHeight, devicePixelRatio], dialogo: r('#dlg-imprimir'), vista: r('#di-vista'), boton: r('#di-imprimir'), enCentro: enCentro && (enCentro.id || enCentro.tagName) };
  })));
  await page.click('#di-imprimir', { timeout: 8000 }).catch(async (e) => { console.log('click normal falló:', e.message.split('\n')[0]); await page.evaluate(() => document.querySelector('#di-imprimir').click()); });
  await espera(1500);
  r.errorImprimir = await page.textContent('#di-err');
  await page.click('#di-cerrar');
  // Excel: se arma y se guarda en el celular (el «Compartir» de Android no se puede tocar acá)
  r.excel = await page.evaluate(async () => {
    const P = window.Capacitor.Plugins;
    const b64 = XLSX.write(libroExcel(), { bookType: 'xlsx', type: 'base64' });
    const w = await P.Filesystem.writeFile({ path: 'prueba.xlsx', data: b64, directory: 'CACHE' });
    const s = await P.Filesystem.stat({ path: 'prueba.xlsx', directory: 'CACHE' });
    return { uri: w.uri, tamano: s.size };
  });
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
  const ok = r.plugins.includes('ImpresoraBT') && r.plugins.includes('BarcodeScanner') && /C1-0001/.test(r.codigo) && /Arandela/.test(r.despuesDeReabrir) && r.excel.tamano > 1000 && r.errorImprimir;
  await device.close();
  if (!ok) { console.error('LA PRUEBA FALLÓ'); process.exit(1); }
  console.log('PRUEBA OK');
})().catch((e) => { console.error(e); process.exit(1); });

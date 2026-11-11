// Arma las herramientas aparte del programa como archivos únicos (con SheetJS y el logo adentro),
// para abrirlas con doble clic en cualquier PC sin internet, o desde el menú Herramientas del programa.
//   node herramientas/armar.js   →   herramientas/Cargador-de-productos.html y herramientas/Lector-de-facturas.html
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const xlsx = leer(raiz, 'vendor', 'xlsx.full.min.js');
const lectorPdf = leer(__dirname, 'fuentes', 'lector-pdf.js');
const lectorProductos = leer(__dirname, 'fuentes', 'lector-productos.js');
for (const [n, t] of [['xlsx', xlsx], ['lector-pdf', lectorPdf], ['lector-productos', lectorProductos]]) if (/<\/script/i.test(t)) throw new Error(`${n} tiene </script>: no se puede incrustar.`);
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(raiz, 'img', 'logo.png')).toString('base64');
const armar = (fuente, salida) => {
  const html = leer(__dirname, 'fuentes', fuente)
    .replace('__LOGO__', () => logo)
    .replace('<script>__XLSX__</script>', () => `<script>/* SheetJS (licencia Apache 2.0, ver vendor/xlsx.LICENSE) */\n${xlsx}</script>`)
    .replace('<script>__LECTOR_PDF__</script>', () => `<script>\n${lectorPdf}</script>`)
    .replace('<script>__LECTOR_PRODUCTOS__</script>', () => `<script>\n${lectorProductos}</script>`);
  fs.writeFileSync(path.join(__dirname, salida), html);
  console.log('Listo:', 'herramientas/' + salida, Math.round(Buffer.byteLength(html) / 1024), 'KB');
};
armar('cargador.html', 'Cargador-de-productos.html');
armar('lector.html', 'Lector-de-facturas.html');

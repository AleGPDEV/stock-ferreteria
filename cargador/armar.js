// Arma cargador/Cargador-de-productos.html: un solo archivo con SheetJS y el logo adentro,
// para abrirlo con doble clic en cualquier PC sin internet.   node cargador/armar.js
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const plantilla = fs.readFileSync(path.join(__dirname, 'cargador.html'), 'utf8');
const xlsx = fs.readFileSync(path.join(raiz, 'vendor', 'xlsx.full.min.js'), 'utf8');
if (/<\/script/i.test(xlsx)) throw new Error('La librería tiene </script>: no se puede incrustar.');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(raiz, 'img', 'logo.png')).toString('base64');
const salida = plantilla.replace('__LOGO__', () => logo).replace('<script>__XLSX__</script>', () => `<script>/* SheetJS (licencia Apache 2.0, ver vendor/xlsx.LICENSE) */\n${xlsx}</script>`);
fs.writeFileSync(path.join(__dirname, 'Cargador-de-productos.html'), salida);
console.log('Listo: cargador/Cargador-de-productos.html', Math.round(salida.length / 1024), 'KB');

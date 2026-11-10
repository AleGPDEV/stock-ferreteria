# Stock Ferretería

Programa para controlar el stock de una ferretería y cobrar en el mostrador. Se instala en Windows como cualquier programa y también se puede usar desde el navegador.

## Qué hace

- **Vender**: buscás el producto por nombre o código (sirve un lector de código de barras USB), armás el ticket, elegís cómo paga (efectivo, débito, crédito o transferencia) y calcula el vuelto. Al **cobrar**, el stock se descuenta solo. Si el producto no está cargado, se agrega ahí mismo con **nombre y precio** y entra a la venta. Permite hacer un **descuento** en porcentaje, **imprimir el ticket** y el **cierre de caja**, ver las ventas de cualquier día y **anular** una venta (el stock vuelve).
- **Productos**: código, nombre, categoría, unidad (unidad, kg, m, litro, caja…), proveedor, ubicación en el local, costo, precio de venta y stock mínimo. Avisa cuando un producto está bajo el mínimo o sin stock.
  - **Importar desde Excel**: carga cientos de productos de una vez desde una planilla `.xlsx` o `.csv`. Trae una planilla modelo. Si el código ya existe, actualiza el producto en lugar de duplicarlo.
  - **Actualizar precios**: sube o baja un porcentaje a todos los productos, a una categoría o a un proveedor, con redondeo.
- **Cargar mercadería**: llegada de mercadería (actualiza el costo), salidas que no son ventas (roturas, uso interno) y corrección después de contar. Todo queda en el historial con el stock antes y después.
- **Proveedores**: datos de contacto, RUT y cuántos productos de cada uno hay que reponer.
- **Reportes** (descargables a Excel): ventas del período con total por medio de pago y más vendidos, lista de reposición con cantidad sugerida a pedir, valor del inventario por categoría e inventario completo.
- **Datos del negocio**: nombre, dirección, teléfono y RUT que salen en el ticket.
- **Copia de seguridad**: descarga y restauración de todos los datos en un archivo `.json`.
- **Tamaño de letra** ajustable, pensado para que lo usen personas mayores.

El ticket impreso es un comprobante interno: no reemplaza a la factura ni al e-ticket de DGI.

## Instalar en Windows

1. Entrá a la pestaña **Releases** del repositorio y descargá la última versión:
   - `Stock-Ferreteria-Instalador-X.Y.Z.exe`: instala el programa y crea un acceso directo en el escritorio y en el menú Inicio.
   - `Stock-Ferreteria-Portable-X.Y.Z.exe`: se ejecuta sin instalar.
2. Windows puede mostrar **"Windows protegió su PC"** porque el programa no está firmado digitalmente. Tocá **Más información → Ejecutar de todas formas**.
3. La primera vez aparecen **datos de ejemplo** para probarlo. Cuando quieras cargar la ferretería, tocá **Empezar de cero**.

### Dónde se guardan los datos (versión Windows)

- Los cambios se guardan solos en `%APPDATA%\Stock Ferretería\datos.json`.
- Cada día se hace un **respaldo automático** en `Documentos\Stock Ferreteria\Respaldos` y se conservan los últimos 60 días. Se abre desde **Archivo → Abrir carpeta de respaldos** o desde **Reportes → Copia de seguridad**.
- Conviene copiar esa carpeta a un pendrive o a la nube de vez en cuando.
- Para pasar los datos a otra PC: **Reportes → Descargar copia** en la PC vieja y **Restaurar copia** en la nueva.

## Usarlo desde el navegador

Abrí `index.html` con doble clic. En esta forma los datos quedan en el navegador de esa PC: usá siempre el mismo navegador, no borres los datos de navegación y descargá copias de seguridad seguido.

## Lector de código de barras

Un lector USB funciona como un teclado: no hay que configurar nada en el programa.

1. Enchufalo y probalo en el Bloc de notas: tiene que escribir los números y saltar de línea. Si no salta de línea, activá el sufijo **Enter (CR)** con el código de configuración del manual del lector.
2. En **Productos → Editar**, hacé clic en **Código** y escaneá el producto.
3. En la **Caja**, escaneás y el producto se agrega al ticket.

## Para desarrolladores

Requiere [Node.js](https://nodejs.org) 20 o más nuevo.

```bash
npm install        # instala Electron y electron-builder
npm start          # abre el programa en modo desarrollo
npm test           # corre las pruebas automáticas
npm run dist       # genera el instalador y la versión portable en dist/ (en Windows)
```

### Publicar una versión nueva

El workflow `.github/workflows/build-windows.yml` corre en cada push a `main`: ejecuta las pruebas, compila el instalador y lo publica en **Releases** con el tag `vX.Y.Z` que toma de `"version"` en `package.json`.

Para sacar una versión nueva, subí ese número (por ejemplo de `1.1.0` a `1.2.0`) y hacé push. Si no lo cambiás, se actualizan los archivos de la versión que ya está publicada.

### Pruebas

```bash
npm test
```

Prueban la lógica de stock, cobro, descuentos, anulación, actualización de precios e importación (`tests/logica.test.js`).

### Estructura

```
index.html                Pantallas y formularios
css/styles.css            Estilos (tema claro y oscuro automático)
js/app.js                 Lógica: stock, caja, reportes, exportación y respaldo
vendor/xlsx.full.min.js   SheetJS para exportar a Excel sin conexión
electron/main.js          Ventana de escritorio, guardado en archivo y respaldo diario
electron/preload.js       Puente entre la página y el disco
build/icon.*              Ícono del programa
tests/logica.test.js      Pruebas automáticas
```

## Ideas para más adelante

- Varias cajas o PCs compartiendo los mismos datos (requiere una base de datos en un servidor).
- Etiquetas con código de barras para los estantes.
- Ventas a crédito (fiado) con cuenta corriente por cliente.
- Usuarios con contraseña y permisos.
- Facturación electrónica (CFE de DGI) a través de un proveedor habilitado.

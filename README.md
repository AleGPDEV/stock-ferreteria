# Stock Ferretería

Programa para controlar el stock de una ferretería y cobrar en el mostrador. Se instala en Windows como cualquier programa y también se puede usar desde el navegador.

## Qué hace

- **Vender**: buscás el producto por nombre o código (sirve un lector de código de barras USB), armás el ticket, elegís cómo paga (efectivo, débito, crédito o transferencia) y calcula el vuelto. Al **cobrar**, el stock se descuenta solo. La lista se puede **filtrar** por categoría, proveedor y stock, y ordenar por nombre, precio o más vendidos. Si el producto no está cargado, se agrega ahí mismo con **nombre y precio** y entra a la venta. Si el programa dice que no hay stock, se puede **vender igual** después de confirmar (el stock queda en negativo hasta que se corrija contando). Si el lector de códigos escribe en otro campo (por ejemplo «¿Con cuánto paga?»), el programa se da cuenta, deja el campo como estaba y agrega el producto. Permite hacer un **descuento** en porcentaje, **imprimir el ticket** y el **cierre de caja**, ver las ventas de cualquier día y **anular** una venta (el stock vuelve).
- **Apertura y cierre de caja**: al entrar a Vender con la caja cerrada se pide el efectivo inicial. Mientras está abierta se anotan retiros e ingresos de efectivo. Al cerrar se cuenta el efectivo y el programa calcula lo que debería haber (inicial + ventas en efectivo + ingresos − retiros) y la diferencia. Para el empleado el cierre es a ciegas: anota lo que contó y la diferencia la ve solo el administrador, en **Reportes y copias → Cierres de caja**, con impresión y exportación a Excel.
- **Productos**: foto, código, nombre, categoría, unidad (unidad, kg, m, litro, caja…), proveedor, ubicación en el local, costo, precio de venta y stock mínimo. Avisa cuando un producto está bajo el mínimo o sin stock: un aviso arriba de todas las pantallas (rojo si hay productos sin stock), un contador en Productos, el detalle en la ventana de venta cobrada y el filtro **Para reponer**. Lo ven también los empleados.
  - **Importar desde Excel**: carga cientos de productos de una vez desde una planilla `.xlsx` o `.csv` (también el `.csv` de Excel en español, con punto y coma y coma decimal). Trae una planilla modelo. Si el código ya existe, actualiza el producto en lugar de duplicarlo, y se elige qué cambiar: por defecto solo precio y costo; el stock y el nombre solo si se marcan, y antes se muestra la lista de stocks que cambian. Con una planilla de solo **Código y Precio** se actualizan los precios de la lista de un proveedor.
  - **Actualizar precios**: sube o baja un porcentaje a todos los productos, a una categoría o a un proveedor, con redondeo. Los precios bajos no se redondean de a $ 5 o $ 10 (un artículo de $ 2 no pasa a $ 10), y la vista previa muestra el cambio real más chico y más grande.
  - **Fotos**: en **Editar** se elige una foto (la que se pasó del teléfono a la computadora, en JPG o PNG) o se arrastra al recuadro. El programa la achica (unos 900 px, 50 a 150 KB) y la guarda en `%APPDATA%\Stock Ferreteria\Fotos`. Se ve en la lista de Vender, en el ticket y en Productos; tocándola se agranda. El filtro **Sin foto** muestra los que faltan. Las fotos HEIC del iPhone no se pueden abrir: en el iPhone, Ajustes → Cámara → Formatos → «Más compatible».
  - **Historial de precios**: cada cambio de precio queda anotado con fecha y usuario, en **Reportes y copias → Cambios de precio**.
- **Cargar mercadería**: llegada de mercadería (actualiza el costo), salidas que no son ventas (roturas, uso interno) y corrección después de contar. Todo queda en el historial con el stock antes y después.
- **Proveedores**: datos de contacto, RUT y cuántos productos de cada uno hay que reponer.
- **Reportes** (descargables a Excel): ventas del período con total por medio de pago y más vendidos, lista de reposición con cantidad sugerida a pedir, valor del inventario por categoría e inventario completo.
- **Datos del negocio**: nombre, dirección, teléfono y RUT que salen en el ticket.
- **Copia de seguridad**: descarga y restauración de todos los datos en un archivo `.json`.
- **Tamaño de letra** ajustable, pensado para que lo usen personas mayores.

El ticket impreso es un comprobante interno: no reemplaza a la factura ni al e-ticket de DGI.

## Usuarios: administrador y empleado

Al abrir el programa, cada persona toca su nombre y escribe su PIN (de 4 a 6 números).

| Usuario | PIN inicial | Qué puede hacer |
|---|---|---|
| Administrador | `1234` | Todo, incluido Resumen del día, Reportes y copias, usuarios, anular ventas y cambiar precios en bloque |
| Empleado | `0000` | Vender, cargar mercadería, productos y proveedores. No ve totales de ventas, costos ni reportes, y no cambia el precio de los productos que ya existen. Puede hacer descuentos hasta un 10 % (se cambia en Datos del negocio); para uno mayor hace falta el PIN de un administrador |

**Lo primero que hay que hacer** es entrar como Administrador e ir a **Reportes y copias → Usuarios** para cambiar los dos PIN. Mientras sigan con el PIN inicial, el programa lo recuerda con un aviso. Ahí mismo se crean más usuarios (uno por cada empleado) y se puede renombrar a "Empleado" con su nombre real.

Cada venta y cada movimiento de stock queda registrado con el nombre de quien lo hizo.

Después de 5 PIN equivocados seguidos, ese usuario tiene que esperar 5 minutos para volver a probar.

**Clave de recuperación:** al instalar, el administrador entra a **Reportes y copias → Usuarios → Crear clave de recuperación**. El programa muestra una vez una clave de 12 letras y números (por ejemplo `QZ85-RNVC-RNSN`) que hay que anotar en papel y guardar fuera del mostrador; el programa guarda solo un resumen cifrado. Mientras no se cree, el administrador ve un aviso.

**Si se olvida el PIN del administrador:** en la pantalla de ingreso, tocá **Me olvidé el PIN del administrador**, escribí la clave de recuperación y elegí un PIN nuevo. Si se pierde la clave, se puede crear otra desde la misma pantalla de Usuarios (la anterior deja de servir).

## Instalar en Windows

1. Entrá a la pestaña **Releases** del repositorio y descargá la última versión:
   - `Stock-Ferreteria-Instalador-X.Y.Z.exe`: instala el programa y crea un acceso directo en el escritorio y en el menú Inicio.
   - `Stock-Ferreteria-Portable-X.Y.Z.exe`: se ejecuta sin instalar.
2. Windows puede mostrar **"Windows protegió su PC"** porque el programa no está firmado digitalmente. Tocá **Más información → Ejecutar de todas formas**.
3. La primera vez aparecen **datos de ejemplo** para probarlo. Cuando quieras cargar la ferretería, tocá **Empezar de cero**.

### Dónde se guardan los datos (versión Windows)

- Los datos están en una base **SQLite** dentro de `%APPDATA%\Stock Ferreteria\datos.sqlite`. SQLite viene dentro del instalador: no hay que instalar nada aparte.
- Cada cambio guarda solo lo que cambió, así una venta tarda unos 50 ms aunque haya años de historia. Con 8.000 productos y un año de ventas (43.800 ventas) la base pesa unos 115 MB y el programa abre en 3 segundos.
- Se hace un **respaldo comprimido** por día (`respaldo_AAAA-MM-DD.json.gz`) en `Documentos\Stock Ferreteria\Respaldos`, y se guardan los últimos 60 días. Se actualiza al abrir el programa, al cerrar la caja y al cerrar el programa, así tiene las ventas del día. Se abre desde **Archivo → Abrir carpeta de respaldos**.
- **Si los datos se dañan** (por un corte de luz o un problema del disco), el programa no toca nada: muestra una pantalla para restaurar el último respaldo, o para quitar solo lo dañado (antes guarda una copia de la base como estaba, `datos-danado-….sqlite`). Mientras tanto no guarda ni hace respaldos, para no pisar los buenos.
- Si en algún momento no se pueden guardar los cambios, aparece un aviso rojo fijo y la caja no deja cobrar hasta que se arregle.
- **Copia extra:** en **Reportes y copias → Copia de seguridad** se elige una carpeta en un pendrive o en Google Drive u OneDrive, y el respaldo del día se copia ahí también. Si el pendrive no está enchufado, el programa lo avisa y vuelve a intentar más tarde.
- Las **fotos** se copian a `Respaldos\Fotos` y, si hay carpeta extra, a su carpeta `Fotos`.
- Para pasar los datos a otra PC: **Descargar copia** en la vieja y **Restaurar copia** en la nueva. También se puede restaurar directamente un respaldo diario `.json.gz`. Para las fotos, copiá la carpeta `Fotos` del respaldo (o del pendrive) a `Documentos\Stock Ferreteria\Respaldos\Fotos` en la PC nueva: al abrir, el programa trae las que falten.
- Al actualizar desde una versión anterior a la 1.6, los datos de `datos.json` se pasan solos a la base nueva, y queda una copia como `datos-antes-de-sqlite.json`.

## Usarlo desde el navegador

Abrí `index.html` con doble clic. **Sirve solo para probar el programa**: los datos quedan en el navegador de esa PC, que guarda unos 5 MB (más o menos un mes de ventas de un comercio). Para usarlo en el negocio, instalá la versión de Windows.

## Lector de código de barras

Un lector USB funciona como un teclado: no hay que configurar nada en el programa.

1. Enchufalo y probalo en el Bloc de notas: tiene que escribir los números y saltar de línea. Si no salta de línea, activá el sufijo **Enter (CR)** con el código de configuración del manual del lector.
2. En **Productos → Editar**, hacé clic en **Código** y escaneá el producto.
3. En la **Caja**, escaneás y el producto se agrega al ticket.

## Para desarrolladores

Requiere [Node.js](https://nodejs.org) 20 o más nuevo.

```bash
npm install        # instala Electron, electron-builder y SQLite (compilado para Electron)
npm start          # abre el programa en modo desarrollo
npm test           # corre las pruebas automáticas de la lógica
npm run test:almacen  # pruebas de la base SQLite (usan el Node de Electron)
npm run dist       # genera el instalador y la versión portable en dist/ (en Windows)
```

### Publicar una versión nueva

El workflow `.github/workflows/build-windows.yml` corre en cada push a `main`: ejecuta las pruebas, compila el instalador y lo publica en **Releases** con el tag `vX.Y.Z` que toma de `"version"` en `package.json`.

Para sacar una versión nueva, subí ese número (por ejemplo de `1.1.0` a `1.2.0`) y hacé push. Si no lo cambiás, se actualizan los archivos de la versión que ya está publicada.

### Pruebas

```bash
npm test
```

Prueban la lógica de stock, cobro, descuentos, anulación, actualización de precios, importación, usuarios, clave de recuperación y caja (`tests/logica.test.js`), y la base SQLite, incluida la detección y reparación de datos dañados (`tests/almacen.test.js`).

### Estructura

```
index.html                Pantallas y formularios
css/styles.css            Estilos (tema claro y oscuro automático)
js/app.js                 Lógica: stock, caja, reportes, exportación y respaldo
vendor/xlsx.full.min.js   SheetJS para exportar a Excel sin conexión
electron/main.js          Ventana de escritorio, respaldos diarios y carpeta extra
electron/datos.js         Base SQLite: guarda solo lo que cambió
electron/preload.js       Puente entre la página y el disco
build/icon.*              Ícono del programa
tests/logica.test.js      Pruebas automáticas de la lógica
tests/almacen.test.js     Pruebas de la base SQLite
```

## Ideas para más adelante

- Varias cajas o PCs compartiendo los mismos datos (requiere una base de datos en un servidor).
- Etiquetas con código de barras para los estantes.
- Ventas a crédito (fiado) con cuenta corriente por cliente.
- Facturación electrónica (CFE de DGI) a través de un proveedor habilitado.

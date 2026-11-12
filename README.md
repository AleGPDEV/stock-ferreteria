# Stock Ferretería

Programa para controlar el stock de una ferretería y cobrar en el mostrador. Se instala en Windows como cualquier programa y también se puede usar desde el navegador.

## Qué hace

- **Vender**: buscás el producto por nombre o código (sirve un lector de código de barras USB), armás el ticket, elegís cómo paga (efectivo, débito, crédito o transferencia) y calcula el vuelto. Al **cobrar**, el stock se descuenta solo. La lista se puede **filtrar** por categoría, proveedor y stock, y ordenar por nombre, precio o más vendidos. Si el producto no está cargado, se agrega ahí mismo con **nombre y precio** y entra a la venta. Si el programa dice que no hay stock, se puede **vender igual** después de confirmar (el stock queda en negativo hasta que se corrija contando). Si el lector de códigos escribe en otro campo (por ejemplo «¿Con cuánto paga?»), el programa se da cuenta, deja el campo como estaba y agrega el producto. Permite hacer un **descuento** en porcentaje, **imprimir el ticket** y el **cierre de caja**, ver las ventas de cualquier día y **anular** una venta (el stock vuelve). Si la venta anulada fue en efectivo y su caja ya se cerró, el programa pregunta si se le devolvió la plata al cliente y, si es así, la anota como retiro «Devolución venta N.º …» en la caja abierta, para que al cerrar no falte plata.
- **Apertura y cierre de caja**: al entrar a Vender con la caja cerrada se pide el efectivo inicial. Mientras está abierta se anotan retiros e ingresos de efectivo. Al cerrar se cuenta el efectivo y el programa calcula lo que debería haber (inicial + ventas en efectivo + ingresos − retiros) y la diferencia. Para el empleado el cierre es a ciegas: anota lo que contó y la diferencia la ve solo el administrador, en **Reportes → Cierres de caja**, con impresión y exportación a Excel.
- **Productos**: foto, código, nombre, categoría, unidad (unidad, kg, m, litro, caja…), proveedor, ubicación en el local, costo, precio de venta y stock mínimo. Avisa cuando un producto está bajo el mínimo o sin stock: un aviso arriba de todas las pantallas (rojo si hay productos sin stock), un contador en Productos, el detalle en la ventana de venta cobrada y el filtro **Para reponer**. Lo ven también los empleados.
  - **Importar desde Excel**: carga cientos de productos de una vez desde una planilla `.xlsx` o `.csv` (también el `.csv` de Excel en español, con punto y coma y coma decimal). Trae una planilla modelo. Si el código ya existe, actualiza el producto en lugar de duplicarlo, y se elige qué cambiar: por defecto solo precio y costo; el stock y el nombre solo si se marcan, y antes se muestra la lista de stocks que cambian. Con una planilla de solo **Código y Precio** se actualizan los precios de la lista de un proveedor. La planilla se puede armar con el **Lector de facturas** o el **Cargador de productos** (ver más abajo); si trae la columna **Llegó**, esas cantidades se suman al stock como mercadería que llegó. Si la planilla trae el número de **Factura** y esa factura ya se cargó antes, el programa avisa («Esta factura ya se cargó el …») y no vuelve a sumar la mercadería, salvo que se marque a propósito la casilla para sumarla otra vez. **Códigos de cada proveedor**: si la planilla trae **Proveedor** y **Código del proveedor**, el producto se busca por ese par, así el código «1234» de un proveedor nunca se confunde con el «1234» de otro. Si el código propio de la fila ya lo usa un producto de **otro** proveedor, no se mezclan: se carga como producto nuevo con otro código propio, y la vista previa lo avisa. Cada producto guarda los códigos de sus proveedores (se ven al editarlo y sirven para buscarlo).
  - **Actualizar precios**: sube o baja un porcentaje a todos los productos, a una categoría o a un proveedor, con redondeo. Los precios bajos no se redondean de a $ 5 o $ 10 (un artículo de $ 2 no pasa a $ 10), y la vista previa muestra el cambio real más chico y más grande.
  - **Precios**: al guardar un precio igual o menor al costo, el programa pregunta antes. El filtro **Precio igual o menor al costo** los muestra todos, y el Tablero de Reportes avisa cuántos hay.
  - **Productos nuevos de los empleados**: quedan con quién los creó y su precio va al historial de precios. Al administrador le aparecen con la marca **Nuevo · revisar** (filtro **Nuevos para revisar** y aviso en el Tablero) hasta que los edita.
  - **Fotos**: en **Editar** se elige una foto (la que se pasó del teléfono a la computadora, en JPG o PNG) o se arrastra al recuadro. El programa la achica (unos 900 px, 50 a 150 KB) y la guarda en `%APPDATA%\Stock Ferreteria\Fotos`. Se ve en la lista de Vender, en el ticket y en Productos; tocándola se agranda. El filtro **Sin foto** muestra los que faltan. Las fotos HEIC del iPhone no se pueden abrir: en el iPhone, Ajustes → Cámara → Formatos → «Más compatible».
  - **Historial de precios**: cada cambio de precio queda anotado con fecha y usuario, en **Reportes → Cambios de precio**.
- **Cargar mercadería**: llegada de mercadería (actualiza el costo), salidas que no son ventas (roturas, uso interno) y corrección después de contar. Todo queda en el historial con el stock antes y después.
- **Proveedores**: datos de contacto, RUT y cuántos productos de cada uno hay que reponer.
- **Reportes** (descargables a Excel con el nombre del negocio, el período, montos con $, fechas que se pueden ordenar, filtros y fila de total), en pestañas:
  - **Período**: abre en el día de hoy y con las flechas ‹ › (o las flechas ← → del teclado) se pasa al día anterior o al siguiente. Para una franja (por ejemplo del 1 al 30 de octubre) se eligen las fechas Desde y Hasta; las flechas mueven entonces la franja entera (un mes entero pasa al mes anterior o siguiente). **Hoy** vuelve al día de hoy.
  - **Comparaciones**: un día se compara con el mismo día de la semana anterior (un sábado con el sábado anterior); un mes, con el mismo tramo del mes anterior; otra franja, con los días anteriores del mismo largo. Lo que sube va en verde y lo que baja en rojo.
  - **Tablero**: vendido, ganancia, margen, ventas y ticket promedio con su cambio; crecimiento del día, la semana, el mes y el año hasta la fecha elegida; categorías y productos que más suben y bajan; cosas para revisar (los más vendidos que se quedan sin stock, ventas anuladas, cajas con diferencia, descuentos, productos sin costo, mercadería parada); promedio de ventas por día de la semana.
  - **Ventas**: total, cantidad, ticket promedio y ganancia con su cambio; gráfico de ventas por hora (un día), por día o por mes (períodos largos); por medio de pago; por vendedor; los 15 más vendidos. **Tocando una barra de un día** se abre el resumen de ese día: lo vendido comparado con el mismo día de la semana anterior, ventas por hora, por medio de pago y por vendedor, lo más vendido, la caja (con la diferencia si la hubo) y la lista de ventas, con las anuladas. Desde ahí también se pasa de un día a otro con las flechas.
  - **Ganancias**: costo de lo vendido, ganancia y margen, por categoría y por producto (los que más dejan o los de menor margen).
  - **Stock**: mercadería parada (con stock y sin ventas en 30, 60, 90 días, 6 meses o 1 año, con la plata inmovilizada), reposición, valor del inventario por categoría e inventario completo.
  - **Cierres de caja** y **Cambios de precio**.
- **Configuración**: usuarios y clave de recuperación, datos del negocio y copias de seguridad.
- **Barra lateral plegable**: el botón de la flecha la achica a solo íconos y el resto de la pantalla se agranda; se recuerda.
- **Datos del negocio**: nombre, dirección, teléfono y RUT que salen en el ticket.
- **Copia de seguridad**: descarga y restauración de todos los datos en un archivo `.json`.
- **Tamaño de la pantalla**: en el menú **Ver → Agrandar / Achicar** (o Ctrl + y Ctrl −), pensado para que lo usen personas mayores. El programa recuerda el tamaño elegido.

El ticket impreso es un comprobante interno: no reemplaza a la factura ni al e-ticket de DGI.

## Usuarios: administrador y empleado

Al abrir el programa, cada persona toca su nombre y escribe su PIN (de 4 a 6 números).

| Usuario | PIN inicial | Qué puede hacer |
|---|---|---|
| Administrador | `1234` | Todo, incluido Resumen del día, Reportes, Configuración (usuarios y copias), anular ventas y cambiar precios en bloque |
| Empleado | `0000` | Vender, cargar mercadería, productos y proveedores. No ve totales de ventas, costos ni reportes, y no cambia el precio de los productos que ya existen. Puede hacer descuentos hasta un 10 % (se cambia en Datos del negocio); para uno mayor hace falta el PIN de un administrador |

**Lo primero que hay que hacer** es entrar como Administrador e ir a **Configuración → Usuarios** para cambiar los dos PIN. Mientras sigan con el PIN inicial, el programa lo recuerda con un aviso en **Configuración** y un número naranja sobre ese botón de la barra. Ahí mismo se crean más usuarios (uno por cada empleado) y se puede renombrar a "Empleado" con su nombre real.

Cada venta y cada movimiento de stock queda registrado con el nombre de quien lo hizo.

Después de 5 PIN equivocados seguidos, ese usuario tiene que esperar 5 minutos para volver a probar. Los errores en la ventana de **autorizar un descuento** se cuentan aparte: un empleado no puede dejar al administrador sin poder entrar. Un administrador bloqueado puede entrar igual con la clave de recuperación. La próxima vez que entra, el dueño del PIN ve un aviso con la fecha de los intentos fallidos.

**Clave de recuperación:** se crea sola la primera vez que se le pone un PIN a un administrador (al cambiar el `1234`), y también se puede crear en **Configuración → Usuarios → Crear clave de recuperación**. El programa muestra una vez una clave de 12 letras y números (por ejemplo `QZ85-RNVC-RNSN`) que hay que anotar en papel y guardar fuera del mostrador; el programa guarda solo un resumen cifrado. Mientras no se cree, el administrador ve un aviso en **Configuración** (con el botón **Crearla**).

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
- **Copia extra:** en **Configuración → Copia de seguridad** se elige una carpeta en un pendrive o en Google Drive u OneDrive, y el respaldo del día se copia ahí también. Si el pendrive no está enchufado, el programa lo avisa y vuelve a intentar más tarde.
- Las **fotos** se copian a `Respaldos\Fotos` y, si hay carpeta extra, a su carpeta `Fotos`. Las fotos que ningún producto usa (porque se cambiaron) se borran recién cuando pasaron más días que los respaldos guardados (67 días), así un respaldo viejo nunca se queda sin sus fotos.
- Para pasar los datos a otra PC: **Descargar copia** en la vieja y **Restaurar copia** en la nueva. También se puede restaurar directamente un respaldo diario `.json.gz`. Las fotos vuelven solas: al abrir, al restaurar y en cada respaldo, el programa trae las que usan los productos y faltan, desde `Respaldos\Fotos` o desde la carpeta extra (pendrive o nube). En una PC nueva alcanza con elegir de nuevo la carpeta extra en Configuración.
- Al actualizar desde una versión anterior a la 1.6, los datos de `datos.json` se pasan solos a la base nueva, y queda una copia como `datos-antes-de-sqlite.json`.

## Usarlo desde el navegador

Abrí `index.html` con doble clic. **Sirve solo para probar el programa**: los datos quedan en el navegador de esa PC, que guarda unos 5 MB (más o menos un mes de ventas de un comercio). Para usarlo en el negocio, instalá la versión de Windows.

## Herramientas aparte: Lector de facturas y Cargador de productos

Son dos programas chicos que **arman el Excel** para importar en **Productos → Importar desde Excel**. Vienen dentro del instalador (menú **Herramientas** del programa, o los botones de la ventana de importar) y se abren en su propia ventana, sin tocar los datos: si una falla, la caja sigue funcionando. También se pueden descargar sueltos de **Releases** (`Lector-de-facturas.html`, `Cargador-de-productos.html`) y abrir con doble clic en Chrome o Edge en cualquier PC, sin internet.

### Lector de facturas

1. Elegí (o arrastrá) los PDF de las e-facturas del proveedor; pueden ser varias. Lee la tabla de productos sola, aunque ocupe varias páginas.
2. Revisá el proveedor (lo sugiere a partir del email de la factura), el IVA y la ganancia para el precio de venta (0 % = igual al costo).
   - **IVA**: compara la suma de las líneas con el total a pagar. Si ya incluyen IVA (como en las facturas de Uruimporta), no lo suma; si no, suma el 22 % (o lo que diga la opción).
   - **Costo**: lo que se pagó por unidad, con el descuento de la factura. Si un producto está en varias facturas, se toma el de la más nueva.
3. Elegí qué hacer con las cantidades: **solo cargar los productos** (facturas viejas) o **es mercadería que acaba de llegar** (se suma al stock, con el número de factura en el historial).
4. Corregí nombres o categorías si hace falta y tocá **Descargar Excel**. Al importarlo, a los productos que ya existen se les actualiza el costo pero no el precio de venta.

Usa el **código del proveedor** como código del producto (la columna «Código» de la factura, el código del modelo como `LH-5283` o el número al principio de la descripción), así la próxima factura actualiza el mismo producto. Las palabras de presentación o medida (`X100`, `G120`, `8MM`…) nunca se toman como código, y el nombre las conserva («Cable unipolar 2,5mm rojo x100m»). Si un renglón no trae código, se usa la descripción completa. Solo se juntan renglones del mismo producto.

- **Notas de crédito**: se rechazan (son devoluciones, no mercadería que llegó).
- **Facturas en dólares**: pide el tipo de cambio y pasa los costos a pesos; sin tipo de cambio no deja descargar el Excel.
- **Número de factura**: reconoce «Número», «Nº», «N°» y «Nro», y RUT o RUC. Si no lo puede leer, deja escribirlo a mano.

Funciona con e-facturas en PDF generadas por sistema (con texto); una foto o un escaneo no se puede leer.

### Cargador de productos

Para cargar el local recorriéndolo con el lector de códigos y una notebook, sin tocar la PC del mostrador.

1. Escaneá un producto: aparece el formulario con el código puesto. Escribí el nombre, Enter, el precio, Enter. La categoría y la ubicación quedan puestas para el siguiente, así se carga estante por estante.
2. Si volvés a escanear un producto que ya cargaste, se le suma 1 a la cantidad. Para lo que no tiene código, **Producto sin código** (el programa le pone uno al importar).
3. Al terminar, **Descargar Excel** e importalo.

Lo cargado queda guardado en esa computadora aunque se cierre. Para **contar el stock** de lo que ya está cargado: exportá **Inventario completo** desde Reportes → Stock, y en el cargador tocá **Cargar los productos del programa**; al escanear aparece el nombre y solo ponés la cantidad. Al importar ese Excel, el programa reconoce que viene del Cargador (columna «Contado») y corrige el stock solo, mostrando antes la lista de los que cambian. Los Excel del Cargador anteriores a la versión 1.17 no tienen esa columna: con esos hay que marcar **Stock** a mano.

## Lector de código de barras

Un lector USB funciona como un teclado: no hay que configurar nada en el programa.

1. Enchufalo y probalo en el Bloc de notas: tiene que escribir los números y saltar de línea. Si no salta de línea, activá el sufijo **Enter (CR)** con el código de configuración del manual del lector.
2. En la **Caja**, escaneás y el producto se agrega al ticket.

**Código propio y códigos de barras.** Cada producto tiene su **código** (por ejemplo el del modelo del proveedor, `LH-5283`, que usa el Lector de facturas para reconocerlo en la próxima factura) y además puede tener uno o varios **códigos de barras**: los números que trae el paquete y que lee el lector. Se buscan y se venden por cualquiera de los dos.

- **En la caja**, al escanear un código que no tiene ningún producto, la ventana permite **buscar un producto que ya está cargado** (por nombre o por su código, por ejemplo «guante cuero» o «5283») y tocarlo: el código de barras le queda asignado y la próxima vez entra solo. Si no está cargado, se agrega como nuevo con nombre y precio.
- **En Productos → Editar**, el campo **Códigos de barras**: se hace clic y se escanea el paquete (se pueden poner varios).
- **En el Cargador de productos**, con los productos del programa cargados, al escanear un código nuevo también se puede elegir el producto que ya existe; al importar, el código de barras se le agrega.

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
css/fuentes/              Letras incluidas (Barlow, Barlow Semi Condensed, IBM Plex Mono; licencia OFL): se ven igual sin internet
vendor/xlsx.full.min.js   SheetJS 0.20.3: lee las planillas que se importan (programa, herramientas y pruebas)
vendor/xlsx-estilo.min.js SheetJS con estilos (xlsx-js-style): solo para escribir los Excel del programa con colores
electron/main.js          Ventana de escritorio, respaldos diarios y carpeta extra
electron/datos.js         Base SQLite: guarda solo lo que cambió
electron/preload.js       Puente entre la página y el disco
build/icon.*              Ícono del programa (logo de Grupo Muros Prontos)
img/logo.png              Logo que se ve en la barra y en el ingreso
herramientas/fuentes/      Lector de facturas y Cargador de productos (fuente); npm run herramientas arma los archivos únicos
tests/logica.test.js      Pruebas automáticas de la lógica
tests/almacen.test.js     Pruebas de la base SQLite
```

## Ideas para más adelante

- Varias cajas o PCs compartiendo los mismos datos (requiere una base de datos en un servidor).
- Etiquetas con código de barras para los estantes.
- Ventas a crédito (fiado) con cuenta corriente por cliente.
- Facturación electrónica (CFE de DGI) a través de un proveedor habilitado.

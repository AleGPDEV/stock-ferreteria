# Stock Ferretería

Programa para controlar el stock de una ferretería y cobrar en el mostrador. Se instala en Windows como cualquier programa y también se puede usar desde el navegador.

## Qué hace

- **Vender**: buscás el producto por nombre o código (sirve un lector de código de barras USB), armás el ticket, elegís cómo paga (efectivo, débito, crédito o transferencia) y calcula el vuelto. Al **cobrar**, el stock se descuenta solo. La lista se puede **filtrar** por categoría, proveedor y stock, y ordenar por nombre, precio o más vendidos. Si el producto no está cargado, se agrega ahí mismo con **nombre y precio** y entra a la venta. Permite hacer un **descuento** en porcentaje, **imprimir el ticket** y el **cierre de caja**, ver las ventas de cualquier día y **anular** una venta (el stock vuelve).
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

## Usuarios: administrador y empleado

Al abrir el programa, cada persona toca su nombre y escribe su PIN (de 4 a 6 números).

| Usuario | PIN inicial | Qué puede hacer |
|---|---|---|
| Administrador | `1234` | Todo, incluido Resumen del día, Reportes y copias, usuarios, anular ventas y cambiar precios en bloque |
| Empleado | `0000` | Vender, cargar mercadería, productos y proveedores. No ve totales de ventas, costos ni reportes |

**Lo primero que hay que hacer** es entrar como Administrador e ir a **Reportes y copias → Usuarios** para cambiar los dos PIN. Mientras sigan con el PIN inicial, el programa lo recuerda con un aviso. Ahí mismo se crean más usuarios (uno por cada empleado) y se puede renombrar a "Empleado" con su nombre real.

Cada venta y cada movimiento de stock queda registrado con el nombre de quien lo hizo.

Si se olvida el PIN de todos los administradores, se puede restaurar una copia de seguridad anterior; pedí ayuda a quien instaló el programa.

## Licencia y activación

El programa necesita un **código de activación** para funcionar. Cada código:

- vale para **una sola computadora** (la identifica el "código de esta computadora", por ejemplo `455J-G1Z5`);
- tiene una **fecha de vencimiento** (o ninguna, si es una venta definitiva);
- dice qué **módulos** están habilitados: Caja y ventas, Usuarios y permisos, Resumen y reportes, Importar y actualizar precios, Ticket y cierre impresos. Stock, productos y proveedores vienen siempre.

Cuando falta poco para el vencimiento, el administrador ve un aviso. Al vencer, el programa se bloquea y muestra los datos de contacto del proveedor, el código de la computadora y un campo para pegar el código nuevo. Los datos no se borran, y desde esa pantalla se puede descargar una copia. Si alguien atrasa la fecha de Windows para seguir usándolo, el programa lo detecta y pide corregirla.

Los códigos están firmados con una clave privada que tiene solo el desarrollador, en un generador aparte que **no está en este repositorio**. El programa trae únicamente la clave pública, con la que puede comprobar un código pero no fabricarlo.

### Pestaña Desarrollador

Aparece para el administrador y se abre con una clave propia del desarrollador (se crea la primera vez que se entra). Ahí se ve el estado de la licencia y los módulos, se carga un código nuevo y se configuran los datos de contacto que ve el cliente al vencer, y cuántos días antes avisar. Si se olvida la clave, se borra pegando un código de activación válido para esa computadora.

## Instalar en Windows

1. Entrá a la pestaña **Releases** del repositorio y descargá la última versión:
   - `Stock-Ferreteria-Instalador-X.Y.Z.exe`: instala el programa y crea un acceso directo en el escritorio y en el menú Inicio.
   - `Stock-Ferreteria-Portable-X.Y.Z.exe`: se ejecuta sin instalar.
2. Windows puede mostrar **"Windows protegió su PC"** porque el programa no está firmado digitalmente. Tocá **Más información → Ejecutar de todas formas**.
3. La primera vez aparecen **datos de ejemplo** para probarlo. Cuando quieras cargar la ferretería, tocá **Empezar de cero**.

### Dónde se guardan los datos (versión Windows)

- Los datos están en una base **SQLite** dentro de `%APPDATA%\Stock Ferreteria\datos.sqlite`. SQLite viene dentro del instalador: no hay que instalar nada aparte.
- Cada cambio guarda solo lo que cambió, así una venta tarda unos 50 ms aunque haya años de historia. Con 8.000 productos y un año de ventas (43.800 ventas) la base pesa unos 115 MB y el programa abre en 3 segundos.
- Una vez por día se hace un **respaldo comprimido** (`respaldo_AAAA-MM-DD.json.gz`) en `Documentos\Stock Ferreteria\Respaldos`, y se guardan los últimos 60 días. Se abre desde **Archivo → Abrir carpeta de respaldos**.
- **Copia extra:** en **Reportes y copias → Copia de seguridad** se elige una carpeta en un pendrive o en Google Drive u OneDrive, y el respaldo del día se copia ahí también. Si el pendrive no está enchufado, el programa lo avisa y vuelve a intentar más tarde.
- Para pasar los datos a otra PC: **Descargar copia** en la vieja y **Restaurar copia** en la nueva. También se puede restaurar directamente un respaldo diario `.json.gz`.
- Al actualizar desde una versión anterior a la 1.6, los datos de `datos.json` se pasan solos a la base nueva, y queda una copia como `datos-antes-de-sqlite.json`.

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

Prueban la lógica de stock, cobro, descuentos, anulación, actualización de precios e importación (`tests/logica.test.js`).

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
- Usuarios con contraseña y permisos.
- Facturación electrónica (CFE de DGI) a través de un proveedor habilitado.

# Stock Ferretería

Programa web para controlar el stock de una ferretería y cobrar en el mostrador. Funciona en el navegador de la PC (Chrome, Edge o Firefox), no necesita instalar nada ni servidor.

## Qué hace

- **Caja**: buscás el producto por nombre o código (sirve un lector de código de barras USB), armás el ticket, elegís el medio de pago (efectivo, débito, crédito o transferencia) y calcula el vuelto. Al **cobrar**, el stock se descuenta solo. Las ventas del día se pueden **anular** y el stock vuelve.
- **Productos**: código, nombre, categoría, unidad (unidad, kg, m, litro, caja…), proveedor, ubicación en el local, costo, precio de venta y stock mínimo. Avisa cuando un producto está bajo el mínimo o sin stock.
- **Movimientos**: entradas (compras a proveedores, actualiza el costo), salidas que no pasan por la caja (roturas, uso interno) y ajustes por conteo físico. Todo queda en el historial con el stock antes y después.
- **Proveedores**: datos de contacto, RUT y cuántos productos de cada uno hay que reponer.
- **Reportes** (descargables a Excel): ventas del período con total por medio de pago y más vendidos, lista de reposición con cantidad sugerida a pedir, valor del inventario por categoría e inventario completo.
- **Copia de seguridad**: descarga y restauración de todos los datos en un archivo `.json`.

## Cómo usarlo

1. Descargá la carpeta del proyecto.
2. Abrí `index.html` con doble clic. Se abre en el navegador.
3. La primera vez aparecen **datos de ejemplo** para probarlo. Cuando quieras cargar tu ferretería, tocá **Empezar de cero**.

Para tenerlo siempre a mano, creá un acceso directo a `index.html` en el escritorio o guardalo como favorito.

### Lector de código de barras

Cargá en el campo **Código** de cada producto el número del código de barras (podés escanearlo en ese campo). En la Caja, con el cursor en el buscador, escaneás y el producto se agrega al ticket.

## Dónde se guardan los datos

Los datos quedan guardados **en el navegador de esa PC** (almacenamiento local). Eso significa:

- Siempre usá el mismo navegador en la misma PC.
- No borres los "datos de sitios" o "cookies" del navegador, porque se pierde la información.
- Descargá una **copia de seguridad** seguido (Reportes → Copia de seguridad) y guardala en un pendrive o en la nube.

La exportación a Excel usa la librería SheetJS desde internet. Sin conexión, los reportes se descargan en formato `.csv`, que Excel también abre.

## Subirlo a GitHub

1. Creá una cuenta en [github.com](https://github.com) y un repositorio nuevo vacío, por ejemplo `stock-ferreteria`.
2. Desde esta carpeta, en una terminal:

   ```bash
   git remote add origin https://github.com/TU-USUARIO/stock-ferreteria.git
   git branch -M main
   git push -u origin main
   ```

   (El proyecto ya trae el primer commit hecho.)
3. Opcional: para usarlo desde una dirección web, en el repositorio andá a **Settings → Pages**, elegí la rama `main` y la carpeta `/ (root)`. GitHub te da un enlace del tipo `https://TU-USUARIO.github.io/stock-ferreteria/`. Cada navegador que lo abra guarda sus propios datos.

## Estructura

```
index.html       Pantallas y formularios
css/styles.css   Estilos (tema claro y oscuro automático)
js/app.js        Lógica: stock, caja, reportes, exportación y respaldo
```

## Ideas para más adelante

- Varias cajas o PCs compartiendo los mismos datos (requiere una base de datos en un servidor).
- Impresión de ticket en impresora térmica.
- Usuarios con contraseña y permisos.
- Facturación electrónica (CFE de DGI) a través de un proveedor habilitado.

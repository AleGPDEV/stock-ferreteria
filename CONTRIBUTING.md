# Cómo se trabaja en Stock Ferretería

Este proyecto lo trabajan **varios chats de Claude a la vez**, cada uno en su sección, y una persona (Ale) que
coordina. Quien hace de **líder del equipo** revisa y une los pull requests. Esta guía es para que nadie pise el
trabajo de otro y para que **nunca se pierdan datos de los clientes**.

## El flujo

1. **Nadie sube directo a `main`.** `main` está protegido: todo entra por pull request.
2. Cada trabajo va en **su propia rama**, creada desde el `main` más nuevo, con un nombre que diga la sección y
   el tema: `caja/descuento-por-medio`, `reportes/grafico-semanal`, `celular/fotos-varias`.
3. Al terminar: `npm test` (y `npm run test:almacen` si se tocó `electron/`) tienen que pasar **en tu máquina**.
   Recién ahí abrí el pull request a `main` con el formulario que aparece (qué cambia, por qué, cómo se probó).
4. GitHub corre solo las mismas verificaciones que antes de publicar: pruebas, instalador de Windows, APK y la
   prueba en el emulador de Android. **Si alguna falla, el pull request no se puede unir.**
5. El líder revisa (código, pruebas, y lo prueba de punta a punta). Si hay que cambiar algo, lo deja en
   comentarios del pull request: se corrige **en la misma rama** y se vuelve a subir.
6. Al unir, si corresponde publicar, el líder sube el número de versión y GitHub publica la versión en Releases.

## Reglas para trabajar en paralelo sin pisarse

- **Cada chat toca solo los archivos (o bloques) de su sección** (tabla de abajo). Si necesitás cambiar algo de
  otra sección, decilo en el pull request y hacé el cambio mínimo; si es grande, que lo haga esa sección.
- **No reformatees ni reordenes código que no cambiaste** (ni comillas, ni sangrías, ni orden de funciones). Un
  pull request con cambios de formato en todo el archivo choca con todos los demás.
- **No subas el número de versión** en `package.json`, `package-lock.json` ni `celular/package.json`: lo hace el
  líder al unir (si dos pull requests suben la versión, chocan).
- **No agregues dependencias** (npm, Capacitor, librerías en `vendor/`) sin explicarlo en el pull request.
- **Pruebas nuevas en el archivo de tu sección** (`tests/<seccion>.test.js`, y sumalo al script `test` de
  `package.json`), no al final de `tests/logica.test.js`, que es donde más se choca.
- **Un pull request, una cosa.** Más fácil de revisar, y si hay que deshacerlo no arrastra lo demás.
- **Antes de abrir el pull request, traé lo último de `main`** (`git pull origin main` en tu rama) y volvé a
  correr las pruebas.

## Secciones

Mientras `js/app.js` sea un solo archivo, cada sección trabaja **solo dentro de sus bloques** (cada bloque empieza
con un comentario `/* ---------- Nombre ---------- */`). El primer paso de la organización es partir `app.js` en
archivos por sección; ese pull request se hace **solo**, sin otros trabajos abiertos sobre `app.js` al mismo tiempo.

| Sección | Qué abarca | Dónde está hoy |
|---|---|---|
| **Base y guardado** | Formato de los datos, guardado por diferencias, SQLite, respaldos, datos dañados | `electron/datos.js`, `electron/main.js` (respaldos, fotos), bloques *Datos*, *Guardado*, *Respaldo*, *Datos dañados*, *Arranque* de `app.js` |
| **Caja y ventas** | Vender, ticket, cobro, dólares, apertura y cierre de caja | Bloques *Caja*, *Impresión de ticket y cierre*, *Apertura y cierre de caja*, *Pantallas de apertura, movimientos y cierre de caja* |
| **Productos y stock** | Productos, fotos, movimientos, proveedores, precios | Bloques *Productos*, *Fotos de los productos*, *Movimientos*, *Proveedores*, *Actualizar precios*, *Historial de cambios de precio*, *Alerta de stock* |
| **Importar y exportar** | Excel de entrada y de salida | Bloques *Importar productos desde una planilla*, *Importar desde Excel*, *Exportar a Excel* |
| **Reportes** | Tablero, ventas, ganancias, gráficos, resumen del día | Bloques *Reportes* … *Resumen de un día* |
| **Depósito y etiquetas** | Estantes, ubicación, etiquetas, etiquetadora (TSPL) | Bloques *Depósito*, *Pantalla Depósito*, *Impresión directa a la etiquetadora*; `js/etiqueta-tspl.js`, `js/codigo-barras.js`, `electron/etiquetadora.js` |
| **Celular** | Conexión por WiFi y app Etiquetador | `electron/servidor-celular.js`, bloques *App del celular* y *Lo que guarda el celular en la PC* de `app.js`, `herramientas/fuentes/etiquetador.html`, `celular/` |
| **Herramientas** | Cargador de productos y Lector de facturas | `herramientas/fuentes/cargador.html`, `herramientas/fuentes/lector.html`, `herramientas/armar.js` |
| **Usuarios e ingreso** | Usuarios, PIN, ingreso, datos del negocio | Bloques *Usuarios y PIN*, *Ingreso*, *Usuarios (solo administrador)*, *Datos del negocio* |
| **Interfaz general** | Navegación, estilos, panel | `index.html` (estructura general), `css/styles.css`, bloques *Interfaz general* y *Panel* |
| **Publicación** | Instaladores, CI, versiones | `.github/`, `build/`, `package.json` (scripts y versión): **solo el líder** |

`index.html` y `css/styles.css` los usan todas las secciones: cada una toca solo el marcado y los estilos de
su pantalla.

## Lo que no se puede romper

1. **Los datos de los clientes.** Cualquier cambio en la forma de los datos (`db`, tablas de SQLite, la copia
   en JSON) tiene que leer bien los datos que ya existen y las copias de seguridad viejas. Si hace falta migrar,
   la migración va con su prueba. Nunca se borran ventas ni movimientos.
2. **La pantalla es la dueña de los datos.** Todo cambio pasa por `db` en la pantalla y se guarda con
   `guardar()` (guarda solo lo que cambió). Nadie escribe en SQLite por fuera de eso: ni `electron/`, ni el
   celular, ni las herramientas. El celular y el Cargador le **piden** a la pantalla (`preguntarAlPrograma`).
3. **Lo que ve un empleado.** Los costos y las ganancias son solo del administrador. El celular trabaja como un
   empleado: no ve costos ni cambia precios de lo que ya existe.
4. **Que funcione sin internet.** El programa es local: nada de servicios en la nube ni librerías por CDN.
5. **El idioma.** Todo lo que lee el usuario (y los comentarios del código) va en español rioplatense, claro y sin
   tecnicismos: «Guardá», «Tocá», «No se pudo guardar…».

## Comandos

```
npm install        # la primera vez (en Windows sin herramientas de compilación: npm install --ignore-scripts
                   #  y después node node_modules/electron/install.js)
npm start          # abre el programa (usa la MISMA carpeta de datos que el programa instalado)
npm test           # pruebas de la lógica, las herramientas y el celular
npm run test:almacen   # pruebas de la base SQLite
npm run herramientas   # arma el Cargador, el Lector y la página de la app del celular (celular/www)
```

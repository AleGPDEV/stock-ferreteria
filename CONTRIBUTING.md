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

El programa está repartido en un archivo por sección (ver **«Mapa del código»** en el README, con qué archivo
tocar para cada cosa y cómo se cargan). Cada chat trabaja en **una** sección:

| Sección | Archivos |
|---|---|
| **Base y guardado** | `js/base/datos-y-guardado.js`, `js/pantallas/datos-danados.js`, `js/pantallas/respaldo.js`, `electron/datos.js`, `electron/registro.js`, `electron/main.js` (respaldos, fotos y registro de errores), `css/pantallas/configuracion.css` (copias) |
| **Caja y ventas** | `js/logica/ventas-y-stock.js`, `js/logica/caja.js`, `js/pantallas/caja.js`, `js/pantallas/ticket-e-impresion.js`, `js/pantallas/cierre-de-caja.js`, `css/pantallas/caja.css` |
| **Productos y stock** | `js/logica/productos.js`, `js/pantallas/productos.js`, `js/pantallas/fotos.js`, `js/pantallas/movimientos.js`, `js/pantallas/proveedores.js`, `css/pantallas/productos.css`, `css/pantallas/movimientos.css` |
| **Importar y exportar** | `js/logica/importar-planilla.js`, `js/pantallas/importar-excel.js`, `js/pantallas/exportar-excel.js`, `css/pantallas/importar.css` |
| **Reportes** | `js/logica/reportes.js`, `js/pantallas/reportes.js`, `js/pantallas/reportes-tablero.js`, `js/pantallas/reportes-pestanas.js`, `css/pantallas/reportes.css` |
| **Depósito y etiquetas** | `js/logica/deposito.js`, `js/logica/etiquetas.js`, `js/pantallas/deposito.js`, `js/pantallas/etiquetadora.js`, `js/etiqueta-tspl.js`, `js/codigo-barras.js`, `electron/etiquetadora.js`, `css/pantallas/deposito.css` |
| **Celular** | `js/logica/celular.js`, `js/pantallas/celular.js`, `electron/servidor-celular.js`, `herramientas/fuentes/etiquetador.html`, `celular/`, `css/pantallas/celular.css` |
| **Herramientas** | `js/logica/puente-cargador.js`, `herramientas/fuentes/cargador.html`, `herramientas/fuentes/lector*`, `herramientas/armar.js` |
| **Usuarios e ingreso** | `js/base/usuarios-y-pin.js`, `js/pantallas/ingreso.js`, `js/pantallas/configuracion.js`, `css/pantallas/ingreso.css` |
| **Interfaz general** | `js/base/utilidades.js`, `js/pantallas/interfaz-general.js`, `js/pantallas/panel.js`, `css/base.css` (estilos de todo el programa) |
| **Publicación** | `.github/`, `build/`, `package.json` (scripts y versión): **solo el líder** |

**Archivos compartidos:** `index.html`, `css/base.css`, `js/arranque.js` (al sumar un `iniciarAlgo()` o una
función a `module.exports`) y `js/orden.json` los tocan casi todos. Ahí cada sección cambia solo lo suyo (el
marcado y los estilos de su pantalla, su línea en `arranque.js`), lo más chico posible, y trae lo último de `main`
seguido.

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

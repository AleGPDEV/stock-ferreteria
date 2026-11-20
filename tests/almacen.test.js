// Pruebas de la base SQLite. Corren con el Node de Electron (better-sqlite3 está compilado para Electron):
//   npm run test:almacen
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const app = require('../js/cargar-en-node.js');
const { Almacen } = require('../electron/datos.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-sqlite-'));
let n = 0;
const nueva = () => new Almacen(path.join(tmp, `prueba-${++n}.sqlite`));

/** Simula la pantalla: calcula los cambios, los guarda y devuelve la foto nueva. */
function guardar(al, foto, d, completo = false) {
  const r = app.calcularCambios(foto, d, completo);
  if (!r) return foto;
  al.aplicar(r.cambios);
  return r.confirmar();
}
const leer = (al) => JSON.parse(al.leerJson());
const igual = (al, d) => assert.deepEqual(leer(al), JSON.parse(JSON.stringify(d)));

test('una base nueva está vacía', () => {
  const al = nueva();
  assert.equal(al.vacia(), true);
  assert.equal(al.leerJson(), null);
  al.cerrar();
});

test('guardar todo y leerlo da exactamente lo mismo', () => {
  const al = nueva();
  const d = app.semilla();
  app.asegurarUsuarios(d);
  guardar(al, null, d);
  igual(al, d);
  al.cerrar();
});

test('cada cambio se guarda solo y se lee bien', () => {
  const al = nueva();
  const d = app.semilla();
  app.asegurarUsuarios(d);
  let foto = guardar(al, null, d);

  // sin cambios no se escribe nada
  assert.equal(app.calcularCambios(foto, d), null);

  // una venta: solo la venta, sus movimientos, los productos tocados y la config (número de venta)
  const p = d.productos[0];
  const { venta } = app.cobrar(d, [{ productoId: p.id, cantidad: 2, precio: p.precio }], 'Efectivo', '');
  const r = app.calcularCambios(foto, d);
  assert.equal(r.cambios.completo, undefined);
  assert.equal(r.cambios.upsert.ventas.length, 1);
  assert.equal(r.cambios.upsert.movimientos.length, 1);
  assert.equal(r.cambios.upsert.productos.length, 1);
  assert.ok(r.cambios.config);
  al.aplicar(r.cambios);
  foto = r.confirmar();
  igual(al, d);

  // anular: la venta se reescribe y se agrega el movimiento de devolución
  app.anularVenta(d, venta.id);
  const r2 = app.calcularCambios(foto, d);
  assert.equal(r2.cambios.upsert.ventas.length, 1);
  assert.equal(r2.cambios.upsert.movimientos.length, 1);
  al.aplicar(r2.cambios);
  foto = r2.confirmar();
  igual(al, d);

  // editar y borrar productos, proveedores y usuarios
  d.productos[1].precio = 9999;
  d.productos.splice(2, 1);
  d.proveedores.pop();
  app.guardarUsuario(d, { nombre: 'Carlos', rol: 'empleado', pin: '4321' });
  d.negocio.nombre = 'Ferretería El Tornillo';
  foto = guardar(al, foto, d);
  igual(al, d);
  assert.equal(app.calcularCambios(foto, d), null);
  al.cerrar();
});

test('reemplazar todos los datos (restaurar o empezar de cero) borra lo anterior', () => {
  const al = nueva();
  const d = app.semilla();
  let foto = guardar(al, null, d);
  const vacio = app.baseVacia();
  app.asegurarUsuarios(vacio);
  foto = guardar(al, foto, vacio, true);
  igual(al, vacio);
  assert.equal(leer(al).productos.length, 0);
  // si las ventas quedan menos que antes, también se hace un guardado completo
  const d2 = app.semilla();
  app.asegurarUsuarios(d2);
  foto = guardar(al, foto, d2, true);
  d2.ventas.pop();
  const r = app.calcularCambios(foto, d2);
  assert.equal(r.cambios.completo, true);
  al.aplicar(r.cambios);
  igual(al, d2);
  al.cerrar();
});

test('migración desde datos.json', () => {
  const al = nueva();
  const d = app.semilla();
  app.asegurarUsuarios(d);
  d.negocio = { nombre: 'Ferretería de prueba' };
  al.importarJson(JSON.stringify(d));
  igual(al, d);
  al.cerrar();
});

test('si algo falla a mitad de camino no se guarda nada', () => {
  const al = nueva();
  const d = app.semilla();
  guardar(al, null, d);
  const antes = al.leerJson();
  assert.throws(() => al.aplicar({ config: '{"x":1}', upsert: { productos: [{ id: 'nuevo', datos: '{}' }], inventada: [{ id: 1 }] } }));
  assert.equal(al.leerJson(), antes);
  al.cerrar();
});

test('ajustes de la computadora', () => {
  const al = nueva();
  assert.equal(al.ajuste('carpetaExtra'), null);
  al.ponerAjuste('carpetaExtra', 'E:\\Respaldos');
  assert.equal(al.ajuste('carpetaExtra'), 'E:\\Respaldos');
  al.ponerAjuste('carpetaExtra', null);
  assert.equal(al.ajuste('carpetaExtra'), null);
  al.cerrar();
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('QA 2: una fila dañada se detecta y se puede quitar sin perder lo demás', () => {
  const al = nueva();
  const d = app.semilla();
  app.asegurarUsuarios(d);
  guardar(al, null, d);
  assert.deepEqual(al.revisar(), []);
  // se daña un producto y una venta, como podría pasar con un corte de luz
  const p = d.productos[3].id, v = d.ventas[0].id;
  al.db.prepare('UPDATE productos SET datos = ? WHERE id = ?').run('{"id":"' + p + '","nombre":"Tal', p);
  al.db.prepare('UPDATE ventas SET datos = ? WHERE id = ?').run('42', v);
  assert.throws(() => JSON.parse(al.leerJson()));
  const malas = al.revisar();
  assert.deepEqual(malas.map((m) => m.tabla).sort(), ['productos', 'ventas']);
  assert.equal(al.vacia(), false);
  // copia antes de reparar
  const copia = path.join(tmp, 'copia-danada.sqlite');
  al.copiarA(copia);
  assert.ok(fs.existsSync(copia));
  al.quitarDanadas(malas);
  assert.deepEqual(al.revisar(), []);
  const leido = leer(al);
  assert.equal(leido.productos.length, d.productos.length - 1);
  assert.equal(leido.ventas.length, d.ventas.length - 1);
  assert.equal(leido.negocio.nombre, d.negocio.nombre);
  al.cerrar();
});

test('QA 2: si falta la configuración pero hay datos, la base no se toma como vacía', () => {
  const al = nueva();
  const d = app.semilla();
  guardar(al, null, d);
  al.db.prepare('DELETE FROM config').run();
  assert.equal(al.vacia(), false, 'no se reemplaza por el ejemplo');
  assert.deepEqual(al.revisar(), [{ tabla: 'config', id: 'datos' }]);
  al.db.prepare("INSERT INTO config (clave, valor) VALUES ('datos', '{roto')").run();
  assert.deepEqual(al.revisar(), [{ tabla: 'config', id: 'datos' }]);
  al.quitarDanadas(al.revisar());
  assert.deepEqual(al.revisar(), []);
  assert.equal(leer(al).productos.length, d.productos.length);
  al.cerrar();
});

test('chequeo del archivo: una base sana da ok', () => {
  const al = nueva();
  assert.deepEqual(al.revisarArchivo(), []);
  guardar(al, null, app.semilla());
  assert.deepEqual(al.revisarArchivo(), []);
  al.cerrar();
});

test('chequeo del archivo: un daño que deja leer los datos igual se detecta', () => {
  // Una base con varias páginas, cerrada (todo queda en el archivo principal)
  const ruta = path.join(tmp, 'para-romper.sqlite');
  let al = new Almacen(ruta);
  const d = app.semilla();
  for (let i = 0; i < 30; i++) d.productos.push({ ...d.productos[0], id: 'largo' + i, nombre: 'Producto de nombre largo '.repeat(20) + i });
  guardar(al, null, d);
  al.cerrar();
  const original = fs.readFileSync(ruta);
  const tamPagina = original.readUInt16BE(16) || 65536;
  // Se pisa el encabezado de una página por vez (como un corte de luz a mitad de escritura) hasta encontrar
  // un daño con el que la base abre y se lee, pero el archivo está roto: ese es el que tiene que atrapar el chequeo
  let detectado = null;
  for (let p = 1; p < original.length / tamPagina && !detectado; p++) {
    for (const lugar of [3, 5]) {
      const roto = Buffer.from(original);
      roto.writeUInt16BE(0xfff0, p * tamPagina + lugar);
      const r = path.join(tmp, `rota-${p}-${lugar}.sqlite`);
      fs.writeFileSync(r, roto);
      let x;
      try { x = new Almacen(r); } catch (e) { continue; } // tan roto que no abre: eso ya lo atrapa el arranque
      try {
        let seLee = true;
        try { x.leerJson(); } catch (e) { seLee = false; }
        let problemas;
        try { problemas = x.revisarArchivo(); } catch (e) { problemas = [String(e.message)]; } // main.js lo toma igual como problema
        if (seLee && problemas.length) { detectado = problemas; break; }
      } finally { try { x.cerrar(); } catch (e) { /* una base rota puede fallar al cerrar */ } }
    }
  }
  assert.ok(detectado, 'el chequeo tiene que encontrar algún daño escondido');
  assert.ok(detectado.every((t) => typeof t === 'string' && t !== 'ok'));
});

// Base de datos SQLite de la versión de escritorio.
// Cada producto, proveedor, usuario, venta y movimiento es una fila; en cada cambio se
// escribe solo lo que cambió, así una venta tarda lo mismo con un día o con años de historia.
const Database = require('better-sqlite3');

const TABLAS = ['productos', 'proveedores', 'usuarios', 'ventas', 'movimientos'];
const CON_FECHA = new Set(['ventas', 'movimientos']);

class Almacen {
  constructor(ruta) {
    this.db = new Database(ruta);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL'); // cada venta queda en disco antes de seguir
    for (const t of TABLAS) {
      this.db.exec(CON_FECHA.has(t)
        ? `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, fecha TEXT NOT NULL DEFAULT '', datos TEXT NOT NULL)`
        : `CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, datos TEXT NOT NULL)`);
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS ventas_fecha ON ventas (fecha)');
    this.db.exec('CREATE INDEX IF NOT EXISTS movimientos_fecha ON movimientos (fecha)');
    // config = datos del programa (negocio, licencia…); ajustes = solo de esta computadora (carpeta extra…)
    this.db.exec('CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');

    this.st = {};
    for (const t of TABLAS) {
      this.st[t] = {
        poner: this.db.prepare(CON_FECHA.has(t)
          ? `INSERT INTO ${t} (id, fecha, datos) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET fecha = excluded.fecha, datos = excluded.datos`
          : `INSERT INTO ${t} (id, datos) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET datos = excluded.datos`),
        borrar: this.db.prepare(`DELETE FROM ${t} WHERE id = ?`),
        vaciar: this.db.prepare(`DELETE FROM ${t}`),
        todos: this.db.prepare(`SELECT datos FROM ${t} ORDER BY rowid`).pluck(),
      };
    }
    this.leerConfig = this.db.prepare("SELECT valor FROM config WHERE clave = 'datos'").pluck();
    this.ponerConfig = this.db.prepare("INSERT INTO config (clave, valor) VALUES ('datos', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor");
    this.leerAjuste = this.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').pluck();
    this.ponerAjusteSt = this.db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
    this.borrarAjusteSt = this.db.prepare('DELETE FROM ajustes WHERE clave = ?');

    /**
     * Aplica los cambios en una sola transacción: o se guarda todo, o nada.
     * cambios = { completo?, config?: texto, upsert?: { tabla: [{ id, fecha?, datos }] }, borrar?: { tabla: [id] } }
     */
    this.aplicar = this.db.transaction((c) => {
      if (c.completo) TABLAS.forEach((t) => this.st[t].vaciar.run());
      if (typeof c.config === 'string') this.ponerConfig.run(c.config);
      for (const [t, filas] of Object.entries(c.upsert || {})) {
        if (!TABLAS.includes(t)) throw new Error('Tabla desconocida: ' + t);
        const st = this.st[t].poner;
        if (CON_FECHA.has(t)) filas.forEach((f) => st.run(String(f.id), String(f.fecha || ''), f.datos));
        else filas.forEach((f) => st.run(String(f.id), f.datos));
      }
      for (const [t, ids] of Object.entries(c.borrar || {})) {
        if (!TABLAS.includes(t)) throw new Error('Tabla desconocida: ' + t);
        ids.forEach((id) => this.st[t].borrar.run(String(id)));
      }
    });
  }

  vacia() { return this.leerConfig.get() === undefined; }

  /** Todos los datos como un texto JSON, con la misma forma que usa la pantalla. */
  leerJson() {
    if (this.vacia()) return null;
    const config = this.leerConfig.get() || '{}';
    const partes = TABLAS.map((t) => `"${t}":[${this.st[t].todos.all().join(',')}]`);
    const resto = config.trim().slice(1, -1).trim();
    return '{' + (resto ? resto + ',' : '') + partes.join(',') + '}';
  }

  /** Reemplaza todo con un JSON completo (migración desde datos.json o restauración). */
  importarJson(texto) {
    const d = JSON.parse(texto);
    const fila = (t, x) => (CON_FECHA.has(t) ? { id: x.id, fecha: x.fecha || '', datos: JSON.stringify(x) } : { id: x.id, datos: JSON.stringify(x) });
    const config = {};
    const upsert = {};
    for (const [k, v] of Object.entries(d)) {
      if (TABLAS.includes(k)) upsert[k] = (Array.isArray(v) ? v : []).filter((x) => x && x.id != null).map((x) => fila(k, x));
      else config[k] = v;
    }
    this.aplicar({ completo: true, config: JSON.stringify(config), upsert });
  }

  ajuste(clave) { const v = this.leerAjuste.get(clave); return v === undefined ? null : JSON.parse(v); }
  ponerAjuste(clave, valor) {
    if (valor == null) this.borrarAjusteSt.run(clave);
    else this.ponerAjusteSt.run(clave, JSON.stringify(valor));
  }

  cerrar() {
    try { this.db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { /* nada */ }
    this.db.close();
  }
}

module.exports = { Almacen, TABLAS };

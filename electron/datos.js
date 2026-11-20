// Base de datos SQLite de la versión de escritorio.
// Cada producto, proveedor, usuario, venta y movimiento es una fila; en cada cambio se
// escribe solo lo que cambió, así una venta tarda lo mismo con un día o con años de historia.
const Database = require('better-sqlite3');

const fs = require('fs');
const path = require('path');

const TABLAS = ['productos', 'proveedores', 'usuarios', 'ventas', 'movimientos', 'cajas'];
const CON_FECHA = new Set(['ventas', 'movimientos', 'cajas']);
// De qué campo sale la columna fecha (las cajas usan cuándo se abrieron)
const CAMPO_FECHA = { ventas: 'fecha', movimientos: 'fecha', cajas: 'abierta' };
/** La fecha de una fila: la que vino aparte, o la del campo que corresponde dentro de los datos. */
function fechaDe(t, f) {
  if (f.fecha != null) return String(f.fecha);
  try { return String(JSON.parse(f.datos)[CAMPO_FECHA[t]] || ''); } catch (e) { return ''; }
}

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
    // config = datos del programa (negocio, cajas…); ajustes = solo de esta computadora (carpeta extra…)
    this.db.exec('CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
    // Antes de cualquier lectura: las cajas que todavía estén dentro de config pasan a su tabla
    this.migrarCajas(ruta);

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
        if (CON_FECHA.has(t)) filas.forEach((f) => st.run(String(f.id), fechaDe(t, f), f.datos));
        else filas.forEach((f) => st.run(String(f.id), f.datos));
      }
      for (const [t, ids] of Object.entries(c.borrar || {})) {
        if (!TABLAS.includes(t)) throw new Error('Tabla desconocida: ' + t);
        ids.forEach((id) => this.st[t].borrar.run(String(id)));
      }
    });
  }

  /**
   * Versiones anteriores guardaban todas las cajas dentro del JSON de config, que se reescribía en cada venta.
   * Ahora cada caja es una fila de la tabla cajas. Corre en el constructor, antes del primer leerJson(): si no,
   * el JSON tendría dos claves "cajas" y JSON.parse se quedaría con la tabla vacía. Antes se guarda una copia
   * de la base (VACUUM INTO) y todo va en una transacción. Si config está dañada no se toca (lo ve revisar()).
   */
  migrarCajas(ruta) {
    const config = this.db.prepare("SELECT valor FROM config WHERE clave = 'datos'").pluck().get();
    if (config === undefined) return 0;
    let d;
    try { d = JSON.parse(config); } catch (e) { return 0; }
    if (!d || typeof d !== 'object' || !Object.prototype.hasOwnProperty.call(d, 'cajas')) return 0;
    const cajas = Array.isArray(d.cajas) ? d.cajas.filter((c) => c && typeof c === 'object') : [];
    if (ruta && ruta !== ':memory:') {
      const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const copia = path.join(path.dirname(ruta), `datos-antes-de-cajas-${sello}.sqlite`);
      if (!fs.existsSync(copia)) this.db.prepare('VACUUM INTO ?').run(copia);
    }
    const poner = this.db.prepare('INSERT OR IGNORE INTO cajas (id, fecha, datos) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      cajas.forEach((c, i) => {
        if (c.id == null) c.id = `caja-${c.numero || i + 1}`;
        poner.run(String(c.id), String(c.abierta || ''), JSON.stringify(c));
      });
      delete d.cajas;
      this.db.prepare("UPDATE config SET valor = ? WHERE clave = 'datos'").run(JSON.stringify(d));
    })();
    return cajas.length;
  }

  /** Vacía de verdad: sin configuración y sin filas. Si falta la configuración pero hay filas, la base está dañada (ver revisar). */
  vacia() {
    if (this.leerConfig.get() !== undefined) return false;
    return TABLAS.every((t) => this.db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get() === undefined);
  }

  /**
   * Chequeo rápido del archivo de la base (PRAGMA quick_check): páginas, índices y estructura.
   * Devuelve [] si está bien, o hasta 20 textos con los problemas. Si el archivo está muy roto, SQLite tira un error.
   */
  revisarArchivo() {
    const r = this.db.pragma('quick_check(20)', { simple: false }).map((x) => String(Object.values(x)[0]));
    return r.length === 1 && r[0] === 'ok' ? [] : r;
  }

  /**
   * Busca filas que no se pueden leer (texto que no es un objeto JSON válido).
   * Devuelve [{ tabla, id }]. Si la base misma está rota, SQLite tira un error.
   */
  revisar() {
    const malas = [];
    for (const t of TABLAS) {
      this.db.prepare(`SELECT id FROM ${t} WHERE CASE WHEN json_valid(datos) THEN json_type(datos) <> 'object' ELSE 1 END`).pluck().all()
        .forEach((id) => malas.push({ tabla: t, id }));
    }
    const config = this.leerConfig.get();
    if (config === undefined) {
      if (!this.vacia()) malas.push({ tabla: 'config', id: 'datos' });
    } else if (!this.db.prepare("SELECT CASE WHEN json_valid(@c) THEN json_type(@c) = 'object' ELSE 0 END").pluck().get({ c: config })) {
      malas.push({ tabla: 'config', id: 'datos' });
    }
    return malas;
  }

  /** Guarda una copia exacta de la base en otro archivo (antes de reparar o restaurar). */
  copiarA(destino) {
    this.db.prepare('VACUUM INTO ?').run(destino);
  }

  /** Quita las filas dañadas. Si la configuración está dañada, se deja vacía (se pierden datos del negocio y cajas). */
  quitarDanadas(malas) {
    this.db.transaction(() => {
      for (const m of malas) {
        if (m.tabla === 'config') this.ponerConfig.run('{}');
        else if (TABLAS.includes(m.tabla)) this.st[m.tabla].borrar.run(String(m.id));
      }
    })();
  }

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
    const fila = (t, x) => (CON_FECHA.has(t) ? { id: x.id, fecha: x[CAMPO_FECHA[t]] || '', datos: JSON.stringify(x) } : { id: x.id, datos: JSON.stringify(x) });
    if (Array.isArray(d.cajas)) d.cajas.forEach((c, i) => { if (c && c.id == null) c.id = `caja-${c.numero || i + 1}`; });
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

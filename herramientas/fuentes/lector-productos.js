/* Lector de facturas: de los renglones leídos del PDF a la lista de productos para el Excel.
 * Sin pantalla, para poder probarlo (tests/herramientas.test.js). Lo usa lector.html.
 *
 * La clave de cada producto es el código del proveedor: la columna «Código» de la factura, el código de
 * modelo de Uruimporta (LH-5563) o el número al principio de la descripción. Si no hay, la descripción completa.
 * Las palabras de presentación o medida (X100, X100M, G120, 8MM, 8X1/2…) nunca son el código: así dos
 * productos distintos que terminan en «X100» no se juntan. */
(function (global) {
  'use strict';

  const normal = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const red2 = (x) => Math.round(x * 100) / 100;

  const MARCAS = ['TOYOKI', 'MAKAWA', 'UYUSTOOLS', 'UYUS', 'PENNSYLVANIA', 'CONDOR', 'KAMASA', 'ARCAL', 'CABLINUR', 'DENZEL', 'ODIM', 'CLARA', 'TIGON', 'GAOQIANG', 'HORUSDY', 'CHALIMEX', 'TIMELIN', 'CORO', 'TOOLS', 'GREEN', 'KILLER', 'MAUSER', 'STANLEY', 'BOSCH', 'TRAMONTINA', 'TRUPER', 'INCOLOR', 'SHERWIN', 'SINTEPLAST', 'CALOPLAST', 'TIGRE', 'NICOLL', 'DUKE', 'PRETUL', 'BLACK', 'DECKER', 'DEWALT', 'MAKITA', 'GAMMA', 'LUSQTOFF', 'SICA', 'ACRILEX', 'FISCHER', 'POXIPOL', 'LOCTITE', 'WD-40', 'TEKNO', 'ACQUAFLEX'];

  /** ¿Es una palabra de presentación o medida? (X100, X50, X100M, G120, P80, M8, 8MM, 200MM, 8X1/2, 2,5MM…) */
  function esMedida(w) {
    const u = String(w || '').toUpperCase().replace(/^[("'”]+|[)"'”.,;:]+$/g, '');
    if (!u) return false;
    return esNorma(u)
      || /^\d/.test(u) // empieza con número: 8MM, 200MM, 8X1/2, 100M, 2,5MM
      || /^X\s?\d/.test(u) // cantidad por paquete: X100, X50, X100M
      || /^[A-Z]\d{1,4}[A-Z]{0,2}$/.test(u) // una letra y números: G120 (lija), P80, M8, E27, T20
      || /^(MM|CM|MTS?|KG|GR|LTS?|ML|HP|CC|PULG)\d/.test(u);
  }

  /** Normas y grados: DIN933, ISO4017, PN10, RAL9010, IP65, RJ45, AWG12, IEC60309, NEMA5, SCH40, CAT6, SAE1020… */
  // Sin «UL», «EN» ni «BS»: hay códigos de modelo así (UL-1240, EN-200, BS-115) y no son normas.
  const NORMAS = ['DIN', 'ISO', 'PN', 'RAL', 'IP', 'RJ', 'AWG', 'IEC', 'NEMA', 'SCH', 'CAT', 'ANSI', 'ASTM', 'SAE', 'UNE', 'UNIT', 'NBR', 'JIS', 'NPT', 'BSP'];
  const RE_NORMA = new RegExp(`^(?:${NORMAS.join('|')})-?\\d`);
  function esNorma(w) { return RE_NORMA.test(String(w || '').toUpperCase()); }

  /** Código de modelo al final de la descripción: MK-0099, EBM301, AB-1234. Con una sola letra, solo con guion (A-1234). */
  const RE_MODELO = /^(?:[A-Z]{2,5}-?\d{2,7}[A-Z]{0,2}|[A-Z]-\d{2,7}[A-Z]?)$/;
  // Número del proveedor al principio, salvo que sea una medida («250 GR …») o una cantidad seguida de un plural
  // («100 TORNILLOS …», «100 TARUGOS …»): «1234 TORNILLO …» sí es código
  const RE_INTERNO = /^(\d{3,8})\s+(?!(?:MM|CM|M|MTS?|KG|GR|G|L|LTS?|ML|UN|UNID|U|X)\b)(?![A-ZÁÉÍÓÚÑ]{2,}S\b)(?=\D)/i;

  /**
   * Separa el código del proveedor de la descripción.
   * Prioridad: columna «Código» de la factura → LH-xxxx → número al principio → código de modelo al final.
   * Devuelve { codigo, nombre } (el nombre conserva la presentación: «… x100m»).
   */
  function separarCodigo(desc, codigoColumna) {
    let d = String(desc || '').replace(/\s+/g, ' ').trim();
    let interno = '';
    const mi = RE_INTERNO.exec(d);
    if (mi) { interno = mi[1]; d = d.slice(mi[0].length); }
    const pal = d.split(' ').filter(Boolean);
    const col = String(codigoColumna || '').trim().toUpperCase();
    let codigo = '';
    const lh = pal.findIndex((w) => /^LH-?\d+$/i.test(w));
    if (col) codigo = col;
    else if (lh >= 0) { codigo = pal[lh].toUpperCase().replace(/^LH-?/, 'LH-'); pal.splice(lh, 1); }
    else if (interno) codigo = interno;
    else if (pal.length > 2) {
      const ult = pal[pal.length - 1].toUpperCase();
      if (RE_MODELO.test(ult) && !esMedida(ult)) codigo = pal.pop().toUpperCase();
    }
    return { codigo, nombre: pal.join(' ').trim() };
  }

  /** Clave para juntar renglones: el mismo código del proveedor, o si no hay, la misma descripción completa. */
  function claveProducto(desc, codigoColumna) {
    const s = separarCodigo(desc, codigoColumna);
    if (s.codigo) return 'c:' + s.codigo.toUpperCase().replace(/\s+/g, '');
    return 'd:' + normal(desc).replace(/[^a-z0-9]/g, '');
  }

  /** «CABLE UNIPOLAR 2,5MM ROJO X100M» → «Cable unipolar 2,5mm rojo x100m». Los códigos con letras y números quedan en mayúscula. */
  function nombreLindo(t) {
    return String(t || '').split(/\s+/).filter(Boolean).map((w, i) => {
      if (/^\d/.test(w) || /^x\d/i.test(w)) return w.toLowerCase();
      if (/\d/.test(w)) return w.toUpperCase();
      if (MARCAS.includes(w.toUpperCase())) return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      const l = w.toLowerCase();
      return i === 0 ? l.charAt(0).toUpperCase() + l.slice(1) : l;
    }).join(' ').replace(/”/g, '"');
  }

  /** Número de factura para mostrar y para el Excel: «A 1234». Vacío si no se pudo leer el número. */
  const numeroFactura = (r) => (r && r.numero ? `${r.serie || ''} ${r.numero}`.trim() : '');

  /** ¿Son la misma factura? Solo si las dos tienen número: sin número no se puede saber. */
  function mismaFactura(a, b) {
    if (!a || !b || !a.numero || !b.numero) return false;
    const k = (r) => `${String(r.rucEmisor || '').replace(/\D/g, '')}|${normal(r.serie).trim()}|${String(r.numero).replace(/^0+/, '')}`;
    return k(a) === k(b);
  }

  const esNotaCredito = (r) => !!(r && r.notaCredito);
  const enDolares = (r) => !!(r && r.dolares);

  /** Motivo para no cargar una factura (texto), o '' si se puede cargar. */
  function problemaFactura(r) {
    if (esNotaCredito(r)) return 'Es una nota de crédito (devolución), no se carga como mercadería que llegó.';
    if (!r || !r.items || !r.items.length) return 'No encontré la lista de productos.';
    return '';
  }

  /* ---------- Proveedor de cada factura ----------
   * Cada factura es de un proveedor: se lo reconoce por el RUT del emisor; si no se pudo leer el RUT,
   * por el nombre del emisor (si coincide con el de otra factura, es el mismo). Sin RUT ni nombre no se sabe de quién es. */
  const rutDe = (r) => String((r && r.rucEmisor) || '').replace(/\D/g, '');
  const emisorDe = (r) => normal((r && r.emisor) || '').replace(/\b(s\.?a\.?s?|s\.?r\.?l|ltda)\.?$/i, '').replace(/[^a-z0-9]/g, '');

  /**
   * Agrupa las facturas por proveedor. Devuelve { grupos: [{ grupo, rut, emisor, facturas: [{ f, numero }] }], porFactura: Map(f → grupo), error }.
   * error: si hay varias facturas y de alguna no se puede saber de quién es (sin RUT ni nombre del emisor).
   */
  function gruposProveedor(facturas) {
    const grupos = new Map();
    const porFactura = new Map();
    const nuevo = (g, f) => { if (!grupos.has(g)) grupos.set(g, { grupo: g, rut: rutDe(f.r), emisor: (f.r && f.r.emisor) || '', facturas: [] }); return grupos.get(g); };
    const sinSaber = [];
    for (const f of facturas) { // primero las que tienen RUT
      const rut = rutDe(f.r);
      if (rut) { nuevo('r:' + rut, f).facturas.push({ f, numero: numeroFactura(f.r) }); porFactura.set(f, 'r:' + rut); }
    }
    for (const f of facturas) {
      if (porFactura.has(f)) continue;
      const em = emisorDe(f.r);
      const conRut = em && [...grupos.values()].find((g) => g.rut && emisorDe({ emisor: g.emisor }) === em);
      const g = conRut ? conRut.grupo : em ? 'e:' + em : '';
      if (!g) sinSaber.push(f);
      nuevo(g, f).facturas.push({ f, numero: numeroFactura(f.r) });
      porFactura.set(f, g);
    }
    let error = '';
    if (sinSaber.length && facturas.length > 1) {
      const cuales = sinSaber.map((f) => numeroFactura(f.r) || f.archivo || 'sin número').join(', ');
      error = `No pude leer el RUT ni el nombre del proveedor de ${sinSaber.length === 1 ? 'la factura' : 'las facturas'} ${cuales}, así que no sé de quién ${sinSaber.length === 1 ? 'es' : 'son'}. ${sinSaber.length === 1 ? 'Quitala y cargala sola' : 'Quitalas y cargalas solas'}, en otra vuelta.`;
    }
    return { grupos: [...grupos.values()], porFactura, error };
  }

  const AVISO_MISMO_CODIGO = 'Mismo código y descripción distinta: revisalos';
  const descripcionComparable = (t) => String(t || '').toUpperCase().replace(/\s+/g, '');

  /** Renglones con el mismo código (del mismo proveedor) y descripciones distintas: { base → [productos] }. Solo los que tienen código. */
  function conflictosCodigo(lista) {
    const porBase = new Map();
    for (const p of lista) {
      if (!p.codigo || !p.base) continue;
      if (!porBase.has(p.base)) porBase.set(p.base, []);
      porBase.get(p.base).push(p);
    }
    return new Map([...porBase].filter(([, l]) => l.length > 1));
  }

  /**
   * Junta los renglones de las facturas en productos.
   * facturas: [{ r }] (r = lo que devuelve LectorPdf.leerFactura, con r.numero corregido a mano si hizo falta).
   * opc.iva(f): % de IVA a sumar a esa factura (0 si ya viene incluido). opc.tipoCambio: pesos por dólar.
   * opc.mismos: Set de «base» que la persona confirmó que son el mismo producto (se juntan aunque la descripción cambie).
   * opc.sinCodigo: Set de «fila» a las que la persona les quitó el código (se cargan por la descripción).
   * Cada producto lleva su grupo (proveedor): el mismo código de dos proveedores distintos son productos distintos.
   * Devuelve { productos, error }. Con facturas en dólares y sin tipo de cambio, error y sin productos.
   */
  function armarProductos(facturas, opc = {}) {
    const ivaDe = opc.iva || (() => 0);
    const tc = Number(opc.tipoCambio);
    if (facturas.some((f) => enDolares(f.r)) && !(tc > 0)) {
      return { productos: [], error: 'Hay facturas en dólares: escribí el tipo de cambio (cuántos pesos vale un dólar) para pasar los costos a pesos.' };
    }
    const mismos = opc.mismos || new Set();
    const sinCodigo = opc.sinCodigo || new Set();
    const { porFactura } = gruposProveedor(facturas);
    const porClave = new Map();
    const ordenadas = facturas.slice().sort((a, b) => (a.r.fecha || '').localeCompare(b.r.fecha || ''));
    for (const f of ordenadas) {
      const iva = ivaDe(f) || 0;
      const cambio = enDolares(f.r) ? tc : 1;
      const nf = numeroFactura(f.r);
      const grupo = porFactura.get(f) || '';
      for (const it of f.r.items) {
        const s = separarCodigo(it.descripcion, it.codigo);
        const desc = descripcionComparable(s.nombre);
        const base = `${grupo}|${claveProducto(it.descripcion, it.codigo)}`;
        const fila = `${base}#${desc}`;
        let codigo = s.codigo;
        let clave;
        if (!codigo) clave = base; // sin código: la clave ya es la descripción completa
        else if (sinCodigo.has(fila)) { codigo = ''; clave = `${grupo}|d:${normal(s.nombre).replace(/[^a-z0-9]/g, '')}`; }
        // Red de seguridad: mismo código y otra descripción (sin contar mayúsculas y espacios) no se juntan, salvo que se confirme
        else clave = mismos.has(base) ? base : fila;
        const costo = red2(it.importe / it.cantidad * (1 + iva / 100) * cambio);
        let p = porClave.get(clave);
        if (!p) { p = { clave, base, fila, grupo, codigo, nombre: nombreLindo(s.nombre), descripcion: s.nombre, desc, cantidad: 0, facturas: [] }; porClave.set(clave, p); }
        p.cantidad += it.cantidad;
        p.costo = costo; // la factura más nueva queda última
        if (nf && !p.facturas.includes(nf)) p.facturas.push(nf);
      }
    }
    const productos = [...porClave.values()];
    for (const l of conflictosCodigo(productos).values()) l.forEach((p) => { p.aviso = AVISO_MISMO_CODIGO; });
    return { productos, error: '' };
  }

  /** Columnas del Excel que arma el Lector (el programa lo importa con «Importar desde Excel»). */
  const COLUMNAS_EXCEL = ['Código', 'Código del proveedor', 'Producto', 'Categoría', 'Unidad', 'Proveedor', 'Costo', 'Precio', 'Llegó', 'Factura'];

  /**
   * Filas del Excel. lista: [{ codigo, nombre, categoria, costo, precio, cantidad, facturas }] (ya con lo que se editó).
   * El programa busca cada producto por «Código del proveedor» + «Proveedor», así que el proveedor es obligatorio.
   * «Código» queda como antes (compatibilidad); «Código del proveedor» va vacío si no hay código (se usó la descripción).
   */
  function filasExcel(lista, opc = {}) {
    // opc.proveedores: { grupo → nombre } (facturas de varios proveedores); opc.proveedor: uno solo para todas
    const provDe = (p) => String((opc.proveedores && p.grupo != null && opc.proveedores[p.grupo] != null ? opc.proveedores[p.grupo] : opc.proveedor) || '').trim();
    const falta = lista.find((p) => !provDe(p));
    if (falta) {
      const varios = opc.proveedores && Object.keys(opc.proveedores).length > 1;
      return { filas: [], error: varios ? `Escribí el nombre de cada proveedor (falta el de la factura ${(falta.facturas || []).join(', ') || 'sin número'}).` : 'Escribí el proveedor (el mismo nombre que en el programa).' };
    }
    if (conflictosCodigo(lista).size) {
      return { filas: [], error: 'Hay productos marcados «Mismo código y descripción distinta». En cada uno elegí «Quitarle el código» o «Son el mismo producto» antes de descargar.' };
    }
    const filas = lista.map((p) => ({
      'Código': p.codigo || '', 'Código del proveedor': p.codigo || '', 'Producto': p.nombre, 'Categoría': p.categoria || '', 'Unidad': 'unidad',
      'Proveedor': provDe(p), 'Costo': p.costo, 'Precio': p.precio, 'Llegó': opc.llego ? p.cantidad : '', 'Factura': (p.facturas || []).join(', '),
    }));
    return { filas, error: '' };
  }

  const api = { gruposProveedor, conflictosCodigo, filasExcel, COLUMNAS_EXCEL, esNorma, AVISO_MISMO_CODIGO, esMedida, separarCodigo, claveProducto, nombreLindo, numeroFactura, mismaFactura, problemaFactura, armarProductos, enDolares, esNotaCredito, MARCAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.LectorProductos = api;
})(typeof window !== 'undefined' ? window : globalThis);

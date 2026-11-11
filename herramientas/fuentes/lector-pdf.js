/* Lector de facturas en PDF (e-factura / e-ticket de DGI).
 * Lee el texto del PDF sin librerías: descomprime los contenidos de cada página, toma cada texto con su
 * posición y arma las filas de la tabla de productos guiándose por los títulos de las columnas
 * (Cantidad, Descripción, Precio unitario, Descuento, Importe). Funciona con PDF que usan fuentes
 * estándar (como los que genera TCPDF); un PDF escaneado (una foto) no tiene texto y no se puede leer. */
(function (global) {
  'use strict';

  const latin1 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s; };
  // WinAnsi: los caracteres 0x80–0x9F que no son latin1
  const WIN = { 0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x99: '™' };
  const winAnsi = (s) => s.replace(/[\x80-\x9f]/g, (c) => WIN[c.charCodeAt(0)] || '');

  async function inflar(bytes) {
    const ds = new DecompressionStream('deflate');
    const w = ds.writable.getWriter();
    w.write(bytes).catch(() => {});
    w.close().catch(() => {});
    const partes = [];
    const r = ds.readable.getReader();
    try {
      for (;;) { const { value, done } = await r.read(); if (done) break; partes.push(value); }
    } catch (e) {
      if (!partes.length) throw e; // basura al final del flujo: alcanza con lo que se leyó
    }
    let n = 0; partes.forEach((p) => { n += p.length; });
    const out = new Uint8Array(n); let o = 0;
    partes.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  /** Contenidos con texto del PDF, en el orden del archivo (una entrada por página). */
  async function flujosDeTexto(bytes) {
    const s = latin1(bytes);
    const res = [];
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(s))) {
      if (s.slice(m.index - 3, m.index) === 'end') continue;
      const ini = m.index + m[0].length;
      const dicIni = s.lastIndexOf('<<', m.index);
      const dic = s.slice(dicIni, m.index);
      const fin = s.indexOf('endstream', ini);
      if (fin < 0) break;
      re.lastIndex = fin + 9;
      if (/\/Subtype\s*\/Image|\/Length1|\/FontFile|\/XRef|\/ObjStm/.test(dic)) continue;
      const lm = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dic);
      const largo = lm && !lm[2] ? Number(lm[1]) : null; // si es una referencia, se usa hasta «endstream»
      const datos = bytes.subarray(ini, largo != null ? ini + largo : fin);
      let txt;
      if (/\/FlateDecode/.test(dic)) {
        try { txt = latin1(await inflar(datos)); } catch (e) { continue; }
      } else if (!/\/Filter/.test(dic)) txt = latin1(datos);
      else continue;
      if (/\bBT\b/.test(txt) && /T[jJ]/.test(txt)) res.push(txt);
    }
    return res;
  }

  /** Recorre un contenido de página y devuelve los textos con su posición: [{ x, y, t }]. */
  function textosDePagina(c) {
    const out = [];
    let i = 0, x = 0, y = 0, lx = 0, ly = 0, lead = 0;
    const pila = [];
    const n = c.length;
    const esp = (ch) => ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f' || ch === '\0';
    const literal = () => {
      let prof = 1, r = '';
      i++;
      while (i < n && prof > 0) {
        const ch = c[i];
        if (ch === '\\') {
          const s = c[i + 1];
          const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
          if (map[s] !== undefined) { r += map[s]; i += 2; continue; }
          if (/[0-7]/.test(s)) { let o = ''; let k = i + 1; while (k < n && o.length < 3 && /[0-7]/.test(c[k])) o += c[k++]; r += String.fromCharCode(parseInt(o, 8)); i = k; continue; }
          if (s === '\r' || s === '\n') { i += (s === '\r' && c[i + 2] === '\n') ? 3 : 2; continue; }
          r += s; i += 2; continue;
        }
        if (ch === '(') prof++;
        if (ch === ')') { prof--; if (!prof) { i++; break; } }
        r += ch; i++;
      }
      return { s: r };
    };
    const hex = () => {
      const f = c.indexOf('>', i);
      let h = c.slice(i + 1, f).replace(/\s/g, '');
      if (h.length % 2) h += '0';
      let r = ''; for (let k = 0; k < h.length; k += 2) r += String.fromCharCode(parseInt(h.substr(k, 2), 16));
      i = f + 1;
      return { s: r };
    };
    const emitir = (t) => { if (t && t.trim()) out.push({ x, y, t: winAnsi(t) }); };
    while (i < n) {
      const ch = c[i];
      if (esp(ch)) { i++; continue; }
      if (ch === '%') { while (i < n && c[i] !== '\n' && c[i] !== '\r') i++; continue; }
      if (ch === '(') { pila.push(literal()); continue; }
      if (ch === '<' && c[i + 1] === '<') { i += 2; pila.push({ dic: true }); continue; }
      if (ch === '>' && c[i + 1] === '>') { i += 2; continue; }
      if (ch === '<') { pila.push(hex()); continue; }
      if (ch === '[') { pila.push({ abre: true }); i++; continue; }
      if (ch === ']') {
        const arr = [];
        while (pila.length && !pila[pila.length - 1].abre) arr.unshift(pila.pop());
        pila.pop();
        pila.push({ arr });
        i++;
        continue;
      }
      if (ch === '/') { let k = i + 1; while (k < n && !esp(c[k]) && !'/[]()<>{}%'.includes(c[k])) k++; pila.push({ nom: c.slice(i + 1, k) }); i = k; continue; }
      let k = i; while (k < n && !esp(c[k]) && !'/[]()<>{}%'.includes(c[k])) k++;
      if (k === i) { i++; continue; }
      const tok = c.slice(i, k); i = k;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { pila.push({ num: Number(tok) }); continue; }
      const nums = () => pila.filter((p) => p.num !== undefined).map((p) => p.num);
      switch (tok) {
        case 'BT': x = y = lx = ly = 0; break;
        case 'Tm': { const v = nums().slice(-6); if (v.length === 6) { lx = x = v[4]; ly = y = v[5]; } break; }
        case 'Td': case 'TD': { const v = nums().slice(-2); if (v.length === 2) { lx += v[0]; ly += v[1]; x = lx; y = ly; if (tok === 'TD') lead = -v[1]; } break; }
        case 'TL': { const v = nums().slice(-1); if (v.length) lead = v[0]; break; }
        case 'T*': ly -= lead; x = lx; y = ly; break;
        case 'Tj': { const p = pila[pila.length - 1]; if (p && p.s !== undefined) emitir(p.s); break; }
        case "'": case '"': { ly -= lead; x = lx; y = ly; const p = pila[pila.length - 1]; if (p && p.s !== undefined) emitir(p.s); break; }
        case 'TJ': {
          const p = pila[pila.length - 1];
          if (p && p.arr) {
            let t = '';
            p.arr.forEach((e) => { if (e.s !== undefined) t += e.s; else if (e.num !== undefined && e.num < -200) t += ' '; });
            emitir(t);
          }
          break;
        }
        default: break;
      }
      pila.length = 0;
    }
    return out;
  }

  /** Agrupa los textos de una página en filas (de arriba hacia abajo). */
  function filas(textos, tol = 2) {
    const ord = textos.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const res = [];
    for (const t of ord) {
      const f = res.length ? res[res.length - 1] : null;
      if (f && Math.abs(f.y - t.y) <= tol) f.celdas.push(t);
      else res.push({ y: t.y, celdas: [t] });
    }
    res.forEach((f) => f.celdas.sort((a, b) => a.x - b.x));
    return res;
  }

  const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  /** "1.234,5" → 1234.5; "-217,6" → -217.6 */
  function numUy(t) {
    let s = String(t || '').replace(/\s|\$/g, '');
    if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const x = Number(s);
    return Number.isFinite(x) ? x : null;
  }

  const COLS = [
    ['cantidad', /^(cant|cantidad)\b/],
    ['unidad', /^(uni|unid|unidad|u\.m)/],
    ['descripcion', /^(descrip|detalle|articulo|producto|concepto)/],
    ['codigo', /^(cod\.?|codigo|cod articulo|codigo articulo)$/],
    ['item', /^(item|linea|renglon)$/], // número de renglón (1, 2, 3…): no es el código del producto
    ['unitario', /(unitario|p\.\s*unit|precio)/],
    ['descuento', /^(dto|desc\b|descuento|bonif)/],
    ['importe', /^(importe|total|monto|subtotal)/],
    ['indicador', /^\*$/],
  ];

  /** Lee los datos de cabecera y la tabla de productos. */
  function leerFactura(paginas) {
    const r = { items: [], avisos: [] };
    const todo = [];
    paginas.forEach((pag, ip) => filas(pag).forEach((f) => todo.push({ ...f, pag: ip, texto: f.celdas.map((c) => c.t.trim()).join(' ') })));
    const plano = todo.map((f) => f.texto).join('\n');
    // Los datos de la factura están arriba de la tabla de productos (en la primera página)
    const iTabla = todo.findIndex((f) => f.celdas.some((c) => /^cantidad$|^cant\.?$/.test(normal(c.t))));
    const cabecera = iTabla > 0 ? todo.slice(0, iTabla) : todo;
    const textoCabecera = cabecera.map((f) => f.texto).join('\n');
    // Rótulos sin puntos ni símbolos: «Nº», «N°» → «n»; «Nro.» → «nro»; «R.U.T.» → «r u t»
    const sinPunt = (s) => normal(s).replace(/[.:ºª°#]/g, ' ').replace(/\s+/g, ' ').trim();
    /** El valor de un rótulo: debajo (mismo x), a la derecha en la misma fila, o en la misma celda («Nº 5521»). */
    const valorDe = (rotulos, valida) => {
      const rs = rotulos.map(sinPunt);
      for (let k = 0; k < cabecera.length; k++) {
        const fila = cabecera[k];
        for (const c of fila.celdas) {
          const t = sinPunt(c.t);
          for (const r of rs) {
            if (t === r) {
              for (let j = k + 1; j < Math.min(cabecera.length, k + 3); j++) {
                const v = cabecera[j].celdas.find((x) => Math.abs(x.x - c.x) < 12);
                if (v && valida(v.t.trim())) return v.t.trim();
              }
              const der = fila.celdas.find((x) => x.x > c.x);
              if (der && valida(der.t.trim())) return der.t.trim();
            } else if (t.startsWith(r + ' ')) {
              const resto = t.slice(r.length + 1).toUpperCase();
              if (valida(resto)) return resto;
            }
          }
        }
      }
      return '';
    };
    const esNumero = (v) => /^([A-Z]{1,2}[\s-]?)?\d{1,9}$/i.test(String(v).trim());
    const esRut = (v) => /^\d{12}$/.test(String(v).replace(/[\s.-]/g, ''));
    r.rucEmisor = valorDe(['RUC EMISOR', 'RUT EMISOR', 'R.U.T. EMISOR', 'R.U.C. EMISOR', 'RUC', 'RUT', 'R.U.T.', 'R.U.C.'], esRut).replace(/[\s.-]/g, '')
      || ((plano.match(/R\.?\s?U\.?\s?[CT]\.?[^\d]{0,20}(\d{12})/i) || [])[1] || '');
    r.serie = valorDe(['SERIE'], (v) => /^[A-Z]{1,2}$/i.test(v)).toUpperCase();
    let numero = valorDe(['NÚMERO', 'NUMERO', 'NRO', 'Nº', 'N°', 'NUM', 'NÚMERO DE DOCUMENTO', 'NRO DOCUMENTO', 'NRO. DE DOCUMENTO'], esNumero)
      || ((/\bN(?:[º°o]|RO\.?|[ÚU]MERO)\s*[.:]?\s*([A-Z]{0,2}[\s-]?\d{1,9})\b/i.exec(textoCabecera) || [])[1] || '');
    // «A-5521» o «A 5521»: la letra es la serie
    const ms = /^([A-Z]{1,2})[\s-]*(\d+)$/i.exec(numero.trim());
    if (ms) { if (!r.serie) r.serie = ms[1].toUpperCase(); numero = ms[2]; }
    r.numero = numero.trim();
    r.tipo = valorDe(['TIPO DE DOCUMENTO', 'TIPO DE COMPROBANTE', 'TIPO CFE'], (v) => /[a-z]{3}/i.test(v));
    // Nota de crédito (devolución): no es mercadería que llegó
    r.notaCredito = /nota\s+de\s+cr[eé]dito|\bN\/C\b/i.test(r.tipo) || /\bnota\s+de\s+cr[eé]dito\b/i.test(textoCabecera);
    const fecha = valorDe(['FECHA DOCUMENTO', 'FECHA DE EMISIÓN', 'FECHA EMISIÓN', 'FECHA'], (v) => /\d{2}\/\d{2}\/\d{4}/.test(v)) || ((plano.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) || [])[1] || '');
    const mf = /(\d{2})\/(\d{2})\/(\d{4})/.exec(fecha);
    r.fecha = mf ? `${mf[3]}-${mf[2]}-${mf[1]}` : '';
    r.moneda = valorDe(['MONEDA'], (v) => /[a-z$]/i.test(v)) || ((/MONEDA\s*:?\s*([A-Z$]{1,4}\$?S?)/i.exec(textoCabecera) || [])[1] || '') || 'UYU';
    r.dolares = /USD|U\$S|US\$|D[OÓ]LAR/i.test(r.moneda);
    const tc = valorDe(['TIPO DE CAMBIO', 'T. CAMBIO', 'T/C', 'COTIZACIÓN', 'COTIZACION'], (v) => numUy(v) > 0);
    r.tipoCambio = tc ? numUy(tc) : null;
    const email = (plano.match(/[\w.-]+@([\w-]+)\.[\w.]+/) || []);
    r.email = email[0] || '';
    r.dominio = email[1] || '';
    // razón social del emisor: primera fila de texto arriba a la izquierda que no sea un número ni un rótulo
    const primeras = todo.filter((f) => f.pag === 0).slice(0, 12).flatMap((f) => f.celdas).filter((c) => c.x < 200 && /[A-Za-z]{3}/.test(c.t));
    r.emisor = primeras.length ? primeras[0].t.trim() : '';
    const tot = (re) => { const m = re.exec(plano); return m ? numUy(m[1]) : null; };
    r.total = tot(/TOTAL A PAGAR:?\s*([\d.,]+)/i) ?? tot(/Monto Total:?\s*([\d.,]+)/i) ?? tot(/\bTOTAL:?\s*\$?\s*([\d.,]+)/i);
    r.ivaTotal = tot(/Total IVA[^:]*:?\s*([\d.,]+)/i);
    r.netoGravado = 0;
    plano.replace(/Subtotal gravado \((\d+)%\):?\s*([\d.,]+)/gi, (m0, tasa, v) => { r.netoGravado += numUy(v) || 0; r.tasa = r.tasa || Number(tasa); return m0; });
    if (!r.tasa) { const mt = /IVA\s*\(?(22|10)\s*%/i.exec(plano); r.tasa = mt ? Number(mt[1]) : 22; }

    // ---- tabla ----
    let cols = null, ultimo = null, enTabla = false;
    const finTabla = /^(subtotal|total|monto|adenda|puede verificar|pagina|página|codigo de seguridad|nro de cae|iva al dia)/i;
    for (const f of todo) {
      const t = normal(f.texto);
      const esCabecera = f.celdas.some((c) => /^cantidad$|^cant\.?$/.test(normal(c.t))) && f.celdas.some((c) => /descrip|detalle|articulo/.test(normal(c.t)));
      if (esCabecera) {
        cols = [];
        f.celdas.forEach((c) => { const n = normal(c.t); const def = COLS.find(([, re]) => re.test(n)); if (def) cols.push({ k: def[0], x: c.x }); });
        cols.sort((a, b) => a.x - b.x);
        enTabla = true;
        continue;
      }
      if (!enTabla || !cols) continue;
      if (finTabla.test(t)) { enTabla = false; continue; }
      // a qué columna va cada celda: los números se alinean a la derecha, así que pueden empezar antes del título
      const deCol = (c) => {
        let mejor = cols[0];
        for (const col of cols) if (c.x >= col.x - 14) mejor = col;
        return mejor.k;
      };
      const v = {};
      f.celdas.forEach((c) => { const k = deCol(c); v[k] = v[k] ? v[k] + ' ' + c.t.trim() : c.t.trim(); });
      const cant = numUy(v.cantidad);
      const imp = numUy(v.importe);
      if (cant != null && imp != null && v.descripcion) {
        ultimo = {
          cantidad: cant, unidad: (v.unidad || '').trim(), descripcion: v.descripcion.replace(/\s+/g, ' ').trim(),
          unitario: numUy(v.unitario), descuento: numUy(v.descuento) || 0, importe: imp, indicador: (v.indicador || '').trim(), codigo: (v.codigo || '').trim(),
        };
        r.items.push(ultimo);
      } else if (ultimo && v.descripcion && cant == null && imp == null) {
        ultimo.descripcion = (ultimo.descripcion + ' ' + v.descripcion).replace(/\s+/g, ' ').trim();
        if (v.unidad) ultimo.unidad += v.unidad.trim();
      }
    }
    // Líneas que no son productos (redondeo, indicador 6 = no facturable)
    r.items = r.items.filter((it) => !/^redondeo\b/i.test(it.descripcion) && it.indicador !== '6' && it.cantidad > 0);
    // ¿Los importes ya incluyen IVA? Se comparan con el total a pagar y con el neto gravado.
    const suma = r.items.reduce((s, it) => s + it.importe, 0);
    r.sumaLineas = Math.round(suma * 100) / 100;
    if (r.total && r.netoGravado) r.ivaIncluido = Math.abs(suma - r.total) <= Math.abs(suma - r.netoGravado);
    else if (r.total && r.ivaTotal) r.ivaIncluido = Math.abs(suma - r.total) < Math.abs(suma - (r.total - r.ivaTotal));
    else r.ivaIncluido = null; // no se sabe
    if (!r.items.length) r.avisos.push('No encontré la tabla de productos en este PDF.');
    return r;
  }

  async function leerPdf(bytes) {
    if (latin1(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('El archivo no es un PDF.');
    const flujos = await flujosDeTexto(bytes);
    if (!flujos.length) throw new Error('El PDF no tiene texto (puede ser una foto o un escaneo).');
    return leerFactura(flujos.map(textosDePagina));
  }

  const api = { leerPdf, leerFactura, textosDePagina, filas, numUy, inflar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.LectorPdf = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* Etiquetas para impresoras térmicas (Unnion LP4206D y otras que entienden TSPL), 203 dpi = 8 puntos por mm.
 * Arma el dibujo de una etiqueta (nombre, código de barras EAN-13 o Code 128, código y estante: lo mismo que imprime el programa)
 * y lo pasa a comandos TSPL. El código de barras se dibuja barra por barra con el mismo armado que el programa
 * (js/codigo-barras.js), así sale igual en la vista previa, en la impresora y en las etiquetas de la PC.
 * Lo usan la app del celular (herramientas/fuentes/etiquetador.html) y el programa (impresión directa a la etiquetadora) y se prueba en tests/logica.test.js. */
(function (global) {
  'use strict';
  const CB = global.CodigoBarras || (typeof require === 'function' ? require('./codigo-barras.js') : null);
  // QR de las etiquetas de estante (vendor/qrcode.js). Se busca al usarlo: en la app del celular no hace falta.
  const QR = () => global.qrcode || (typeof require === 'function' ? (() => { try { return require('../vendor/qrcode.js'); } catch (e) { return null; } })() : null);
  const PUNTOS_MM = 8;
  // Letras de la impresora: ancho y alto de cada letra, en puntos
  const FUENTES = { 1: [8, 12], 2: [12, 20], 3: [16, 24], 4: [24, 32], 5: [32, 48] };

  /** La impresora solo tiene letras sin tilde: «Caño ½"» → «Cano 1/2'». */
  function ascii(t) {
    return String(t ?? '').replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4').replace(/[º°]/g, 'o')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/"/g, "'").replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
  }

  /** Corta el texto en renglones de hasta «max» letras (por palabras); el último lleva «...» si no entra. */
  function renglones(t, max, cuantos) {
    const palabras = t.split(' ');
    const r = [];
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? actual + ' ' + p : p;
      if (prueba.length <= max) { actual = prueba; continue; }
      if (actual) r.push(actual);
      actual = p.length > max ? p.slice(0, max) : p;
    }
    if (actual) r.push(actual);
    if (r.length > cuantos) {
      const ult = r.slice(cuantos - 1).join(' ');
      r.length = cuantos - 1;
      r.push(ult.length > max ? ult.slice(0, max - 3).trimEnd() + '...' : ult);
    }
    return r;
  }

  /** Cuántos puntos tiene la barra más fina si el código ocupa «lugar» puntos (con su zona en blanco). */
  const finoPara = (anchos, blanco, lugar) => Math.min(4, Math.floor(lugar / (anchos.reduce((s, x) => s + x, 0) + 2 * blanco)));
  /** El código de barras de la etiqueta: el EAN de fábrica si sale con barras más gruesas; si no, Code 128 (como siempre). */
  function elegirCodigo(codigo, lugar) {
    const c128 = CB.anchos128 ? CB.anchos128(codigo) : CB.anchos(codigo);
    const e = CB.ean && CB.ean(codigo) ? CB.anchos(codigo) : null;
    if (e && (!c128 || finoPara(e, 11, lugar) > finoPara(c128, 10, lugar))) return { anchos: e, blanco: 11, tipo: CB.ean(codigo).tipo };
    return c128 ? { anchos: c128, blanco: 10, tipo: 'code128' } : null;
  }

  /**
   * El dibujo de una etiqueta de producto. item: { nombre, codigo, ubicacion }. medida: { ancho, alto } en mm.
   * Devuelve { ancho, alto, textos: [{ x, y, fuente, texto }], barras: [{ x, y, w, h }], aviso } en puntos.
   */
  /**
   * El precio para la etiqueta: «$ 2.700», «$ 4,50» o «U$S 9,90» (sin decimales si es redondo).
   * Sale de item.precio y item.moneda (UYU o USD); vacío si no tiene precio.
   */
  function textoPrecio(item) {
    const n = typeof item.precio === 'number' ? item.precio : Number(String(item.precio == null ? '' : item.precio).replace(',', '.'));
    if (item.precio == null || item.precio === '' || !Number.isFinite(n) || n <= 0) return '';
    const redondo = Math.abs(n - Math.round(n)) < 0.005;
    const [ent, dec] = (redondo ? Math.round(n).toFixed(0) : n.toFixed(2)).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${item.moneda === 'USD' ? 'U$S' : '$'} ${miles}${dec ? ',' + dec : ''}`;
  }

  function disenoEtiqueta(item, medida) {
    if (item.qr && QR()) return disenoEstante(item, medida);
    const W = Math.round(medida.ancho * PUNTOS_MM), H = Math.round(medida.alto * PUNTOS_MM);
    const m = medida.alto < 30 ? 12 : 16; // margen
    const k = Math.min((medida.ancho - 2) / 70, (medida.alto - 2) / 37); // 1 = etiqueta de 70 × 37 mm
    const fN = k < 0.75 ? 2 : k < 1.2 ? 3 : k < 1.8 ? 4 : 5;     // nombre
    const fC = k < 0.75 ? 1 : k < 1.2 ? 2 : k < 1.8 ? 3 : 4;     // número del producto
    const fE = Math.min(5, fN + 1);                              // estante, más grande
    const codigo = ascii(item.codigo).toUpperCase();
    const estante = ascii(item.ubicacion).toUpperCase();
    const nombre = ascii(item.nombre);
    const precio = ascii(textoPrecio(item));
    const textos = [];
    const barras = [];
    let aviso = '';

    // Abajo: el número a la izquierda, el precio en el medio (grande: si el código de barras no se lee, el precio
    // está ahí) y el estante a la derecha. Si no entran, se achica primero el número, después el estante y el precio.
    const gap = 10;
    let fCod = fC, fEst = fE, fP = fE; // el precio, del tamaño del estante
    const ancho = (t, f) => (t ? t.length * FUENTES[f][0] : 0);
    const total = () => ancho(codigo, fCod) + ancho(precio, fP) + ancho(estante, fEst) + gap * ([codigo, precio, estante].filter(Boolean).length - 1);
    while (total() > W - 2 * m) {
      if (fCod > 1) fCod--;
      else if (fEst > Math.max(2, fP)) fEst--;
      else if (fP > 2) fP--;
      else if (fEst > 1) fEst--;
      else break;
    }
    let cod = codigo;
    // Si igual no entra, el número se corta (está también abajo de las barras… y en el sistema)
    while (cod.length > 3 && total() - ancho(codigo, fCod) + ancho(cod, fCod) > W - 2 * m) cod = cod.slice(0, -1);
    const [, chC] = FUENTES[fCod], [cwE, chE] = FUENTES[fEst], [cwP, chP] = FUENTES[fP];
    const altoPie = Math.max(estante ? chE : 0, precio ? chP : 0, cod ? chC : 0);
    const yPie = H - m - altoPie;
    if (cod) textos.push({ x: m, y: yPie + (altoPie - chC), fuente: fCod, texto: cod });
    const xE = W - m - estante.length * cwE;
    if (estante) textos.push({ x: Math.max(m, xE), y: yPie + (altoPie - chE), fuente: fEst, texto: estante });
    if (precio) {
      // Centrado en la etiqueta, pero sin pisar el número ni el estante
      const izq = m + (cod ? ancho(cod, fCod) + gap : 0), der = (estante ? xE - gap : W - m) - precio.length * cwP;
      const x = Math.round(Math.max(izq, Math.min(der, (W - precio.length * cwP) / 2)));
      textos.push({ x, y: yPie + (altoPie - chP), fuente: fP, texto: precio });
    }

    // Arriba: el nombre, en uno o dos renglones
    const [cwN, chN] = FUENTES[fN];
    const max = Math.max(4, Math.floor((W - 2 * m) / cwN));
    const libre = yPie - m - 8; // alto para el nombre y el código de barras
    const dos = libre - 2 * (chN + 4) >= 7 * PUNTOS_MM; // dos renglones si igual queda lugar para un código de 7 mm
    const lineas = nombre ? renglones(nombre, max, dos ? 2 : 1) : [];
    lineas.forEach((l, i) => textos.push({ x: m, y: m + i * (chN + 4), fuente: fN, texto: l }));
    const yBarras = m + lineas.length * (chN + 4) + 6;

    // En el medio: el código de barras, centrado, con su zona en blanco a los costados
    // EAN-13 / EAN-8 (el de fábrica) si con eso las barras salen más gruesas que en Code 128; si no, Code 128
    const cb = CB && codigo ? elegirCodigo(codigo, W - 2 * m) : null;
    const a = cb && cb.anchos;
    if (a) {
      const blanco = cb.blanco;
      const modulos = a.reduce((s, x) => s + x, 0) + 2 * blanco;
      let fino = Math.min(4, Math.floor((W - 2 * m) / modulos));
      if (fino < 1) { fino = 1; aviso = 'El código es muy largo para esta etiqueta: puede no leerse.'; }
      else if (fino < 2) aviso = 'Etiqueta angosta para este código: las barras salen muy finas. Probá que el lector la lea.';
      const ancho = (modulos - 2 * blanco) * fino;
      const alto = Math.max(4 * PUNTOS_MM, Math.min(30 * PUNTOS_MM, yPie - 6 - yBarras));
      // La impresora térmica engorda cada barra: con barras de 3 puntos o más se dibujan un punto más finas,
      // así los espacios angostos no se tapan (lo que lee la cámara del celular). El lector mide de borde a borde
      // de barras iguales, así que el código no cambia.
      const afinar = fino >= 3 ? 1 : 0;
      let x = Math.round((W - ancho) / 2);
      a.forEach((w, i) => { if (i % 2 === 0) barras.push({ x, y: yBarras, w: w * fino - afinar, h: alto }); x += w * fino; });
    } else if (codigo) aviso = 'Ese código tiene letras que el código de barras no acepta.';
    return { ancho: medida.ancho, alto: medida.alto, puntos: [W, H], textos, barras, aviso };
  }

  /** Los cuadraditos de un QR: { n (módulos por lado), negro(fila, col) }. Corrección media (M): se lee aunque se raspe un poco. */
  function modulosQR(texto) {
    const q = QR()(0, 'M');
    q.addData(String(texto));
    q.make();
    const n = q.getModuleCount();
    return { n, negro: (f, c) => q.isDark(f, c) };
  }

  /**
   * El dibujo de una etiqueta de estante: un QR a la izquierda (para no confundirla con una de producto, que lleva
   * código de barras) y a la derecha el estante en letras grandes, la categoría y el número corto.
   * item: { qr: true, codigo (lo que lleva el QR, el número corto: U12), ubicacion (B-3), nombre (la categoría) }.
   */
  function disenoEstante(item, medida) {
    const W = Math.round(medida.ancho * PUNTOS_MM), H = Math.round(medida.alto * PUNTOS_MM);
    const m = medida.alto < 30 ? 12 : 16;
    const codigo = ascii(item.codigo).toUpperCase();
    const estante = ascii(item.ubicacion).toUpperCase();
    const categoria = ascii(item.nombre);
    const textos = [], barras = [];
    let aviso = '';
    // El QR: lo más grande que entre en el alto, sin pasar del 55 % del ancho, con 2 módulos de blanco alrededor
    const { n, negro } = modulosQR(codigo);
    const lado = Math.min(H - 2 * m, Math.floor(W * 0.55));
    const mod = Math.max(1, Math.floor(lado / (n + 4)));
    if (mod < 3) aviso = 'Etiqueta chica para el QR: probá que el celular lo lea.';
    const qr = mod * n;
    const x0 = m + 2 * mod, y0 = Math.round((H - qr) / 2);
    for (let f = 0; f < n; f++) {
      // Cada tira seguida de cuadraditos negros de una fila va como una sola barra (menos comandos para la impresora)
      for (let c = 0; c < n;) {
        if (!negro(f, c)) { c++; continue; }
        let fin = c;
        while (fin + 1 < n && negro(f, fin + 1)) fin++;
        barras.push({ x: x0 + c * mod, y: y0 + f * mod, w: (fin - c + 1) * mod, h: mod });
        c = fin + 1;
      }
    }
    // A la derecha: el estante (lo más grande que entre), la categoría y el número corto
    const xT = x0 + qr + 2 * mod + 8;
    const anchoT = W - m - xT;
    let fE = 5;
    while (fE > 2 && estante.length * FUENTES[fE][0] > anchoT) fE--;
    const fCat = fE >= 4 ? 2 : 1;
    const [cwE, chE] = FUENTES[fE], [cwC, chC] = FUENTES[fCat];
    const lineasCat = categoria ? renglones(categoria, Math.max(4, Math.floor(anchoT / cwC)), H - 2 * m - chE - chC > 2 * (chC + 4) ? 2 : 1) : [];
    const altoBloque = chE + (lineasCat.length ? 8 + lineasCat.length * (chC + 4) : 0) + 8 + FUENTES[1][1];
    let y = Math.max(m, Math.round((H - altoBloque) / 2));
    if (estante) textos.push({ x: xT, y, fuente: fE, texto: estante.slice(0, Math.max(1, Math.floor(anchoT / cwE))) });
    y += chE + 8;
    lineasCat.forEach((l) => { textos.push({ x: xT, y, fuente: fCat, texto: l }); y += chC + 4; });
    if (codigo) textos.push({ x: xT, y: Math.min(H - m - FUENTES[1][1], y + 4), fuente: 1, texto: codigo.slice(0, Math.max(1, Math.floor(anchoT / FUENTES[1][0]))) });
    if (anchoT < 8 * PUNTOS_MM) aviso = 'Etiqueta angosta: el nombre del estante puede no entrar al lado del QR.';
    return { ancho: medida.ancho, alto: medida.alto, puntos: [W, H], textos, barras, aviso, qr: true };
  }

  /**
   * Comandos TSPL para imprimir el dibujo. opc: { copias, separacion (mm entre etiquetas), oscuridad (1-15), velocidad,
   * correrX / correrY (mm, pueden ser negativos: corren todo el dibujo si la impresora no lo pone justo en la etiqueta),
   * girar (true: lo imprime dado vuelta, DIRECTION 0),
   * cabezal (mm de ancho que imprime la impresora: 48, 72 o 104; el área de impresión se hace de ese ancho
   * para poder correr el dibujo hasta donde está la etiqueta sin que «dé la vuelta») }.
   */
  function tspl(d, opc = {}) {
    const copias = Math.max(1, Math.min(500, Math.floor(Number(opc.copias) || 1)));
    const gap = Number.isFinite(Number(opc.separacion)) ? Number(opc.separacion) : 2;
    const mm = (v) => (Number.isFinite(Number(v)) ? Math.round(Math.max(-60, Math.min(60, Number(v))) * PUNTOS_MM) : 0);
    const dx = mm(opc.correrX), dy = mm(opc.correrY);
    const X = (x) => Math.max(0, Math.round(x + dx)), Y = (y) => Math.max(0, Math.round(y + dy));
    const l = [
      `SIZE ${Math.max(d.ancho, Number(opc.cabezal) || 0)} mm,${d.alto} mm`,
      `GAP ${gap} mm,0 mm`,
      `DENSITY ${Math.max(1, Math.min(15, Math.round(Number(opc.oscuridad) || 8)))}`,
      `SPEED ${Math.max(2, Math.min(6, Math.round(Number(opc.velocidad) || 4)))}`,
      opc.girar ? 'DIRECTION 0' : 'DIRECTION 1',
      'REFERENCE 0,0',
      'CLS',
    ];
    for (const c of d.cajas || []) l.push(`BOX ${X(c.x1)},${Y(c.y1)},${X(c.x2)},${Y(c.y2)},${c.grosor || 3}`);
    for (const t of d.textos) l.push(`TEXT ${X(t.x)},${Y(t.y)},"${t.fuente}",0,1,1,"${t.texto.replace(/"/g, "'")}"`);
    // El código de barras nunca se recorta: si el corrimiento lo deja (en parte) fuera de la zona que imprime la
    // impresora, se acomoda entero para que entre. Una barra cortada cambia el número que lee el lector.
    const xs = d.barras.map((b) => b.x + dx);
    const anchoImp = Math.round(Math.max(d.ancho, Number(opc.cabezal) || 0) * PUNTOS_MM);
    const izq = xs.length ? Math.min(...xs) : 0, der = xs.length ? Math.max(...d.barras.map((b, i) => xs[i] + b.w)) : 0;
    const acomodar = izq < 0 ? -izq : der > anchoImp ? Math.max(-izq, anchoImp - der) : 0;
    for (const [i, b] of d.barras.entries()) {
      const x = xs[i] + acomodar, y = b.y + dy;
      const h = b.h + Math.min(0, y);
      if (b.w > 0 && h > 0) l.push(`BAR ${Math.max(0, x)},${Math.max(0, y)},${b.w},${h}`);
    }
    l.push(`PRINT 1,${copias}`);
    return l.join('\r\n') + '\r\n';
  }

  /** Página de prueba: un recuadro del tamaño de la etiqueta y su medida, para ver si está bien configurada. */
  function tsplPrueba(medida, opc = {}) {
    const W = Math.round(medida.ancho * PUNTOS_MM), H = Math.round(medida.alto * PUNTOS_MM);
    const d = disenoEtiqueta({ nombre: `Prueba ${medida.ancho} x ${medida.alto} mm`, codigo: 'PRUEBA-1', ubicacion: 'OK' }, medida);
    d.cajas = [{ x1: 4, y1: 4, x2: W - 4, y2: H - 4, grosor: 3 }];
    return tspl(d, opc);
  }

  /**
   * Regla para calibrar: rayitas cada 1 mm y números cada 5 mm a lo ancho de todo el cabezal.
   * El número que queda en el borde izquierdo de la etiqueta es lo que hay que poner en «Correr a los costados».
   */
  function tsplRegla(opc = {}) {
    const cab = Math.max(20, Math.min(108, Number(opc.cabezal) || 72));
    const alto = Math.max(15, Math.min(300, Number(opc.alto) || 25));
    const d = { ancho: cab, alto, textos: [], barras: [] };
    for (let mm = 0; mm <= cab; mm++) {
      const h = mm % 10 === 0 ? 72 : mm % 5 === 0 ? 48 : 24;
      d.barras.push({ x: Math.min(mm * PUNTOS_MM, cab * PUNTOS_MM - 2), y: 16, w: 2, h });
      if (mm % 5 === 0 && mm < cab) d.textos.push({ x: mm * PUNTOS_MM + 3, y: 96, fuente: '2', texto: String(mm) });
    }
    d.barras.push({ x: 0, y: 14, w: cab * PUNTOS_MM, h: 2 });
    return tspl(d, { ...opc, correrX: 0, correrY: 0, copias: 1 });
  }

  /** Dibuja la vista previa en un canvas (tamaño real a 203 dpi, escalado con «escala»). */
  function dibujar(d, canvas, escala = 1) {
    const [W, H] = d.puntos;
    canvas.width = W * escala; canvas.height = H * escala;
    const c = canvas.getContext('2d');
    c.scale(escala, escala);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#000';
    for (const b of d.barras) c.fillRect(b.x, b.y, b.w, b.h);
    c.textBaseline = 'top';
    for (const t of d.textos) {
      const [cw, ch] = FUENTES[t.fuente];
      c.font = `bold ${ch}px "Courier New", monospace`;
      c.save();
      // Las letras de la impresora son de ancho fijo: se estiran para que ocupen lo mismo
      const medido = c.measureText(t.texto).width || 1;
      c.translate(t.x, t.y);
      c.scale((t.texto.length * cw) / medido, 1);
      c.fillText(t.texto, 0, 0);
      c.restore();
    }
  }

  const api = { ascii, renglones, textoPrecio, disenoEtiqueta, disenoEstante, modulosQR, tspl, tsplPrueba, tsplRegla, dibujar, FUENTES, PUNTOS_MM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EtiquetaTSPL = api;
  api.elegirCodigo = elegirCodigo; // EAN-13 o Code 128 (aparte, para no chocar con otros cambios de la lista de arriba)
})(typeof window !== 'undefined' ? window : globalThis);

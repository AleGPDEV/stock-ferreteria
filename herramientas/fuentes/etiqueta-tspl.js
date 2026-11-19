/* Etiquetas para impresoras térmicas (Unnion LP4206D y otras que entienden TSPL), 203 dpi = 8 puntos por mm.
 * Arma el dibujo de una etiqueta (nombre, código de barras Code 128, código y estante: lo mismo que imprime el programa)
 * y lo pasa a comandos TSPL. El código de barras se dibuja barra por barra con el mismo armado que el programa
 * (js/codigo-barras.js), así sale igual en la vista previa, en la impresora y en las etiquetas de la PC.
 * Lo usa la app del celular (herramientas/fuentes/etiquetador.html) y se prueba en tests/logica.test.js. */
(function (global) {
  'use strict';
  const CB = global.CodigoBarras || (typeof require === 'function' ? require('../../js/codigo-barras.js') : null);
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

  /**
   * El dibujo de una etiqueta de producto. item: { nombre, codigo, ubicacion }. medida: { ancho, alto } en mm.
   * Devuelve { ancho, alto, textos: [{ x, y, fuente, texto }], barras: [{ x, y, w, h }], aviso } en puntos.
   */
  function disenoEtiqueta(item, medida) {
    const W = Math.round(medida.ancho * PUNTOS_MM), H = Math.round(medida.alto * PUNTOS_MM);
    const m = medida.alto < 30 ? 12 : 16; // margen
    const k = Math.min((medida.ancho - 2) / 70, (medida.alto - 2) / 37); // 1 = etiqueta de 70 × 37 mm
    const fN = k < 0.75 ? 2 : k < 1.2 ? 3 : k < 1.8 ? 4 : 5;     // nombre
    const fC = k < 0.75 ? 1 : k < 1.2 ? 2 : k < 1.8 ? 3 : 4;     // número del producto
    const fE = Math.min(5, fN + 1);                              // estante, más grande
    const codigo = ascii(item.codigo).toUpperCase();
    const estante = ascii(item.ubicacion).toUpperCase();
    const nombre = ascii(item.nombre);
    const textos = [];
    const barras = [];
    let aviso = '';

    // Abajo: el número a la izquierda y el estante a la derecha
    const [cwE, chE] = FUENTES[fE];
    let fCod = fC;
    const xE = W - m - estante.length * cwE;
    while (fCod > 1 && m + codigo.length * FUENTES[fCod][0] + 10 > (estante ? xE : W - m)) fCod--;
    const [cwC, chC] = FUENTES[fCod];
    const altoPie = Math.max(estante ? chE : 0, chC);
    const yPie = H - m - altoPie;
    if (codigo) textos.push({ x: m, y: yPie + (altoPie - chC), fuente: fCod, texto: codigo.slice(0, Math.floor((W - 2 * m) / cwC)) });
    if (estante) textos.push({ x: Math.max(m, xE), y: yPie, fuente: fE, texto: estante });

    // Arriba: el nombre, en uno o dos renglones
    const [cwN, chN] = FUENTES[fN];
    const max = Math.max(4, Math.floor((W - 2 * m) / cwN));
    const libre = yPie - m - 8; // alto para el nombre y el código de barras
    const dos = libre - 2 * (chN + 4) >= 7 * PUNTOS_MM; // dos renglones si igual queda lugar para un código de 7 mm
    const lineas = nombre ? renglones(nombre, max, dos ? 2 : 1) : [];
    lineas.forEach((l, i) => textos.push({ x: m, y: m + i * (chN + 4), fuente: fN, texto: l }));
    const yBarras = m + lineas.length * (chN + 4) + 6;

    // En el medio: el código de barras, centrado, con su zona en blanco a los costados
    const a = CB && codigo ? CB.anchos(codigo) : null;
    if (a) {
      const modulos = a.reduce((s, x) => s + x, 0) + 20; // + 10 módulos en blanco de cada lado
      let fino = Math.min(4, Math.floor((W - 2 * m) / modulos));
      if (fino < 1) { fino = 1; aviso = 'El código es muy largo para esta etiqueta: puede no leerse.'; }
      else if (fino < 2) aviso = 'Etiqueta angosta para este código: las barras salen muy finas. Probá que el lector la lea.';
      const ancho = (modulos - 20) * fino;
      const alto = Math.max(4 * PUNTOS_MM, Math.min(30 * PUNTOS_MM, yPie - 6 - yBarras));
      let x = Math.round((W - ancho) / 2);
      a.forEach((w, i) => { if (i % 2 === 0) barras.push({ x, y: yBarras, w: w * fino, h: alto }); x += w * fino; });
    } else if (codigo) aviso = 'Ese código tiene letras que el código de barras no acepta.';
    return { ancho: medida.ancho, alto: medida.alto, puntos: [W, H], textos, barras, aviso };
  }

  /**
   * Comandos TSPL para imprimir el dibujo. opc: { copias, separacion (mm entre etiquetas), oscuridad (1-15), velocidad,
   * correrX / correrY (mm, pueden ser negativos: corren todo el dibujo si la impresora no lo pone justo en la etiqueta),
   * girar (true: lo imprime dado vuelta, DIRECTION 0) }.
   */
  function tspl(d, opc = {}) {
    const copias = Math.max(1, Math.min(500, Math.floor(Number(opc.copias) || 1)));
    const gap = Number.isFinite(Number(opc.separacion)) ? Number(opc.separacion) : 2;
    const mm = (v) => (Number.isFinite(Number(v)) ? Math.round(Math.max(-60, Math.min(60, Number(v))) * PUNTOS_MM) : 0);
    const dx = mm(opc.correrX), dy = mm(opc.correrY);
    const X = (x) => Math.max(0, Math.round(x + dx)), Y = (y) => Math.max(0, Math.round(y + dy));
    const l = [
      `SIZE ${d.ancho} mm,${d.alto} mm`,
      `GAP ${gap} mm,0 mm`,
      `DENSITY ${Math.max(1, Math.min(15, Math.round(Number(opc.oscuridad) || 8)))}`,
      `SPEED ${Math.max(2, Math.min(6, Math.round(Number(opc.velocidad) || 4)))}`,
      opc.girar ? 'DIRECTION 0' : 'DIRECTION 1',
      'REFERENCE 0,0',
      'CLS',
    ];
    for (const c of d.cajas || []) l.push(`BOX ${X(c.x1)},${Y(c.y1)},${X(c.x2)},${Y(c.y2)},${c.grosor || 3}`);
    for (const t of d.textos) l.push(`TEXT ${X(t.x)},${Y(t.y)},"${t.fuente}",0,1,1,"${t.texto.replace(/"/g, "'")}"`);
    for (const b of d.barras) {
      // Si queda corrida hacia afuera, se recorta en lugar de mandar coordenadas negativas.
      const x = b.x + dx, y = b.y + dy;
      const w = b.w + Math.min(0, x), h = b.h + Math.min(0, y);
      if (w > 0 && h > 0) l.push(`BAR ${Math.max(0, x)},${Math.max(0, y)},${w},${h}`);
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

  const api = { ascii, renglones, disenoEtiqueta, tspl, tsplPrueba, dibujar, FUENTES, PUNTOS_MM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EtiquetaTSPL = api;
})(typeof window !== 'undefined' ? window : globalThis);

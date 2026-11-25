/* Importar productos desde una planilla (sin pantalla): leer columnas, armar el plan de qué se agrega
 * y qué se actualiza, filas dudosas, facturas repetidas y aplicar la importación.
 * La pantalla está en pantallas/importar-excel.js. */
'use strict';

/* ---------- Importar productos desde una planilla ---------- */

const COLUMNAS = {
  codigo: ['codigo', 'cod', 'sku', 'code'],
  // El código que usa el proveedor para ese producto: se guarda aparte, junto con el proveedor
  codprov: ['codigo del proveedor', 'codigo proveedor', 'cod proveedor', 'cod prov', 'codigo prov', 'ref proveedor', 'referencia del proveedor'],
  barras: ['codigo de barras', 'codigos de barras', 'ean', 'barras'],
  nombre: ['producto', 'nombre', 'descripcion', 'articulo', 'detalle'],
  categoria: ['categoria', 'rubro', 'familia'],
  subcategoria: ['subcategoria', 'sub categoria', 'subrubro', 'sub rubro'],
  unidad: ['unidad', 'um', 'unidad de medida'],
  proveedor: ['proveedor'],
  ubicacion: ['ubicacion', 'estante', 'lugar'],
  stock: ['stock', 'stock actual', 'existencia', 'existencias'],
  minimo: ['stock minimo', 'minimo', 'stock min', 'min'],
  costo: ['costo', 'precio de costo', 'costo unitario', 'precio costo'],
  precio: ['precio', 'precio de venta', 'precio venta', 'pvp', 'venta'],
  entrada: ['llego', 'entrada', 'cantidad que llego', 'sumar al stock', 'llegada'],
  factura: ['factura', 'comprobante', 'documento'],
  conteo: ['contado', 'conteo', 'stock contado'], // la pone el Cargador de productos: el Stock es lo que se contó
  moneda: ['moneda', 'divisa'], // USD (U$S, dólares) o UYU (pesos): en qué moneda están el costo y el precio
};
const UNIDADES = ['unidad', 'kg', 'm', 'litro', 'caja', 'paquete', 'rollo', 'par'];
const ALIAS_UNIDAD = { u: 'unidad', un: 'unidad', und: 'unidad', unid: 'unidad', unidades: 'unidad', kilo: 'kg', kilos: 'kg', kgs: 'kg', metro: 'm', metros: 'm', mt: 'm', mts: 'm', l: 'litro', lt: 'litro', lts: 'litro', litros: 'litro', cajas: 'caja', paq: 'paquete', paquetes: 'paquete', rollos: 'rollo', pares: 'par' };

const normCol = (k) => normal(k).replace(/[._:]/g, ' ').replace(/\s+/g, ' ').trim();
function normUnidad(u) {
  const x = normal(u).replace(/\./g, '').trim();
  if (UNIDADES.includes(x)) return x;
  return ALIAS_UNIDAD[x] || 'unidad';
}

/** Convierte "1.234,50", "$ 290" o 12.5 en número. Devuelve null si la celda está vacía o no es un número. */
function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(t)) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

/** Campos que se pueden cambiar en los productos que ya existen al importar. */
const CAMPOS_IMPORTAR = { precio: true, costo: true, stock: false, nombre: false, otros: false, entrada: true, repetidas: false, deposito: false };

/* Facturas que ya se cargaron: las entradas tienen la nota «Factura A 1234» (o «Factura A 1234, A 1300»). */
const normFactura = (f) => String(f || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+/, '$1');
const facturasDeTexto = (t) => String(t || '').split(/\s*[,;]\s*/).map((x) => x.trim()).filter((x) => /\d/.test(x));
function facturasCargadas(d) {
  const mapa = new Map(); // número normalizado → [{ fecha, proveedorId }]
  for (const m of d.movimientos) {
    if (m.tipo !== 'entrada' || !/^Factura\s/.test(m.nota || '')) continue;
    for (const f of facturasDeTexto(m.nota.replace(/^Factura\s+/, ''))) {
      const k = normFactura(f);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push({ fecha: m.fecha, proveedorId: m.proveedorId || '' });
    }
  }
  return mapa;
}

/** Lee las filas de la planilla y arma qué se agregaría y qué se actualizaría, sin tocar los datos.
 *  Si la planilla no tiene columna «Producto» pero sí «Código», solo actualiza productos que ya existen. */
function planImportacion(d, filas) {
  const plan = { nuevos: [], actualizados: [], salteadas: 0, sinProducto: 0, columnas: [], soloActualiza: false, facturasRepetidas: [], deConteo: false, otroProveedor: [], dudosas: [], repetidasDistintas: [], enDeposito: [] };
  let cargadas = null;
  const mapa = {};
  const claves = new Set();
  filas.forEach((f) => Object.keys(f).forEach((k) => claves.add(k)));
  for (const k of claves) {
    const nk = normCol(k);
    for (const [campo, alias] of Object.entries(COLUMNAS)) if (!mapa[campo] && alias.includes(nk)) mapa[campo] = k;
  }
  plan.columnas = Object.values(mapa);
  if (!mapa.nombre && !mapa.codigo && !mapa.barras && !mapa.codprov) {
    plan.error = 'No encontré la columna «Producto» ni la columna «Código». La primera fila de la planilla tiene que tener los títulos de las columnas.';
    return plan;
  }
  plan.soloActualiza = !mapa.nombre;
  plan.conEntrada = !!mapa.entrada;
  plan.deFactura = !!mapa.factura;
  const porCodigo = new Map(d.productos.flatMap((p) => codigosDe(p).map((c) => [normCodigo(c), p])));
  const porNombre = new Map(d.productos.map((p) => [normal(p.nombre), p]));
  // Código de cada proveedor → producto (clave «idProveedor|CÓDIGO»)
  const porCodigoProv = new Map(d.productos.flatMap((p) => codigosProvDe(p).map((x) => [`${x.proveedorId}|${normCodigo(x.codigo)}`, p])));
  const provPorNombre = new Map(d.proveedores.map((v) => [normal(v.nombre), v]));
  const vistos = new Map();
  const codigosNuevos = new Set();
  let sec = 0;
  const codigoNuevo = () => { let c; do { sec++; c = 'P-' + String(sec).padStart(4, '0'); } while (porCodigo.has(c) || vistos.has(c) || codigosNuevos.has(c)); return c; };
  for (const f of filas) {
    const txt = (c) => (mapa[c] ? String(f[mapa[c]] ?? '').trim() : '');
    const num = (c) => (mapa[c] ? parseNum(f[mapa[c]]) : null);
    const nombre = txt('nombre');
    const codprov = normCodigo(txt('codprov'));
    let codigo = txt('codigo').toUpperCase() || (mapa.codigo ? '' : codprov);
    const barras = [...new Set(txt('barras').toUpperCase().split(/[\s,;\/|]+/).filter((x) => x.length >= 3))];
    if (plan.soloActualiza ? !codigo && !codprov && !barras.length : !nombre) { plan.salteadas++; continue; }
    const provFila = txt('proveedor');
    const prov = provFila ? provPorNombre.get(normal(provFila)) : null;
    // ¿Es de otro proveedor? Un código propio igual no alcanza para decir que es el mismo producto
    // si la fila dice un proveedor y el producto encontrado es de otro.
    const deOtro = (p) => !!(p && provFila && p.proveedorId && (!prov || p.proveedorId !== prov.id));
    // Sin columna «Código del proveedor», el código de la fila puede ser el del proveedor (planillas viejas del Lector)
    const refProv = codprov || codigo;
    let existente = (prov && refProv && porCodigoProv.get(`${prov.id}|${refProv}`)) || barras.map((b) => porCodigo.get(b)).find(Boolean) || null;
    let choca = false;
    if (!existente && codigo) {
      const p = porCodigo.get(codigo);
      if (p && deOtro(p)) {
        choca = true;
        plan.otroProveedor.push({ codigo, nombre: nombre || codprov, proveedor: provFila, otro: p.nombre, otroProveedor: nombreProveedorDe(d, p.proveedorId), nuevo: !plan.soloActualiza });
      } else existente = p || null;
    }
    if (!existente && !codigo && !codprov && nombre) existente = porNombre.get(normal(nombre)) || null;
    // Mismo código pero la descripción no se parece en nada al producto (ni a cómo lo llama ese proveedor):
    // no se pisa. Va como producto nuevo y en la vista previa se puede marcar «Es el mismo».
    let dudosaDe = null, repetidaDe = '';
    // (un código de barras del paquete sí alcanza: es único)
    const porBarras = existente && (barras.some((b) => porCodigo.get(b) === existente) || (existente.barras || []).map(normCodigo).includes(codigo));
    if (existente && nombre && !plan.soloActualiza && !porBarras) {
      const descProv = codigosProvDe(existente).map((x) => x.desc).filter(Boolean);
      if (!seParecen(nombre, existente.nombre) && !descProv.some((x) => seParecen(nombre, x))) {
        dudosaDe = existente;
        existente = null;
      }
    }
    if (plan.soloActualiza && !existente) { plan.sinProducto++; continue; }
    let clave = existente ? existente.codigo : provFila && codprov ? `p:${normal(provFila)}|${codprov}` : (codigo || 'n:' + normal(nombre));
    if (dudosaDe) clave = 'd:' + normal(nombre);
    if (vistos.has(clave)) {
      // Dos filas con el mismo código y descripciones distintas: no se saltea en silencio la segunda
      const primera = vistos.get(clave);
      if (!nombre || !primera || normal(primera) === normal(nombre) || plan.soloActualiza) { plan.salteadas++; continue; }
      plan.repetidasDistintas.push({ codigo: codprov || codigo, nombre, primera });
      clave = 'r:' + normal(nombre);
      existente = null;
      repetidaDe = primera;
      if (vistos.has(clave)) { plan.salteadas++; continue; }
    }
    vistos.set(clave, nombre);
    const datos = {
      nombre, categoria: txt('categoria'), subcategoria: txt('subcategoria'), unidad: txt('unidad') ? normUnidad(txt('unidad')) : '', proveedor: provFila,
      ubicacion: txt('ubicacion'), stock: num('stock'), minimo: num('minimo'), costo: num('costo'), precio: num('precio'),
      entrada: num('entrada'), factura: txt('factura'), barras, codprov: codprov || (choca ? codigo : ''),
      moneda: leerMoneda(txt('moneda')),
    };
    if (mapa.conteo && /^(si|sí|s|x|1|true)$/i.test(txt('conteo'))) { datos.contado = true; plan.deConteo = true; }
    // ¿La mercadería de esta factura ya se sumó antes? (mismo número y, si se sabe, mismo proveedor)
    if (datos.factura && datos.entrada > 0) {
      const provId = (d.proveedores.find((v) => datos.proveedor && normal(v.nombre) === normal(datos.proveedor)) || {}).id || '';
      for (const f of facturasDeTexto(datos.factura)) {
        const previas = (cargadas || (cargadas = facturasCargadas(d))).get(normFactura(f)) || [];
        const igual = previas.filter((x) => !provId || !x.proveedorId || x.proveedorId === provId);
        if (!igual.length) continue;
        datos.repetida = true;
        const fecha = igual.map((x) => x.fecha).sort()[0];
        if (!plan.facturasRepetidas.some((x) => x.factura === f)) plan.facturasRepetidas.push({ factura: f, fecha });
      }
    }
    if (repetidaDe) datos.repetidaDe = repetidaDe;
    if (dudosaDe) {
      datos.dudosaDe = dudosaDe.id;
      plan.dudosas.push({ codigo: codprov || codigo, nombre, id: dudosaDe.id, otro: dudosaDe.nombre, otroProveedor: nombreProveedorDe(d, dudosaDe.proveedorId) });
    }
    // Lo que llegó y ya se sumó en el Depósito en los últimos días: no se vuelve a sumar con la factura
    const prodEntrada = existente || dudosaDe;
    if (prodEntrada && datos.entrada > 0) {
      const desde = Date.now() - DIAS_RECIBIDO_DEPOSITO * DIA;
      const rec = d.movimientos.filter((m) => m.productoId === prodEntrada.id && m.tipo === 'entrada' && m.nota === 'Llegó (Depósito)' && Date.parse(m.fecha) >= desde);
      if (rec.length) {
        const r = { cantidad: red(rec.reduce((x, m) => x + m.cantidad, 0)), fecha: rec.map((m) => m.fecha).sort().pop() };
        // Si la fila es dudosa (va como producto nuevo), solo cuenta si después se elige «es el mismo»
        if (existente) {
          datos.enDeposito = r;
          plan.enDeposito.push({ id: prodEntrada.id, nombre: prodEntrada.nombre, llego: datos.entrada, ...r });
        } else datos.enDepositoSiMismo = r;
      }
    }
    if (existente) plan.actualizados.push({ id: existente.id, codigo: existente.codigo, nombreActual: existente.nombre, stockActual: existente.stock, precioActual: existente.precio, datos });
    else {
      // El código propio no puede repetirse: si ya lo usa otro producto (de otro proveedor), lleva uno nuevo
      if (!codigo || porCodigo.has(codigo) || codigosNuevos.has(codigo)) codigo = codigoNuevo();
      codigosNuevos.add(codigo);
      plan.nuevos.push({ codigo, datos });
    }
  }
  return plan;
}
const nombreProveedorDe = (d, id) => ((d.proveedores.find((v) => v.id === id) || {}).nombre || '');
const DIAS_RECIBIDO_DEPOSITO = 7;

/** Cambios de stock que haría la importación en productos que ya existen (para mostrarlos antes de confirmar). */
function cambiosStockImportacion(plan) {
  return plan.actualizados
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.datos.stock != null && a.datos.stock >= 0 && red(a.datos.stock) !== a.stockActual)
    // i: la fila en plan.actualizados; cambiar: se puede desmarcar producto por producto (a.sinStock)
    .map(({ a, i }) => ({ i, codigo: a.codigo, nombre: a.nombreActual, antes: a.stockActual, despues: red(a.datos.stock), cambiar: !a.sinStock }));
}

/** campos: qué se cambia en los productos que ya existen ({ precio, costo, stock, nombre, otros }).
 *  Sin campos, se cambia todo (comportamiento de las versiones anteriores). Los productos nuevos se cargan completos. */
function aplicarImportacion(d, plan, campos) {
  const c = campos || { precio: true, costo: true, stock: true, nombre: true, otros: true, entrada: true };
  let llegadas = 0;
  // Mercadería que llegó (columna «Llegó»): se suma al stock como una entrada, con su costo y su factura
  const sumarLlegada = (p, x) => {
    if (!(c.entrada && x.entrada > 0)) return;
    if (x.repetida && !c.repetidas) return; // factura ya cargada: solo se vuelve a sumar si se marcó a propósito
    if (x.enDeposito && !c.deposito) return; // ya se sumó al recibirlo en el Depósito
    // La entrada va a nombre del proveedor de la factura (puede no ser el habitual del producto)
    const err = registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: x.entrada, costoUnit: c.costo && x.costo > 0 ? x.costo : '', proveedorId: x.proveedor ? provId(x.proveedor) : p.proveedorId, nota: x.factura ? `Factura ${x.factura}` : 'Llegó (importado)' });
    if (!err) llegadas++;
  };
  const provId = (nombre) => {
    if (!nombre) return '';
    let v = d.proveedores.find((x) => normal(x.nombre) === normal(nombre));
    if (!v) { v = { id: uid(), nombre, contacto: '', telefono: '', email: '', rut: '', notas: '' }; d.proveedores.push(v); }
    return v.id;
  };
  const pos = (x) => (x != null && x >= 0 ? x : null);
  // Filas dudosas que en la vista previa se marcaron «Es el mismo»: actualizan ese producto en lugar de crear otro
  const unidos = plan.nuevos.filter((x) => x.datos.dudosaDe && x.accion === 'mismo').map((x) => {
    const p = d.productos.find((q) => q.id === x.datos.dudosaDe) || {};
    const datos = x.datos.enDepositoSiMismo ? { ...x.datos, enDeposito: x.datos.enDepositoSiMismo } : x.datos;
    return { id: x.datos.dudosaDe, codigo: p.codigo, nombreActual: p.nombre, stockActual: p.stock, precioActual: p.precio, datos };
  });
  for (const nuevo of plan.nuevos.filter((x) => !(x.datos.dudosaDe && x.accion === 'mismo') && x.accion !== 'saltear')) {
    const x = nuevo.datos;
    const p = {
      id: uid(), codigo: nuevo.codigo, nombre: x.nombre, categoria: x.categoria, unidad: x.unidad || 'unidad', proveedorId: provId(x.proveedor),
      ubicacion: x.ubicacion, costo: pos(x.costo) || 0, precio: pos(x.precio) || 0, minimo: pos(x.minimo) || 0, stock: 0,
      ...(x.moneda === 'USD' ? { moneda: 'USD' } : {}),
    };
    if (p.categoria && x.subcategoria) p.subcategoria = asegurarSubcategoria(d, p.categoria, x.subcategoria);
    d.productos.push(p);
    if (x.codprov && p.proveedorId) anotarCodigoProv(p, p.proveedorId, x.codprov, x.nombre);
    (x.barras || []).forEach((b) => { if (b !== p.codigo) asignarBarras(d, p, b); });
    if (x.stock > 0) registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: x.stock, costoUnit: p.costo, proveedorId: p.proveedorId, nota: 'Stock inicial (importado)', origen: 'inicial' });
    sumarLlegada(p, x);
  }
  for (const act of plan.actualizados.concat(unidos)) {
    const p = d.productos.find((q) => q.id === act.id);
    if (!p) continue;
    const x = act.datos;
    (x.barras || []).forEach((b) => asignarBarras(d, p, b)); // los códigos de barras se agregan siempre
    if (x.codprov && x.proveedor) anotarCodigoProv(p, provId(x.proveedor), x.codprov, x.nombre); // y el código del proveedor
    if (c.nombre && x.nombre) p.nombre = x.nombre;
    if (c.otros) {
      if (x.categoria) {
        // Otra categoría: la subcategoría vieja era de la anterior
        if (claveCategoria(x.categoria) !== claveCategoria(p.categoria)) delete p.subcategoria;
        p.categoria = x.categoria;
      }
      if (x.subcategoria && p.categoria) p.subcategoria = asegurarSubcategoria(d, p.categoria, x.subcategoria);
      if (x.unidad) p.unidad = x.unidad;
      if (x.ubicacion) p.ubicacion = x.ubicacion;
      if (x.proveedor) p.proveedorId = provId(x.proveedor);
      if (pos(x.minimo) != null) p.minimo = x.minimo;
    }
    // La moneda va con el precio: si la planilla la dice y se actualizan los precios, el producto pasa a esa moneda
    const cambiaMoneda = c.precio && x.precio > 0 && x.moneda && x.moneda !== (esUSD(p) ? 'USD' : 'UYU');
    const moneda = cambiaMoneda ? x.moneda : (esUSD(p) ? 'USD' : 'UYU');
    if (c.precio && x.precio > 0 && (x.precio !== p.precio || cambiaMoneda)) { anotarPrecio(d, p, x.precio, 'Importación', moneda); p.precio = x.precio; }
    if (cambiaMoneda) { if (x.moneda === 'USD') p.moneda = 'USD'; else delete p.moneda; }
    if (c.costo && pos(x.costo) != null) p.costo = x.costo;
    if (c.stock && !act.sinStock && pos(x.stock) != null && red(x.stock) !== p.stock) registrar(d, { tipo: 'ajuste', productoId: p.id, cantidad: x.stock, nota: 'Corrección por importación' });
    sumarLlegada(p, x);
  }
  // Estantes nuevos que vienen en la planilla (por ejemplo, creados en el Cargador sin el programa abierto): quedan con su categoría
  let estantes = 0;
  const creados = plan.nuevos.filter((x) => !(x.datos.dudosaDe && x.accion === 'mismo') && x.accion !== 'saltear').map((x) => x.datos);
  for (const x of creados.concat(c.otros ? plan.actualizados.concat(unidos).map((a) => a.datos) : [])) {
    if (x && x.ubicacion && asegurarEstante(d, x.ubicacion, x.categoria)) estantes++;
  }
  return { nuevos: plan.nuevos.length, actualizados: plan.actualizados.length, llegadas, estantes };
}

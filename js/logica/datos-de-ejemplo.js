/* Datos de ejemplo para la primera vez que se abre el programa. */
'use strict';

/* ---------- Datos de ejemplo ---------- */

function semilla() {
  const d = baseVacia();
  d.ejemplo = true;
  const prov = [
    ['Distribuidora Ejemplo Sur', 'Martín Pérez', '099 123 456', 'ventas@ejemplo-sur.com.uy', '210000000011', 'Entrega martes y viernes'],
    ['Pinturas Ejemplo S.A.', 'Laura Gómez', '098 765 432', 'pedidos@ejemplo-pinturas.com.uy', '210000000022', ''],
    ['Herramientas Ejemplo Ltda.', 'Diego Rodríguez', '2900 1234', 'contacto@ejemplo-herr.com.uy', '210000000033', 'Pedido mínimo $ 5.000'],
    ['Sanitaria Ejemplo', 'Ana Fernández', '097 111 222', 'info@ejemplo-sanitaria.com.uy', '210000000044', ''],
  ].map(([nombre, contacto, telefono, email, rut, notas]) => ({ id: uid(), nombre, contacto, telefono, email, rut, notas }));
  d.proveedores = prov;

  // código, nombre, categoría, unidad, proveedor, costo, precio, mínimo, ubicación, stock inicial, salidas
  const lista = [
    ['7790001000101', 'Tornillo autoperforante 8 x 1" (caja x100)', 'Tornillería', 'caja', 0, 180, 290, 10, 'A-01', 30, [6, 5, 4]],
    ['CLA-2000', 'Clavo punta París 2"', 'Tornillería', 'kg', 0, 95, 160, 15, 'A-02', 40, [8, 6]],
    ['TAR-0008', 'Tarugo nylon 8 mm (bolsa x50)', 'Tornillería', 'paquete', 0, 70, 120, 12, 'A-03', 25, [5, 6, 4, 2]],
    ['PIN-LAT4', 'Pintura látex interior blanco 4 L', 'Pinturería', 'unidad', 1, 890, 1390, 6, 'B-01', 18, [3, 4, 2]],
    ['PIN-ESM1', 'Esmalte sintético negro 1 L', 'Pinturería', 'unidad', 1, 410, 650, 5, 'B-02', 8, [2, 2, 2, 2]],
    ['PIN-ROD22', 'Rodillo lana 22 cm', 'Pinturería', 'unidad', 1, 160, 260, 8, 'B-03', 12, [3, 2]],
    ['ADH-SIL280', 'Silicona acética transparente 280 ml', 'Adhesivos', 'unidad', 1, 140, 240, 10, 'B-04', 14, [3, 2]],
    ['HER-TAL13', 'Taladro percutor 13 mm 650 W', 'Herramientas', 'unidad', 2, 2350, 3490, 2, 'C-01', 5, [1, 1]],
    ['HER-MAR16', 'Martillo carpintero 16 oz', 'Herramientas', 'unidad', 2, 390, 620, 4, 'C-02', 10, [2, 1, 1]],
    ['HER-CIN5', 'Cinta métrica 5 m', 'Herramientas', 'unidad', 2, 190, 320, 6, 'C-03', 9, [2]],
    ['SAN-PVC110', 'Caño PVC 110 mm x 3 m', 'Sanitaria', 'unidad', 3, 620, 940, 8, 'D-01', 20, [4, 3]],
    ['SAN-COD110', 'Codo PVC 110 mm a 90°', 'Sanitaria', 'unidad', 3, 85, 140, 20, 'D-02', 50, [10, 8]],
    ['SAN-TEF34', 'Cinta teflón 3/4"', 'Sanitaria', 'rollo', 3, 25, 50, 30, 'D-03', 60, [15, 10]],
    ['ELE-CAI19', 'Cinta aisladora 19 mm x 20 m', 'Electricidad', 'rollo', 0, 45, 85, 20, 'E-01', 40, [8, 7]],
    ['ELE-CAB25', 'Cable unipolar 2,5 mm²', 'Electricidad', 'm', 0, 28, 48, 100, 'E-02', 300, [60, 50]],
    ['CON-POR25', 'Cemento portland 25 kg', 'Construcción', 'unidad', 0, 390, 560, 10, 'Patio', 25, [6, 5, 4, 3]],
  ];
  const ahora = Date.now();
  lista.forEach(([codigo, nombre, categoria, unidad, pi, costo, precio, minimo, ubicacion, inicial, salidas], idx) => {
    const p = { id: uid(), codigo, nombre, categoria, unidad, proveedorId: prov[pi].id, costo, precio, stock: 0, minimo, ubicacion };
    d.productos.push(p);
    registrar(d, { tipo: 'entrada', productoId: p.id, cantidad: inicial, costoUnit: costo, proveedorId: prov[pi].id, nota: 'Stock inicial', origen: 'inicial', fecha: new Date(ahora - 24 * DIA).toISOString() });
    salidas.forEach((q, i) => {
      const f = ahora - (19 - i * 5) * DIA - ((idx * 7 + i * 3) % 9) * 36e5;
      registrar(d, { tipo: 'salida', productoId: p.id, cantidad: q, nota: 'Venta mostrador', fecha: new Date(f).toISOString() });
    });
  });
  // Ventas de hoy por la caja
  const cod = (c) => d.productos.find((p) => p.codigo === c);
  const item = (c, q) => ({ productoId: cod(c).id, cantidad: q, precio: cod(c).precio });
  const hoy0 = new Date(); hoy0.setHours(9, 0, 0, 0);
  const hace = (min) => new Date(Math.min(Date.now() - 60000, hoy0.getTime() + min * 60000)).toISOString();
  abrirCaja(d, 2000, 'Administrador', hace(-5));
  cobrar(d, [item('7790001000101', 2), item('ELE-CAI19', 1)], 'Efectivo', 1000, '', hace(25));
  cobrar(d, [item('SAN-PVC110', 2), item('SAN-COD110', 4)], 'Débito', '', 'Obra calle Rivera', hace(110));
  cobrar(d, [item('ELE-CAB25', 10), item('HER-MAR16', 1)], 'Transferencia', '', '', hace(190));
  d.movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  d.ventas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return d;
}

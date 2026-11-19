/* Arranque: iniciar() conecta todas las pantallas al abrir el programa.
 * Al final, en Node (pruebas) se exportan las funciones que se prueban; en el navegador se llama a iniciar(). */
'use strict';

function arrancar() {
  if (datosDanados) { mostrarDanado(); return; }
  mostrarLogin();
}

function iniciar() {
  iniciarBarra();
  iniciarGraficos();
  document.body.classList.toggle('es-escritorio', escritorio() && !!window.almacen.abrirHerramienta);
  iniciarAperturaCaja();
  $('#banner-stock-ver').addEventListener('click', verParaReponer);
  $('#banner-stock-ocultar').addEventListener('click', () => {
    const { sin, bajo } = paraReponer();
    alertaOcultaFirma = sin.map((p) => p.id).join(',') + '|' + bajo.map((p) => p.id).join(',');
    $('#banner-stock').hidden = true;
  });
  iniciarDanado();
  $('#banner-guardado-reintentar').addEventListener('click', () => { if (guardar({ completo: true })) toast('Listo, se guardó.'); else toast('Sigue sin poder guardar.'); });
  $('#banner-guardado-copia').addEventListener('click', () => descargarBlob(JSON.stringify(db), 'application/json', `respaldo_stock_${isoLocal()}.json`));
  iniciarLogin();
  iniciarUsuarios();
  iniciarRecuperacion();
  iniciarImportacion();
  iniciarPrecios();
  iniciarNegocio();
  iniciarDeposito();
  iniciarCelular();
  if (typeof window.print !== 'function' || window.SIN_IMPRESION) $$('[data-imprime]').forEach((b) => { b.hidden = true; });
  $('#venta-imprimir').addEventListener('click', () => { if (ultimaVenta) imprimir(htmlTicket(ultimaVenta)); });
  $('#dlg-venta').addEventListener('close', () => $('#caja-buscar').focus());
  $('#venta-nueva').addEventListener('click', () => $('#dlg-venta').close());
  cargar();
  $('#fecha-hoy').textContent = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#rep-desde').value = isoLocal();
  $('#rep-hasta').value = isoLocal();
  ['#rep-parada-dias', '#rep-gan-orden'].forEach((s) => $(s).addEventListener('input', renderReportes));
  // Al elegir solo «Desde» se ve ese día; con «Hasta» se arma la franja
  $('#rep-desde').addEventListener('change', () => {
    const d = $('#rep-desde').value;
    if (d && $('#rep-hasta').value < d) $('#rep-hasta').value = d;
    renderReportes();
  });
  $('#rep-hasta').addEventListener('change', () => {
    const h = $('#rep-hasta').value;
    if (h && $('#rep-desde').value > h) $('#rep-desde').value = h;
    renderReportes();
  });
  $('#rep-ant').addEventListener('click', () => moverReportes(-1));
  $('#rep-sig').addEventListener('click', () => moverReportes(1));
  $('#rep-hoy').addEventListener('click', () => ponerPeriodo(isoLocal(), isoLocal()));
  // Flechas del teclado en Reportes: día anterior / siguiente
  document.addEventListener('keydown', (e) => {
    if (location.hash !== '#reportes' || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [role="tab"], .g-col')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); moverReportes(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); moverReportes(1); }
  });
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
    tabReportes = b.dataset.tab;
    try { localStorage.setItem('ferreteria-tab-rep', tabReportes); } catch (e) { /* nada */ }
    renderReportes();
  }));
  iniciarResumenDia();
  iniciarAyudas();
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => exportar(b.dataset.export)));
  $$('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  iniciarCaja();
  iniciarProductos();
  iniciarMovRapido();
  iniciarMovimientos();
  iniciarProveedores();
  iniciarRespaldo();
  window.addEventListener('hashchange', mostrarVista);
  window.addEventListener('storage', (e) => { if (e.key === CLAVE && !datosDanados) { if (cargar()) render(); else mostrarDanado(); } });
  arrancar();
}

if (typeof module !== 'undefined') {
  module.exports = { fotoDesdeCelularEn, stockDesdeConteo, altaDesdeCelularEn, conteoDesdeCelularEn, codigoLibreCelular, contadoElDesde, htmlTicket, datosParaCelular, productoCelular, productosCelular, estantesCelular, tsplEtiquetas, itemEtiquetadora, medidaRollo, htmlEtiquetas, leerMoneda, enPesos, $m, sugerenciasDeposito, porHojaEtiquetas, medidaEtiquetaHoja, posicionGlobito, resumenAjustesEtiquetas, asegurarEstante, tieneCodigoFabrica, codigoLibreDe, anotarCodigoProv, codigosProvDe, quitarCodigoProv, unirProductos, seParecen, registrar, cobrar, anularVenta, devolucionEnOtraCaja, semilla, baseVacia, estado, abrirCaja, cajaAbierta, movimientoCaja, resumenCaja, cerrarCaja, parseNum, planImportacion, aplicarImportacion, actualizarPrecios, redondearPrecio, sha256, crearUsuario, asegurarUsuarios, verificarPin, guardarUsuario, eliminarUsuario, fotoDe, calcularCambios, analisisVentas, serieVentas, mercaderiaParada, buscarPorCodigo, codigoUsado, asignarBarras, nuevaClaveRecuperacion, verificarRecuperacion, precioConAumento, cambiosStockImportacion, CAMPOS_IMPORTAR, gananciaBruta, totalCompras, esperaPin, fallarPin, acertarPin, bloqueosPendientes, anotarPrecio, hojaExcel, fechaExcel, textoPeriodo, precioBajoCosto, marcarProductoNuevo, moverPeriodo, periodoComparable, tramosCrecimiento, subasYBajas, promedioPorDiaSemana, resumenDia, sumarDias, ubicacionesDe, dondeEsta, codigoEtiqueta, htmlEtiquetas, claveUbic, PREFIJO_UBIC, estantesDe, guardarEstante, eliminarEstante, ubicarProducto, altaEnDeposito, recibirEnDeposito, numerarEstantes, completarEstantes, revisarCantidadDeposito, TOPE_DEPOSITO };
} else {
  document.addEventListener('DOMContentLoaded', iniciar);
}

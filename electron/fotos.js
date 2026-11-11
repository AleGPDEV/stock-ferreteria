// Fotos de los productos: qué fotos ya no usa ningún producto y se pueden borrar.
// Sin Electron, para poder probarlo con node.

/** Nombres de foto que usan los productos de la base (texto JSON completo de los datos). */
function fotosEnUso(textoDatos) {
  const usadas = new Set();
  try {
    const d = JSON.parse(textoDatos);
    for (const p of (d && d.productos) || []) if (p && typeof p.foto === 'string' && p.foto) usadas.add(p.foto);
  } catch (e) {
    return null; // si no se pudo leer, no se borra nada
  }
  return usadas;
}

/**
 * Una foto que ningún producto usa (porque se reemplazó o se borró el producto) no se borra enseguida:
 * un respaldo de hace unos días puede todavía usarla. Se anota desde cuándo está sin usar y se borra
 * recién cuando pasaron más días que los respaldos que se guardan.
 *
 * huerfanas: { nombre: fechaISO desde que no se usa } (lo anotado la vez anterior)
 * Devuelve { huerfanas (lo que hay que anotar ahora), borrar: [nombres] }.
 */
function planLimpiezaFotos(huerfanas, enUso, presentes, ahora, dias) {
  const nuevas = {};
  const borrar = [];
  const limite = ahora - dias * 864e5;
  for (const f of presentes) {
    if (enUso.has(f)) continue; // se volvió a usar (por ejemplo, al restaurar un respaldo)
    const desde = huerfanas && huerfanas[f] ? Date.parse(huerfanas[f]) : ahora;
    if (desde <= limite) borrar.push(f);
    else nuevas[f] = new Date(desde).toISOString();
  }
  return { huerfanas: nuevas, borrar };
}

module.exports = { fotosEnUso, planLimpiezaFotos };

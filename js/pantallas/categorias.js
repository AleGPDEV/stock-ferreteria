/* Ventana «Categorías» (Productos y Depósito, solo administradores): crear, renombrar y borrar categorías.
 * La lógica está en js/logica/categorias.js. */
'use strict';

/** Las categorías para elegir en las fichas de producto y de estante (incluye las que todavía no usa nadie). */
function opcionesCategorias() { return nombresCategorias(db).map((c) => `<option value="${esc(c)}">`).join(''); }

function renderCategorias() {
  const lista = categoriasDe(db);
  const uso = (c) => {
    const partes = [c.productos ? plural(c.productos, 'producto', 'productos') : '', c.estantes ? plural(c.estantes, 'estante', 'estantes') : ''].filter(Boolean);
    return partes.length ? partes.join(' y ') : 'Sin usar todavía';
  };
  $('#cat-lista').innerHTML = lista.length ? lista.map((c) => `<li data-cat="${esc(c.nombre)}">
      <div class="cat-dato"><strong>${esc(c.nombre)}</strong><span class="meta">${uso(c)}</span></div>
      <div class="cat-acc"><button class="btn sm" type="button" data-cat-renombrar>Cambiar nombre</button><button class="btn sm danger" type="button" data-cat-borrar>Borrar</button></div>
    </li>`).join('') : '<li class="vacio">Todavía no hay categorías. Agregá la primera arriba.</li>';
}

function abrirCategorias() {
  if (!esAdmin()) return;
  $('#cat-err').textContent = '';
  $('#cat-nombre').value = '';
  renderCategorias();
  $('#dlg-categorias').showModal();
  $('#cat-nombre').focus();
}

/** Después de cambiar categorías: se guarda y se actualizan las pantallas que las muestran. */
function categoriasCambiadas(texto) {
  guardar();
  renderCategorias();
  if (typeof render === 'function') render();
  if (texto) toast(texto);
}

function iniciarCategorias() {
  $$('[data-abrir-categorias]').forEach((b) => b.addEventListener('click', abrirCategorias));
  $('#cat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = crearCategoria(db, $('#cat-nombre').value);
    if (r.error) { $('#cat-err').textContent = r.error; return; }
    $('#cat-err').textContent = '';
    $('#cat-nombre').value = '';
    categoriasCambiadas(`Categoría ${r.nombre} agregada.`);
  });
  $('#cat-lista').addEventListener('click', async (e) => {
    const li = e.target.closest('[data-cat]');
    if (!li) return;
    const nombre = li.dataset.cat;
    if (e.target.closest('[data-cat-renombrar]')) {
      // Se cambia el nombre ahí mismo, en el renglón
      const dato = li.querySelector('.cat-dato');
      dato.innerHTML = `<form class="cat-renombrar" novalidate><label class="visualmente-oculto" for="cat-nuevo">Nombre nuevo de ${esc(nombre)}</label><input id="cat-nuevo" type="text" maxlength="60" value="${esc(nombre)}" autocomplete="off"><button class="btn sm primary" type="submit">Guardar</button><button class="btn sm" type="button" data-cat-cancelar>Cancelar</button></form>`;
      li.querySelector('.cat-acc').hidden = true;
      const input = li.querySelector('#cat-nuevo');
      input.focus(); input.select();
      li.querySelector('[data-cat-cancelar]').addEventListener('click', renderCategorias);
      li.querySelector('.cat-renombrar').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const nuevo = input.value;
        if (claveCategoria(nuevo) === claveCategoria(nombre) && nombreCategoria(nuevo) === nombre) { renderCategorias(); return; }
        const otra = categoriasDe(db).find((c) => claveCategoria(c.nombre) === claveCategoria(nuevo) && claveCategoria(c.nombre) !== claveCategoria(nombre));
        if (otra && !(await confirmar(`Ya existe la categoría ${otra.nombre}. ¿Unir ${nombre} con ${otra.nombre}? Los productos y estantes de las dos quedan en ${otra.nombre}.`, 'Unir'))) return;
        const r = renombrarCategoria(db, nombre, nuevo);
        if (r.error) { $('#cat-err').textContent = r.error; return; }
        $('#cat-err').textContent = '';
        const cuantos = [r.productos ? plural(r.productos, 'producto', 'productos') : '', r.estantes ? plural(r.estantes, 'estante', 'estantes') : ''].filter(Boolean).join(' y ');
        categoriasCambiadas(`${r.unidas ? 'Unidas en' : 'Ahora se llama'} ${r.nombre}${cuantos ? ` (${cuantos})` : ''}.`);
      });
      return;
    }
    if (e.target.closest('[data-cat-borrar]')) {
      const c = categoriasDe(db).find((x) => x.nombre === nombre) || { productos: 0, estantes: 0 };
      const usados = [c.productos ? plural(c.productos, 'producto', 'productos') : '', c.estantes ? plural(c.estantes, 'estante', 'estantes') : ''].filter(Boolean).join(' y ');
      if (!(await confirmar(usados ? `¿Borrar la categoría ${nombre}? ${usados[0].toUpperCase() + usados.slice(1)} van a quedar sin categoría (no se borra ningún producto).` : `¿Borrar la categoría ${nombre}?`, 'Borrar categoría', true))) return;
      borrarCategoria(db, nombre);
      categoriasCambiadas(`Categoría ${nombre} borrada.`);
    }
  });
}

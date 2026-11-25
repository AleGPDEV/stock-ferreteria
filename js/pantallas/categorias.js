/* Ventana «Categorías» (Productos y Depósito, solo administradores): crear, renombrar y borrar categorías
 * y sus subcategorías (cada categoría se despliega con «Subcategorías»).
 * La lógica está en js/logica/categorias.js. */
'use strict';

let catAbierta = ''; // la categoría que muestra sus subcategorías (clave)
function renderCategorias() {
  const lista = categoriasDe(db);
  const uso = (c) => {
    const partes = [c.productos ? plural(c.productos, 'producto', 'productos') : '', c.estantes ? plural(c.estantes, 'estante', 'estantes') : ''].filter(Boolean);
    return partes.length ? partes.join(' y ') : 'Sin usar todavía';
  };
  const subs = (c) => {
    const ss = subcategoriasDe(db, c.nombre);
    return `<div class="cat-subs">
      <ul class="sub-lista">${ss.length ? ss.map((x) => `<li data-sub="${esc(x.nombre)}"><div class="cat-dato"><span>${esc(x.nombre)}</span><span class="meta">${x.productos ? plural(x.productos, 'producto', 'productos') : 'Sin usar todavía'}</span></div>
        <div class="cat-acc"><button class="btn sm" type="button" data-sub-renombrar aria-label="Cambiar el nombre de ${esc(x.nombre)}">Cambiar nombre</button><button class="btn sm danger" type="button" data-sub-borrar aria-label="Borrar ${esc(x.nombre)}">Borrar</button></div></li>`).join('')
        : '<li class="vacio">Todavía no tiene subcategorías.</li>'}</ul>
      <form class="cat-nueva sub-nueva" novalidate><label class="visualmente-oculto" for="sub-nombre">Subcategoría nueva de ${esc(c.nombre)}</label><input id="sub-nombre" type="text" maxlength="60" autocomplete="off" placeholder="Subcategoría nueva de ${esc(c.nombre)}"><button class="btn sm primary" type="submit">Agregar</button></form>
    </div>`;
  };
  $('#cat-lista').innerHTML = lista.length ? lista.map((c) => {
    const abierta = claveCategoria(c.nombre) === catAbierta;
    const n = subcategoriasDe(db, c.nombre).length;
    return `<li data-cat="${esc(c.nombre)}"${abierta ? ' class="abierta"' : ''}>
      <div class="cat-fila">
        <div class="cat-dato"><strong>${esc(c.nombre)}</strong><span class="meta">${uso(c)}</span></div>
        <div class="cat-acc"><button class="btn sm" type="button" data-cat-subs aria-expanded="${abierta}">${n ? `Subcategorías (${n})` : 'Subcategorías'} ${abierta ? '▴' : '▾'}</button><button class="btn sm" type="button" data-cat-renombrar>Cambiar nombre</button><button class="btn sm danger" type="button" data-cat-borrar>Borrar</button></div>
      </div>${abierta ? subs(c) : ''}
    </li>`;
  }).join('') : '<li class="vacio">Todavía no hay categorías. Agregá la primera arriba.</li>';
}

/** Cambiar el nombre ahí mismo, en el renglón (categoría o subcategoría). alGuardar(nuevo) hace el cambio. */
function renombrarEnRenglon(li, nombre, alGuardar) {
  const dato = li.querySelector(':scope > .cat-dato, :scope > .cat-fila > .cat-dato');
  dato.innerHTML = `<form class="cat-renombrar" novalidate><label class="visualmente-oculto" for="cat-nuevo">Nombre nuevo de ${esc(nombre)}</label><input id="cat-nuevo" type="text" maxlength="60" value="${esc(nombre)}" autocomplete="off"><button class="btn sm primary" type="submit">Guardar</button><button class="btn sm" type="button" data-cat-cancelar>Cancelar</button></form>`;
  dato.parentElement.querySelector(':scope > .cat-acc').hidden = true;
  const input = dato.querySelector('#cat-nuevo');
  input.focus(); input.select();
  dato.querySelector('[data-cat-cancelar]').addEventListener('click', renderCategorias);
  dato.querySelector('.cat-renombrar').addEventListener('submit', (ev) => { ev.preventDefault(); alGuardar(input.value); });
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
  $('#cat-lista').addEventListener('submit', (e) => {
    const f = e.target.closest('.sub-nueva');
    if (!f) return;
    e.preventDefault();
    const cat = f.closest('[data-cat]').dataset.cat;
    const r = crearSubcategoria(db, cat, f.querySelector('input').value);
    if (r.error) { $('#cat-err').textContent = r.error; return; }
    $('#cat-err').textContent = '';
    categoriasCambiadas(`Subcategoría ${r.nombre} agregada a ${cat}.`);
    const otra = $('#cat-lista .sub-nueva input');
    if (otra) otra.focus();
  });
  $('#cat-lista').addEventListener('click', async (e) => {
    const li = e.target.closest('[data-cat]');
    if (!li) return;
    const nombre = li.dataset.cat;
    const subLi = e.target.closest('[data-sub]');
    if (subLi) {
      const sub = subLi.dataset.sub;
      if (e.target.closest('[data-sub-renombrar]')) {
        renombrarEnRenglon(subLi, sub, async (nuevo) => {
          if (nombreCategoria(nuevo) === sub) { renderCategorias(); return; }
          const otra = subcategoriasDe(db, nombre).find((x) => claveCategoria(x.nombre) === claveCategoria(nuevo) && claveCategoria(x.nombre) !== claveCategoria(sub));
          if (otra && !(await confirmar(`${nombre} ya tiene la subcategoría ${otra.nombre}. ¿Unir ${sub} con ${otra.nombre}?`, 'Unir'))) return;
          const r = renombrarSubcategoria(db, nombre, sub, nuevo);
          if (r.error) { $('#cat-err').textContent = r.error; return; }
          $('#cat-err').textContent = '';
          categoriasCambiadas(`${r.unidas ? 'Unidas en' : 'Ahora se llama'} ${r.nombre}${r.productos ? ` (${plural(r.productos, 'producto', 'productos')})` : ''}.`);
        });
        return;
      }
      if (e.target.closest('[data-sub-borrar]')) {
        const x = subcategoriasDe(db, nombre).find((y) => y.nombre === sub) || { productos: 0 };
        if (!(await confirmar(x.productos ? `¿Borrar la subcategoría ${sub}? ${plural(x.productos, 'producto queda', 'productos quedan')} solo con la categoría ${nombre}.` : `¿Borrar la subcategoría ${sub}?`, 'Borrar subcategoría', true))) return;
        borrarSubcategoria(db, nombre, sub);
        categoriasCambiadas(`Subcategoría ${sub} borrada.`);
      }
      return;
    }
    if (e.target.closest('[data-cat-subs]')) {
      catAbierta = catAbierta === claveCategoria(nombre) ? '' : claveCategoria(nombre);
      renderCategorias();
      const input = $('#cat-lista .sub-nueva input');
      if (input) input.focus(); else $(`#cat-lista [data-cat="${CSS.escape(nombre)}"] [data-cat-subs]`).focus();
      return;
    }
    if (e.target.closest('[data-cat-renombrar]')) {
      renombrarEnRenglon(li, nombre, async (nuevo) => {
        if (claveCategoria(nuevo) === claveCategoria(nombre) && nombreCategoria(nuevo) === nombre) { renderCategorias(); return; }
        const otra = categoriasDe(db).find((c) => claveCategoria(c.nombre) === claveCategoria(nuevo) && claveCategoria(c.nombre) !== claveCategoria(nombre));
        if (otra && !(await confirmar(`Ya existe la categoría ${otra.nombre}. ¿Unir ${nombre} con ${otra.nombre}? Los productos y estantes de las dos quedan en ${otra.nombre}.`, 'Unir'))) return;
        const r = renombrarCategoria(db, nombre, nuevo);
        if (r.error) { $('#cat-err').textContent = r.error; return; }
        $('#cat-err').textContent = '';
        if (catAbierta === claveCategoria(nombre)) catAbierta = claveCategoria(r.nombre);
        const cuantos = [r.productos ? plural(r.productos, 'producto', 'productos') : '', r.estantes ? plural(r.estantes, 'estante', 'estantes') : ''].filter(Boolean).join(' y ');
        categoriasCambiadas(`${r.unidas ? 'Unidas en' : 'Ahora se llama'} ${r.nombre}${cuantos ? ` (${cuantos})` : ''}.`);
      });
      return;
    }
    if (e.target.closest('[data-cat-borrar]')) {
      const c = categoriasDe(db).find((x) => x.nombre === nombre) || { productos: 0, estantes: 0 };
      const usados = [c.productos ? plural(c.productos, 'producto', 'productos') : '', c.estantes ? plural(c.estantes, 'estante', 'estantes') : ''].filter(Boolean).join(' y ');
      const nSub = subcategoriasDe(db, nombre).length;
      if (!(await confirmar((usados ? `¿Borrar la categoría ${nombre}? ${usados[0].toUpperCase() + usados.slice(1)} van a quedar sin categoría (no se borra ningún producto).` : `¿Borrar la categoría ${nombre}?`) + (nSub ? ` También se borran sus ${plural(nSub, 'subcategoría', 'subcategorías')}.` : ''), 'Borrar categoría', true))) return;
      borrarCategoria(db, nombre);
      categoriasCambiadas(`Categoría ${nombre} borrada.`);
    }
  });
}

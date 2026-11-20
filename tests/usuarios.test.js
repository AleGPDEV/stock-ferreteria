// Pruebas de Usuarios e ingreso (js/base/usuarios-y-pin.js): PIN con PBKDF2, migración del formato viejo,
// usuarios, bloqueos por intentos y clave de recuperación. Las primeras se mudaron de tests/logica.test.js (#23).
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../js/cargar-en-node.js');

function base() {
  const d = app.baseVacia();
  d.productos.push(
    { id: 'a', codigo: 'MAR-16', nombre: 'Martillo 16 oz', categoria: 'Herramientas', unidad: 'unidad', proveedorId: 'v1', ubicacion: 'C-02', costo: 390, precio: 620, minimo: 4, stock: 10 },
    { id: 'b', codigo: 'CAB-25', nombre: 'Cable 2,5 mm²', categoria: 'Electricidad', unidad: 'm', proveedorId: '', ubicacion: '', costo: 28, precio: 48, minimo: 100, stock: 300 },
  );
  d.proveedores.push({ id: 'v1', nombre: 'Herramientas Sur', contacto: '', telefono: '', email: '', rut: '', notas: '' });
  return d;
}

test('sha256 coincide con el de Node', () => {
  const { createHash } = require('node:crypto');
  for (const t of ['', 'abc', 'sal-123:1234', 'x'.repeat(200), 'ñandú']) {
    assert.equal(app.sha256(t), createHash('sha256').update(t, 'utf8').digest('hex'), t);
  }
});

test('la primera vez se crean administrador y empleado con PIN inicial', async () => {
  const d = app.baseVacia();
  assert.equal(app.asegurarUsuarios(d), true);
  const [admin, emp] = d.usuarios;
  assert.equal(admin.rol, 'admin');
  assert.equal(emp.rol, 'empleado');
  assert.ok(await app.verificarPin(admin, '1234'));
  assert.ok(await app.verificarPin(emp, '0000'));
  assert.ok(!await app.verificarPin(emp, '1234'));
  assert.ok(!JSON.stringify(d.usuarios).includes('"1234"'), 'el PIN no se guarda tal cual');
  assert.equal(app.asegurarUsuarios(d), false);
});

test('crear, editar y validar usuarios', async () => {
  const d = app.baseVacia();
  app.asegurarUsuarios(d);
  const admin = d.usuarios[0];
  assert.match((await app.guardarUsuario(d, { nombre: 'Carlos', rol: 'empleado', pin: '12' })).error, /4 a 6/);
  assert.match((await app.guardarUsuario(d, { nombre: 'empleado', rol: 'empleado', pin: '5555' })).error, /Ya hay/);
  const { usuario } = await app.guardarUsuario(d, { nombre: 'Carlos', rol: 'empleado', pin: '4321' });
  assert.ok(await app.verificarPin(usuario, '4321'));
  // editar sin PIN no lo cambia
  await app.guardarUsuario(d, { nombre: 'Carlos P.', rol: 'empleado', pin: '' }, usuario.id);
  assert.equal(usuario.nombre, 'Carlos P.');
  assert.ok(await app.verificarPin(usuario, '4321'));
  // cambiar el PIN del admin saca la marca de PIN inicial
  await app.guardarUsuario(d, { nombre: 'Administrador', rol: 'admin', pin: '908070' }, admin.id);
  assert.ok(await app.verificarPin(admin, '908070'));
  assert.equal(admin.pinPorDefecto, false);
  // no puede quedar sin administrador
  assert.match((await app.guardarUsuario(d, { nombre: 'Administrador', rol: 'empleado', pin: '' }, admin.id)).error, /al menos un administrador/);
});

test('eliminar usuarios', () => {
  const d = app.baseVacia();
  app.asegurarUsuarios(d);
  const [admin, emp] = d.usuarios;
  assert.match(app.eliminarUsuario(d, admin.id, admin.id), /estás adentro/);
  assert.match(app.eliminarUsuario(d, admin.id, emp.id), /al menos un administrador/);
  assert.equal(app.eliminarUsuario(d, emp.id, admin.id), null);
  assert.equal(d.usuarios.length, 1);
});

test('QA 3: después de 5 PIN incorrectos hay que esperar', () => {
  const d = base();
  const t = 1_000_000;
  for (let i = 0; i < 4; i++) assert.equal(app.fallarPin(d, 'u1', t), 0);
  assert.ok(app.fallarPin(d, 'u1', t) > 0);
  assert.ok(app.esperaPin(d, 'u1', t + 1000) > 0);
  assert.equal(app.esperaPin(d, 'u1', t + 6 * 60 * 1000), 0);
  assert.ok(app.fallarPin(d, 'u1', t + 6 * 60 * 1000) > 0, 'otro error después de esperar vuelve a bloquear');
  app.acertarPin(d, 'u1');
  assert.equal(app.esperaPin(d, 'u1', t + 6 * 60 * 1000), 0);
  assert.equal(app.esperaPin(d, 'u2', t), 0);
});

test('QA 3: la clave de recuperación restablece el acceso del administrador', async () => {
  const d = base();
  assert.equal(await app.verificarRecuperacion(d, 'ABCD-EFGH-JKMN'), false, 'sin clave creada no entra nada');
  const clave = await app.nuevaClaveRecuperacion(d);
  assert.match(clave, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.doesNotMatch(clave, /[01OIL]/, 'sin letras que se confunden');
  assert.ok(!JSON.stringify(d).includes(clave.replace(/-/g, '')), 'no se guarda tal cual');
  assert.equal(await app.verificarRecuperacion(d, clave), true);
  assert.equal(await app.verificarRecuperacion(d, clave.toLowerCase().replace(/-/g, ' ')), true, 'acepta minúsculas y espacios');
  assert.equal(await app.verificarRecuperacion(d, clave.slice(0, -1) + (clave.endsWith('A') ? 'B' : 'A')), false);
  const otra = await app.nuevaClaveRecuperacion(d);
  assert.notEqual(otra, clave);
  assert.equal(await app.verificarRecuperacion(d, clave), false, 'la anterior deja de servir');
});

test('QA2 B4: los errores al autorizar no bloquean el ingreso del administrador, y quedan avisados', () => {
  const d = base();
  const ahora = Date.now();
  for (let i = 0; i < 5; i++) app.fallarPin(d, 'aut:adm1', ahora);
  assert.ok(app.esperaPin(d, 'aut:adm1', ahora) > 0);
  assert.equal(app.esperaPin(d, 'adm1', ahora), 0, 'puede entrar al programa');
  const b = app.bloqueosPendientes(d, 'adm1');
  assert.equal(b.length, 1);
  assert.equal(b[0].donde, 'autorizar');
  assert.equal(app.bloqueosPendientes(d, 'adm1').length, 0, 'se avisa una sola vez');
});

/* ---------- PBKDF2 (#13) ---------- */
/* global hashPinFuerte */
test('PIN con PBKDF2: el nuevo verifica, uno equivocado no, y queda el formato con sus vueltas', async () => {
  const d = base();
  app.asegurarUsuarios(d);
  const { usuario } = await app.guardarUsuario(d, { nombre: 'Carlos', rol: 'empleado', pin: '4321' });
  assert.match(usuario.pin, /^pbkdf2\$600000\$[A-Za-z0-9+/]{43}=$/);
  assert.ok(usuario.sal);
  assert.equal(await app.verificarPin(usuario, '4321'), true);
  assert.equal(await app.verificarPin(usuario, '4322'), false);
  assert.equal(await app.verificarPin(usuario, ''), false);
  assert.equal(await app.verificarPin(null, '4321'), false);
  // Mismo PIN con otra sal da otro hash
  const otro = (await app.guardarUsuario(d, { nombre: 'Ana', rol: 'empleado', pin: '4321' })).usuario;
  assert.notEqual(otro.pin, usuario.pin);
  // Las vueltas se leen del formato: un hash con menos vueltas sigue verificando
  const pocas = { sal: 'x', pin: await hashPinFuerte('9999', 'x', 1000) };
  assert.equal(await app.verificarPin(pocas, '9999'), true);
  assert.equal(await app.verificarPin({ sal: 'x', pin: 'pbkdf2$0$abc' }, '9999'), false);
});

test('PIN viejo (SHA-256): el usuario entra bien y queda pasado a PBKDF2 con la misma sal', async () => {
  const d = base();
  app.asegurarUsuarios(d);
  const admin = d.usuarios.find((u) => u.rol === 'admin');
  // Los usuarios iniciales se crean sin esperar, con el formato viejo (PIN públicos 1234 y 0000)
  assert.match(admin.pin, /^[0-9a-f]{64}$/);
  const sal = admin.sal;
  assert.equal(await app.verificarPin(admin, '9999'), false);
  assert.match(admin.pin, /^[0-9a-f]{64}$/, 'un PIN equivocado no lo cambia');
  assert.equal(await app.verificarPin(admin, '1234'), true);
  assert.match(admin.pin, /^pbkdf2\$600000\$/, 'quedó migrado');
  assert.equal(admin.sal, sal, 'conserva la sal');
  assert.equal(await app.verificarPin(admin, '1234'), true, 'sigue entrando con el formato nuevo');
  assert.equal(await app.verificarPin(admin, '4321'), false);
  // Un usuario guardado antes de este cambio (pin = sha256(sal:pin))
  const viejo = { id: 'v', nombre: 'Viejo', rol: 'empleado', sal: 'abc', pin: app.sha256('abc:2468') };
  assert.equal(await app.verificarPin(viejo, '2468'), true);
  assert.ok(viejo.pin.startsWith('pbkdf2$'));
});

test('clave de recuperación vieja (SHA-256): sirve y queda pasada a PBKDF2', async () => {
  const d = base();
  d.recuperacion = { sal: 's1', hash: app.sha256('s1:ABCDEFGHJKMN'), creada: '2026-01-01T00:00:00.000Z' };
  assert.equal(await app.verificarRecuperacion(d, 'abcd-efgh-jkmx'), false);
  assert.match(d.recuperacion.hash, /^[0-9a-f]{64}$/);
  assert.equal(await app.verificarRecuperacion(d, 'ABCD-EFGH-JKMN'), true);
  assert.match(d.recuperacion.hash, /^pbkdf2\$600000\$/);
  assert.equal(await app.verificarRecuperacion(d, 'abcd efgh jkmn'), true);
  // La nueva se crea directamente con PBKDF2
  await app.nuevaClaveRecuperacion(d);
  assert.match(d.recuperacion.hash, /^pbkdf2\$/);
});

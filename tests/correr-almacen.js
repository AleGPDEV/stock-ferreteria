// Corre tests/almacen.test.js con el Node que trae Electron (para usar better-sqlite3 compilado para Electron).
const { spawnSync } = require('child_process');
const path = require('path');
const electron = require('electron'); // ruta al ejecutable de Electron

const r = spawnSync(electron, [path.join(__dirname, 'almacen.test.js')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(r.status === null ? 1 : r.status);

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const electronBinary = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const result = spawnSync(electronBinary, ['--test', 'tests/database.test.cjs', 'tests/bus-owner-import.test.cjs', 'tests/update.test.cjs'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

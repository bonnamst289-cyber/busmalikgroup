const { spawnSync } = require('node:child_process');
const electronVersion = require('electron/package.json').version;
const windows = process.platform === 'win32';
const command = windows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const args = windows ? ['/d', '/s', '/c', 'npm.cmd rebuild better-sqlite3'] : ['rebuild', 'better-sqlite3'];
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_fallback_to_build: 'false'
  }
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

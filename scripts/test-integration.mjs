import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'dist-server/tests/integration.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_DB_TESTS: '1' },
  windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

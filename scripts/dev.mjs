import { spawn } from 'node:child_process';

const run = (cmd, args, env = {}) =>
  spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });

const build = run('node', ['scripts/build-main.mjs', '--watch']);
const vite = run('npx', ['vite']);
setTimeout(() => {
  const app = run('npx', ['electron', '.'], { AUDITFRAME_DEV_URL: 'http://localhost:5173' });
  app.on('exit', () => {
    build.kill();
    vite.kill();
    process.exit(0);
  });
}, 4000);

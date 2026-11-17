import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info'
};

const configs = [
  { ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.js', external: ['electron', 'sharp'] },
  { ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.js', external: ['electron'] },
  { ...common, entryPoints: ['src/preload/overlay.ts'], outfile: 'dist/preload/overlay.js', external: ['electron'] }
];

if (watch) {
  for (const c of configs) await (await context(c)).watch();
} else {
  await Promise.all(configs.map((c) => build(c)));
}

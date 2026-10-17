import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const run = (script, args) => { const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); };
run('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.desktop.json']);
await mkdir('dist-desktop', { recursive: true });
await writeFile('dist-desktop/package.json', '{"type":"commonjs"}\n');
run('node_modules/vite/bin/vite.js', ['build', '--mode', 'desktop']);

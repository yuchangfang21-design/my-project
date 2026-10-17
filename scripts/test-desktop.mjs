import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const build = spawnSync(process.execPath, ['scripts/build-desktop.mjs'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
let display;
const env = { ...process.env };
if (process.platform === 'linux' && !env.DISPLAY) {
  const binary = env.XUMU_XVFB_PATH || 'Xvfb';
  display = spawn(binary, [':98', '-screen', '0', '1440x1080x24', '-nolisten', 'tcp', '-ac'], { stdio: 'ignore' });
  let failed;
  display.on('error', error => { failed = error; });
  for (let i = 0; i < 50 && !existsSync('/tmp/.X11-unix/X98') && !failed; i++) await new Promise(resolve => setTimeout(resolve, 100));
  if (failed || !existsSync('/tmp/.X11-unix/X98')) { display.kill(); throw new Error('无法启动 Xvfb；请安装 xvfb 或设置 DISPLAY。'); }
  env.DISPLAY = ':98';
}
try { const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.desktop.config.ts', ...process.argv.slice(2)], { stdio: 'inherit', env }); process.exitCode = result.status || (result.error ? 1 : 0); }
finally { display?.kill(); }

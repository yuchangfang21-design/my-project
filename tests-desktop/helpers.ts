import { _electron, type ElectronApplication } from '@playwright/test';
import { resolve } from 'node:path';
export async function launchDesktop(dataDir: string): Promise<ElectronApplication> {
  const env = { ...process.env, XUMU_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  return _electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), resolve('dist-desktop/desktop/main.js')], env, timeout: 15_000 });
}

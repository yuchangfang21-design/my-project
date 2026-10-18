import { _electron, type ElectronApplication } from '@playwright/test';
import { resolve } from 'node:path';
export async function launchDesktop(dataDir: string): Promise<ElectronApplication> {
  const env = { ...process.env, XUMU_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await _electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), resolve('dist-desktop/desktop/main.js')], env, timeout: 15_000 });
  // Main creates this window only after SQLite and the native module are initialized.
  // Inspector evaluations before then can re-enter a partially loaded native addon.
  try { await application.firstWindow(); return application; }
  catch (error) { await application.close(); throw error; }
}

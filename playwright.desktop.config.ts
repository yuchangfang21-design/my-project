import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests-desktop', testIgnore:'packaging.spec.ts', workers: 1, timeout: 30_000, outputDir: 'desktop-test-results', reporter: 'list' });

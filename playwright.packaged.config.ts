import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests-desktop',testMatch:'packaging.spec.ts',workers:1,timeout:40_000,outputDir:'desktop-test-results/packaged',reporter:'list'});

import type { Page } from 'playwright-core';
import type { Identity } from '../../shared/desktop-contracts.js';
export const CREATOR_URL = 'https://creator.douyin.com/';
// No verified identity parser is available yet. Page access or a QR scan alone
// is not evidence of the account identity. Enable a parser only after live validation.
export async function observeIdentity(_page: Page): Promise<Identity | null> { return null; }

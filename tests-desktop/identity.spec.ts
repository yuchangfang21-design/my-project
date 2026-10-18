import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchDesktop } from './helpers';

test('identity accepts the observed endpoint trailing slash hidden by the old route report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-identity-slash-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, dir) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const { createIdentityFixture } = require(require('node:path').join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const f = await createIdentityFixture(dir, { trailingSlash: true });
      try { await f.open(0); return await f.manager.refresh(f.accounts[0].id); } finally { await f.close(); }
    }, root);
    expect(result).toMatchObject({ status: 'logged_in', identity: { remoteId: 'douyin-account:9007199254740993' } });
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('identity reads the observed self-account endpoint with exact numeric IDs and blocks duplicate or switched accounts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-identity-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, dir) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const { createIdentityFixture } = require(require('node:path').join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const f = await createIdentityFixture(dir);
      try {
        await f.open(0);
        const first = await f.manager.refresh(f.accounts[0].id);
        const report = await f.manager.inspect(f.accounts[0].id);
        await f.open(1);
        const duplicate = await f.manager.refresh(f.accounts[1].id);
        f.responses.set(f.accounts[1].id, { body: JSON.stringify({ message: 'success', data: { user_id_str: '9007199254740994', screen_name: '另一个夹具身份' } }), contentType: 'application/json' });
        const second = await f.manager.refresh(f.accounts[1].id);
        f.responses.set(f.accounts[0].id, { body: JSON.stringify({ message: 'success', data: { user_id_str: '9007199254740995', screen_name: '不应改绑的身份' } }), contentType: 'application/json' });
        const mismatch = await f.manager.refresh(f.accounts[0].id);
        return { first, report, duplicate, second, mismatch, retained: f.repo.getConnection(f.accounts[0].id).identity, requests: f.requests };
      } finally { await f.close(); }
    }, root);
    expect(result.first).toMatchObject({ status: 'logged_in', identity: { remoteId: 'douyin-account:9007199254740993', displayName: '夹具身份' } });
    expect(result.duplicate.status).toBe('pending_confirmation');
    expect(result.duplicate.reason).toContain('已绑定其他账号');
    expect(result.second).toMatchObject({ status: 'logged_in', identity: { remoteId: 'douyin-account:9007199254740994' } });
    expect(result.mismatch.status).toBe('pending_confirmation');
    expect(result.mismatch.reason).toContain('不一致');
    expect(result.retained.remoteId).toBe('douyin-account:9007199254740993');
    expect(result.report).toMatchObject({ identity: 'observed', identityRead: { status: 'verified' } });
    for (const secret of ['PRIVATE_', '9007199254740993', '夹具身份']) expect(JSON.stringify(result.report)).not.toContain(secret);
    expect(result.requests.length).toBeGreaterThan(2);
    expect(result.requests.every((r: any) => r.method === 'GET' && r.queryPreserved)).toBe(true);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('identity refuses unobserved or foreign pages and does not follow account response redirects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-identity-origin-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, dir) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const p = require('node:path');
      const { createIdentityFixture } = require(p.join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const { readIdentity } = require(p.join(process.cwd(), 'dist-desktop/desktop/browser/douyin.js'));
      const f = await createIdentityFixture(dir);
      try {
        await f.open(0);
        const context = f.contexts.get(f.accounts[0].id), extra = await context.newPage();
        await extra.route('**/blank', (route: any) => route.fulfill({ contentType: 'text/html', body: '<p>no resource</p>' }));
        await extra.goto('https://creator.douyin.com/blank');
        const count = f.requests.length;
        const unseen = await readIdentity(extra);
        await extra.goto('https://foreign.invalid/blank');
        const foreign = await readIdentity(extra);
        const noRequests = count === f.requests.length;
        await extra.close();
        const foreignCount = f.foreignRequests.length;
        f.responses.set(f.accounts[0].id, { status: 302, body: '', headers: { location: 'https://foreign.invalid/account/api/v1/user/account/info' } });
        const redirected = await f.manager.withAccountPage(f.accounts[0].id, (page: any) => readIdentity(page));
        const redirectNotFollowed = foreignCount === f.foreignRequests.length;
        const beforeRace = f.requests.length;
        const raced = await f.manager.withAccountPage(f.accounts[0].id, async (page: any) => {
          const evaluate = page.evaluate.bind(page);
          page.evaluate = async (fn: any, args: any) => { await page.goto('https://foreign.invalid/blank'); return evaluate(fn, args); };
          try { return await readIdentity(page); } finally { page.evaluate = evaluate; }
        });
        return { unseen, foreign, noRequests, redirected, redirectNotFollowed, raced, raceNoRequests: beforeRace === f.requests.length };
      } finally { await f.close(); }
    }, root);
    expect(result.unseen).toMatchObject({ identity: null, summary: { status: 'endpoint_unseen' } });
    expect(result.foreign.identity).toBeNull();
    expect(result.noRequests).toBe(true);
    expect(result.redirected.identity).toBeNull();
    expect(result.redirectNotFollowed).toBe(true);
    expect(result.raced).toMatchObject({ identity: null, summary: { status: 'page_changed' } });
    expect(result.raceNoRequests).toBe(true);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('identity bounds response size and stalled reads without blocking later coordinated work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-identity-deadline-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, dir) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const p = require('node:path');
      const { createIdentityFixture } = require(p.join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const { OperationCoordinator } = require(p.join(process.cwd(), 'dist-desktop/desktop/publishing/coordinator.js'));
      const f = await createIdentityFixture(dir), coordinator = new OperationCoordinator();
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      try {
        await f.open(0);
        f.responses.set(f.accounts[0].id, { body: JSON.stringify({ message: 'success', data: { user_id_str: '1234', screen_name: 'large'.repeat(20000) } }), contentType: 'application/json' });
        const oversized = await f.manager.refresh(f.accounts[0].id);
        const oversizedReport = await f.manager.inspect(f.accounts[0].id);
        f.responses.set(f.accounts[0].id, { body: '{"message":"success","data":{"user_id_str":"1234","screen_name":"not json media type"}}', contentType: 'text/html' });
        const wrongType = await f.manager.refresh(f.accounts[0].id);
        f.responses.set(f.accounts[0].id, { stall: true });
        const stalled = coordinator.run(() => f.manager.refresh(f.accounts[0].id));
        const next = coordinator.run(async () => 'available');
        const completed = await Promise.race([Promise.all([stalled, next]), new Promise<null>(resolve => { watchdog = setTimeout(() => resolve(null), 9000); })]);
        const report = await f.manager.inspect(f.accounts[0].id);
        return { oversized, oversizedReport, wrongType, completed, report };
      } finally { clearTimeout(watchdog); await f.close(); await coordinator.close(); }
    }, root);
    expect(result.oversized.status).toBe('pending_confirmation');
    expect(result.oversizedReport.identityRead?.status).toBe('unsupported_response');
    expect(result.wrongType.status).toBe('pending_confirmation');
    expect(result.completed).not.toBeNull();
    expect(result.completed?.[0].status).toBe('pending_confirmation');
    expect(result.completed?.[1]).toBe('available');
    expect(result.report.identityRead?.status).toBe('unavailable');
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('identity rejects malformed responses and exposes only allowlisted field types for unsupported formats', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-identity-format-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, dir) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const { createIdentityFixture } = require(require('node:path').join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const f = await createIdentityFixture(dir);
      try {
        await f.open(0);
        const cases = [
          { message: 'error', data: { user_id_str: '1234', screen_name: 'PRIVATE_NAME' } },
          { message: 'success', data: { screen_name: 'PRIVATE_NAME', mobile: 'PRIVATE_PHONE' } },
          { message: 'success', data: { user_id_str: '1234', screen_name: '' } },
          { message: 'success', data: { user_id_str: '0', screen_name: 'PRIVATE_NAME' } },
          { message: 'success', data: { user_id_str: '1234', user_id: 1235, screen_name: 'PRIVATE_NAME' } },
          { message: 'success', data: { user_id_str: '1234', screen_name: 'PRIVATE_NAME', error_code: 12 } },
          { message: 'success', data: { user_id_str: '1234', screen_name: 'PRIVATE_NAME', is_login: false } },
          { message: 'success', data: [] },
        ];
        const rejected = [];
        for (const payload of cases) {
          f.responses.set(f.accounts[0].id, { body: JSON.stringify(payload), contentType: 'application/json' });
          rejected.push((await f.manager.refresh(f.accounts[0].id)).status);
        }
        f.responses.set(f.accounts[0].id, { body: JSON.stringify({ message: 'success', data: { uid: 'PRIVATE_ID', nickname: 'PRIVATE_NAME', mobile: 'PRIVATE_PHONE', PRIVATE_KEY: 'PRIVATE_VALUE' } }), contentType: 'application/json' });
        const unsupported = await f.manager.refresh(f.accounts[0].id);
        const report = await f.manager.inspect(f.accounts[0].id);
        f.responses.set(f.accounts[0].id, { body: '{}', status: 401, contentType: 'application/json' });
        const unauthorized = await f.manager.refresh(f.accounts[0].id);
        const unauthorizedReport = await f.manager.inspect(f.accounts[0].id);
        return { rejected, unsupported, report, unauthorized, unauthorizedReport };
      } finally { await f.close(); }
    }, root);
    expect(result.rejected.every((status: string) => status === 'pending_confirmation')).toBe(true);
    expect(result.unsupported.status).toBe('pending_confirmation');
    expect(result.report).toMatchObject({ identity: 'not_observed', identityRead: { status: 'unsupported_response', fields: { data: { uid: 'string', nickname: 'string' } } } });
    expect(result.unauthorized.status).toBe('pending_confirmation');
    expect(result.unauthorizedReport).toMatchObject({ identityRead: { status: 'not_authenticated' } });
    expect(JSON.stringify([result.report, result.unauthorizedReport])).not.toContain('PRIVATE_');
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

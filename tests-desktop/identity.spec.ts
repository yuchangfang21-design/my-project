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

test('identity reads the confirmed passport endpoint with exact numeric IDs and blocks duplicate or switched accounts', async () => {
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

for (const scenario of ['unobserved', 'foreign', 'redirect', 'navigation_race']) test(`identity boundary ${scenario} refuses unsupported sources without a false binding`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-identity-origin-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, input) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const p = require('node:path');
      const { createIdentityFixture } = require(p.join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const { readIdentity } = require(p.join(process.cwd(), 'dist-desktop/desktop/browser/douyin.js'));
      const f = await createIdentityFixture(input.dir);
      try {
        await f.open(0);
        const context = f.contexts.get(f.accounts[0].id);
        if (input.scenario === 'unobserved' || input.scenario === 'foreign') {
          const page = await context.newPage();
          await page.route('**/blank', (route: any) => route.fulfill({ contentType: 'text/html', body: '<p>no resource</p>' }));
          await page.goto(input.scenario === 'foreign' ? 'https://foreign.invalid/blank' : 'https://creator.douyin.com/blank');
          const count = f.requests.length, read = await readIdentity(page);
          return { read, requestDelta: f.requests.length - count, redirectNotFollowed: true };
        }
        const foreignCount = f.foreignRequests.length, count = f.requests.length;
        if (input.scenario === 'redirect') {
          f.responses.set(f.accounts[0].id, { status: 302, body: '', headers: { location: 'https://foreign.invalid/passport/account/info/v2/' } });
          const read = await f.manager.withAccountPage(f.accounts[0].id, (page: any) => readIdentity(page));
          return { read, requestDelta: f.requests.length - count, redirectNotFollowed: foreignCount === f.foreignRequests.length };
        }
        const read = await f.manager.withAccountPage(f.accounts[0].id, async (page: any) => {
          const evaluate = page.evaluate.bind(page);
          page.evaluate = async (fn: any, args: any) => { await page.goto('https://foreign.invalid/blank'); return evaluate(fn, args); };
          try { return await readIdentity(page); } finally { page.evaluate = evaluate; }
        });
        return { read, requestDelta: f.requests.length - count, redirectNotFollowed: true };
      } finally { await f.close(); }
    }, { dir: root, scenario });
    expect(result.read.identity).toBeNull();
    expect(result.read.summary.status).toBe(scenario === 'redirect' ? 'unavailable' : scenario === 'navigation_race' ? 'page_changed' : 'endpoint_unseen');
    expect(result.requestDelta).toBe(scenario === 'redirect' ? 1 : 0);
    expect(result.redirectNotFollowed).toBe(true);
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
          { message: 'success', data: { user_id_str: '1234', screen_name: 'PRIVATE_NAME', is_visitor_account: true } },
          { message: 'success', data: { user_id_str: '1234', screen_name: 'PRIVATE_NAME', app_id: 9999 } },
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

test('identity rejects the account-type envelope as passport identity without exporting values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-identity-account-info-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, dir) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const { createIdentityFixture } = require(require('node:path').join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const f = await createIdentityFixture(dir);
      try {
        await f.open(0);
        const refresh = async (body: string) => { f.responses.set(f.accounts[0].id, { body, contentType: 'application/json' }); return f.manager.refresh(f.accounts[0].id); };
        const unknown = await refresh(JSON.stringify({ status_code: 0, account_info: { uid: 'PRIVATE_ID', user_name: 'PRIVATE_NAME', mobile: 'PRIVATE_PHONE' } }));
        const report = await f.manager.inspect(f.accounts[0].id);
        const oldEnvelope = await refresh('{"status_code":0,"account_info":{"user_id":9007199254740993,"user_name":"PRIVATE_NAME"}}');
        const rejected = [];
        for (const payload of [
          { status_code: 9, account_info: { user_id_str: '9007199254740993', user_name: 'PRIVATE_NAME' } },
          { account_info: { user_id_str: '9007199254740993', user_name: 'PRIVATE_NAME' } },
          { status_code: 0, account_info: { user_id_str: '9007199254740993', user_id: '9007199254740994', user_name: 'PRIVATE_NAME' } },
          { status_code: 0, account_info: { user_id_str: '9007199254740993', user_name: 'PRIVATE_NAME', is_login: false } },
          { status_code: 0, data: { user_id_str: '9007199254740994', screen_name: 'OTHER' }, account_info: { user_id_str: '9007199254740993', user_name: 'PRIVATE_NAME' } },
          { status_code: 0, account_info: { user_id_str: '9007199254740994', user_name: 'SWITCHED' } },
        ]) rejected.push((await refresh(JSON.stringify(payload))).status);
        return { unknown, report, oldEnvelope, rejected };
      } finally { await f.close(); }
    }, root);
    expect(result.unknown.status).toBe('pending_confirmation');
    expect(result.report.identityRead?.fields).toMatchObject({ root: { status_code: 'number', account_info: 'object' }, account_info: { uid: 'string', user_name: 'string' } });
    expect(JSON.stringify(result.report)).not.toContain('PRIVATE_');
    expect(result.oldEnvelope.status).toBe('pending_confirmation');
    expect(result.rejected).toEqual(Array(6).fill('pending_confirmation'));
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});


test('identity checks the confirmed passport API from home and upload without resource history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xumu-passport-identity-')); const app = await launchDesktop(root);
  try {
    const result = await app.evaluate(async (_electron, dir) => {
      const require = process.getBuiltinModule('module')!.createRequire(process.cwd() + '/package.json');
      const { createIdentityFixture } = require(require('node:path').join(process.cwd(), 'tests-desktop/identity-fixture.cjs'));
      const f = await createIdentityFixture(dir, { endpoint: '/passport/account/info/v2', trailingSlash: true, prepareResource: false });
      try {
        await f.open(0);
        f.responses.set(f.accounts[0].id, { body: '{"message":"success","data":{"user_id":9007199254740993,"user_id_str":"9007199254740993","screen_name":"PRIVATE_NAME","mobile":"PRIVATE_PHONE","session_key":"PRIVATE_SESSION"}}', contentType: 'application/json' });
        const home = await f.manager.refresh(f.accounts[0].id);
        await f.manager.withAccountPage(f.accounts[0].id, async (page: any) => { await page.goto('https://creator.douyin.com/creator-micro/content/upload', { waitUntil: 'load' }); });
        const upload = await f.manager.refresh(f.accounts[0].id), report = await f.manager.inspect(f.accounts[0].id);
        return { home, upload, report, requests: f.requests };
      } finally { await f.close(); }
    }, root);
    for (const observation of [result.home, result.upload]) expect(observation).toMatchObject({ status: 'logged_in', identity: { remoteId: 'douyin-account:9007199254740993', displayName: 'PRIVATE_NAME' } });
    expect(result.requests.length).toBe(2);
    expect(result.requests.every((r: any) => r.method === 'GET' && r.path === '/passport/account/info/v2/' && r.queryPreserved)).toBe(true);
    for (const privateValue of ['PRIVATE_', '9007199254740993']) expect(JSON.stringify(result.report)).not.toContain(privateValue);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

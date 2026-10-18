import type { Page } from 'playwright-core';
import type { Identity } from '../../shared/desktop-contracts.js';
import type { IdentityReadSummary } from '../../shared/site-check-contracts.js';
export const CREATOR_URL = 'https://creator.douyin.com/';
// The user observed this exact same-origin resource in the0.4.2 Windows report.
// Its payload format still needs user-device confirmation; unknown formats fail closed.
const SELF_ACCOUNT_PATH = '/account/api/v1/user/account/info';
type IdentityRead = { identity: Identity | null; summary: IdentityReadSummary };

export async function readIdentity(page: Page): Promise<IdentityRead> {
  const expectedUrl = page.url();
  const unavailable = (status: IdentityReadSummary['status']): IdentityRead => ({ identity: null, summary: { status } });
  try {
    const initial = new URL(expectedUrl);
    if (initial.origin !== 'https://creator.douyin.com' || initial.username || initial.password) return unavailable('endpoint_unseen');
    const evaluation = page.evaluate(async ({ expectedUrl, endpoint }) => {
      type Result = { identity: { remoteId: string; displayName: string } | null; summary: IdentityReadSummary };
      const fail = (status: IdentityReadSummary['status'], fields?: IdentityReadSummary['fields']): Result => ({ identity: null, summary: { status, ...(fields ? { fields } : {}) } });
      if (location.href !== expectedUrl || location.origin !== 'https://creator.douyin.com') return fail('page_changed');
      // Reuse only the already-observed self-account resource, retaining its
      // existing SDK query inside the browser. Never invent or export credentials.
      const observed = performance.getEntriesByType('resource').filter(entry => {
        if (!['fetch', 'xmlhttprequest'].includes((entry as PerformanceResourceTiming).initiatorType)) return false;
        try { const url = new URL(entry.name); return url.origin === location.origin && !url.username && !url.password && (url.pathname === endpoint || url.pathname === endpoint + '/'); } catch { return false; }
      }).at(-1);
      if (!observed) return fail('endpoint_unseen');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(observed.name, { method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal });
        if (location.href !== expectedUrl) return fail('page_changed');
        if (response.status === 401 || response.status === 403) return fail('not_authenticated');
        const actualUrl = new URL(response.url);
        if (!response.ok || actualUrl.origin !== location.origin || (actualUrl.pathname !== endpoint && actualUrl.pathname !== endpoint + '/')) return fail('unavailable');
        if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') || '') || !response.body) return fail('unsupported_response');
        const reader = response.body.getReader(); const decoder = new TextDecoder();
        let bytes = 0, body = '';
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 65536) { await reader.cancel(); return fail('unsupported_response'); }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
        // Keep the exact JSON numeric token for64-bit IDs instead of rounding
        // through JavaScript Number. If unavailable, only safe integers qualify.
        const exactIds = new WeakMap<object, string>();
        const payload = JSON.parse(body, function (this: object, key, value, context?: { source?: string }) {
          if (key === 'user_id' && typeof value === 'number' && typeof context?.source === 'string') exactIds.set(this, context.source);
          return value;
        });
        const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
        const allowedKeys = ['message', 'data', 'error_code', 'status_code', 'user_id', 'user_id_str', 'uid', 'screen_name', 'nickname', 'username', 'is_login', 'user_info', 'account_info', 'profile'];
        const types = (value: unknown) => !isRecord(value) ? {} : Object.fromEntries(allowedKeys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key] === null ? 'null' : Array.isArray(value[key]) ? 'array' : typeof value[key]]));
        const data = isRecord(payload) ? payload.data : undefined;
        const fields = { root: types(payload), data: types(data) };
        if (!isRecord(payload) || !isRecord(data) || payload.message !== 'success') return fail('unsupported_response', fields);
        for (const object of [payload, data]) {
          for (const key of ['error_code', 'status_code']) if (Object.hasOwn(object, key) && object[key] !== 0) return fail('unsupported_response', fields);
          if (Object.hasOwn(object, 'is_login') && object.is_login !== true && object.is_login !== 1) return fail('not_authenticated', fields);
        }
        const candidates: unknown[] = [];
        if (Object.hasOwn(data, 'user_id_str')) candidates.push(data.user_id_str);
        if (Object.hasOwn(data, 'user_id')) candidates.push(typeof data.user_id === 'number' ? exactIds.get(data) ?? (Number.isSafeInteger(data.user_id) ? String(data.user_id) : null) : data.user_id);
        if (!candidates.length || candidates.some(value => typeof value !== 'string' || !/^[1-9]\d{0,29}$/.test(value)) || new Set(candidates).size !== 1) return fail('unsupported_response', fields);
        if (typeof data.screen_name !== 'string' || !data.screen_name.trim() || data.screen_name.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(data.screen_name)) return fail('unsupported_response', fields);
        if (location.href !== expectedUrl) return fail('page_changed');
        return { identity: { remoteId: `douyin-account:${candidates[0]}`, displayName: data.screen_name.trim() }, summary: { status: 'verified', fields } } satisfies Result;
      } catch { return fail('unavailable'); }
      finally { clearTimeout(timer); controller.abort(); }
    }, { expectedUrl, endpoint: SELF_ACCOUNT_PATH });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('身份读取超时')), 6000); });
    const result = await Promise.race([evaluation, deadline]).finally(() => clearTimeout(timer));
    if (page.isClosed() || page.url() !== expectedUrl) return unavailable('page_changed');
    return { identity: result.identity ? { ...result.identity, observedAt: new Date().toISOString() } : null, summary: result.summary };
  } catch { return unavailable('unavailable'); }
}

export async function observeIdentity(page: Page): Promise<Identity | null> { return (await readIdentity(page)).identity; }

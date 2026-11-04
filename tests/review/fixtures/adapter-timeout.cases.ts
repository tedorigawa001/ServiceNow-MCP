import { describe, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../../src/servicenow/client.js';
import { installAdapterReviewScope } from './adapter-review-scope.js';

describe('adapter managed timeout reproduction', () => {
  const review = installAdapterReviewScope();
  const client = () => new ServiceNowClient({ instanceUrl: 'https://adapter-timeout.service-now.com', authMode: 'per-user',
    perUserBearerToken: 'synthetic-adapter-timeout', oauth: { clientId: '', clientSecret: '' } });
  const input = { update_set_sys_id: 'a'.repeat(32) };
  let cancelled = false, settled = false, calls = 0;
  let pending: ReturnType<typeof review>;
  it('preserves the original framework timeout while aborting and draining the review', async () => {
    // No timer, network or worker: parent fetch remains pending until owner cancellation.
    const fetcher: typeof fetch = (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => { cancelled = true; reject(Error('synthetic_cancel')); }, { once: true });
      });
    };
    pending = review(client(), input, { fetch: fetcher });
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await pending;
  }, 250);
  it('starts the next same-principal review after cleanup, not with review_busy', async () => {
    expect(cancelled).toBe(true); expect(settled).toBe(true); expect(calls).toBe(1);
    expect(await pending).toEqual({ isError: true, error: { stage: 'parent', code: 'cancelled' } });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 403 }));
    expect(await review(client(), input, { fetch: fetcher })).toEqual({ isError: true,
      error: { stage: 'parent', code: 'access_denied' } });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(calls).toBe(1);
  });
});

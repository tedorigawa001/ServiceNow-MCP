import { expect, it } from 'vitest';
import { BoundedUpdateSetSource } from '../../src/review/bounded-source.js';
import { BoundedReadSession } from '../../src/servicenow/bounded-read.js';

it('ED06: reaches the first normal metadata read with the same source-issued Permit and no prior diagnostics', async () => {
  const origin = 'https://ed06-positive.invalid';
  const updateSet = 'a'.repeat(32);
  const version = { sys_updated_on: '2026-11-20 00:00:00', sys_mod_count: '0' };
  const parent = { sys_id: updateSet, state: 'in progress', application: 'global', ...version };
  const row = {
    sys_id: 'b'.repeat(32),
    update_set: updateSet,
    name: 'Synthetic ED06 metadata',
    type: 'sys_script',
    action: 'INSERT_OR_UPDATE',
    ...version,
  };
  const replies = [
    { path: `/api/now/table/sys_update_set/${updateSet}`, body: JSON.stringify({ result: parent }) },
    { path: '/api/now/table/sys_cluster_state', body: JSON.stringify({ result: [{ build_name: 'Australia' }] }) },
    { path: '/api/now/table/sys_update_xml', body: JSON.stringify({ result: [row] }) },
  ];
  const expectedPaths = replies.map(reply => reply.path);
  const receivedBytes = replies.reduce((sum, reply) => sum + new TextEncoder().encode(reply.body).byteLength, 0);
  const paths: string[] = [];
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const next = replies[paths.length];
    paths.push(url.pathname);
    if (!next || url.origin !== origin || url.pathname !== next.path || init?.method !== 'GET') {
      throw new Error('unexpected request in the local ED06 fixture');
    }
    return new Response(next.body, { headers: { 'content-type': 'application/json' } });
  };

  // The injected fetch has no delegation or network fallback. All lifecycle methods below
  // are the existing production methods on fresh objects, not patched fixture methods.
  const session = new BoundedReadSession({
    instanceUrl: origin,
    authMode: 'per-user',
    perUserBearerToken: 'ED06_SYNTHETIC_ONLY',
    oauth: { clientId: 'unused' },
  }, { fetch: fixtureFetch });

  const { source, permit, metadata, beforeClose } = await session.run(async () => {
    const source = new BoundedUpdateSetSource(session, { update_set_sys_id: updateSet, max_records: 20 });
    await source.readParent();
    const release = await source.resolveRelease();
    if (release.release_match !== 'matched') throw new Error('synthetic release did not match');
    // First metadata guard: no reviewRunStatus/reviewReleaseStatus, clock or lease probe here.
    const metadata = await source.listMetadata(release.permit);
    return { source, permit: release.permit, metadata, beforeClose: session.stats() };
  });

  expect(paths).toEqual(expectedPaths);
  expect(metadata).toEqual({ rows: [row], metadata_seen: 1, truncated: false });
  expect(beforeClose).toEqual({ requests: 3, received_bytes: receivedBytes, payload_bytes: 0 });
  expect(session.stats()).toEqual(beforeClose);
  expect(session.constructionStatus()).toMatchObject({
    state: 'closed',
    sealed: true,
    teardown: 'confirmed',
    primary: null,
    resources: {
      registered_owner: { state: 'released', releases: 1 },
      core: { state: 'released', releases: 1 },
      admission: { state: 'released', releases: 1 },
    },
  });
  expect(session.reviewRunStatus()).toMatchObject({
    state: 'closed',
    auth_ready: false,
    ready_generation: 1,
    source_claim: 'claimed',
    evidence_issuance: 'disabled',
  });
  await expect(source.listMetadata(permit)).rejects.toMatchObject({ code: 'closed' });
  expect(paths).toEqual(expectedPaths);
  expect(session.stats()).toEqual(beforeClose);
});

// Test-only external HTTP boundary. Never delegates to the real network.
// The production entry point, MCP transport, router and worker remain unchanged.
const id = '1'.repeat(32);
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.origin !== 'https://stdio-fixture.service-now.com' || init.method !== 'GET'
    || !/^\/api\/now\/table\/(sys_update_set|sys_update_xml|sys_cluster_state)(\/|$)/.test(u.pathname)) {
    throw Error('STDIO_FIXTURE_NETWORK_DENIED');
  }
  if (u.pathname.endsWith('/sys_update_set/' + 'c'.repeat(32))) {
    return new Response('STDIO_PRIVATE_UPSTREAM_ERROR_BODY', { status: 403 });
  }
  const parent = (u.pathname + u.search).includes('b'.repeat(32)) ? 'b'.repeat(32) : 'a'.repeat(32);
  const row = { sys_id: id, update_set: parent, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
  if (parent === 'b'.repeat(32) && u.searchParams.get('sysparm_fields')?.includes('payload')) {
    process.stderr.write('BP5_STDIO_PAYLOAD_STARTED\n');
    return new Promise((_resolve, reject) => {
      const abort = () => {
        process.stderr.write('BP5_STDIO_PAYLOAD_ABORTED\n');
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener('abort', abort, { once: true });
    });
  }
  const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
    : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
      : u.searchParams.get('sysparm_fields')?.includes('payload') ? [{ ...row,
        payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><when>after</when><script><![CDATA[/* STDIO_PRIVATE_BODY */ current.update();]]></script></sys_script></record_update>` }]
        : [{ ...row, type: 'Business Rule' }];
  return new Response(JSON.stringify({ result }));
};

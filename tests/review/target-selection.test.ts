import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { reviewBoundedUpdateSet as unscopedReview } from '../../src/review/update-set-adapter.js';
import { sourceWorkerFactory } from './fixtures/worker-factory.js';
import { ReviewTestScope } from './fixtures/review-test-scope.js';
import { aggregateReviewSchema, aggregateReviewV3Schema, aggregateReviewV3JsonSchema,
  anyAggregateReviewSchema, type AggregateReviewV3 } from '../../src/review/aggregate-schema.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { BOUNDED_LIMITS } from '../../src/servicenow/bounded-read.js';
import { getBestPracticeToolDefinitions, renderReviewToolOutcome } from '../../src/tools/best-practice.js';
import { getTools, executeTool } from '../../src/tools/index.js';
import { Worker } from 'node:worker_threads';

const parent = 'a'.repeat(32);
const id = (n: number) => n.toString(16).padStart(32, '0');
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = (n: number, table = 'sys_script', action = 'INSERT_OR_UPDATE') => ({
  sys_id: id(n), update_set: parent, name: `${table}_${id(n + 1000)}`, type: '', action, ...version,
});
type Row = ReturnType<typeof row>;
const json = (result: unknown) => new Response(JSON.stringify({ result }));
const client = () => new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'synthetic-selection-token', oauth: { clientId: '', clientSecret: '' } });
function fixture(rows: Row[], script = 'current.update(); /* PRIVATE_SELECTION_BODY */', collection?: string, when = 'after', clientType?: string) {
  const fetcher = vi.fn<typeof fetch>(async url => {
    const u = new URL(String(url));
    if (u.pathname.includes('/sys_update_set/')) return json({ sys_id: parent, state: 'in progress', application: 'global', ...version });
    if (u.pathname.endsWith('/sys_cluster_state')) return json([{ build_name: 'Australia' }]);
    const query = u.searchParams.get('sysparm_query')!;
    if (u.searchParams.get('sysparm_fields')?.includes('payload')) {
      const r = rows.find(r => query.startsWith(`sys_id=${r.sys_id}^`))!;
      const table = r.name.slice(0, -33);
      const detail: Record<string, unknown> = { ...r }; delete detail.type;
      return json([{ ...detail, payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${r.name.slice(-32)}</sys_id><sys_scope>global</sys_scope><when>${when}</when>${clientType === undefined ? '' : `<type>${clientType}</type>`}${collection === undefined ? '' : `<collection>${collection}</collection>`}<script><![CDATA[${script}]]></script></${table}></record_update>` }]);
    }
    // Synthetic server boundary: apply the documented fixed AND predicates.
    const selected = rows.filter(r => query.split('^').every(term => {
      if (term.startsWith('nameSTARTSWITH')) return r.name.startsWith(term.slice(14));
      if (term.startsWith('nameNOT LIKE')) return !r.name.includes(term.slice(12));
      if (term.startsWith('action=')) return r.action === term.slice(7);
      return true;
    }));
    return json(selected.slice(0, Number(u.searchParams.get('sysparm_limit'))));
  });
  return fetcher;
}
let reviewScope: ReviewTestScope;
beforeEach(context => {
  const owned = new ReviewTestScope(context.signal); reviewScope = owned;
  context.onTestFinished(() => { Object.assign(context.task.meta, { bp5_review_lifecycle: owned.diagnostics() }); });
  context.onTestFailed(() => { console.error('BP5_REVIEW_TEST_LIFECYCLE', JSON.stringify(owned.diagnostics())); });
});
const reviewBoundedUpdateSet: typeof unscopedReview = (client, raw, options) => reviewScope.review(client, raw, options);
afterEach(async () => {
  // Do not restore fetch/clock mocks while an expired test still owns a review.
  try { await reviewScope.close(); }
  finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
const run = (rows: Row[], extra: Record<string, unknown> = {}, fetcher = fixture(rows)) => reviewBoundedUpdateSet(client(),
  { update_set_sys_id: parent, selection_mode: 'review_targets', ...extra }, { fetch: fetcher, workerFactory: sourceWorkerFactory });
it('CL-007 preserves document/custom provenance through worker and rejects forged context', async () => {
  const rows=[row(1,'sys_script_client')];
  for(const mode of ['review_targets',undefined]) {
    const out=await run(rows,{requested_rule_ids:['AU-CL-007'],selection_mode:mode},fixture(rows,
      'function onLoad(){document.getElementById("PRIVATE_DOM");document.createElement("div").querySelector(".PRIVATE_CHILD");}'));
    expect(out.isError).toBe(false);if(out.isError)throw Error(out.error.code);
    expect(out.result).toMatchObject({schema_version:mode?'bp-mcp-review-0.3':'bp-mcp-review-0.2',versions:{ruleset:'bp3-0.13'},counts:{findings:2}});
    expect(aggregateReviewSchema.safeParse(out.result).success || aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/PRIVATE_DOM|PRIVATE_CHILD|synthetic-selection-token/);
    for(const corrupt of ['scope','ownership','followup']) {
      const forged=structuredClone(out.result),asset=forged.assets[0];if(asset.state!=='reviewed')throw Error('Expected DOM candidate');
      if(corrupt==='scope')asset.result.findings[0].required_follow_up.push('dom_created_subtree_review');
      else if(corrupt==='ownership')asset.result.limitations=asset.result.limitations.filter(x=>x!=='dom_standard_ui_ownership_not_verified');
      else asset.result.findings[0].required_follow_up=asset.result.findings[0].required_follow_up.filter(x=>x!=='dom_dependency_review');
      expect((mode?aggregateReviewV3Schema:aggregateReviewSchema).safeParse(forged).success).toBe(false);
    }
  }
});
it('CL-007 unknown receiver cannot become complete analysis', async () => {
  const rows=[row(1,'sys_script_client')];
  const out=await run(rows,{requested_rule_ids:['AU-CL-007']},fixture(rows,'function onLoad(el){el.querySelector("x");}'));
  expect(out.isError).toBe(false);if(out.isError)throw Error(out.error.code);
  expect(out.result.coverage.analysis_complete).toBe(false);
  const forged=structuredClone(out.result);forged.coverage.analysis_complete=true;
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('CL-003 preserves per-finding input classes and exposure limits through the worker', async () => {
  const rows=[row(1,'sys_script_client')];
  const out=await run(rows,{requested_rule_ids:['AU-CL-003']},fixture(rows,
    'function onLoad(){var gr=new GlideRecord("PRIVATE_PRELOAD_TABLE");gr.get("PRIVATE_PRELOAD_ID");g_form.getReference("x");}',undefined,'after','onLoad'));
  expect(out.isError).toBe(false);if(out.isError)throw Error(out.error.code);
  expect(out.result).toMatchObject({versions:{ruleset:'bp3-0.12'},counts:{findings:2}});
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_PRELOAD|synthetic-selection-token/);
  for(const corrupt of ['classification','exposure','event']){
    const forged=structuredClone(out.result),asset=forged.assets[0];if(asset.state!=='reviewed')throw Error('Expected timing candidate');
    if(corrupt==='classification')asset.result.findings[0].required_follow_up.push('onload_runtime_inputs_review');
    else asset.result.limitations=asset.result.limitations.filter(x=>x!==(corrupt==='exposure'?'onload_data_exposure_not_verified':'onload_event_payload_onload'));
    expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
  }
});
it('CL-003 unknown inputs or missing event evidence cannot claim complete analysis', async () => {
  const rows=[row(1,'sys_script_client')];
  for(const type of ['onLoad','onChange',undefined]){
    const out=await run(rows,{requested_rule_ids:['AU-CL-003']},fixture(rows,'function onLoad(){var gr=new GlideRecord("task");gr.get(compute());}',undefined,'after',type));
    expect(out.isError).toBe(false);if(out.isError)throw Error(out.error.code);
    expect(out.result.coverage.analysis_complete).toBe(false);
    const forged=structuredClone(out.result);forged.coverage.analysis_complete=true;
    expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
  }
});
it('CL-003 preserves the old 0.2 envelope and distinct CL-002 necessity review', async () => {
  const rows=[row(1,'sys_script_client')];
  const out=await run(rows,{requested_rule_ids:['AU-CL-002','AU-CL-003'],selection_mode:undefined},fixture(rows,'function onLoad(){var gr=new GlideRecord("task");gr.get("fixed");}',undefined,'after','onLoad'));
  expect(out.isError).toBe(false);if(out.isError)throw Error(out.error.code);
  expect(out.result).toMatchObject({schema_version:'bp-mcp-review-0.2',versions:{ruleset:'bp3-0.12'},counts:{findings:2}});
  expect(aggregateReviewSchema.safeParse(out.result).success).toBe(true);
});
it('CL-008 uses payload event evidence, worker guard analysis and strict follow-ups', async () => {
  const rows = [row(1, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-CL-008'] }, fixture(rows,
    'function onChange(c,o,n,isLoading){g_form.getReference("PRIVATE_ONCHANGE", cb);}', undefined, 'after', 'onChange'));
  expect(out.isError).toBe(false); if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.11' }, counts: { findings: 1 } });
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_ONCHANGE|synthetic-selection-token/);
  for (const corrupt of ['event', 'followup']) {
    const forged = structuredClone(out.result), asset = forged.assets[0];
    if (asset.state !== 'reviewed') throw Error('Expected loading candidate');
    if (corrupt === 'event') asset.result.limitations = asset.result.limitations.filter(x => x !== 'onchange_event_payload_onchange');
    else asset.result.findings[0].required_follow_up = ['source_approval'];
    expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
  }
});
it('CL-008 metadata absence or unsupported flow never becomes complete analysis', async () => {
  const rows = [row(1, 'sys_script_client')];
  for (const type of [undefined, 'onLoad', 'onChange']) {
    const out = await run(rows, { requested_rule_ids: ['AU-CL-008'] }, fixture(rows,
      'function onChange(c,o,n,isLoading){while(ready)g_form.getReference("x");}', undefined, 'after', type));
    expect(out.isError).toBe(false); if (out.isError) throw Error(out.error.code);
    expect(out.result.coverage.analysis_complete).toBe(false);
    const forged = structuredClone(out.result); forged.coverage.analysis_complete = true;
    expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
  }
});
it('CL-008 guarded calls remain distinct from CL-002 necessity candidates in the old 0.2 envelope', async () => {
  const rows = [row(1, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-CL-002', 'AU-CL-008'], selection_mode: undefined }, fixture(rows,
    'function onChange(c,o,n,isLoading){if(isLoading)return;g_form.getReference("x");}', undefined, 'after', 'onChange'));
  expect(out.isError).toBe(false); if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ schema_version: 'bp-mcp-review-0.2', versions: { ruleset: 'bp3-0.11' }, counts: { findings: 1 } });
  expect(aggregateReviewSchema.safeParse(out.result).success).toBe(true);
  const asset = out.result.assets[0]; if (asset.state !== 'reviewed') throw Error('Expected review');
  expect(asset.result.findings[0].rule_id).toBe('AU-CL-002');
  expect(asset.result.limitations).toContain('onchange_lookup_loading_excluded');
});
it('explicit CL-002 selects Client Scripts and preserves necessity review through the worker', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-CL-002'] }, fixture(rows, 'g_form.getReference("PRIVATE_LOOKUP", callback);'));
  expect(out.isError).toBe(false); if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.10' }, selection: { requested_asset_types: ['client_script'] }, counts: { reviewed: 1, findings: 1 } });
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_LOOKUP|synthetic-selection-token/);
  const forged = structuredClone(out.result), asset = forged.assets[0];
  if (asset.state !== 'reviewed') throw Error('Expected lookup candidate');
  expect(asset.result.findings[0].required_follow_up).toContain('client_lookup_necessity_review');
  asset.result.findings[0].required_follow_up = ['source_approval'];
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('CL-002 unknown receivers cannot claim complete aggregate analysis', async () => {
  const rows = [row(1, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-CL-002'] }, fixture(rows, 'function f(gr) { gr.query(); }'));
  expect(out.isError).toBe(false); if (out.isError) throw Error(out.error.code);
  expect(out.result.coverage.analysis_complete).toBe(false);
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  const forged = structuredClone(out.result); forged.coverage.analysis_complete = true;
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('keeps historical per-asset rulesets when a BR rule and CL-002 share an aggregate', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-001', 'AU-CL-002'] }, fixture(rows, 'current.update(); g_form.getReference("x");'));
  expect(out.isError).toBe(false); if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.10' }, counts: { reviewed: 2, findings: 2 } });
  expect(out.result.assets[0]).toMatchObject({ state: 'reviewed', result: { ruleset_version: 'bp3-0.4' } });
  expect(out.result.assets[1]).toMatchObject({ state: 'reviewed', result: { ruleset_version: 'bp3-0.10' } });
});
it('supports CL-002 in the legacy 0.2 envelope and combines client opt-ins without changing defaults', async () => {
  const rows = [row(1, 'sys_script_client')];
  const fetcher = fixture(rows, 'g_form.getReference("x"); g_form.setVisible("x", true);');
  const out = await run(rows, { selection_mode: undefined, requested_rule_ids: ['AU-CL-002', 'AU-CL-006'] }, fetcher);
  expect(out.isError).toBe(false); if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ schema_version: 'bp-mcp-review-0.2', versions: { ruleset: 'bp3-0.10' }, counts: { findings: 2 } });
  expect(aggregateReviewSchema.safeParse(out.result).success).toBe(true);
  const forged = structuredClone(out.result), asset = forged.assets[0];
  if (asset.state !== 'reviewed') throw Error('Expected lookup/control candidates');
  asset.result.limitations = asset.result.limitations.filter(x => x !== 'client_lookup_api_subset');
  expect(aggregateReviewSchema.safeParse(forged).success).toBe(false);
});
it('explicit CL-006 selects Client Scripts and retains UI Policy suitability through the worker', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-CL-006'] },
    fixture(rows, 'function onLoad() { g_form.setMandatory("PRIVATE_UI_FIELD", true); }'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.9' },
    selection: { requested_asset_types: ['client_script'] }, counts: { reviewed: 1, findings: 1 } });
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_UI_FIELD|synthetic-selection-token/);
  const forged = structuredClone(out.result), asset = forged.assets[0];
  if (asset.state !== 'reviewed') throw Error('Expected control candidate');
  expect(asset.result.findings[0].required_follow_up).toContain('ui_policy_suitability_review');
  asset.result.findings[0].required_follow_up = ['source_approval'];
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('CL-006 unknown control evidence stays incomplete', async () => {
  const rows = [row(1, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-CL-006'] }, fixture(rows, 'g_form[method]("x", true);'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result.coverage.analysis_complete).toBe(false);
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  const forged = structuredClone(out.result); forged.coverage.analysis_complete = true;
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('keeps per-asset versions when CL-006 and a BR rule share an aggregate', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-001', 'AU-CL-006'] },
    fixture(rows, 'current.update(); g_form.setVisible("x", false);'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.9' }, counts: { reviewed: 2, findings: 2 } });
  expect(out.result.assets[0]).toMatchObject({ state: 'reviewed', applicable_rule_ids: ['AU-BR-001'], result: { ruleset_version: 'bp3-0.4' } });
  expect(out.result.assets[1]).toMatchObject({ state: 'reviewed', applicable_rule_ids: ['AU-CL-006'], result: { ruleset_version: 'bp3-0.9' } });
});
it('explicit BR-007 selects stored before_display and retains display intent through the worker', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-007'] },
    fixture(rows, 'current.short_description = "PRIVATE_DISPLAY";', undefined, 'before_display'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.8' },
    selection: { requested_asset_types: ['business_rule'] }, counts: { reviewed: 1, findings: 1 } });
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_DISPLAY|synthetic-selection-token/);
  const forged = structuredClone(out.result), asset = forged.assets[0];
  if (asset.state !== 'reviewed') throw Error('Expected display candidate');
  expect(asset.result.findings[0].required_follow_up).toContain('display_persistence_intent_review');
  asset.result.findings[0].required_follow_up = ['source_approval'];
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('BR-007 unknown write evidence stays incomplete', async () => {
  const rows = [row(1)];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-007'] },
    fixture(rows, 'current[field] = 2;', undefined, 'before_display'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result.coverage.analysis_complete).toBe(false);
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  const forged = structuredClone(out.result); forged.coverage.analysis_complete = true;
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('explicit BR-005 reaches before-only post-abort review with strict intent context through the worker', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-005'] },
    fixture(rows, 'current.setAbortAction(true); gs.addErrorMessage("PRIVATE_ABORT");', undefined, 'before'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.7' },
    selection: { requested_asset_types: ['business_rule'] }, counts: { reviewed: 1, findings: 1 } });
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_ABORT|synthetic-selection-token/);
  const forged = structuredClone(out.result);
  const asset = forged.assets[0];
  if (asset.state !== 'reviewed') throw Error('Expected abort candidate');
  expect(asset.result.findings[0].required_follow_up).toContain('post_abort_processing_review');
  asset.result.findings[0].required_follow_up = ['source_approval'];
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('BR-005 unresolved order cannot be promoted to complete analysis', async () => {
  const rows = [row(1)];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-005'] },
    fixture(rows, 'current.setAbortAction(true); try { gs.info("x"); } finally {}', undefined, 'before'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result.coverage.analysis_complete).toBe(false);
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  const forged = structuredClone(out.result); forged.coverage.analysis_complete = true;
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it('explicit BR-004 reaches BR bindings with typed intent review through the worker', async () => {
  const rows = [row(1), row(2, 'sys_script_client'), row(3, 'sys_script_include')];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-004'] }, fixture(rows, 'var PRIVATE_SHARED = 1;', 'global'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.6' },
    selection: { requested_asset_types: ['business_rule'] }, counts: { reviewed: 1, findings: 1 } });
  expect(out.result.assets[0]).toMatchObject({ state: 'reviewed', result: {
    limitations: expect.arrayContaining(['br_global_table_shared_context']),
    findings: [{ rule_id: 'AU-BR-004', required_follow_up: expect.arrayContaining(['shared_binding_intent_review']) }] } });
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_SHARED|synthetic-selection-token/);
  const forged = structuredClone(out.result);
  const asset = forged.assets[0];
  if (asset.state !== 'reviewed') throw Error('Expected binding candidate');
  asset.result.findings[0].required_follow_up = ['source_approval'];
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
});
it.each([undefined, 'global'])('BR-004 keeps unknown table/dynamic scope incomplete (%s)', async collection => {
  const rows = [row(1)];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-004'] },
    fixture(rows, collection ? 'eval(text);' : 'var top = 1;', collection));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result.coverage.analysis_complete).toBe(false);
  expect(aggregateReviewV3Schema.safeParse(out.result).success).toBe(true);
});
it('combines five opt-in rules without changing client applicability or default rules', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const out = await run(rows, { requested_rule_ids: ['AU-BR-001', 'AU-BR-002', 'AU-CL-004', 'AU-QRY-001', 'AU-BR-004'] },
    fixture(rows, "var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y');", 'incident'));
  expect(out.isError).toBe(false);
  if (out.isError) throw Error(out.error.code);
  expect(out.result).toMatchObject({ versions: { ruleset: 'bp3-0.6' }, counts: { reviewed: 2, findings: 2 } });
  expect(out.result.assets[1]).toMatchObject({ state: 'reviewed', applicable_rule_ids: ['AU-CL-004'],
    result: { ruleset_version: 'bp3-0.4', findings: [] } });
});
it('explicit QRY-001 selects BR only and returns worker-validated candidates in 0.3 JSON', async () => {
  const rows = [row(1), row(2, 'sys_script_client'), row(3, 'sys_script_include')];
  const fetcher = fixture(rows, "var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'PRIVATE_QUERY_BODY');");
  const outcome = await run(rows, { requested_rule_ids: ['AU-QRY-001'] }, fetcher);
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error(outcome.error.code);
  expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
  expect(outcome.result).toMatchObject({ schema_version: 'bp-mcp-review-0.3',
    versions: { ruleset: 'bp3-0.5' }, selection: { requested_asset_types: ['business_rule'] },
    counts: { reviewed: 1, findings: 1 } });
  expect(outcome.result.assets[0]).toMatchObject({ state: 'reviewed', result: {
    findings: [{ rule_id: 'AU-QRY-001' }] } });
  const forged = structuredClone(outcome.result);
  forged.versions.ruleset = 'bp3-0.4';
  expect(aggregateReviewV3Schema.safeParse(forged).success).toBe(false);
  const asset = outcome.result.assets[0];
  if (asset.state !== 'reviewed') throw Error('Expected query result');
  const wrongAsset = structuredClone(outcome.result);
  const nested = wrongAsset.assets[0];
  if (nested.state !== 'reviewed') throw Error('Expected query result');
  nested.result.ruleset_version = 'bp3-0.4';
  expect(aggregateReviewV3Schema.safeParse(wrongAsset).success).toBe(false);
  expect(JSON.stringify(outcome)).not.toMatch(/PRIVATE_QUERY_BODY|synthetic-selection-token/);
});
it('unknown query receiver returns partial rather than a complete no-findings analysis', async () => {
  const rows = [row(1)];
  const outcome = await run(rows, { requested_rule_ids: ['AU-QRY-001'] },
    fixture(rows, "unknown.addQuery('x', 'LIKE', 'y');"));
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error(outcome.error.code);
  expect(outcome.result.coverage.analysis_complete).toBe(false);
  expect(outcome.result.assets[0]).toMatchObject({ state: 'reviewed', result: {
    limitations: expect.arrayContaining(['query_like_unresolved']), findings: [] } });
});
it('mixed old rules plus opt-in query preserve applicability and per-asset ruleset provenance', async () => {
  const rows = [row(1), row(2, 'sys_script_client')];
  const outcome = await run(rows, { requested_rule_ids: ['AU-BR-001', 'AU-BR-002', 'AU-CL-004', 'AU-QRY-001'] },
    fixture(rows, "var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y');"));
  expect(outcome.isError).toBe(false);
  if (outcome.isError) throw Error(outcome.error.code);
  expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
  expect(outcome.result.counts).toMatchObject({ reviewed: 2, findings: 1 });
  expect(outcome.result.assets[1]).toMatchObject({ state: 'reviewed', applicable_rule_ids: ['AU-CL-004'],
    result: { ruleset_version: 'bp3-0.4', findings: [] } });
});
it('opt-in reaches an update behind 100 unsupported/deleted rows without expanding the candidate window', async () => {
  const rows = [...Array.from({ length: 120 }, (_, i) => row(i + 1, i % 2 ? 'sys_dictionary' : 'sys_script', i % 2 ? 'INSERT_OR_UPDATE' : 'DELETE')), row(200)];
  const fetcher = fixture(rows);
  const result = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent, selection_mode: 'review_targets', max_records: 1 },
    { fetch: fetcher, workerFactory: sourceWorkerFactory });
  expect(result.isError).toBe(false);
  if (result.isError) throw Error('Expected target review');
  expect(result.result).toMatchObject({ schema_version: 'bp-mcp-review-0.3', collection: { metadata_seen: 1, selected: 1, truncated: false },
    counts: { reviewed: 1, findings: 1 }, selection: { mode: 'review_targets' } });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SELECTION_BODY|synthetic-selection-token/);
});
it.each([undefined, 'bounded_all'])('preserves the 0.2 contract and original query for %s mode', async mode => {
  const fetcher = fixture([row(1, 'sys_dictionary'), row(2, 'sys_script', 'DELETE'), row(3)]);
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent, max_records: 2,
    ...(mode ? { selection_mode: mode } : {}) }, { fetch: fetcher, workerFactory: sourceWorkerFactory });
  if (outcome.isError) throw Error('Expected legacy result');
  expect(outcome.result).toMatchObject({ schema_version: 'bp-mcp-review-0.2', collection: { metadata_seen: 3, selected: 2, truncated: true },
    counts: { not_applicable: 1, skipped_deleted: 1, reviewed: 0 } });
  expect(outcome.result).not.toHaveProperty('selection');
  expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
  for (const [url] of fetcher.mock.calls) {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/sys_update_xml')) {
      expect(u.searchParams.get('sysparm_query')).toBe(`update_set=${parent}^ORDERBYsys_id`);
      expect(u.searchParams.has('sysparm_no_count')).toBe(false);
    }
  }
});
it.each([
  { rules: ['AU-BR-001'], suffix: '^nameSTARTSWITHsys_script_^nameNOT LIKEsys_script_client_^nameNOT LIKEsys_script_include_', types: ['business_rule'], reviewed: 1 },
  { rules: ['AU-CL-004'], suffix: '^nameSTARTSWITHsys_script_client_', types: ['client_script'], reviewed: 1 },
  { rules: ['AU-BR-002', 'AU-CL-004'], suffix: '^nameSTARTSWITHsys_script_^nameNOT LIKEsys_script_include_', types: ['business_rule', 'client_script'], reviewed: 2 },
])('uses one fixed candidate query and the requested rule types: $rules', async ({ rules, suffix, types, reviewed }) => {
  const rows = [row(1), row(2, 'sys_script_client'), row(3, 'sys_script_include'), row(4, 'sys_script', 'DELETE')];
  const fetcher = fixture(rows);
  const outcome = await run(rows, { requested_rule_ids: rules, max_records: 2 }, fetcher);
  if (outcome.isError || outcome.result.schema_version !== 'bp-mcp-review-0.3') throw Error('Expected V3');
  expect(outcome.result.counts.reviewed).toBe(reviewed);
  expect(outcome.result.selection.requested_asset_types).toEqual(types);
  expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
  const lists = fetcher.mock.calls.map(([url]) => new URL(String(url))).filter(u => u.pathname.endsWith('/sys_update_xml') && !u.searchParams.get('sysparm_fields')?.includes('payload'));
  expect(lists).toHaveLength(2);
  expect(lists[0].search).toBe(lists[1].search);
  for (const u of lists) {
    expect(u.searchParams.get('sysparm_query')).toBe(`update_set=${parent}^action=INSERT_OR_UPDATE${suffix}^ORDERBYsys_id`);
    expect(u.searchParams.get('sysparm_limit')).toBe('3');
    expect(u.searchParams.get('sysparm_offset')).toBe('0');
    expect(u.searchParams.get('sysparm_no_count')).toBe('true');
    expect(u.searchParams.get('sysparm_fields')).not.toContain('payload');
  }
});
it.each([0, 1, 2, 3, 101])('bounds %i candidates, never reads lookahead, and does not infer inventory completeness', async count => {
  const rows = Array.from({ length: count }, (_, i) => row(i + 1, 'sys_script_custom'));
  const max = count === 101 ? 100 : 2;
  const fetcher = fixture(rows);
  const outcome = await run(rows, { max_records: max }, fetcher);
  if (outcome.isError) throw Error('Expected finite candidate window');
  expect(outcome.result.collection).toMatchObject({ metadata_seen: Math.min(count, max + 1), selected: Math.min(count, max), truncated: count > max });
  expect(outcome.result.coverage).toMatchObject({ candidate_inventory_complete: false, update_set_inventory_complete: false,
    analysis_scope: 'selected_candidate_window', analysis_complete: count > 0 && count <= max });
  expect(outcome.result.counts.not_applicable).toBe(Math.min(count, max));
  expect(fetcher.mock.calls.some(([url]) => new URL(String(url)).searchParams.get('sysparm_fields')?.includes('payload'))).toBe(false);
  expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
});
it.each(['first', 'final', 'lookahead'] as const)('rejects candidate-condition violations in the %s window', async phase => {
  const rows = [row(1)]; const base = fixture(rows); let lists = 0;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/sys_update_xml') && !u.searchParams.get('sysparm_fields')?.includes('payload')) {
      lists++;
      if (phase === 'first' || phase === 'lookahead' || lists === 2) return json(phase === 'lookahead'
        ? [rows[0], row(2, 'sys_dictionary')] : [row(1, 'sys_script', 'DELETE')]);
    }
    return base(url, init);
  });
  const outcome = await run(rows, { max_records: 1 }, fetcher);
  if (phase === 'final') {
    expect(outcome).toMatchObject({ isError: false, result: { status: 'partial', consistency: 'unverified', counts: { reviewed: 1, findings: 1 } } });
  } else expect(outcome).toMatchObject({ isError: true, error: { stage: 'metadata', code: 'candidate_filter_violation' },
    result: { status: 'failed', collection: { status: 'failed', selected: 0, metadata_seen: 0 }, assets: [] } });
  expect(outcome.result?.errors).toContainEqual({ stage: phase === 'final' ? 'consistency' : 'metadata', code: 'candidate_filter_violation' });
  expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
  if (phase !== 'final') expect(base.mock.calls.some(([url]) => new URL(String(url)).searchParams.get('sysparm_fields')?.includes('payload'))).toBe(false);
});
it.each([
  { update_set: 'b'.repeat(32) }, { action: 'UNKNOWN' }, { name: `sys_script_include_${id(1)}` },
  { name: `sys_dictionary_incident_u_test` },
])('refuses an initial row outside the fixed candidate predicate: %j', async patch => {
  const base = fixture([]);
  const fetcher: typeof fetch = async (url, init) => new URL(String(url)).pathname.endsWith('/sys_update_xml')
    ? json([{ ...row(1), ...patch }]) : base(url, init);
  const outcome = await run([], {}, fetcher);
  expect(outcome).toMatchObject({ isError: true, error: { code: 'candidate_filter_violation' }, result: { assets: [] } });
});
it('keeps malformed target names inside the window as rejected rather than refilling it', async () => {
  const outcome = await run([{ ...row(1), name: 'sys_script_bad_id' }, row(2)], { max_records: 1 });
  expect(outcome).toMatchObject({ isError: false, result: { collection: { selected: 1, truncated: true },
    assets: [{ state: 'rejected', reason: 'identity_mismatch' }], counts: { reviewed: 0 }, coverage: { analysis_complete: false } } });
});
it.each(['Zurich', 'Unknown release'])('stops before candidate metadata on release %s', async family => {
  const base = fixture([row(1)]);
  const fetcher = vi.fn<typeof fetch>(async (url, init) => new URL(String(url)).pathname.endsWith('/sys_cluster_state')
    ? json([{ build_name: family }]) : base(url, init));
  const outcome = await run([row(1)], {}, fetcher);
  expect(outcome).toMatchObject({ isError: false, result: { schema_version: 'bp-mcp-review-0.3', collection: { status: 'not_started' }, assets: [] } });
  expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/sys_update_xml'))).toBe(false);
});
it.each([
  { kind: 'duplicate', rows: [row(1), row(1)] },
  { kind: 'out-of-order', rows: [row(2), row(1)] },
  { kind: 'missing-type', rows: [{ ...row(1), type: undefined }] },
])('rejects $kind metadata without fetching payloads', async ({ rows }) => {
  const base = fixture([]);
  const fetcher: typeof fetch = async (url, init) => new URL(String(url)).pathname.endsWith('/sys_update_xml') ? json(rows) : base(url, init);
  const outcome = await run([], {}, fetcher);
  expect(outcome).toMatchObject({ isError: true, error: { code: 'metadata_unavailable' }, result: { assets: [] } });
});
it('detects a valid candidate membership change in final observation', async () => {
  const base = fixture([row(1)]); let lists = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/sys_update_xml') && !u.searchParams.get('sysparm_fields')?.includes('payload') && ++lists === 2) return json([row(2)]);
    return base(url, init);
  };
  const outcome = await run([row(1)], {}, fetcher);
  expect(outcome).toMatchObject({ isError: false, result: { consistency: 'changed', coverage: { analysis_complete: false }, counts: { reviewed: 1 } } });
});
it('advertises and dispatches opt-in through MCP while rejecting non-enumerated modes before I/O', async () => {
  const validate = new AjvJsonSchemaValidator().getValidator(getBestPracticeToolDefinitions()[0].inputSchema);
  for (const mode of [null, 'typo', 1, { query: 'anything' }]) {
    expect(validate({ update_set_sys_id: parent, selection_mode: mode }).valid).toBe(false);
    const fetcher = vi.fn<typeof fetch>();
    expect(await run([], { selection_mode: mode }, fetcher)).toMatchObject({ isError: true, error: { stage: 'input', code: 'invalid_input' } });
    expect(fetcher).not.toHaveBeenCalled();
  }
  expect(validate({ update_set_sys_id: parent, selection_mode: 'bounded_all' }).valid).toBe(true);
  expect(validate({ update_set_sys_id: parent, selection_mode: 'review_targets' }).valid).toBe(true);
  vi.stubEnv('MCP_TOOL_PACKAGE', 'full');
  vi.stubGlobal('fetch', fixture([row(1)]));
  const outcome = await reviewScope.track(signal => executeTool(client(), 'review_update_set_best_practices',
    { update_set_sys_id: parent, selection_mode: 'review_targets' }, undefined, { signal }));
  expect(outcome).toMatchObject({ isError: false, result: { schema_version: 'bp-mcp-review-0.3', counts: { reviewed: 1 } } });
  expect(getTools().filter(t => t.name === 'review_update_set_best_practices')).toHaveLength(1);
});
it('enforces 0.3 structure and cross-field invariants without weakening 0.2 validation', async () => {
  const outcome = await run([row(1)]);
  if (outcome.isError || outcome.result.schema_version !== 'bp-mcp-review-0.3') throw Error('Expected V3');
  const r = outcome.result;
  expect(aggregateReviewSchema.safeParse(r).success).toBe(false);
  expect(anyAggregateReviewSchema.safeParse(r).success).toBe(true);
  expect(new AjvJsonSchemaValidator().getValidator(aggregateReviewV3JsonSchema)(r).valid).toBe(true);
  const mutations: ((r: AggregateReviewV3) => unknown)[] = [
    r => ({ ...r, unexpected: true }), r => ({ ...r, selection: { ...r.selection, filter_version: 'caller' } }),
    r => ({ ...r, selection: { ...r.selection, requested_asset_types: ['business_rule'] } }),
    r => ({ ...r, selection: { ...r.selection, requested_asset_types: ['client_script', 'business_rule'] } }),
    r => ({ ...r, selection: { ...r.selection, excluded_counts: { ...r.selection.excluded_counts, deleted_assets: 0 } } }),
    r => ({ ...r, coverage: { ...r.coverage, candidate_inventory_complete: true } }),
    r => ({ ...r, limitations: r.limitations.filter(s => s !== 'acl_pre_limit_inventory_unknown') }),
    r => ({ ...r, counts: { ...r.counts, reviewed: 0 } }),
    r => ({ ...r, collection: { ...r.collection, metadata_seen: 102 } }),
    r => ({ ...r, ended_at: new Date(Date.parse(r.started_at) + 60001).toISOString() }),
    r => ({ ...r, errors: [{ stage: 'analysis', code: 'candidate_filter_violation' }] }),
  ];
  for (const mutate of mutations) expect(aggregateReviewV3Schema.safeParse(mutate(r)).success).toBe(false);
  const rendered = renderReviewToolOutcome(outcome);
  expect(JSON.parse(rendered.content[0].text).schema_version).toBe('bp-mcp-review-0.3');
  expect(Buffer.byteLength(JSON.stringify(rendered))).toBeLessThanOrEqual(262144);
});
it('keeps request reservation and retry bytes in the same bounded budget', async () => {
  const base = fixture([row(1), row(2)]);
  const limited = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent, selection_mode: 'review_targets' },
    { fetch: base, workerFactory: sourceWorkerFactory, limits: { requests: 8 } });
  expect(limited).toMatchObject({ isError: false, result: { consistency: 'stable_observation', counts: { reviewed: 1, not_processed: 1 } } });
  const failed = fixture([row(1)]); let lists = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/sys_update_xml') && ++lists === 1) return new Response('x'.repeat(900), { status: 503 });
    return failed(url, init);
  };
  const received = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent, selection_mode: 'review_targets' },
    { fetch: fetcher, workerFactory: sourceWorkerFactory, limits: { totalBytes: 1100, retryDelayMs: 1 } });
  expect(received).toMatchObject({ isError: true, error: { code: 'receive_budget_exceeded' } });
  expect(BOUNDED_LIMITS).toMatchObject({ deadlineMs: 60000, responseBytes: 4194304, totalBytes: 16777216,
    payloadBytes: 2097152, totalPayloadBytes: 8388608, requests: 210 });
});
it.each(['response', 'single_payload', 'total_payload'] as const)('enforces the %s byte ceiling on the opt-in path', async kind => {
  const rows = [row(1), row(2)], base = fixture(rows);
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    if (kind === 'response' && u.pathname.endsWith('/sys_update_xml')) return new Response('x'.repeat(4097));
    return base(url, init);
  };
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent, selection_mode: 'review_targets' },
    { fetch: fetcher, workerFactory: sourceWorkerFactory, limits: kind === 'response' ? { responseBytes: 4096 }
      : kind === 'single_payload' ? { payloadBytes: 50 } : { totalPayloadBytes: 400 } });
  if (kind === 'response') expect(outcome).toMatchObject({ isError: true, error: { code: 'receive_budget_exceeded' }, result: { assets: [] } });
  if (kind === 'single_payload') expect(outcome).toMatchObject({ isError: false, result: { counts: { rejected: 2 },
    assets: [{ state: 'rejected', reason: 'payload_limit' }, { state: 'rejected', reason: 'payload_limit' }] } });
  if (kind === 'total_payload') expect(outcome).toMatchObject({ isError: false, result: { counts: { reviewed: 1, not_processed: 1 },
    assets: [{ state: 'reviewed' }, { state: 'not_processed', reason: 'payload_budget_exceeded' }] } });
});
it('bounds escaped MCP bytes for 0.3 without returning an oversized fragment', async () => {
  const outcome = await run([row(1)]);
  if (outcome.isError) throw Error('Expected aggregate');
  outcome.result.limitations.push(...Array.from({ length: 40 }, () => '"'.repeat(1800)));
  expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
  expect(JSON.parse(renderReviewToolOutcome(outcome).content[0].text)).toEqual({ status: 'failed', error: { stage: 'output', code: 'response_limit' } });
});
it.each(['soft', 'verify', 'hard', 'cancel'] as const)('maintains %s deadlines/cancellation and worker cleanup in opt-in mode', async kind => {
  const now = performance.now.bind(performance); let spent = 0, parents = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now() + spent);
  const rows = [row(1), row(2), row(3)], base = fixture(rows);
  const controller = new AbortController(); const workers: Worker[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    if (kind === 'soft' && u.searchParams.get('sysparm_fields')?.includes('payload') && u.searchParams.get('sysparm_query')?.startsWith(`sys_id=${id(2)}`)) spent = 51000;
    if (u.pathname.includes('/sys_update_set/') && ++parents === 2) {
      if (kind === 'verify') spent = 56000;
      if (kind === 'hard') spent = 61000;
      if (kind === 'cancel') controller.abort();
    }
    return base(url, init);
  };
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent, selection_mode: 'review_targets' },
    { fetch: fetcher, signal: controller.signal, workerFactory: (url, options) => {
      const w = sourceWorkerFactory(url, options); workers.push(w); return w;
    } });
  if (kind === 'hard' || kind === 'cancel') expect(outcome).toMatchObject({ isError: true, error: { code: kind === 'hard' ? 'deadline_exceeded' : 'cancelled' } });
  else {
    expect(outcome).toMatchObject({ isError: false, result: { schema_version: 'bp-mcp-review-0.3', coverage: { analysis_complete: false },
      counts: { reviewed: kind === 'soft' ? 1 : 3, not_processed: kind === 'soft' ? 2 : 0 }, consistency: kind === 'soft' ? 'stable_observation' : 'unverified' } });
    expect(aggregateReviewV3Schema.safeParse(outcome.result).success).toBe(true);
  }
  expect(workers.every(w => w.threadId === -1)).toBe(true);
});
it('does not accept a filter violation as a successful stable collection in the 0.3 contract', async () => {
  const outcome = await reviewBoundedUpdateSet(client(), { update_set_sys_id: parent, selection_mode: 'review_targets' },
    { fetch: fixture([row(1)]), workerFactory: sourceWorkerFactory });
  if (outcome.isError || outcome.result.schema_version !== 'bp-mcp-review-0.3') throw Error('Expected V3');
  const invalid = structuredClone(outcome.result);
  invalid.coverage.analysis_complete = false;
  invalid.errors = [{ stage: 'metadata', code: 'candidate_filter_violation' }];
  expect(aggregateReviewV3Schema.safeParse(invalid).success).toBe(false);
});

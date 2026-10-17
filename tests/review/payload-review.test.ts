import { describe, expect, it } from 'vitest';
import { extractReviewXml, sha256, XML_LIMITS } from '../../src/review/update-xml.js';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';
import { reviewResultSchema } from '../../src/review/result-schema.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sysId = '1'.repeat(32);
function payload(script: string, options: { table?: string; when?: string; extra?: string; action?: string } = {}) {
  const table = options.table ?? 'sys_script';
  return `<record_update table="${table}"><${table} action="${options.action ?? 'INSERT_OR_UPDATE'}"><sys_id>${sysId}</sys_id><sys_scope display_value="Global">global</sys_scope>${options.when === undefined ? '' : `<when>${options.when}</when>`}<script>${script}</script>${options.extra ?? ''}</${table}></record_update>`;
}
function input(xml = payload('<![CDATA[current.update();]]>'), rules = ['AU-BR-001'], table = 'sys_script') {
  return { update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), name: `${table}_${sysId}`,
    payload: xml, retrieved_at: '2026-10-17T05:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-17T04:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: rules };
}
function reviewed(value: unknown) {
  const output = reviewUpdateSetPayload(value);
  expect(output.status).toBe('reviewed');
  if (output.status !== 'reviewed') throw new Error(output.reason);
  expect(reviewResultSchema.safeParse(output.result).success).toBe(true);
  return output.result;
}

describe('safe Update Set XML extraction', () => {
  it('decodes normal text once and preserves CDATA, whitespace and exact payload/code hashes', () => {
    const code = '\nvar x = a && b < 2;\n';
    const plain = payload('\nvar x = a &amp;&amp; b &lt; 2;\n');
    const cdata = payload(`<![CDATA[${code}]]>`);
    const a = extractReviewXml(plain, `sys_script_${sysId}`);
    const b = extractReviewXml(cdata, `sys_script_${sysId}`);
    expect(a.code).toBe(code);
    expect(a.code_hash).toBe(b.code_hash);
    expect(a.code_hash).toBe(sha256(code));
    expect(a.payload_hash).toBe(sha256(plain));
    expect(a.payload_hash).not.toBe(b.payload_hash);
    expect(a.sys_scope).toBe('global');
    expect(extractReviewXml(payload('<![CDATA[&amp;]]>&amp;amp;'), `sys_script_${sysId}`).code).toBe('&amp;&amp;');
  });
  it('handles five entities, decimal/hex references, mixed CDATA and XML newline normalization', () => {
    const xml = payload('&lt;&gt;&amp;&quot;&apos;&#65;&#x42;<![CDATA[ C ]]>&#10;\r\n\r&#13;');
    expect(extractReviewXml(xml, `sys_script_${sysId}`).code).toBe('<>&"\'AB C \n\n\n\r');
  });
  it.each([
    ['external DTD', '<!DOCTYPE record_update SYSTEM "https://example.invalid/evil.dtd">'],
    ['external file entity', '<!DOCTYPE record_update [<!ENTITY x SYSTEM "file:///etc/passwd">]>'],
    ['entity expansion', '<!DOCTYPE record_update [<!ENTITY a "a"><!ENTITY b "&a;&a;">]>'],
  ])('rejects %s without invoking a resolver', (_name, prefix) => {
    expect(() => extractReviewXml(prefix + payload('safe'), `sys_script_${sysId}`)).toThrow('forbidden_dtd');
  });
  it.each(['&undefined;', '&#0;', '&#xD800;', '&#x110000;', '<', ']]>'])('rejects malformed XML text %s', text => {
    expect(() => extractReviewXml(payload(text), `sys_script_${sysId}`)).toThrow();
  });
  it.each([
    payload('safe', { extra: '<script>other</script>' }),
    payload('<nested>bad</nested>'),
    payload('safe', { extra: '<sys_id>bad</sys_id>' }),
    payload('safe').replace('</record_update>', `<sys_script action="INSERT_OR_UPDATE"/></record_update>`),
    payload('safe').replace('<script>', '<script xmlns="urn:evil">'),
    payload('<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="file:///etc/passwd"/>'),
    '<?fetch file="/etc/passwd"?>' + payload('safe'),
    payload('safe').replace('</sys_script>', '</different>'),
    payload('safe').replace('<record_update', '<different'),
    payload('safe').replace('<script>', '<script a="1" a="2">'),
  ])('rejects ambiguous, nested, namespaced or malformed structure %#', xml => {
    expect(() => extractReviewXml(xml, `sys_script_${sysId}`)).toThrow();
  });
  it('rejects delete, absent code, unsupported table/action, identity drift and malformed scope', () => {
    const cases = [payload('', { action: 'DELETE' }), payload('', { action: 'INSERT' }),
      payload('safe').replace('<script>safe</script>', ''), payload('safe', { table: 'incident' }),
      payload('safe').replace(sysId, '4'.repeat(32)), payload('safe').replace('>global<', '>x_app<')];
    for (const xml of cases) expect(() => extractReviewXml(xml, `sys_script_${sysId}`)).toThrow();
  });
  it('accepts unknown/scoped scope, empty script and the XML declaration', () => {
    for (const scope of ['', 'a'.repeat(32)]) {
      const asset = extractReviewXml('<?xml version="1.0" encoding="UTF-8"?>' + payload('').replace('>global<', `>${scope}<`), `sys_script_${sysId}`);
      expect(asset.sys_scope).toBe(scope || null);
      expect(asset.code).toBe('');
    }
  });
  it('enforces payload, code, text, element and nested-depth bounds', () => {
    expect(() => extractReviewXml(' '.repeat(XML_LIMITS.payload_bytes + 1), '')).toThrow('payload_limit');
    expect(() => extractReviewXml(payload('あ'.repeat(Math.ceil(XML_LIMITS.code_bytes / 3))), `sys_script_${sysId}`)).toThrow('code_limit');
    expect(() => extractReviewXml(payload('', { extra: `<description>${'x'.repeat(XML_LIMITS.text_bytes + 1)}</description>` }), `sys_script_${sysId}`)).toThrow('text_limit');
    expect(() => extractReviewXml(payload('', { extra: Array.from({ length: XML_LIMITS.elements }, (_, i) => `<f${i}/>`).join('') }), `sys_script_${sysId}`)).toThrow('element_limit');
    expect(() => extractReviewXml(payload('<x>'.repeat(100) + '</x>'.repeat(100)), `sys_script_${sysId}`)).toThrow('nested_field');
  });
});

describe('BP-3 offline candidate validation', () => {
  it('keeps the synthetic CLI example valid with explicit unsupported coverage', () => {
    const example = JSON.parse(readFileSync(new URL('../../examples/bp3-review-input.json', import.meta.url), 'utf8'));
    const result = reviewed(example);
    expect(result.findings.map(f => f.rule_id)).toEqual(['AU-BR-002', 'AU-BR-001']);
    expect(result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-004', reason: 'unsupported' }]);
    expect(result.review_status).toBe('partial');
  });
  it('returns source-linked AST candidates, not code or claimed violations', () => {
    const result = reviewed(input(payload('<![CDATA[// secret_SENTINEL\ncurrent.update();]]>')));
    expect(result.target.sys_scope).toBe('global');
    expect(result.ruleset_version).toBe('bp3-0.1');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule_id: 'AU-BR-001', line_start: 2, line_end: 2,
      verification_status: 'candidate', confidence: 'low', severity: 'info', verification_evidence: [] });
    expect(result.findings[0].sources[0].section).toContain('Prevent recursive');
    expect(JSON.stringify(result)).not.toContain('secret_SENTINEL');
    expect(JSON.stringify(result)).not.toContain('current.update();');
    expect(result.code_return_mode).toBe('none');
  });
  it.each([
    '// current.update();\nvar s = "current.update()";',
    'var pattern = /current.update()/;', 'somecurrent.update();', 'current.update;',
  ])('does not mistake comments, strings, regexps or unrelated identifiers for a call %#', code => {
    expect(reviewed(input(payload(`<![CDATA[${code}]]>`))).findings).toEqual([]);
  });
  it('recognizes whitespace and literal bracket calls and reports decoded-code line positions', () => {
    const result = reviewed(input(payload('&#10;current&#10;.update();&#10;current[&quot;update&quot;]();')));
    expect(result.findings.map(f => [f.line_start, f.line_end])).toEqual([[2, 3], [4, 4]]);
  });
  it('keeps shadowing, unreachable calls and workflow exceptions as unconfirmed candidates', () => {
    const code = 'function f(current) { if (false) { current.setWorkflow(false); current.update(); } }';
    const result = reviewed(input(payload(`<![CDATA[${code}]]>`)));
    expect(result.findings[0].verification_status).toBe('candidate');
    expect(result.findings[0].required_follow_up).toContain('binding_and_reachability');
  });
  it('uses payload metadata, not conditions or current-record metadata, for async candidates', () => {
    const script = '<![CDATA[(function executeRule(current, previous) { previous.state; current.state.changes(); })(current, previous);]]>';
    const result = reviewed(input(payload(script, { when: 'async', extra: '<condition>current.state.changes()</condition>' }), ['AU-BR-002']));
    expect(result.findings).toHaveLength(2);
    expect(reviewed(input(payload(script, { when: 'before' }), ['AU-BR-002'])).findings).toHaveLength(0);
    const missing = reviewed(input(payload(script), ['AU-BR-002']));
    expect(missing.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-002', reason: 'missing_context' }]);
    expect(missing.review_status).toBe('partial');
  });
  it('detects client synchronous call candidates without treating callback getXML as synchronous', () => {
    const xml = payload('<![CDATA[function onLoad() { ga.getXMLWait(); ga.getXML(function(r) {}); }]]>', { table: 'sys_script_client' });
    const result = reviewed(input(xml, ['AU-CL-004'], 'sys_script_client'));
    expect(result.findings.map(f => f.rule_id)).toEqual(['AU-CL-004']);
  });
  it.each(['Zurich', null])('skips every rule with no findings for release %s', family => {
    const data = input(undefined, ['AU-BR-001', 'AU-BR-004']);
    data.instance_release = { ...data.instance_release, family: family!, raw_buildname: family!, resolution_status: family ? 'resolved' : 'unknown' };
    const result = reviewed(data);
    expect(result.findings).toEqual([]);
    expect(result.coverage.evaluated_rule_ids).toEqual([]);
    expect(result.coverage.skipped_rules.map(s => s.reason)).toEqual(Array(2).fill(family ? 'release_mismatch' : 'release_unknown'));
    expect(result.review_status).toBe('partial');
  });
  it('reports unsupported rules and inactive metadata without silently dropping coverage', () => {
    const result = reviewed(input(payload('<![CDATA[current.update();]]>', { extra: '<active>false</active>' }), ['AU-BR-001', 'AU-BR-004']));
    expect(result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-004', reason: 'unsupported' }]);
    expect(result.limitations).toContain('inactive_asset');
  });
  it('fails closed with sanitized reasons for input errors, bad JS and overflow', () => {
    const cases = [
      [{ ...input(), code_return_mode: 'full' }, 'invalid_input'],
      [{ ...input(), requested_rule_ids: ['AU-BR-001', 'AU-BR-001'] }, 'invalid_input'],
      [input(payload('<![CDATA[var secret_SENTINEL = ;]]>')), 'javascript_parse_failed'],
      [input(payload('<![CDATA[current.update();]]>', { action: 'DELETE' })), 'deleted_asset'],
      [input(payload('<![CDATA[current.update();]]>'.repeat(101))), 'finding_limit'],
      [input(undefined, ['AU-CL-004']), 'rule_asset_mismatch'],
      [{ ...input(), instance_release: { ...input().instance_release, raw_buildname: 'Zurich' } }, 'invalid_result_context'],
    ];
    for (const [data, reason] of cases) {
      const output = reviewUpdateSetPayload(data);
      expect(output).toEqual({ poc_only: true, status: 'rejected', reason });
      expect(JSON.stringify(output)).not.toContain('secret_SENTINEL');
    }
  });
  it('never evaluates code or follows payload directives', () => {
    const code = 'throw new Error("secret_SENTINEL"); require("node:fs").writeFileSync("/tmp/no", "no"); current.update();';
    expect(reviewed(input(payload(`<![CDATA[${code}]]>`))).findings).toHaveLength(1);
  });
});

describe('BP-3 CLI boundary', () => {
  it('runs the offline pipeline and returns a schema-valid result without code', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bp3-poc.ts', '--review', 'examples/bp3-review-input.json'], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    const output = JSON.parse(run.stdout);
    expect(output.status).toBe('reviewed');
    expect(reviewResultSchema.safeParse(output.result).success).toBe(true);
    expect(output.result).not.toHaveProperty('payload');
    expect(output.result.target).not.toHaveProperty('code');
  });
  it('rejects malformed, oversized and invalid UTF-8 input without echoing file paths or contents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bp3-test-'));
    try {
      for (const bytes of [Buffer.from('{"secret_SENTINEL":'), Buffer.from([0xff]), Buffer.alloc(3 * 1024 * 1024 + 1)]) {
        const file = join(directory, 'secret_SENTINEL.json');
        writeFileSync(file, bytes);
        const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bp3-poc.ts', '--review', file], { encoding: 'utf8' });
        expect(run.status).toBe(1);
        expect(run.stdout).toBe('');
        expect(run.stderr).toContain('BP-3 input rejected');
        expect(run.stderr).not.toContain('secret_SENTINEL');
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

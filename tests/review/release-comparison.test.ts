import {describe, expect, it, vi} from 'vitest';
import {compareRelease} from '../../src/servicenow/review-kernel/release-comparison.js';

const observed = '2026-11-01T00:00:01.000Z';
const input = (values: (string | null)[] = ['Australia']) => ({model_id: 'release-comparison-v1',
  timing: {started_at: '2026-11-01T00:00:00.000Z', deadline_ms: 60000, observed_at: observed},
  policy: {instanceBinding: 'a'.repeat(64)},
  observation: {kind: 'complete_200', rows: values.map(build_name => ({build_name}))},
});
const permissions = {formal_issuance: false, release_permit: false, dispatch: false, fallback_activation: false};
const draft = (release_match: string, instance_release: unknown, limitations: string[]) => ({ok: true,
  kind: 'release_comparison_draft', model_id: 'release-comparison-v1', decision: {release_match, instance_release, limitations}, permissions});
const measured = (family: string, raw_buildname: string) => ({source: 'sys_cluster_state.build_name', resolution_status: 'resolved',
  family, raw_buildname, observed_at: observed, visibility_scope: 'caller_acl'});
const assertion = () => ({source: 'operator_config', resolution_status: 'asserted', visibility_scope: 'operator_configured',
  family: 'Australia', instance_binding: 'a'.repeat(64), config_version: 'b'.repeat(64),
  asserted_at: '2026-10-01T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z'});
const unavailable = (reason: string) => draft('unknown', {source: 'none', resolution_status: 'unknown', family: null,
  visibility_scope: 'unavailable', reason}, [reason, 'release_unknown']);
const conflict = (observed_families: string[], configured_family: string | null) => draft('unknown', {source: 'conflict',
  resolution_status: 'unknown', family: null, visibility_scope: 'caller_acl', observed_families, configured_family, observed_at: observed},
['release_evidence_conflict', 'release_unknown']);
const families = ['Australia', 'Brazil', 'Zurich', 'Yokohama', 'Xanadu'];

describe('RC-02 pure release comparison', () => {
  it('returns a non-executable measured draft, retaining first trimmed case', () => {
    expect(compareRelease(input([' aUsTrAlIa ', 'Australia']))).toEqual(draft('matched', measured('Australia', 'aUsTrAlIa'), ['release_visible_nodes_only']));
  });
  it.each([
    ['future assertion', {asserted_at: '2026-11-01T00:00:00.001Z'}, undefined],
    ['equal validity dates', {expires_at: '2026-10-01T00:00:00.000Z'}, 'config_expired'],
    ['reversed validity dates', {expires_at: '2026-09-01T00:00:00.000Z'}, 'config_expired'],
    ['missing expiry issue', {expires_at: '2026-11-01T00:00:00.000Z'}, undefined],
    ['missing insufficient issue', {expires_at: '2026-11-01T00:01:00.000Z'}, undefined],
    ['missing binding issue', {instance_binding: 'c'.repeat(64)}, undefined],
    ['wrong binding priority', {instance_binding: 'c'.repeat(64), expires_at: '2026-10-31T00:00:00.000Z'}, 'config_expired'],
    ['spurious expiry issue', {}, 'config_expired'],
    ['wrong issue kind', {expires_at: '2026-11-01T00:01:00.000Z'}, 'config_expired'],
  ])('rejects policy inconsistency: %s', (_name, patch, issue) => {
    const policy = {...input().policy, assertion: {...assertion(), ...patch}, ...(issue ? {issue} : {})};
    expect(compareRelease({...input(), policy})).toEqual({ok: false, code: 'invalid_input'});
  });
  it.each([
    [[], 'observation_unavailable'],
    [[null, '', ' \t'], 'observation_unavailable'],
    [Array(20).fill(null), 'observation_unavailable'],
    [['Australia', null], 'observation_incomplete'],
    [['unrecognized', ' '], 'observation_incomplete'],
    [['Australia', 'Zurich', null, 'unrecognized'], 'observation_incomplete'],
    [['Australia', 'unrecognized'], 'observation_inconsistent'],
    [['Australia', 'Zurich', 'unrecognized'], 'observation_inconsistent'],
    [['Australia Patch 1'], 'observation_inconsistent'],
    [Array(21).fill('Australia'), 'observation_limit'],
    [Array(21).fill(null), 'observation_limit'],
    [Array(21).fill('unrecognized'), 'observation_limit'],
  ] as [(string | null)[], string][])('applies priority for %j -> %s', (values, reason) => {
    expect(compareRelease(input(values))).toEqual(unavailable(reason));
  });
  it('keeps invalid observations distinct from empty completed observations', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {observed_at: _observed, ...timing} = input().timing;
    expect(compareRelease({...input(), timing, observation: {kind: 'invalid_observation'}})).toEqual(unavailable('observation_incomplete'));
  });
  it.each(['Australia', 'Brazil', 'Zurich', 'Yokohama', 'Xanadu'])('uses valid %s assertions only for entirely missing values', family => {
    const configured = {...assertion(), family};
    const policy = {...input().policy, assertion: configured};
    const warnings = ['release_operator_asserted', 'release_not_observed', 'release_config_may_be_stale', 'release_observation_unavailable',
      ...(family === 'Australia' ? [] : ['release_mismatch'])];
    for (const values of [[], [null, '', ' '], Array(20).fill(null)]) {
      expect(compareRelease({...input(values), policy})).toEqual(draft(family === 'Australia' ? 'matched' : 'mismatched', configured, warnings));
    }
    expect(compareRelease({...input(['Australia', null]), policy})).toEqual(unavailable('observation_incomplete'));
    expect(compareRelease({...input(Array(21).fill(null)), policy})).toEqual(unavailable('observation_limit'));
  });
  it.each([
    ['2026-10-31T23:59:59.999Z', 'config_expired'],
    ['2026-11-01T00:00:00.000Z', 'config_expired'],
    ['2026-11-01T00:00:00.001Z', 'config_validity_insufficient'],
    ['2026-11-01T00:01:00.000Z', 'config_validity_insufficient'],
  ])('retains exact deadline boundary %s / %s', (expires_at, issue) => {
    const policy = {...input().policy, assertion: {...assertion(), expires_at}, issue};
    expect(compareRelease({...input([]), policy})).toEqual(unavailable(issue));
    expect(compareRelease({...input(), policy})).toEqual(draft('matched', measured('Australia', 'Australia'), ['release_visible_nodes_only', issue]));
    const zurichPolicy = {...policy, assertion: {...policy.assertion, family: 'Zurich'}};
    expect(compareRelease({...input(['Zurich']), policy: zurichPolicy})).toEqual(draft('mismatched', measured('Zurich', 'Zurich'), ['release_visible_nodes_only', issue, 'release_mismatch']));
  });
  it('accepts one millisecond beyond the full deadline and an assertion made at start', () => {
    const configured = {...assertion(), asserted_at: input().timing.started_at, expires_at: '2026-11-01T00:01:00.001Z'};
    expect(compareRelease({...input([]), policy: {...input().policy, assertion: configured}})).toEqual(draft('matched', configured,
      ['release_operator_asserted', 'release_not_observed', 'release_config_may_be_stale', 'release_observation_unavailable']));
  });
  it('gives a consistent binding issue priority over every observation kind', () => {
    const policy = {...input().policy, assertion: {...assertion(), instance_binding: 'c'.repeat(64), expires_at: '2026-10-31T00:00:00.000Z'}, issue: 'config_binding_mismatch'};
    expect(compareRelease({...input(Array(21).fill(null)), policy})).toEqual(unavailable('config_binding_mismatch'));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {observed_at: _observed, ...timing} = input().timing;
    for (const kind of ['not_requested', 'invalid_observation']) {
      expect(compareRelease({...input(), policy, timing, observation: {kind}})).toEqual(unavailable('config_binding_mismatch'));
    }
  });
  it.each(families.flatMap(observation => families.map(configured => [observation, configured])))('compares observed %s with configured %s', (observation, configured) => {
    const policy = {...input().policy, assertion: {...assertion(), family: configured}};
    expect(compareRelease({...input([observation]), policy})).toEqual(observation !== configured ? conflict([observation], configured)
      : draft(observation === 'Australia' ? 'matched' : 'mismatched', measured(observation, observation),
        ['release_visible_nodes_only', ...(observation === 'Australia' ? [] : ['release_mismatch'])]));
  });
  it.each([
    ['2026-10-31T00:00:00.000Z', 'config_expired'],
    ['2026-11-01T00:01:00.000Z', 'config_validity_insufficient'],
  ])('keeps conflicting assertions even when unusable for fallback: %s', (expires_at, issue) => {
    const policy = {...input().policy, assertion: {...assertion(), family: 'Zurich', expires_at}, issue};
    expect(compareRelease({...input(), policy})).toEqual(conflict(['Australia'], 'Zurich'));
  });
  it('preserves first-seen unique family order and keeps conflicts free of config warnings', () => {
    const values = [' Zurich ', 'Australia', 'zurich', 'Xanadu', 'Brazil', 'Yokohama'];
    expect(compareRelease(input(values))).toEqual(conflict(['Zurich', 'Australia', 'Xanadu', 'Brazil', 'Yokohama'], null));
    const policy = {...input().policy, assertion: {...assertion(), expires_at: '2026-10-31T00:00:00.000Z'}, issue: 'config_expired'};
    expect(compareRelease({...input(values), policy})).toEqual(conflict(['Zurich', 'Australia', 'Xanadu', 'Brazil', 'Yokohama'], 'Australia'));
  });
  it('accepts 20 completed rows but refuses 22 rows and malformed rows before priority evaluation', () => {
    expect(compareRelease(input(Array(20).fill('Australia')))).toEqual(draft('matched', measured('Australia', 'Australia'), ['release_visible_nodes_only']));
    expect(compareRelease(input(Array(22).fill('Australia')))).toEqual({ok: false, code: 'invalid_input'});
    expect(compareRelease({...input(), observation: {kind: 'complete_200', rows: [...Array(20).fill({build_name: 'Australia'}), {build_name: 42}]}})).toEqual({ok: false, code: 'invalid_input'});
  });
  it.each([
    ['valid', '2026-12-01T00:00:00.000Z', undefined],
    ['expired', '2026-10-31T00:00:00.000Z', 'config_expired'],
    ['insufficient', '2026-11-01T00:01:00.000Z', 'config_validity_insufficient'],
  ])('does not rescue invalid/incomplete/unknown/limited observations with %s config', (_name, expires_at, issue) => {
    const policy = {...input().policy, assertion: {...assertion(), expires_at}, ...(issue ? {issue} : {})};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {observed_at: _observed, ...timing} = input().timing;
    expect(compareRelease({...input(), policy, timing, observation: {kind: 'invalid_observation'}})).toEqual(unavailable('observation_incomplete'));
    expect(compareRelease({...input(['UNRECOGNIZED_SECRET', null]), policy})).toEqual(unavailable('observation_incomplete'));
    expect(compareRelease({...input(['Australia', 'Zurich', 'UNRECOGNIZED_SECRET']), policy})).toEqual(unavailable('observation_inconsistent'));
    const result = compareRelease({...input(Array(21).fill('UNRECOGNIZED_SECRET')), policy});
    expect(result).toEqual(unavailable('observation_limit'));
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('retains long assertion timestamps verbatim without adding a config cap', () => {
    const configured = {...assertion(), asserted_at: `2026-10-01T00:00:00.${'0'.repeat(1000)}Z`, expires_at: `2026-12-01T00:00:00.${'0'.repeat(1000)}Z`};
    expect(compareRelease({...input([]), policy: {...input().policy, assertion: configured}})).toEqual(draft('matched', configured,
      ['release_operator_asserted', 'release_not_observed', 'release_config_may_be_stale', 'release_observation_unavailable']));
  });
  it('is clock-independent, input-preserving and fresh/deeply frozen for each output kind', () => {
    const cases = [input(), input(['Australia', 'Zurich']), input(['UNRECOGNIZED_SECRET']),
      {...input([]), policy: {...input().policy, assertion: assertion()}}];
    const before = JSON.stringify(cases);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {throw Error('unexpected wall clock');});
    try {
      for (const value of cases) {
        const first = compareRelease(value), second = compareRelease(value);
        expect(first.ok).toBe(true); expect(second).toEqual(first); expect(second).not.toBe(first);
        const frozen = (value: unknown): void => {
          if (value && typeof value === 'object') {expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(frozen);}
        };
        frozen(first);
        if (first.ok && second.ok) {
          expect(second.decision.instance_release).not.toBe(first.decision.instance_release);
          expect(second.decision.limitations).not.toBe(first.decision.limitations);
          expect(second.permissions).not.toBe(first.permissions);
          expect(first.permissions).toEqual(permissions);
          expect(first).not.toHaveProperty('permit');
          expect(first.decision.limitations.length).toBeLessThanOrEqual(5);
        }
        expect(compareRelease(JSON.parse(JSON.stringify(first)))).toEqual({ok: false, code: 'invalid_input'});
      }
      expect(JSON.stringify(cases)).toBe(before);
    } finally {clock.mockRestore();}
  });
  it('never executes Proxy/getter code and refuses transport/status or authority-shaped input', () => {
    let calls = 0;
    const getter = input();
    Object.defineProperty(getter.policy, 'assertion', {get() {calls++; throw Error('SECRET');}});
    const proxy = new Proxy(input(), {ownKeys() {calls++; throw Error('SECRET');}});
    for (const value of [getter, proxy, {...input(), permit: {}}, {...input(), status: 403},
      {...input(), observation: {kind: 'cancelled'}}, {...input(), model_id: 'wrong'}]) {
      expect(compareRelease(value)).toEqual({ok: false, code: 'invalid_input'});
    }
    expect(calls).toBe(0);
  });
  it('does not create a new observed/start ordering constraint', () => {
    const earlier = '2026-10-31T23:59:59.000Z';
    expect(compareRelease({...input(), timing: {...input().timing, observed_at: earlier}})).toEqual(draft('matched',
      {...measured('Australia', 'Australia'), observed_at: earlier}, ['release_visible_nodes_only']));
  });
});

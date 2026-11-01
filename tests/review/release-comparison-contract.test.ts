import {describe, expect, it} from 'vitest';
import {parseReleaseComparisonInput} from '../../src/servicenow/review-kernel/release-comparison.js';
import {operatorReleaseConfigSchema} from '../../src/servicenow/review-release-config.js';

const input = () => ({
  model_id: 'release-comparison-v1',
  timing: {started_at: '2026-11-01T00:00:00.000Z', deadline_ms: 60000, observed_at: '2026-11-01T00:00:01.000Z'},
  policy: {instanceBinding: 'a'.repeat(64)},
  observation: {kind: 'complete_200', rows: [{build_name: ' Australia '}]},
});
const assertion = () => ({source: 'operator_config', resolution_status: 'asserted', visibility_scope: 'operator_configured',
  family: 'Australia', instance_binding: 'a'.repeat(64), config_version: 'b'.repeat(64),
  asserted_at: '2026-10-01T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z'});

describe('RC-01 strict value input', () => {
  it('copies and freezes accepted values without admitting a release', () => {
    const original = input();
    const result = parseReleaseComparisonInput(original);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected accepted value input');
    expect(result.input).toEqual(original);
    original.observation.rows[0]!.build_name = 'Zurich';
    expect(result.input.observation).toEqual({kind: 'complete_200', rows: [{build_name: ' Australia '}]});
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(Object.isFrozen(result.input.observation)).toBe(true);
    expect(result).not.toHaveProperty('decision');
    expect(result).not.toHaveProperty('permit');
  });
  it('rejects getters and proxies without executing their code', () => {
    let calls = 0;
    const getter = input();
    Object.defineProperty(getter.observation.rows[0], 'build_name', {get() {calls++; return 'Australia';}});
    const proxy = new Proxy(input(), {get() {calls++; throw new Error('secret');}, ownKeys() {calls++; return [];}});
    const revoked = Proxy.revocable(input(), {}); revoked.revoke();
    for (const value of [getter, proxy, revoked.proxy]) expect(parseReleaseComparisonInput(value)).toEqual({ok: false, code: 'invalid_input'});
    expect(calls).toBe(0);
  });
  it('requires observation timestamps only for complete_200 and bounds row values', () => {
    const original = input();
    const {observed_at: _observed, ...timing} = original.timing;
    expect(parseReleaseComparisonInput({...original, timing})).toEqual({ok: false, code: 'invalid_input'});
    for (const observation of [{kind: 'invalid_observation'}, {kind: 'not_requested'}]) {
      expect(parseReleaseComparisonInput({...original, observation})).toEqual({ok: false, code: 'invalid_input'});
    }
    expect(parseReleaseComparisonInput({...original, timing, observation: {kind: 'invalid_observation'}}).ok).toBe(true);
    expect(parseReleaseComparisonInput({...original, timing, observation: {kind: 'not_requested'}})).toEqual({ok: false, code: 'invalid_input'});
    expect(parseReleaseComparisonInput({...original, observation: {kind: 'complete_200', rows: Array.from({length: 21}, () => ({build_name: null}))}}).ok).toBe(true);
    for (const rows of [Array.from({length: 22}, () => ({build_name: null})), [{build_name: 'x'.repeat(41)}], [{}]]) {
      expect(parseReleaseComparisonInput({...original, observation: {kind: 'complete_200', rows}})).toEqual({ok: false, code: 'invalid_input'});
    }
  });
  it.each([
    ['model', () => ({...input(), model_id: 'release-comparison-v2'})],
    ['unknown root key', () => ({...input(), permit: {}})],
    ['unknown nested key', () => ({...input(), policy: {...input().policy, provider: 'secret'}})],
    ['row projection required', () => ({...input(), observation: {kind: 'complete_200', rows: [{build_name: 'Australia', node: 'secret'}]}})],
    ['upper-case binding', () => ({...input(), policy: {instanceBinding: 'A'.repeat(64)}})],
    ['fractional deadline', () => ({...input(), timing: {...input().timing, deadline_ms: 1.5}})],
    ['zero deadline', () => ({...input(), timing: {...input().timing, deadline_ms: 0}})],
    ['deadline cap', () => ({...input(), timing: {...input().timing, deadline_ms: 60001}})],
    ['invalid ISO', () => ({...input(), timing: {...input().timing, started_at: '2026-02-30T00:00:00Z'}})],
    ['owner date cap', () => ({...input(), timing: {...input().timing, observed_at: `2026-11-01T00:00:00.${'0'.repeat(50)}Z`}})],
    ['undefined optional', () => ({...input(), policy: {...input().policy, assertion: undefined}})],
    ['noncanonical config family', () => ({...input(), policy: {...input().policy, assertion: {...assertion(), family: 'australia'}}})],
    ['function', () => ({...input(), policy: () => 'secret'})],
    ['Promise', () => ({...input(), policy: Promise.resolve('secret')})],
    ['Buffer', () => ({...input(), observation: Buffer.from('secret')})],
    ['prototype', () => Object.assign(Object.create({secret: true}), input())],
    ['symbol', () => ({...input(), [Symbol('secret')]: true})],
    ['cycle', () => {const value: Record<string, unknown> = input(); value.policy = value; return value;}],
    ['sparse rows', () => ({...input(), observation: {kind: 'complete_200', rows: new Array(1)}})],
    ['array extras', () => ({...input(), observation: {kind: 'complete_200', rows: Object.assign([], {secret: true})}})],
    ['nonenumerable', () => Object.defineProperty(input(), 'secret', {value: true})],
    ['issue without assertion', () => ({...input(), policy: {...input().policy, issue: 'config_expired'}})],
  ])('rejects %s with only a fixed diagnostic', (_name, make) => {
    const result = parseReleaseComparisonInput(make());
    expect(result).toEqual({ok: false, code: 'invalid_input'});
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('retains long config timestamp representations while their cap remains pending', () => {
    const config = {...assertion(), asserted_at: `2026-10-01T00:00:00.${'0'.repeat(1000)}Z`};
    expect(operatorReleaseConfigSchema.safeParse({instance_id: 'pdi', assertion: {
      family: config.family, instance_binding: config.instance_binding, asserted_at: config.asserted_at, expires_at: config.expires_at,
    }}).success).toBe(true);
    const result = parseReleaseComparisonInput({...input(), policy: {...input().policy, assertion: config}});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.policy.assertion?.asserted_at).toBe(config.asserted_at);
      expect(Object.isFrozen(result.input.policy.assertion)).toBe(true);
    }
  });
  it('accepts a no-request binding-mismatch value without issuing authority', () => {
    const {observed_at: _observed, ...timing} = input().timing;
    const value = {...input(), timing, policy: {...input().policy, assertion: {...assertion(), instance_binding: 'c'.repeat(64)}, issue: 'config_binding_mismatch'}, observation: {kind: 'not_requested'}};
    expect(parseReleaseComparisonInput(value).ok).toBe(true);
    expect(parseReleaseComparisonInput({...value, policy: {...value.policy, assertion: assertion()}})).toEqual({ok: false, code: 'invalid_input'});
  });
  it('does not introduce observation/start ordering or read the current clock', () => {
    const value = {...input(), timing: {...input().timing, observed_at: '2026-10-31T23:59:59.000Z'}};
    const original = Date.now;
    try {
      Date.now = () => {throw new Error('clock must not run');};
      const first = parseReleaseComparisonInput(value), second = parseReleaseComparisonInput(value);
      expect(first.ok).toBe(true); expect(second).toEqual(first); expect(second).not.toBe(first);
      if (first.ok && second.ok) {
        expect(second.input).not.toBe(first.input);
        expect(Object.isFrozen(first.input.timing)).toBe(true);
        if (first.input.observation.kind === 'complete_200') {
          expect(Object.isFrozen(first.input.observation.rows)).toBe(true);
          expect(Object.isFrozen(first.input.observation.rows[0])).toBe(true);
        }
      }
    } finally {Date.now = original;}
  });
});

import { describe, expect, it } from 'vitest';
import { createSyntheticMapSupply, createFixedSyntheticMapSupply } from './fixtures/source-map-supply-fake.js';

describe('fixed synthetic map supply, no real pins or I/O', () => {
  it('uses the checked map/files/rows together and preserves incomplete rows', () => {
    const supply = createSyntheticMapSupply();
    expect(supply.check()).toMatchObject({ ok: true, kind: 'non_executable_map_supply', ready: false,
      authority: 'none', hash: 'not_checked', mapping: 'shape_only', implementation: 'unknown' });
    expect(supply.inspect()).toMatchObject({ state: 'active', reviewSetId: 'synthetic-map-set-1',
      files: 4, rows: 12, partialRows: 1, unimplementedRows: 11, missingPoints: 12, checks: 1, construction: 'ready' });
    expect(Object.isFrozen(supply.inspect())).toBe(true);
  });
  for (const scenario of ['other_snapshot', 'equal_snapshot_copy', 'map_copy', 'map_wrapper', 'files_copy', 'rows_copy', 'pair_mix', 'version_mix', 'origin_input']) {
    it(`rejects ${scenario} and retires the original binding without replacing its first diagnosis`, () => {
      const supply = createFixedSyntheticMapSupply(scenario);
      expect(supply.check()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      const stopped = supply.inspect();
      expect(stopped).toMatchObject({ state: 'rejected', retainedSnapshot: false, retainedOrigin: false,
        firstReason: 'binding_mismatch', logicalRetirements: 1 });
      expect(supply.check()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(supply.close()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(supply.inspect()).toEqual(stopped);
    });
  }
  it('isolates map identity: same files and rows in a different map object are still a mismatch', () => {
    const supply = createFixedSyntheticMapSupply('map_wrapper');
    expect(supply.inspect()).toMatchObject({ state: 'active', retainedSnapshot: true, construction: 'ready' });
    expect(supply.check()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
  });
  it('holds the original input before the origin probe, so that probe tests the copy boundary', () => {
    const supply = createFixedSyntheticMapSupply('origin_input');
    expect(supply.inspect()).toMatchObject({ retainedOrigin: true, retainedSnapshot: true });
    expect(createSyntheticMapSupply().inspect()).toMatchObject({ retainedOrigin: false });
    expect(supply.check()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    expect(supply.inspect()).toMatchObject({ retainedOrigin: false });
  });
  it('rejects unknown scenarios rather than falling back to a normal supply', () => {
    const supply = createFixedSyntheticMapSupply('unknown');
    expect(supply.check()).toMatchObject({ ok: false, reason: 'supply_invalid' });
    expect(supply.inspect()).toMatchObject({ state: 'rejected', files: 0, checks: 0, retainedSnapshot: false });
  });
  for (const [scenario, stage, snapshots] of [
    ['partial_build_failure', 'source_prepared', 0], ['map_rejected', 'source_prepared', 0], ['after_snapshot_failure', 'snapshot_built', 1],
  ] as const) it(`contains ${scenario} without supplying a partial snapshot`, () => {
    const supply = createFixedSyntheticMapSupply(scenario);
    expect(supply.inspect()).toMatchObject({ state: 'rejected', construction: stage, snapshotsCreated: snapshots,
      logicalRetirements: snapshots, retainedSnapshot: false, firstReason: 'supply_invalid' });
    expect(supply.check()).toMatchObject({ ok: false, reason: 'supply_invalid' });
    const stopped = supply.inspect();
    supply.close(); supply.check();
    expect(supply.inspect()).toEqual(stopped);
  });
  it('allows repeated readonly checks, but retires once and refuses use after close', () => {
    const supply = createSyntheticMapSupply();
    expect(supply.check().ok).toBe(true); expect(supply.check().ok).toBe(true);
    expect(supply.inspect()).toMatchObject({ mapChecks: 1, snapshotsCreated: 1, checks: 2, logicalRetirements: 0 });
    expect(supply.close().ok).toBe(true);
    const closed = supply.inspect();
    expect(closed).toMatchObject({ state: 'closed', retainedSnapshot: false, logicalRetirements: 1, firstReason: 'none' });
    expect(supply.check()).toMatchObject({ ok: false, reason: 'supply_closed' });
    expect(supply.close().ok).toBe(true);
    expect(supply.inspect()).toEqual(closed);
  });
  it('keeps separate active supplies independent when one closes or fails', () => {
    const a = createSyntheticMapSupply(), b = createSyntheticMapSupply(), bad = createFixedSyntheticMapSupply('pair_mix');
    a.close(); bad.check();
    expect(b.check().ok).toBe(true);
    expect(b.inspect()).toMatchObject({ state: 'active', retainedSnapshot: true, checks: 1 });
    b.close();
  });
  it('has no external dictionary, map, version or supplier injection point and executes no hooks', () => {
    let hooks = 0;
    const hostile = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const input of [undefined, null, {}, hostile, 'synthetic-map-set-2', () => { hooks++; }]) {
      const a = createSyntheticMapSupply(input);
      const b = createFixedSyntheticMapSupply(input);
      const c = createFixedSyntheticMapSupply('normal', input);
      for (const supply of [a, b, c]) {
        expect(supply.check()).toMatchObject({ ok: false, reason: 'supply_invalid' });
        expect(supply.inspect()).toMatchObject({ construction: 'not_started', mapChecks: 0, snapshotsCreated: 0, checks: 0 });
      }
    }
    expect(hooks).toBe(0);
  });
  it('does not expose map, dictionary, hashes, snapshots, raw errors or adoption helpers', () => {
    const supply = createSyntheticMapSupply();
    expect(Object.keys(supply)).toEqual(['check', 'close', 'inspect']);
    expect(Object.isFrozen(supply)).toBe(true);
    const outputs = [supply.check(), supply.inspect(), supply.close(), supply.inspect()];
    for (const output of outputs) {
      expect(Object.isFrozen(output)).toBe(true);
      expect(output).toMatchObject({ synthetic: true, realPins: 'not_supplied', runtimeCoverage: 'unknown', nativeCost: 'unknown',
        entryRequirement: 'unknown', seedRequirement: 'unknown', coreInvocation: 'not_called', ready: false });
      expect(JSON.stringify(output)).not.toMatch(/expectedSha256|Synthetic\.producer|synthetic\/producer\.ts|stack|secret/);
    }
  });
  it('uses the same fixed normal recipe through the scenario factory without changing its map', () => {
    const a = createSyntheticMapSupply(), b = createFixedSyntheticMapSupply('normal');
    expect(a.check()).toEqual(b.check());
    expect(a.inspect()).toEqual(b.inspect());
    a.close(); b.close();
  });
  it('agrees with an independent readonly/closed state oracle for every five-operation word', () => {
    for (let word = 0; word < 32; word++) {
      const supply = createSyntheticMapSupply();
      let active = true, checks = 0;
      for (let bit = 0; bit < 5; bit++) {
        const close = (word & (1 << bit)) !== 0;
        if (close) { expect(supply.close().ok).toBe(true); active = false; }
        else {
          const r = supply.check(); expect(r.ok).toBe(active);
          if (active) checks++; else expect(r).toMatchObject({ reason: 'supply_closed' });
        }
        expect(supply.inspect()).toMatchObject({ state: active ? 'active' : 'closed', retainedSnapshot: active,
          checks, logicalRetirements: active ? 0 : 1, mapChecks: 1, snapshotsCreated: 1, firstReason: 'none' });
      }
      supply.close();
    }
  });
});

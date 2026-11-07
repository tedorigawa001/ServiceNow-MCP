/** Fixed fault scenarios only; never imported by the value engine or raw parser. */
import { ValueAccountingOwner, ValueCost, ValueRejected } from './value-core-accounting.js';

const limits = Object.freeze({ max_scopes: 1, max_workers: 1, max_nodes: 100, max_work: 100,
  max_snapshot_bytes: 1000, max_control_bytes: 500, max_file_bytes: 2000 });
class SnapshotFaultCost extends ValueCost { override snapshot(): never { throw Error('private_snapshot_fault'); } }
export type AccountingScenario = 'overflow' | 'multiply_overflow' | 'invalid_value' | 'before_meter'
  | 'snapshot_unavailable' | 'success_snapshot_unavailable' | 'first_failure' | 'duplicate_install';
export function runFixedAccountingScenario(scenario: AccountingScenario) {
  const owner = new ValueAccountingOwner<null>();
  try {
    if (scenario === 'before_meter') throw Error('private_before_meter');
    const cost = scenario === 'snapshot_unavailable' || scenario === 'success_snapshot_unavailable'
      ? new SnapshotFaultCost(limits) : new ValueCost(limits);
    owner.install(cost); cost.spend('structural', 8);
    if (scenario === 'overflow') cost.add(Number.MAX_SAFE_INTEGER, 1);
    if (scenario === 'multiply_overflow') cost.mul(Number.MAX_SAFE_INTEGER, 2);
    if (scenario === 'duplicate_install') owner.install(new ValueCost(limits));
    if (scenario === 'success_snapshot_unavailable') return owner.success(null);
    if (scenario === 'first_failure') {
      const first = owner.failure(new ValueRejected('relation'));
      return Object.freeze({ first, second: owner.failure(new ValueRejected('overflow')), success: owner.success(null) });
    }
    if (scenario === 'snapshot_unavailable') throw new ValueRejected('relation');
    throw Error('private_engine_fault');
  } catch (error) { return owner.failure(error); }
}

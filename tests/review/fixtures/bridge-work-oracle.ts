/** Independent semantic event oracle. Never imports the calculator or its recipe/coefficients. */
type Kind = 'read' | 'check' | 'write' | 'arithmetic' | 'copy' | 'container' | 'freeze' | 'control';
export interface OracleEvent { readonly kind: Kind; readonly subject: string }
export const oracleSlots = ['invocation', 'plan', 'meter', 'byteIdentity', 'rootBorrow', 'inputLength', 'valueNodes', 'claim',
  'firstReason', 'secondaryReason', 'coreState', 'coreWork', 'admissionProjection', 'coreResult', 'candidate', 'returnPending',
  'reservationSeed', 'reservationAdmit', 'reservationTail'];
const caps = ['max_scopes', 'max_workers', 'max_nodes', 'max_work', 'max_snapshot_bytes', 'max_control_bytes', 'max_file_bytes'];
const work = ['structural', 'relation', 'arithmetic', 'number_formatting', 'copies', 'total'];
const binding = ['owner', 'plan', 'meter', 'root', 'V', 'N', 'frame', 'state'];
const diagnostic = ['reason', 'secondary', 'coreInvocation', 'accountingState', 'parserCharged', 'bridgeCharged', 'coreCharged', 'totalState', 'unused', 'phase'];
export function oracleStep(id: string): readonly OracleEvent[] {
  const out: OracleEvent[] = [];
  const emit = (kind: Kind, ...subjects: string[]) => { for (const subject of subjects) out.push({ kind, subject }); };
  const transfer = (...subjects: string[]) => { for (const s of subjects) { emit('read', s); emit('copy', s); emit('write', s); } };
  switch (id) {
    case 'seed_guard':
      emit('read', 'model', 'coverage', 'phase', 'owner');
      emit('check', 'model', 'coverage', 'phase', 'freshOwner', 'finiteSlots', 'finitePaths', 'closedCore', 'closedRuntime'); emit('control', 'prepare'); break;
    case 'seed_allocate': emit('container', 'owner', 'diagnostic', 'credits'); emit('write', ...oracleSlots); break;
    case 'seed_gate': case 'admit_gate': case 'tail_gate':
      emit('read', 'cap', 'parser', 'bridge'); emit('check', 'safe', 'nonnegative', 'phase', 'capacity');
      emit('arithmetic', 'used', 'remaining', 'after'); emit('write', 'creditState', 'creditAmount', 'charged'); emit('control', id); break;
    case 'seed_diagnostic':
      emit('read', 'reason', 'secondary', 'coreState', 'accountingState'); emit('check', 'firstReason', 'terminalState');
      emit('write', 'reason', 'secondary', 'coreState', 'accountingState'); break;
    case 'seed_clear': emit('write', ...oracleSlots.filter(s => !['admissionProjection', 'coreResult', 'candidate', 'returnPending'].includes(s))); break;
    case 'bind': emit('read', ...binding); emit('check', ...binding); emit('control', 'borrow'); break;
    case 'admission': emit('read', 'V', 'valueCap', 'astCap', 'liveCap', 'structuralCap');
      emit('check', 'validV', 'valueCap', 'astCap', 'liveCap', 'structuralCap'); emit('arithmetic', 'twoV', 'threeV', 'plusTen'); break;
    case 'projection': transfer(...caps); emit('container', 'limits'); emit('freeze', 'limits'); break;
    case 'admit_state': emit('read', 'admitState'); emit('check', 'admitState'); emit('write', 'admitState'); break;
    case 'admit_clear': emit('write', 'admissionProjection'); break;
    case 'pre_claim': emit('read', ...binding, 'tailCredit'); emit('check', ...binding, 'tailCredit');
      emit('write', 'claim', 'coreState'); emit('control', 'pre', 'claim'); break;
    case 'dispatch_marker': emit('control', 'syntheticDispatchMarker'); break;
    case 'core_limits_recipe':
      emit('read', 'prototype', 'keys'); emit('check', 'object', 'notProxy', 'prototype', 'keyCount');
      emit('container', 'limitsCopy'); emit('control', 'record');
      for (const key of caps) { emit('read', key); emit('check', key + '/name', key + '/data', key + '/number'); emit('write', key); emit('control', key + '/field'); }
      emit('freeze', 'limitsCopy'); break;
    case 'core_metadata_recipe': {
      emit('read', 'limits', 'shape', 'bounds', 'value', 'usage', 'reason', 'model', 'accounting');
      const fields = ['cases', 'modules', 'events', 'scopes', 'workers', 'samples', 'snapshot', 'encoded', 'control', 'controlReserve', 'kind', 'model'];
      emit('copy', ...fields); emit('write', ...fields);
      emit('container', 'shape', 'upper', 'owner', 'accounting', 'wrapper'); emit('freeze', 'shape', 'upper', 'accounting', 'wrapper'); emit('control', 'entry', 'exit'); break;
    }
    case 'accept': emit('read', 'result', 'model', 'variant', 'claim'); emit('check', 'result', 'model', 'variant', 'claim'); emit('write', 'coreResult', 'candidate'); break;
    case 'work_guard': emit('read', ...work); emit('check', ...work, 'sum', 'cap'); emit('arithmetic', ...work.slice(1)); break;
    case 'work_snapshot': emit('copy', ...work); emit('container', 'work'); emit('freeze', 'work'); break;
    case 'identity_guard': emit('read', 'owner', 'claim', 'candidate', 'state'); emit('check', 'owner', 'claim', 'candidate', 'state'); break;
    case 'width_guard': emit('read', 'N', 'encoded', 'snapshot', 'control', 'fileCap', 'shape'); emit('check', 'N', 'encoded', 'snapshot', 'control', 'fileCap', 'shape'); break;
    case 'pending_move': emit('read', 'candidate'); emit('write', 'candidate', 'returnPending'); emit('control', 'move'); break;
    case 'return_prepare': emit('read', ...diagnostic); emit('copy', ...diagnostic); emit('container', 'diagnostic', 'result'); emit('freeze', 'diagnostic', 'result'); break;
    case 'return_totals': emit('read', 'parser', 'bridge', 'core'); emit('check', 'observable', 'safe'); emit('arithmetic', 'parserBridge', 'all'); break;
    case 'return_seal': emit('container', 'sealedReturn'); emit('freeze', 'sealedReturn'); emit('control', 'seal'); break;
    case 'failure_metadata': emit('read', ...work); emit('check', ...work); emit('copy', ...work); emit('container', 'diagnosticWork'); emit('freeze', 'diagnosticWork'); break;
    case 'tail_clear': emit('write', 'coreResult', 'candidate', 'returnPending'); break;
    case 'tail_retire': emit('read', 'tailCredit'); emit('check', 'tailCredit'); emit('write', 'tailCredit'); emit('control', 'retire'); break;
    default: throw Error('unknown_oracle_step');
  }
  return out;
}
export function oraclePaths() {
  const out: { id: string; phase: 'seed' | 'admit' | 'tail'; steps: string[] }[] = [];
  const put = (id: string, phase: 'seed' | 'admit' | 'tail', steps: string[]) => { out.push({ id, phase, steps }); };
  for (const gates of [[], ['admit_gate'], ['admit_gate', 'tail_gate']]) put('seed/' + gates.length, 'seed', ['seed_guard', 'seed_allocate', 'seed_gate', ...gates, 'seed_diagnostic', 'seed_clear']);
  const admit = ['bind', 'admission', 'projection', 'admit_state'];
  for (let i = 0; i <= admit.length; i++) put('admit/' + i, 'admit', [...admit.slice(0, i), 'admit_clear']);
  const begin = ['pre_claim', 'dispatch_marker', 'core_limits_recipe', 'core_metadata_recipe'];
  const after = ['accept', 'work_guard', 'work_snapshot', 'identity_guard', 'width_guard'];
  const returns = ['return_prepare', 'return_totals', 'return_seal'];
  const end = ['tail_clear', 'tail_retire'];
  put('pre_refused', 'tail', ['pre_claim', 'failure_metadata', ...end]);
  for (let i = 2; i <= begin.length; i++) put('core_throw/' + i, 'tail', [...begin.slice(0, i), 'failure_metadata', ...end]);
  for (const id of ['core_refused', 'result_invalid']) put(id, 'tail', [...begin, 'failure_metadata', ...end]);
  for (let i = 0; i <= after.length; i++) put('post_refused/' + i, 'tail', [...begin, ...after.slice(0, i), 'failure_metadata', ...end]);
  for (let i = 0; i <= returns.length; i++) put('return_refused/' + i, 'tail', [...begin, ...after, 'pending_move', ...returns.slice(0, i), 'failure_metadata', ...end]);
  const completed = [...begin, ...after, 'pending_move', ...returns];
  put('success', 'tail', [...completed, ...end]); put('diagnostic_fault', 'tail', [...completed, 'failure_metadata', ...end]);
  for (let i = 0; i <= end.length; i++) put('cleanup_fault/' + i, 'tail', [...completed, 'failure_metadata', ...end.slice(0, i)]);
  return out;
}

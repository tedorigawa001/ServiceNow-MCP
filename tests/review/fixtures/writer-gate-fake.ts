/** Pure, isolated gate model. No imports, real frames, writer callbacks, Journal or runtime adoption. */
const PIN: unique symbol = Symbol('fake-writer-pin');
const GRANT: unique symbol = Symbol('fake-frame-grant');
type GateState = 'unbound' | 'open' | 'stop_requested' | 'closed' | 'unconfirmed';
type FrameState = 'not_entered' | 'entering' | 'active' | 'exiting' | 'exited' | 'exit_unconfirmed';
type Reason = 'none' | 'input_rejected' | 'binding_mismatch' | 'operation_unconfirmed';
interface FakeScope { readonly owner: object; readonly construction: object; readonly retention: object;
  readonly sourceSlot: object; readonly claim: object; readonly epoch: object }
interface GateBindingPin extends FakeScope { readonly [PIN]: true; readonly gate: object; readonly scope: FakeScope }
interface FrameGrant { readonly [GRANT]: true; readonly gate: object; readonly owner: object; readonly pin: GateBindingPin;
  readonly epoch: object; readonly frame: object; readonly phase: 'generation' }
interface FailureShell { first: Reason; phase: string; boundary: string }
class WriterGateModel {
  readonly #failure: FailureShell;
  readonly #gate = Object.freeze({}); readonly #frameOrigin = Object.freeze({});
  readonly #scope: FakeScope;
  #pin: GateBindingPin | undefined; #issuedPin: GateBindingPin | undefined;
  #grant: FrameGrant | undefined; #issuedGrant: FrameGrant | undefined;
  #gateState: GateState = 'unbound'; #frameState: FrameState = 'not_entered';
  #grantStage: 'not_started' | 'attempting' | 'provisional' | 'active' | 'revoked' = 'not_started';
  #binding = false; #bound = false; #stop = false; #used = false;
  #bindAttempts = 0; #grantAttempts = 0; #activations = 0; #revocations = 0;
  #fixed: Readonly<{ ok: boolean; disposition: string; first: Reason }> | undefined;
  #reentry: string | undefined; #refusal: 'none' | 'duplicate_binding' | 'duplicate_grant' = 'none';
  constructor(private readonly script: string, admitted: boolean) {
    this.#failure = { first: admitted ? 'none' : 'input_rejected', phase: 'construction', boundary: 'none' };
    this.#scope = Object.freeze({ owner: Object.freeze({}), construction: Object.freeze({}), retention: Object.freeze({}),
      sourceSlot: Object.freeze({}), claim: Object.freeze({}), epoch: Object.freeze({}) });
  }
  private reply(ok: boolean, disposition: string) { return Object.freeze({ ok, disposition, first: this.#failure.first }); }
  private fail(reason: Exclude<Reason, 'none'>) {
    if (this.#failure.first === 'none') this.#failure.first = reason;
    // A closed model never reopens. Only an unconfirmed operation, or a failure while the frame is entering/exiting,
    // leaves execution authority unconfirmed; other refusals keep the gate state.
    const unconfirmed = reason === 'operation_unconfirmed' || this.#frameState === 'entering' || this.#frameState === 'exiting';
    if (unconfirmed && this.#gateState !== 'closed') this.#gateState = 'unconfirmed';
    return this.#fixed ??= this.reply(false, reason);
  }
  // A duplicate request is refused without executing anything; it keeps gate/frame state and later closure possible.
  private refuse(reason: 'duplicate_binding' | 'duplicate_grant') {
    if (this.#refusal === 'none') this.#refusal = reason;
    return this.reply(false, reason);
  }
  private guard() { return this.#fixed ?? (this.#failure.first !== 'none' ? this.fail(this.#failure.first) : undefined); }
  private point(phase: string, boundary: string) {
    this.#failure.phase = phase; this.#failure.boundary = boundary;
    if (this.script === `${phase}_${boundary}`) throw Error('private_gate_fault');
  }
  private pinMatches(): boolean {
    const p = this.#pin, s = this.#scope;
    return !!p && p === this.#issuedPin && Reflect.ownKeys(p).length === 9 && p[PIN] === true && p.gate === this.#gate
      && p.scope === s && p.owner === s.owner && p.construction === s.construction && p.retention === s.retention
      && p.sourceSlot === s.sourceSlot && p.claim === s.claim && p.epoch === s.epoch;
  }
  private grantMatches(): boolean {
    const g = this.#grant;
    return !!g && g === this.#issuedGrant && Reflect.ownKeys(g).length === 7 && g[GRANT] === true
      && g.gate === this.#gate && g.owner === this.#scope.owner && g.pin === this.#issuedPin
      && g.epoch === this.#scope.epoch && g.frame === this.#frameOrigin && g.phase === 'generation';
  }
  private pinProbe(p: GateBindingPin): GateBindingPin {
    const field = this.script.startsWith('pin_') ? this.script.slice(4) : '';
    if (['gate', 'scope', 'owner', 'construction', 'retention', 'sourceSlot', 'claim', 'epoch'].includes(field))
      return Object.freeze({ ...p, [field]: Object.freeze({}) }) as GateBindingPin;
    if (field === 'brand') return Object.freeze({ ...p, [PIN]: false }) as unknown as GateBindingPin;
    if (field === 'extra') return Object.freeze({ ...p, extra: true });
    return p;
  }
  private grantProbe(g: FrameGrant): FrameGrant {
    const field = this.script.startsWith('grant_') ? this.script.slice(6) : '';
    if (['gate', 'owner', 'pin', 'epoch', 'frame'].includes(field)) return Object.freeze({ ...g, [field]: Object.freeze({}) }) as FrameGrant;
    if (field === 'brand') return Object.freeze({ ...g, [GRANT]: false }) as unknown as FrameGrant;
    if (field === 'phase') return Object.freeze({ ...g, phase: 'foreign' }) as unknown as FrameGrant;
    if (field === 'extra') return Object.freeze({ ...g, extra: true });
    return g;
  }
  bind() {
    const bad = this.guard(); if (bad) return bad;
    if (this.#binding) return this.reply(false, 'binding_in_progress');
    if (this.#bound) return this.refuse('duplicate_binding');
    if (this.#stop) return this.reply(false, 'stopped');
    this.#binding = true;
    try {
      this.point('bind', 'before'); this.#bindAttempts = 1;
      if (this.script === 'reenter_bind') this.#reentry = this.bind().disposition;
      this.point('bind', 'mint');
      const p = this.pinProbe(Object.freeze({ [PIN]: true as const, gate: this.#gate, scope: this.#scope, ...this.#scope }));
      this.#issuedPin = p; this.#pin = this.script === 'pin_copy' ? Object.freeze({ ...p }) : p;
      this.point('bind', 'capture');
      if (!this.pinMatches()) return this.fail('binding_mismatch');
      this.point('bind', 'post'); this.#bound = true; this.#gateState = 'open'; return this.reply(true, 'bound');
    } catch { return this.fail('operation_unconfirmed'); }
    finally { this.#binding = false; }
  }
  enter() {
    const bad = this.guard(); if (bad) return bad;
    if (this.#frameState === 'entering' || this.#frameState === 'active') return this.reply(false, 'generation_in_progress');
    if (this.#used) return this.refuse('duplicate_grant');
    if (!this.#bound) return this.reply(false, 'not_bound');
    if (this.#stop || this.#gateState !== 'open') return this.reply(false, 'stopped');
    if (!this.pinMatches()) return this.fail('binding_mismatch');
    try {
      this.point('enter', 'before');
      this.#used = true; this.#frameState = 'entering'; this.#grantStage = 'attempting'; this.#grantAttempts = 1;
      if (this.script === 'reenter_enter') this.#reentry = this.enter().disposition;
      this.point('grant', 'mint');
      const g = this.grantProbe(Object.freeze({ [GRANT]: true as const, gate: this.#gate, owner: this.#scope.owner,
        pin: this.#issuedPin!, epoch: this.#scope.epoch, frame: this.#frameOrigin, phase: 'generation' }));
      this.#issuedGrant = g; this.#grant = this.script === 'grant_copy' ? Object.freeze({ ...g }) : g;
      this.#grantStage = 'provisional'; this.point('grant', 'capture');
      if (!this.grantMatches()) return this.fail('binding_mismatch');
      if (this.script === 'request_during_enter') { this.request(); return this.fail('operation_unconfirmed'); }
      this.point('grant', 'post'); this.#grantStage = 'active'; this.#frameState = 'active'; this.#activations = 1;
      return this.reply(true, 'active_fake');
    } catch { return this.fail('operation_unconfirmed'); }
  }
  request() {
    const bad = this.guard(); if (bad) return bad;
    this.#stop = true;
    if (this.#gateState !== 'closed') this.#gateState = 'stop_requested';
    return this.reply(false, this.#frameState === 'active' || this.#frameState === 'entering' || this.#frameState === 'exiting' ? 'deferred_frame' : 'stopped');
  }
  check() {
    const bad = this.guard(); if (bad) return bad;
    if (this.#frameState !== 'active' || this.#grantStage !== 'active'
      || this.#gateState !== 'open' && this.#gateState !== 'stop_requested') return this.reply(false, 'inactive');
    if (!this.pinMatches() || !this.grantMatches()) return this.fail('binding_mismatch');
    return this.reply(true, 'qualified_fake'); // Qualification only. There is no operation callback or real leaf.
  }
  exit() {
    const bad = this.guard(); if (bad) return bad;
    if (this.#frameState === 'exiting') return this.reply(false, 'exit_in_progress');
    if (this.#frameState === 'exited') return this.reply(false, 'already_exited');
    if (this.#frameState !== 'active') return this.reply(false, 'not_active');
    if (!this.pinMatches() || !this.grantMatches()) return this.fail('binding_mismatch');
    this.#frameState = 'exiting';
    try {
      this.point('exit', 'before');
      if (this.script === 'reenter_exit') this.#reentry = this.exit().disposition;
      this.#grantStage = 'revoked'; this.#revocations = 1; this.point('exit', 'revoke');
      this.point('exit', 'post'); this.#frameState = 'exited'; return this.reply(true, 'exited_fake');
    } catch { this.#frameState = 'exit_unconfirmed'; return this.fail('operation_unconfirmed'); }
  }
  closeGate() {
    const bad = this.guard(); if (bad) return bad;
    if (this.#gateState === 'closed') return this.reply(true, 'closed_fake');
    if (!this.#bound || !this.#stop) return this.reply(false, 'not_ready');
    if (this.#frameState !== 'not_entered' && this.#frameState !== 'exited') return this.reply(false, 'deferred_frame');
    if (!this.pinMatches() || this.#used && (this.#grantStage !== 'revoked' || !this.grantMatches())) return this.fail('binding_mismatch');
    this.#gateState = 'closed'; return this.reply(true, 'closed_fake');
  }
  rejectInput() { return this.fail('input_rejected'); }
  inspect() {
    return Object.freeze({ model: 'wfb-writer-gate-pure-fake-1', gate: this.#gateState, frame: this.#frameState,
      first: this.#failure.first, phase: this.#failure.phase, boundary: this.#failure.boundary, stop: this.#stop,
      bound: this.#bound, generationUsed: this.#used, bindAttempts: this.#bindAttempts, grantAttempts: this.#grantAttempts,
      grantStage: this.#grantStage, pinRetained: !!this.#issuedPin, grantRetained: !!this.#issuedGrant,
      activations: this.#activations, revocations: this.#revocations, reentry: this.#reentry, refusal: this.#refusal,
      producerFirst: this.script === 'prior_failure' ? 'synthetic_producer_failure' : 'none',
      outcome: this.script === 'outcome_throw' ? 'throw' : this.script === 'outcome_cancel' ? 'cancel' : 'return',
      realFrame: 'not_connected', realWriterCalls: 0, journalSupply: 'not_connected', closedEvidence: 'not_issued',
      admissionConsumptions: 0, packetObjects: 0, proofIssuance: 'closed', rootFinish: 'not_called' });
  }
}
const SCRIPTS = Object.freeze(['normal', 'prior_failure', 'outcome_throw', 'outcome_cancel', 'reenter_bind', 'reenter_enter', 'reenter_exit', 'request_during_enter',
  ...['before', 'mint', 'capture', 'post'].map(p => 'bind_' + p), 'enter_before', ...['mint', 'capture', 'post'].map(p => 'grant_' + p),
  ...['before', 'revoke', 'post'].map(p => 'exit_' + p),
  ...['copy', 'brand', 'extra', 'gate', 'scope', 'owner', 'construction', 'retention', 'sourceSlot', 'claim', 'epoch'].map(p => 'pin_' + p),
  ...['copy', 'brand', 'extra', 'gate', 'owner', 'pin', 'epoch', 'frame', 'phase'].map(p => 'grant_' + p)]);
export function createWriterGateFake(...args: readonly unknown[]) {
  const s = args.length ? args[0] : 'normal';
  const admitted = args.length <= 1 && typeof s === 'string' && SCRIPTS.includes(s);
  const a = new WriterGateModel(admitted ? s as string : 'normal', admitted);
  return Object.freeze({ bind: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.bind(),
    enter: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.enter(), request: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.request(),
    check: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.check(), exit: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.exit(),
    closeGate: (...xs: readonly unknown[]) => xs.length ? a.rejectInput() : a.closeGate(), inspect: () => a.inspect() });
}

/** Isolated synthetic construction only: no source, payload, binding, retirement or root operations. */
const CONSTRUCTION: unique symbol = Symbol('construction');
const RETENTION: unique symbol = Symbol('retention');
const SLOT: unique symbol = Symbol('unbound-slot');
type ConstructionOrigin = Readonly<{ [CONSTRUCTION]: true }>;
type RetentionOrigin = Readonly<{ [RETENTION]: true }>;
const ROLES = Object.freeze(['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'] as const);
type Role = typeof ROLES[number];
type Reason = 'none' | 'binding_mismatch' | 'duplicate_generation' | 'supply_closed' | 'generation_unavailable' | 'capture_unconfirmed';
interface UnboundSlot {
  readonly [SLOT]: true; readonly construction: ConstructionOrigin; readonly retention: RetentionOrigin;
  readonly origin: object; readonly role: Role; readonly state: 'unbound';
  readonly parent: UnboundSlot | undefined; readonly payload: undefined;
}
type Capture = 'not_started' | 'not_created' | 'attempting' | 'provisional' | 'confirmed';
interface CaptureCell { stage: Capture; value: UnboundSlot | undefined }
class GenerationClaim {
  #spent = false;
  constructor(readonly construction: ConstructionOrigin, readonly retention: RetentionOrigin) { Object.freeze(this); }
  get spent() { return this.#spent; }
  begin(): boolean { if (this.#spent) return false; this.#spent = true; return true; }
}
const CLOSED = Object.freeze({ model: 'wfb-pending-construction-fake-1', authority: 'none', ready: false,
  formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', nativeCost: 'unknown',
  entryRequirement: 'unknown', seedRequirement: 'unknown', investigations: 'on_hold',
  source: 'not_created', sourceBinding: 'not_connected', payloadMoves: 0, claimsConsumed: 0, sourceDetaches: 0,
  holderPublications: 0, proofIssuance: 'closed', rootFinish: 'not_called', retirement: 'not_started',
  resourceCleanup: 'not_started', actualBudget: 'not_connected' } as const);
type State = 'unused' | 'generating' | 'prepared_unbound' | 'rejected' | 'closed' | 'sealed';
type PendingSnapshot = Readonly<typeof CLOSED & { state: State; firstReason: Reason; closeRequested: boolean;
  inputValid: boolean;
  generationClaim: 'spent' | 'unused'; diagnosticSlot: 'ready'; resultSlot: 'sealed' | 'empty';
  retainedSlots: number; confirmedSlots: number; generationStarts: number;
  parentLinks: Readonly<Record<Role, 'none' | 'own_shell' | 'absent' | 'mismatch'>>;
  scopeOriginsDistinct: boolean; roleOriginsDistinct: boolean; sealedFrom?: State;
  stages: readonly Readonly<{ role: Role; stage: Capture; retained: boolean }>[] }>;
const MIX_FIELDS = ['construction', 'retention', 'origin', 'role', 'state', 'brand', 'parent', 'payload', 'copy'] as const;
const SCENARIOS = Object.freeze(['normal', 'claim_copy', 'claim_construction', 'claim_retention',
  'diagnostic_construction', 'diagnostic_retention', 'result_construction', 'result_retention',
  ...ROLES.flatMap(role => [`mint_${role}_failure`, `attempt_${role}_failure`, `capture_${role}_failure`,
    `close_after_${role}`, `reenter_after_${role}`,
  ...MIX_FIELDS.map(field => `mix_${role}_${field}`)])]);

class RetentionRoot {
  readonly #construction = Object.freeze<ConstructionOrigin>({ [CONSTRUCTION]: true });
  readonly #origin = Object.freeze<RetentionOrigin>({ [RETENTION]: true });
  readonly #claim: GenerationClaim;
  readonly #origins = Object.freeze({ pendingShell: Object.freeze({}), pendingActive: Object.freeze({}),
    failureShell: Object.freeze({}), failureCustody: Object.freeze({}) });
  readonly #cells: Record<Role, CaptureCell> = {
    pendingShell: { stage: 'not_started', value: undefined }, pendingActive: { stage: 'not_started', value: undefined },
    failureShell: { stage: 'not_started', value: undefined }, failureCustody: { stage: 'not_started', value: undefined },
  };
  readonly #diagnostic = { construction: this.#construction, retention: this.#origin,
    first: 'none' as Reason, stop: false, state: 'unused' as State };
  readonly #result = { construction: this.#construction, retention: this.#origin,
    value: undefined as PendingSnapshot | undefined };
  constructor(private readonly scenario: string, private readonly admitted: boolean) {
    this.#claim = new GenerationClaim(scenario === 'claim_construction' ? Object.freeze({ ...this.#construction }) : this.#construction,
      scenario === 'claim_retention' ? Object.freeze({ ...this.#origin }) : this.#origin);
    if (scenario === 'diagnostic_construction') this.#diagnostic.construction = Object.freeze({ ...this.#construction });
    if (scenario === 'diagnostic_retention') this.#diagnostic.retention = Object.freeze({ ...this.#origin });
    if (scenario === 'result_construction') this.#result.construction = Object.freeze({ ...this.#construction });
    if (scenario === 'result_retention') this.#result.retention = Object.freeze({ ...this.#origin });
    if (!admitted) this.reject('binding_mismatch');
  }
  private scopeMatches(): boolean {
    return this.#diagnostic.construction === this.#construction && this.#diagnostic.retention === this.#origin
      && this.#result.construction === this.#construction && this.#result.retention === this.#origin;
  }
  private reply(reason?: Exclude<Reason, 'none'> | 'already_sealed') {
    return Object.freeze(reason ? { ...CLOSED, ok: false, reason } : { ...CLOSED, ok: true });
  }
  private reject(reason: Exclude<Reason, 'none'>) {
    if (this.#diagnostic.first === 'none') this.#diagnostic.first = reason;
    this.#diagnostic.state = 'rejected'; return this.reply(this.#diagnostic.first as Exclude<Reason, 'none'>);
  }
  private parent(role: Role): UnboundSlot | undefined {
    return role === 'pendingActive' ? this.#cells.pendingShell.value
      : role === 'failureCustody' ? this.#cells.failureShell.value : undefined;
  }
  private mint(role: Role): UnboundSlot {
    if (this.scenario === `attempt_${role}_failure`) throw new Error('synthetic_attempt_unconfirmed');
    const slot: UnboundSlot = Object.freeze({ [SLOT]: true as const, construction: this.#construction, retention: this.#origin,
      origin: this.#origins[role], role, state: 'unbound' as const, parent: this.parent(role), payload: undefined });
    if (!this.scenario.startsWith(`mix_${role}_`)) return slot;
    const field = this.scenario.slice(`mix_${role}_`.length), foreign = Object.freeze({});
    const patch = field === 'construction' ? { construction: Object.freeze({ ...slot.construction }) }
      : field === 'retention' ? { retention: Object.freeze({ ...slot.retention }) }
        : field === 'origin' ? { origin: foreign } : field === 'role' ? { role: 'foreign' }
          : field === 'state' ? { state: 'bound' } : field === 'brand' ? { [SLOT]: false }
            : field === 'parent' ? { parent: slot.parent ? Object.freeze({ ...slot.parent }) : foreign }
              : field === 'payload' ? { payload: foreign } : undefined;
    // Fixed malformed issuance controls only; no caller values or actual payload are accepted.
    return patch ? Object.freeze({ ...slot, ...patch }) as unknown as UnboundSlot : slot;
  }
  private matches(role: Role, value: UnboundSlot): boolean {
    return value === this.#cells[role].value && value[SLOT] === true && value.construction === this.#construction
      && value.retention === this.#origin && value.origin === this.#origins[role] && value.role === role
      && value.state === 'unbound' && value.payload === undefined && value.parent === this.parent(role);
  }
  prepare() {
    if (this.#result.value) return this.reply('already_sealed');
    if (this.#diagnostic.first !== 'none') return this.reply(this.#diagnostic.first);
    if (this.#diagnostic.stop) return this.reply('supply_closed');
    if (!this.scopeMatches()) return this.reject('binding_mismatch');
    const claim = this.scenario === 'claim_copy' ? new GenerationClaim(this.#construction, this.#origin) : this.#claim;
    if (claim !== this.#claim || claim.construction !== this.#construction || claim.retention !== this.#origin) return this.reject('binding_mismatch');
    if (!claim.begin()) return this.reject('duplicate_generation');
    this.#diagnostic.state = 'generating';
    for (const role of ROLES) {
      const cell = this.#cells[role]; cell.stage = 'attempting';
      if (this.scenario === `mint_${role}_failure`) { cell.stage = 'not_created'; return this.reject('generation_unavailable'); }
      try { cell.value = this.mint(role); }
      catch { return this.reject('capture_unconfirmed'); }
      cell.stage = 'provisional';
      if (this.scenario === `capture_${role}_failure`) return this.reject('capture_unconfirmed');
      const candidate = this.scenario === `mix_${role}_copy` ? Object.freeze({ ...cell.value }) : cell.value;
      if (!this.matches(role, candidate)) return this.reject('binding_mismatch');
      cell.stage = 'confirmed';
      if (this.scenario === `close_after_${role}`) { this.close(); return this.reply('supply_closed'); }
      if (this.scenario === `reenter_after_${role}`) {
        this.prepare(); return this.reply(this.#diagnostic.first as Exclude<Reason, 'none'>);
      }
    }
    this.#diagnostic.state = 'prepared_unbound'; return this.reply();
  }
  close() {
    if (this.#result.value) return this.reply('already_sealed');
    this.#diagnostic.stop = true;
    if (this.#claim.spent && this.#diagnostic.first === 'none') this.#diagnostic.first = 'supply_closed';
    this.#diagnostic.state = 'closed';
    return this.reply(this.#diagnostic.first === 'none' ? 'supply_closed' : this.#diagnostic.first);
  }
  rejectArguments() { return this.#result.value ? this.reply('already_sealed') : this.reject('binding_mismatch'); }
  private snapshot(): PendingSnapshot {
    const stages = Object.freeze(ROLES.map(role => Object.freeze({ role, stage: this.#cells[role].stage, retained: !!this.#cells[role].value })));
    // Read the captured cells directly (not parent()/#origins) so generation and checking cannot agree on a wrong link.
    const c = this.#cells;
    const link = (slot: UnboundSlot | undefined, shell: UnboundSlot | undefined) =>
      !slot ? 'absent' as const : shell && slot.parent === shell ? 'own_shell' as const : 'mismatch' as const;
    const unparented = (slot: UnboundSlot | undefined) => !slot ? 'absent' as const : slot.parent === undefined ? 'none' as const : 'mismatch' as const;
    const parentLinks = Object.freeze({ pendingShell: unparented(c.pendingShell.value), pendingActive: link(c.pendingActive.value, c.pendingShell.value),
      failureShell: unparented(c.failureShell.value), failureCustody: link(c.failureCustody.value, c.failureShell.value) });
    const held = ROLES.map(role => c[role].value).filter((s): s is UnboundSlot => !!s);
    return Object.freeze({ ...CLOSED, state: this.#diagnostic.state, firstReason: this.#diagnostic.first, inputValid: this.admitted,
      closeRequested: this.#diagnostic.stop, generationClaim: this.#claim.spent ? 'spent' as const : 'unused' as const,
      diagnosticSlot: 'ready' as const, resultSlot: this.#result.value ? 'sealed' as const : 'empty' as const,
      retainedSlots: stages.filter(s => s.retained).length, confirmedSlots: stages.filter(s => s.stage === 'confirmed').length,
      generationStarts: this.#claim.spent ? 1 : 0, stages, parentLinks,
      scopeOriginsDistinct: (this.#construction as object) !== (this.#origin as object),
      roleOriginsDistinct: new Set(held.map(s => s.origin)).size === held.length
        && new Set(Object.values(this.#origins)).size === ROLES.length });
  }
  inspect() { return this.#result.value ?? this.snapshot(); }
  seal() {
    if (this.#result.value) return this.#result.value;
    if (!this.scopeMatches()) return this.reject('binding_mismatch');
    const sealedFrom = this.#diagnostic.state; this.#diagnostic.state = 'sealed';
    this.#result.value = Object.freeze({ ...this.snapshot(), resultSlot: 'sealed', sealedFrom }); return this.#result.value;
  }
}
export function createPendingConstructionFake(...args: readonly unknown[]) {
  const input = args.length === 0 ? 'normal' : args[0];
  const admitted = args.length <= 1 && typeof input === 'string' && SCENARIOS.includes(input);
  const a = new RetentionRoot(admitted ? input as string : 'normal', admitted);
  return Object.freeze({ prepare: (...xs: readonly unknown[]) => xs.length ? a.rejectArguments() : a.prepare(),
    close: () => a.close(), seal: () => a.seal(), inspect: () => a.inspect() });
}

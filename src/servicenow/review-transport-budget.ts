/** Internal prepared-only port; carries no credentials or evidence issuance authority. */
export type PreparedTransportOutcome='body'|'auth_only'|'upstream_unavailable'|'invalid_response'|'not_found_or_not_visible'|'access_denied'|'scope_evidence_limit'|'stopped';
export type PreparedAttemptSettlement=Readonly<{retryable:boolean;outcome:PreparedTransportOutcome;cleanup:'confirmed'|'unconfirmed'}>;
export type PreparedFinalSkip=Readonly<{state:'skipped';reason:'initial_unavailable'|'initial_not_completed'|'evidence_budget_exhausted';
  initial_outcome:PreparedTransportOutcome|null;released_attempts:number;synthetic:true;evidence_issuance:'disabled'}>;
export interface PreparedTransportBudget {
  now():number;
  /** Clock-only observation for bounded cleanup after logical revocation; grants no active authority. */
  observationNow():number;
  deadlineMs:number;
  requestTimeoutMs:number;
  responseBytes:number;
  authMode:'per-user'|'service-account';
  readonly authReady?:boolean;
  /** Fixture-only completion, callable after confirmed auth_only settlement. No secret argument. */
  authenticationReady?():void;
  signal:AbortSignal;
  dispatch(purpose:string,target:string|undefined,ordinal:1|2):void;
  chunk(bytes:number):void;
  /** Once per successful payload attempt: the decoded payload string, as the legacy source charges it. */
  chargePayload(payload:string):void;
  settle(result:PreparedAttemptSettlement):void;
  /** Fixture source projection may only downgrade a settled initial body, never upgrade it. */
  rejectInitialTable?(target:string):void;
  skipFinal(target:string):PreparedFinalSkip;
  enterFinal():void;
  check():void;
  stop(code:string):void;
  stats():Readonly<{requests:number;received_bytes:number;payload_bytes:number;evidence_bytes:number;reserved:number}>;
}

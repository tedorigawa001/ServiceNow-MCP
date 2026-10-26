/** Internal prepared-only port; carries no credentials or evidence issuance authority. */
export type PreparedTransportOutcome='body'|'auth_only'|'upstream_unavailable'|'invalid_response'|'not_found_or_not_visible'|'access_denied'|'scope_evidence_limit'|'stopped';
export type PreparedAttemptSettlement=Readonly<{retryable:boolean;outcome:PreparedTransportOutcome;cleanup:'confirmed'|'unconfirmed'}>;
export type PreparedFinalSkip=Readonly<{state:'skipped';reason:'initial_unavailable'|'initial_not_completed'|'evidence_budget_exhausted';
  initial_outcome:PreparedTransportOutcome|null;released_attempts:number;synthetic:true;evidence_issuance:'disabled'}>;
export interface PreparedTransportBudget {
  now():number;
  deadlineMs:number;
  requestTimeoutMs:number;
  authMode:'per-user'|'service-account';
  signal:AbortSignal;
  dispatch(purpose:string,target:string|undefined,ordinal:1|2):void;
  chunk(bytes:number):void;
  settle(result:PreparedAttemptSettlement):void;
  skipFinal(target:string):PreparedFinalSkip;
  enterFinal():void;
  check():void;
  stop(code:string):void;
  stats():Readonly<{requests:number;received_bytes:number;payload_bytes:number;evidence_bytes:number;reserved:number}>;
}

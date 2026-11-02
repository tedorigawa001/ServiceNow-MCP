/** Development-only predicates, not parsers, evidence, claims or result validation.
 * Callers retain bounded copying/schema checks and unique rule-list validation.
 */
export const sameFinishRuleSet=(a:readonly string[],b:readonly string[]):boolean=>
  a.length===b.length&&a.every(x=>b.includes(x));
/** Serialize the already schema-checked release at the caller, in its original order. */
export const sameFinishReleaseEncoding=(a:string|undefined,b:string|undefined):boolean=>a===b;
/** Validated finite UTC epochs and bounded effective deadline only; no clock access. */
export const finishEndOutsideBounds=(end:number,upper:number,start:number,deadline:number):boolean=>
  end<upper||end>start+deadline;

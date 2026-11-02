/** Legacy API retained; the shared kernel constructs a fresh legacy root per call. */
import {createSyntheticRecoveryKernel,type SyntheticRecoverySeed,type SyntheticSoftFacts} from './synthetic-recovery-kernel.js';
export type {SyntheticRecoverySeed,SyntheticSoftFacts} from './synthetic-recovery-kernel.js';
export function createSyntheticSoftRecoveryIssuer(seed:SyntheticRecoverySeed,expected:SyntheticSoftFacts,check:()=>string|undefined=()=>undefined){
  return createSyntheticRecoveryKernel(seed,expected,check);
}

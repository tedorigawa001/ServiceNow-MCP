// Source execution only. Compiled production code never selects this entry.
import { register } from 'tsx/esm/api';
register({ tsconfig: false });
await import('./review-worker.ts');

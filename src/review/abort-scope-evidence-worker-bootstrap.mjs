// Development source entry only. Compiled execution selects the fixed .js worker.
import { register } from 'tsx/esm/api';
register({ tsconfig: false });
await import('./abort-scope-evidence-worker-entry.ts');

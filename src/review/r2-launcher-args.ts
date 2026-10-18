/** Fixed repository entry grammar only. No filesystem, environment discovery or execution authority. */
import { isAbsolute, normalize } from 'node:path';
export const R2_LAUNCHER_USAGE = 'Usage: r2-launcher [check-plan|run] <absolute-manifest-path>\nDefault: offline check-plan. run requires explicit cooked-TTY approval.\n';
export function parseR2LauncherArguments(args: readonly string[]): { mode: 'check-plan' | 'run'; path: string } | undefined {
  if (process.platform === 'win32' || !Array.isArray(args)) return undefined;
  const mode = args.length === 1 ? 'check-plan' : args.length === 2 && ['check-plan', 'run'].includes(args[0]) ? args[0] : undefined;
  const path = args.length === 1 ? args[0] : args[1];
  if (!mode || typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || path.length > 4096 || path.includes('\0')) return undefined;
  return { mode: mode as 'check-plan' | 'run', path };
}

/** Repository-only compiled entry. No public CLI/bin registration, run mode, token or output-file inputs. */
import { installR2LauncherFatalGuards } from './r2-launcher-bootstrap.js';
const guard = installR2LauncherFatalGuards();
// Defense in depth only. A trusted outer launcher must remove injection options BEFORE Node starts.
// CoreFoundation can add this native encoding key even when the parent supplies env: {}.
const unexpectedEnv = Object.keys(process.env).some(key => !(process.platform === 'darwin'
  && key === '__CF_USER_TEXT_ENCODING' && /^0x[0-9a-f]+:0x[0-9a-f]+:0x[0-9a-f]+$/i.test(process.env[key] ?? '')));
if (!import.meta.url.endsWith('.js') || process.platform === 'win32' || process.execArgv.length
  || unexpectedEnv || process.send) process.exit(64);
try {
  const { runR2CheckPlanEntry } = await import('./r2-launcher-check-plan.js');
  const { selectR2EntryExitCode } = await import('./r2-entry-terminal.js');
  const selected = selectR2EntryExitCode(await runR2CheckPlanEntry(process.argv.slice(2), {
    onTerminationUnconfirmed: () => guard.remember(73),
  }));
  guard.remember(selected);
  const code = guard.priority() ?? selected;
  process.exitCode = code;
  // A failed native sink may never settle. Do not leave this dedicated offline entry resident.
  if (code !== 0) process.exit(code);
} catch { guard.fatal(); }

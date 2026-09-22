import { randomBytes } from 'node:crypto';
import type { ServiceNowClient } from '../servicenow/client.js';

/**
 * ServiceNow has no REST endpoint that runs a server script synchronously
 * (sys.scripts.do is a UI page behind a session and CSRF token). The
 * supported way to get server-side script executed through the Table API is
 * a run-once sysauto_script: the scheduler picks it up within seconds when a
 * worker is free, and it can report back through syslog, which is readable.
 *
 * Used by run_security_playbook, scan_vulnerabilities and
 * execute_background_script.
 */

/** A token safe to interpolate into a script literal and an encoded query. */
export function newJobToken(prefix: string): string {
  return `${prefix}-${randomBytes(16).toString('hex')}`;
}

/** UTC "YYYY-MM-DD HH:mm:ss", 60 s in the past so the trigger is due at once. */
export function immediateRunStart(): string {
  return new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' ');
}

export interface ScheduledScriptJob {
  sys_id: string;
  name: string;
  run_start_utc: string;
}

/** Create the run-once job. sysauto_script has no free-text column besides `script`. */
export async function scheduleScriptJob(client: ServiceNowClient, name: string, script: string): Promise<ScheduledScriptJob> {
  const run_start_utc = immediateRunStart();
  const job = await client.createRecord('sysauto_script', {
    name,
    active: true,
    run_type: 'once',
    run_start: run_start_utc,
    script,
  }) as Record<string, unknown>;
  return { sys_id: String(job.sys_id), name, run_start_utc };
}

/**
 * Poll syslog for `<token> RESULT:<json>` written by the job, for up to
 * waitSeconds. Resolves to the parsed object, or undefined when the scheduler
 * has not run the job in time (the caller then reports the job as scheduled).
 */
export async function awaitScriptJobResult(client: ServiceNowClient, token: string, waitSeconds: number): Promise<Record<string, unknown> | undefined> {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    const logs = await client.queryRecords({ table: 'syslog', query: `messageSTARTSWITH${token} RESULT:`, fields: 'message', limit: 1 });
    const message = String((logs.records[0] as { message?: string } | undefined)?.message ?? '');
    if (message) {
      try {
        return JSON.parse(message.slice(message.indexOf('RESULT:') + 'RESULT:'.length)) as Record<string, unknown>;
      } catch {
        return { error: `Unparseable job output: ${message}` };
      }
    }
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, Math.min(3000, Math.max(250, deadline - Date.now()))));
  }
}

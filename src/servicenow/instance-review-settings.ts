import { readBoundedConfigJson, readTrustedConfigJson } from './trusted-config-file.js';

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue | undefined => v && typeof v === 'object' && !Array.isArray(v) ? v as RecordValue : undefined;
export interface InstanceDocument { document: RecordValue; reviewConfig: (name: string) => unknown }

/** Preserve legacy connection discovery, but never confer BP-5 trust from that unverified read. */
export function loadInstanceDocument(path: string): InstanceDocument {
  const initial = readBoundedConfigJson(path);
  if (!record(initial)) throw Error('config_invalid');
  let verified: RecordValue | null | undefined;
  return { document: initial as RecordValue, reviewConfig(name) {
    if (verified === undefined) {
      try {
        const trusted = readTrustedConfigJson(path);
        if (JSON.stringify(initial) !== JSON.stringify(trusted)) throw Error('config_invalid');
        verified = trusted as RecordValue;
      } catch { verified = null; }
    }
    return extractReviewSettings(verified, name);
  } };
}

/** null is deliberate poison: bounded admission returns config_invalid, never observed-only fallback. */
function extractReviewSettings(verified: RecordValue | null, name: string): unknown {
  if (!verified) return null;
  const entry = record(record(verified.instances)?.[name]);
  if (!entry) return null;
  const keys = ['review_release_config', 'reviewReleaseConfig'].filter(key => Object.hasOwn(entry, key));
  if (!keys.length) return { instance_id: name };
  if (keys.length !== 1) return null;
  const settings = record(entry[keys[0]]);
  if (!settings || settings.instance_id !== name) return null;
  return settings;
}

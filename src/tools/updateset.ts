/**
 * Update Set management tools — full lifecycle for ServiceNow Update Sets.
 *
 * Goes beyond the basic changeset tools in script.ts to provide:
 * - Create / switch / preview / complete / export
 * - Auto-creation guard (ensure active update set exists)
 * - Batch artifact registration
 *
 * Tier 0 (Read):  get_current_update_set, list_update_sets, preview_update_set
 * Tier 3 (Script): create_update_set, switch_update_set, complete_update_set,
 *                   export_update_set, retrieve_remote_update_set
 *
 * ServiceNow tables: sys_update_set, sys_update_xml, sys_remote_update_set
 */
import { createHash } from 'node:crypto';
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting } from '../utils/permissions.js';

const SYS_ID_PATTERN = /^[0-9a-f]{32}$/i;
const MAX_SCA_RECORDS = 100;
const MAX_SCA_PAYLOAD_BYTES = 512 * 1024;
const MAX_OSV_LOOKUPS = 50;
const MAX_OSV_FINDINGS_PER_COMPONENT = 50;
const OSV_TIMEOUT_MS = 5_000;
const OSV_CACHE_TTL_MS = 60 * 60 * 1000;
const OSV_API_URL = 'https://api.osv.dev/v1/query';
const MAX_OSV_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Update XML types whose payload can contain executable or dependency-bearing text. */
const SCA_ASSET_TYPES: Record<string, { asset_type: string; text_fields: readonly string[] }> = {
  'Business Rule': { asset_type: 'business_rule', text_fields: ['script', 'condition', 'filter_condition'] },
  'Script Include': { asset_type: 'script_include', text_fields: ['script'] },
  'Client Script': { asset_type: 'client_script', text_fields: ['script'] },
  'UI Script': { asset_type: 'ui_script', text_fields: ['script'] },
  'UI Action': { asset_type: 'ui_action', text_fields: ['script'] },
  'Script Action': { asset_type: 'script_action', text_fields: ['script'] },
  'Scheduled Script Execution': { asset_type: 'scheduled_script_execution', text_fields: ['script'] },
  'Scripted REST Resource': { asset_type: 'scripted_rest_resource', text_fields: ['script'] },
  'Service Portal Widget': { asset_type: 'service_portal_widget', text_fields: ['script', 'client_script', 'server_script'] },
};

type DetectedComponent = {
  name: string;
  version: string;
  ecosystem: 'npm';
  confidence: 'high' | 'medium';
  dependency_type: 'direct' | 'transitive' | 'unknown';
  evidence: {
    update_xml_sys_id: string;
    asset_type: string;
    asset_name: string;
    payload_sha256: string;
    extractor: 'package_manifest' | 'package_lockfile' | 'versioned_cdn_url' | 'versioned_module_specifier';
    match_sha256: string;
  };
};

type NormalizedComponent = Omit<DetectedComponent, 'evidence' | 'dependency_type'> & {
  purl: string;
  dependency_types: Array<DetectedComponent['dependency_type']>;
  evidence: DetectedComponent['evidence'][];
};

type UnresolvedReference = {
  name: string;
  ecosystem: 'npm';
  reason: 'version_range_or_alias' | 'unversioned_cdn_reference' | 'unversioned_module_specifier';
  confidence: 'medium';
  evidence: DetectedComponent['evidence'][];
};

type DetectedReferences = {
  components: DetectedComponent[];
  unresolved: Array<Omit<UnresolvedReference, 'evidence'> & { evidence: DetectedComponent['evidence'] }>;
};

type ScaFinding = {
  component: string;
  installed_version: string;
  purl: string;
  advisory_id: string;
  aliases: string[];
  summary: string;
  severity: string;
  cvss: string[];
  fixed_versions: string[];
  source: 'OSV';
};

type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

type OsvLookupResult = { findings: ScaFinding[]; truncated: boolean };

const osvCache = new Map<string, { expiresAt: number; result: OsvLookupResult }>();

function fieldValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'value' in value && (value as { value?: unknown }).value !== undefined) {
    return String((value as { value: unknown }).value ?? '');
  }
  return String(value);
}

/**
 * Extract one known XML element without parsing XML or resolving entities.
 * Field names are allowlisted constants, so they cannot influence the pattern.
 */
function extractUpdateXmlText(payload: string, field: string): string | undefined {
  const match = payload.match(new RegExp(`<${field}(?:\\s[^>]*)?>([\\s\\S]*?)</${field}>`, 'i'));
  if (!match) return undefined;
  const value = match[1].trim();
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/i);
  return cdata ? cdata[1] : value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validateScaRecordLimit(value: unknown): number {
  if (value === undefined) return 50;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_SCA_RECORDS) {
    throw new ServiceNowError(`max_records must be an integer between 1 and ${MAX_SCA_RECORDS}`, 'VALIDATION_ERROR');
  }
  return value as number;
}

function isSafePackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value);
}

function isSafeVersion(value: string): boolean {
  // Exact versions only. Ranges and aliases must never be presented as installed versions.
  return /^v?\d+(?:\.\d+){1,3}(?:[-+][0-9a-z.-]+)?$/i.test(value);
}

/**
 * Detect only components that carry an explicit, exact version. The returned evidence is
 * metadata plus a hash of the matched token, never source code or an arbitrary source snippet.
 */
function detectComponents(
  text: string,
  context: Omit<DetectedComponent['evidence'], 'extractor' | 'match_sha256'>,
): DetectedReferences {
  const components: DetectedComponent[] = [];
  const unresolved: DetectedReferences['unresolved'] = [];
  const add = (
    name: string,
    version: string,
    extractor: DetectedComponent['evidence']['extractor'],
    confidence: DetectedComponent['confidence'],
    dependencyType: DetectedComponent['dependency_type'],
    matchedToken: string,
  ) => {
    if (!isSafePackageName(name) || !isSafeVersion(version)) return;
    components.push({
      name,
      version: version.replace(/^v/i, ''),
      ecosystem: 'npm',
      confidence,
      dependency_type: dependencyType,
      evidence: { ...context, extractor, match_sha256: sha256(matchedToken) },
    });
  };
  const addUnresolved = (
    name: string,
    reason: UnresolvedReference['reason'],
    extractor: DetectedComponent['evidence']['extractor'],
    matchedToken: string,
  ) => {
    if (!isSafePackageName(name)) return;
    unresolved.push({
      name: name.toLowerCase(),
      ecosystem: 'npm',
      reason,
      confidence: 'medium',
      evidence: { ...context, extractor, match_sha256: sha256(matchedToken) },
    });
  };

  // package.json and package-lock.json-like data may be embedded in a script field.
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const packages = parsed.packages;
    if (typeof parsed.lockfileVersion === 'number' && packages && typeof packages === 'object' && !Array.isArray(packages)) {
      for (const [path, entry] of Object.entries(packages as Record<string, unknown>)) {
        const name = path.replace(/^node_modules\//, '');
        const version = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).version : undefined;
        if (path.startsWith('node_modules/') && typeof version === 'string') {
          add(name, version, 'package_lockfile', 'high', 'transitive', `${name}@${version}`);
        }
      }
    }
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const dependencies = parsed[field];
      if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
      for (const [name, version] of Object.entries(dependencies as Record<string, unknown>)) {
        if (typeof version === 'string') {
          if (isSafeVersion(version)) {
            add(name, version, 'package_manifest', 'high', 'direct', `${name}@${version}`);
          } else {
            addUnresolved(name, 'version_range_or_alias', 'package_manifest', `${name}@${version}`);
          }
        } else if (version && typeof version === 'object' && typeof (version as Record<string, unknown>).version === 'string') {
          // npm lockfile v1 stores package entries in a nested dependencies object.
          const exactVersion = (version as Record<string, unknown>).version as string;
          add(name, exactVersion, 'package_lockfile', 'high', 'transitive', `${name}@${exactVersion}`);
        }
      }
    }
  } catch {
    // Most script assets are not JSON manifests; continue with explicit source references.
  }

  // jsDelivr and unpkg provide an npm package name and version in their stable URL forms.
  const npmCdnPattern = /https?:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@([0-9][0-9a-z.+-]*)\b/gi;
  for (const match of text.matchAll(npmCdnPattern)) add(match[1], match[2], 'versioned_cdn_url', 'high', 'unknown', match[0]);

  // Alias and unversioned CDN paths are evidence of a library reference, but not an installed version.
  const unversionedNpmCdnPattern = /https?:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?!@[0-9])(?:@(latest|next|beta|canary|dev))?(?=\/|\b)/gi;
  for (const match of text.matchAll(unversionedNpmCdnPattern)) {
    addUnresolved(match[1], 'unversioned_cdn_reference', 'versioned_cdn_url', match[0]);
  }

  // cdnjs uses a different, but likewise versioned, path layout.
  const cdnjsPattern = /https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([a-z0-9][a-z0-9._-]*)\/([0-9][0-9a-z.+-]*)\b/gi;
  for (const match of text.matchAll(cdnjsPattern)) add(match[1], match[2], 'versioned_cdn_url', 'high', 'unknown', match[0]);

  // A module specifier with `package@exact-version` is explicit enough to report, unlike bare require('package').
  const specifierPattern = /(?:require\s*\(\s*|from\s*|import\s*\(\s*)['"]((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@([0-9][0-9a-z.+-]*)['"]/gi;
  for (const match of text.matchAll(specifierPattern)) add(match[1], match[2], 'versioned_module_specifier', 'medium', 'unknown', match[0]);

  const bareSpecifierPattern = /(?:require\s*\(\s*|from\s*|import\s*\(\s*)['"]((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)['"]/gi;
  for (const match of text.matchAll(bareSpecifierPattern)) addUnresolved(match[1], 'unversioned_module_specifier', 'versioned_module_specifier', match[0]);

  return { components, unresolved };
}

function toNpmPurl(name: string, version: string): string {
  return `pkg:npm/${encodeURIComponent(name).replace(/%2F/gi, '/')}@${encodeURIComponent(version)}`;
}

/** Merge same package/version candidates without losing independent source evidence. */
function normalizeComponents(candidates: DetectedComponent[]): NormalizedComponent[] {
  const grouped = new Map<string, NormalizedComponent>();
  for (const candidate of candidates) {
    const normalizedName = candidate.name.toLowerCase();
    const key = `${candidate.ecosystem}\0${normalizedName}\0${candidate.version}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        name: normalizedName,
        version: candidate.version,
        ecosystem: candidate.ecosystem,
        purl: toNpmPurl(normalizedName, candidate.version),
        confidence: candidate.confidence,
        dependency_types: [candidate.dependency_type],
        evidence: [candidate.evidence],
      });
      continue;
    }
    if (candidate.confidence === 'high') existing.confidence = 'high';
    if (!existing.dependency_types.includes(candidate.dependency_type)) {
      existing.dependency_types.push(candidate.dependency_type);
    }
    const evidenceKey = JSON.stringify(candidate.evidence);
    if (!existing.evidence.some(evidence => JSON.stringify(evidence) === evidenceKey)) {
      existing.evidence.push(candidate.evidence);
    }
  }
  return [...grouped.values()].sort((a, b) =>
    a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
  );
}

function normalizeUnresolvedReferences(candidates: DetectedReferences['unresolved']): UnresolvedReference[] {
  const grouped = new Map<string, UnresolvedReference>();
  for (const candidate of candidates) {
    const key = `${candidate.ecosystem}\0${candidate.name}\0${candidate.reason}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...candidate, evidence: [candidate.evidence] });
      continue;
    }
    const evidenceKey = JSON.stringify(candidate.evidence);
    if (!existing.evidence.some(evidence => JSON.stringify(evidence) === evidenceKey)) {
      existing.evidence.push(candidate.evidence);
    }
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name) || a.reason.localeCompare(b.reason));
}

function boundedText(value: unknown, maximumLength: number): string {
  return typeof value === 'string' ? value.slice(0, maximumLength) : '';
}

function normalizeSeverity(value: string): FindingSeverity {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium' || normalized === 'moderate') return 'medium';
  if (normalized === 'low') return 'low';
  return 'unknown';
}

function extractOsvFindings(component: NormalizedComponent, response: unknown): OsvLookupResult {
  const rawVulnerabilities = (response && typeof response === 'object' && Array.isArray((response as Record<string, unknown>).vulns))
    ? (response as { vulns: unknown[] }).vulns
    : [];
  const vulnerabilities = rawVulnerabilities.slice(0, MAX_OSV_FINDINGS_PER_COMPONENT);
  const findings: ScaFinding[] = [];
  for (const vulnerability of vulnerabilities) {
    if (!vulnerability || typeof vulnerability !== 'object') continue;
    const record = vulnerability as Record<string, unknown>;
    const fixedVersions = new Set<string>();
    const affected = Array.isArray(record.affected) ? record.affected : [];
    for (const entry of affected) {
      if (!entry || typeof entry !== 'object') continue;
      const ranges = Array.isArray((entry as Record<string, unknown>).ranges) ? (entry as Record<string, unknown>).ranges as unknown[] : [];
      for (const range of ranges) {
        if (!range || typeof range !== 'object') continue;
        const events = Array.isArray((range as Record<string, unknown>).events) ? (range as Record<string, unknown>).events as unknown[] : [];
        for (const event of events) {
          const fixed = event && typeof event === 'object' ? (event as Record<string, unknown>).fixed : undefined;
          if (typeof fixed === 'string' && isSafeVersion(fixed)) fixedVersions.add(fixed.replace(/^v/i, ''));
        }
      }
    }
    const severityValues = Array.isArray(record.severity) ? record.severity : [];
    const cvss = severityValues
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(item => boundedText(item.score, 512))
      .filter(Boolean)
      .slice(0, 5);
    const databaseSpecific = record.database_specific && typeof record.database_specific === 'object'
      ? record.database_specific as Record<string, unknown> : {};
    const severity = normalizeSeverity(boundedText(databaseSpecific.severity, 32));
    const aliases = Array.isArray(record.aliases)
      ? record.aliases.filter((alias): alias is string => typeof alias === 'string').slice(0, 20) : [];
    const advisoryId = boundedText(record.id, 128);
    if (!advisoryId) continue;
    findings.push({
      component: component.name,
      installed_version: component.version,
      purl: component.purl,
      advisory_id: advisoryId,
      aliases,
      summary: boundedText(record.summary, 500),
      severity,
      cvss,
      fixed_versions: [...fixedVersions].sort(),
      source: 'OSV',
    });
  }
  const hasNextPage = Boolean(response && typeof response === 'object' && (response as Record<string, unknown>).next_page_token);
  return { findings, truncated: rawVulnerabilities.length > MAX_OSV_FINDINGS_PER_COMPONENT || hasNextPage };
}

async function lookupOsv(component: NormalizedComponent): Promise<{ result: OsvLookupResult; cached: boolean }> {
  const cached = osvCache.get(component.purl);
  if (cached && cached.expiresAt > Date.now()) return { result: cached.result, cached: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSV_TIMEOUT_MS);
  try {
    const response = await fetch(OSV_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ package: { name: component.name, ecosystem: 'npm' }, version: component.version }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OSV returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > MAX_OSV_RESPONSE_BYTES) throw new Error('OSV response exceeds size limit');
    const result = extractOsvFindings(component, JSON.parse(await readBoundedResponse(response)));
    if (osvCache.size >= 500) osvCache.delete(osvCache.keys().next().value as string);
    osvCache.set(component.purl, { expiresAt: Date.now() + OSV_CACHE_TTL_MS, result });
    return { result, cached: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_OSV_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('OSV response exceeds size limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function buildScaSummary(
  components: NormalizedComponent[],
  unresolvedReferences: UnresolvedReference[],
  findings: ScaFinding[],
  lookup: { status: string; queriedComponents: number; skippedComponents: number; errors: number; truncated: boolean },
): Record<string, unknown> {
  const findingsBySeverity: Record<FindingSeverity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, unknown: 0,
  };
  const affectedComponents = new Set<string>();
  for (const finding of findings) {
    findingsBySeverity[normalizeSeverity(finding.severity)]++;
    affectedComponents.add(finding.purl);
  }
  return {
    findings_by_severity: findingsBySeverity,
    total_findings: findings.length,
    affected_components: affectedComponents.size,
    coverage: {
      exact_version_components: components.length,
      unresolved_references: unresolvedReferences.length,
      queried_components: lookup.queriedComponents,
      unqueried_components: lookup.skippedComponents,
      lookup_errors: lookup.errors,
      lookup_truncated: lookup.truncated,
    },
    assessment: lookup.status === 'completed' && lookup.skippedComponents === 0 && !lookup.truncated
      ? 'completed_with_bounded_coverage'
      : 'incomplete_coverage',
    safety_note: 'No findings does not prove the Update Set or its dependencies are free of vulnerabilities.',
    integrity_verification: 'not_performed_for_external_artifacts',
  };
}

export function getUpdateSetToolDefinitions() {
  return [
    {
      name: 'get_current_update_set',
      description: 'Get the currently active Update Set for the session',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_update_sets',
      description: 'List Update Sets by state (in progress, complete, ignore)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'State filter: "in progress", "complete", "ignore"' },
          query: { type: 'string', description: 'Additional encoded query filter' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'create_update_set',
      description: 'Create a new Update Set and optionally switch to it. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Update Set name' },
          description: { type: 'string', description: 'Purpose or description' },
          release: { type: 'string', description: 'Target release label' },
          switch_to: { type: 'boolean', description: 'Switch to this Update Set after creation (default true)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'switch_update_set',
      description: 'Switch the active Update Set context to a specified Update Set. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id of the target Update Set' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'complete_update_set',
      description: 'Mark an Update Set as complete (ready for migration). **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'preview_update_set',
      description: 'Preview all changes contained in an Update Set',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
          limit: { type: 'number', description: 'Max records to list (default 100)' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'scan_update_set_sca',
      description: 'Read-only SCA scan for an Update Set. Inventories script-bearing changes and returns normalized, exact-version component metadata with hashed evidence only; source code is never returned.',
      inputSchema: {
        type: 'object',
        properties: {
          update_set: { type: 'string', description: 'Update Set sys_id (32 hexadecimal characters) or an exact Update Set name' },
          max_records: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum update XML records to inspect (1-100; default 50). The result says when it is truncated.' },
          lookup_vulnerabilities: { type: 'boolean', description: 'Query OSV for each exact-version npm component (default true). Set false to perform local collection only.' },
        },
        required: ['update_set'],
        additionalProperties: false,
      },
    },
    {
      name: 'export_update_set',
      description: 'Get the XML export payload for an Update Set (as used in migration). **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Update Set sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'ensure_active_update_set',
      description: 'Ensure an active Update Set exists; create one automatically if none is in progress. **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          default_name: { type: 'string', description: 'Name to use when auto-creating (default: "AI Session Update Set")' },
        },
        required: [],
      },
    },
  ];
}

export async function executeUpdateSetToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'get_current_update_set': {
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: 'state=in progress',
        limit: 5,
        fields: 'sys_id,name,description,state,is_default,release,sys_updated_on,sys_updated_by',
      });
      return { count: resp.count, active_update_sets: resp.records };
    }

    case 'list_update_sets': {
      let query = '';
      if (args.state) query = `state=${args.state}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,name,state,description,release,sys_updated_on,sys_updated_by',
      });
      return { count: resp.count, update_sets: resp.records };
    }

    case 'create_update_set': {
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      requireScripting();
      const payload: Record<string, any> = { name: args.name, state: 'in progress' };
      if (args.description) payload.description = args.description;
      if (args.release) payload.release = args.release;
      const result = await client.createRecord('sys_update_set', payload);
      const newId = String((result as any).sys_id || (result as any).result?.sys_id || '');
      if (newId && args.switch_to !== false) {
        await client.updateRecord('sys_update_set', newId, { is_default: true });
        return { action: 'created_and_switched', name: args.name, sys_id: newId, ...result };
      }
      return { action: 'created', name: args.name, sys_id: newId, ...result };
    }

    case 'switch_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      requireScripting();
      const result = await client.updateRecord('sys_update_set', args.sys_id, { is_default: true });
      return { action: 'switched', sys_id: args.sys_id, ...result };
    }

    case 'complete_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      requireScripting();
      const result = await client.updateRecord('sys_update_set', args.sys_id, { state: 'complete' });
      return { action: 'completed', sys_id: args.sys_id, ...result };
    }

    case 'preview_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // List all update XML records for this update set
      const resp = await client.queryRecords({
        table: 'sys_update_xml',
        query: `update_set=${args.sys_id}`,
        limit: args.limit || 100,
        fields: 'sys_id,name,type,action,payload,sys_updated_on',
      });
      const updateSet = await client.getRecord('sys_update_set', args.sys_id);
      return {
        update_set: updateSet,
        change_count: resp.count,
        changes: resp.records.map((r: any) => ({
          sys_id: r.sys_id,
          name: r.name,
          type: r.type,
          action: r.action,
          updated: r.sys_updated_on,
        })),
      };
    }

    case 'scan_update_set_sca': {
      const updateSetInput = typeof args.update_set === 'string' ? args.update_set.trim() : '';
      if (!updateSetInput) throw new ServiceNowError('update_set is required', 'INVALID_REQUEST');
      if (updateSetInput.length > 250 || /[\^\0]/.test(updateSetInput)) {
        throw new ServiceNowError('update_set must be a sys_id or an exact name without encoded-query operators', 'VALIDATION_ERROR');
      }
      const maxRecords = validateScaRecordLimit(args.max_records);
      const lookupVulnerabilities = args.lookup_vulnerabilities !== false;

      let updateSet: Record<string, any>;
      if (SYS_ID_PATTERN.test(updateSetInput)) {
        updateSet = await client.getRecord('sys_update_set', updateSetInput) as Record<string, any>;
      } else {
        // Equality plus a post-query exact comparison prevents a name lookup from becoming a fuzzy match.
        const resolved = await client.queryRecords({
          table: 'sys_update_set',
          query: `name=${updateSetInput}`,
          limit: 3,
          fields: 'sys_id,name,state,application,sys_updated_on',
        });
        const exactMatches = (resolved.records as Record<string, any>[])
          .filter(record => fieldValue(record.name) === updateSetInput);
        if (exactMatches.length === 0) {
          throw new ServiceNowError(`No Update Set named "${updateSetInput}" was found`, 'NOT_FOUND');
        }
        if (exactMatches.length > 1) {
          throw new ServiceNowError(`Update Set name "${updateSetInput}" is ambiguous; use sys_id instead`, 'INVALID_REQUEST');
        }
        updateSet = exactMatches[0];
      }

      const updateSetId = fieldValue(updateSet.sys_id);
      if (!SYS_ID_PATTERN.test(updateSetId)) {
        throw new ServiceNowError('Resolved Update Set does not have a valid sys_id', 'VALIDATION_ERROR');
      }

      // Fetch one extra metadata row so bounded scans explicitly report truncation.
      const metadata: Record<string, any>[] = [];
      let offset = 0;
      const pageSize = Math.min(50, maxRecords + 1);
      while (metadata.length < maxRecords + 1) {
        const remaining = maxRecords + 1 - metadata.length;
        const batch = await client.queryRecords({
          table: 'sys_update_xml',
          query: `update_set=${updateSetId}`,
          limit: Math.min(pageSize, remaining),
          offset,
          fields: 'sys_id,name,type,action,sys_updated_on',
        });
        const records = batch.records as Record<string, any>[];
        metadata.push(...records);
        if (records.length < Math.min(pageSize, remaining)) break;
        offset += records.length;
      }
      const truncated = metadata.length > maxRecords;
      const recordsToInspect = metadata.slice(0, maxRecords);
      const byUpdateXmlType: Record<string, number> = {};
      const skipped: Record<string, number> = {
        non_sca_asset_type: 0,
        deleted_change: 0,
        payload_too_large: 0,
        no_extractable_text: 0,
        payload_unavailable: 0,
      };
      const assets: Array<Record<string, unknown>> = [];
      const components: DetectedComponent[] = [];
      const unresolvedReferences: DetectedReferences['unresolved'] = [];

      for (const record of recordsToInspect) {
        const type = fieldValue(record.type) || '(unknown)';
        byUpdateXmlType[type] = (byUpdateXmlType[type] || 0) + 1;
        const action = fieldValue(record.action).toUpperCase();
        const assetDefinition = SCA_ASSET_TYPES[type];
        if (action === 'DELETE') {
          skipped.deleted_change++;
          continue;
        }
        if (!assetDefinition) {
          skipped.non_sca_asset_type++;
          continue;
        }

        const xmlId = fieldValue(record.sys_id);
        try {
          const detail = await client.getRecord('sys_update_xml', xmlId) as Record<string, any>;
          const payload = fieldValue(detail.payload);
          const payloadBytes = Buffer.byteLength(payload, 'utf8');
          if (payloadBytes > MAX_SCA_PAYLOAD_BYTES) {
            skipped.payload_too_large++;
            continue;
          }
          const extracted = assetDefinition.text_fields
            .map(field => ({ field, text: extractUpdateXmlText(payload, field) }))
            .filter((entry): entry is { field: string; text: string } => entry.text !== undefined);
          if (extracted.length === 0) {
            skipped.no_extractable_text++;
            continue;
          }
          const extractedText = extracted.map(entry => `${entry.field}\0${entry.text}`).join('\0');
          const payloadHash = sha256(payload);
          const assetName = fieldValue(record.name);
          for (const entry of extracted) {
            const detected = detectComponents(entry.text, {
              update_xml_sys_id: xmlId,
              asset_type: assetDefinition.asset_type,
              asset_name: assetName,
              payload_sha256: payloadHash,
            });
            components.push(...detected.components);
            unresolvedReferences.push(...detected.unresolved);
          }
          assets.push({
            update_xml_sys_id: xmlId,
            name: assetName,
            type: fieldValue(record.type),
            action: fieldValue(record.action),
            updated: fieldValue(record.sys_updated_on),
            asset_type: assetDefinition.asset_type,
            payload: { bytes: payloadBytes, sha256: payloadHash },
            extracted_text: {
              fields: extracted.map(entry => entry.field),
              bytes: Buffer.byteLength(extractedText, 'utf8'),
              sha256: sha256(extractedText),
            },
          });
        } catch {
          // Continue the bounded scan, but make ACL or malformed-record gaps visible to callers.
          skipped.payload_unavailable++;
        }
      }

      const normalizedComponents = normalizeComponents(components);
      const normalizedUnresolvedReferences = normalizeUnresolvedReferences(unresolvedReferences);
      const findings: ScaFinding[] = [];
      const lookupErrors: Array<{ purl: string; code: 'OSV_REQUEST_FAILED' }> = [];
      let cacheHits = 0;
      let lookupTruncated = false;
      const componentsToLookup = lookupVulnerabilities ? normalizedComponents.slice(0, MAX_OSV_LOOKUPS) : [];
      for (const component of componentsToLookup) {
        try {
          const lookup = await lookupOsv(component);
          findings.push(...lookup.result.findings);
          cacheHits += lookup.cached ? 1 : 0;
          lookupTruncated ||= lookup.result.truncated;
        } catch {
          // An unavailable advisory source is an incomplete scan, never evidence of no vulnerabilities.
          lookupErrors.push({ purl: component.purl, code: 'OSV_REQUEST_FAILED' });
        }
      }
      const lookupStatus = !lookupVulnerabilities ? 'disabled'
        : lookupErrors.length > 0 ? 'partial_failure'
          : 'completed';
      const lookup = {
        source: 'OSV' as const,
        status: lookupStatus,
        queried_components: componentsToLookup.length,
        skipped_components: lookupVulnerabilities ? normalizedComponents.length - componentsToLookup.length : normalizedComponents.length,
        cache_hits: cacheHits,
        truncated: lookupTruncated,
        errors: lookupErrors,
      };
      return {
        schema_version: '1.0',
        scan_status: 'collection_complete',
        update_set: {
          sys_id: updateSetId,
          name: fieldValue(updateSet.name),
          state: fieldValue(updateSet.state),
          application: fieldValue(updateSet.application),
          updated: fieldValue(updateSet.sys_updated_on),
        },
        scope: {
          max_records: maxRecords,
          metadata_records: recordsToInspect.length,
          by_update_xml_type: byUpdateXmlType,
          eligible_records: recordsToInspect.length - skipped.non_sca_asset_type - skipped.deleted_change,
          collected_assets: assets.length,
          detected_component_evidence: components.length,
          normalized_components: normalizedComponents.length,
          unresolved_references: normalizedUnresolvedReferences.length,
          skipped,
          truncated,
        },
        assets,
        components: normalizedComponents,
        unresolved_references: normalizedUnresolvedReferences,
        findings,
        summary: buildScaSummary(normalizedComponents, normalizedUnresolvedReferences, findings, {
          status: lookup.status,
          queriedComponents: lookup.queried_components,
          skippedComponents: lookup.skipped_components,
          errors: lookup.errors.length,
          truncated: lookup.truncated,
        }),
        lookup,
        errors: lookupErrors,
        limitations: [
          'Only exact versions found in supported package manifests, versioned CDN URLs, or versioned module specifiers are reported. Bare package names and version ranges are not treated as installed versions.',
          'Unversioned CDN references, manifest version ranges or aliases, and bare module specifiers are reported separately as unresolved references and are never sent to OSV.',
          'Remote artifact integrity is not verified; local hashes identify the scanned Update Set payload and evidence only, so no hash mismatch conclusion is made.',
          `OSV lookups are limited to ${MAX_OSV_LOOKUPS} exact-version npm components per scan and time out after ${OSV_TIMEOUT_MS / 1000} seconds per component. Lookup failures or skipped components do not mean no vulnerabilities.`,
          'Source code and payload contents are intentionally not returned; only metadata, field names, byte counts, and hashes are included.',
          `Payloads larger than ${MAX_SCA_PAYLOAD_BYTES} bytes are skipped without returning their content.`,
        ],
      };
    }

    case 'export_update_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      requireScripting();
      const updateSet = await client.getRecord('sys_update_set', args.sys_id) as Record<string, any>;

      // Paginate sys_update_xml to guarantee completeness; hard-cap at 2000 to avoid runaway responses
      const PAGE_SIZE = 500;
      const MAX_RECORDS = 2000;
      const allXmlRecords: Record<string, any>[] = [];
      let offset = 0;
      while (true) {
        const batch = await client.queryRecords({
          table: 'sys_update_xml',
          query: `update_set=${args.sys_id}`,
          limit: PAGE_SIZE,
          offset,
          fields: 'sys_id,name,type,action,payload',
        });
        allXmlRecords.push(...(batch.records as Record<string, any>[]));
        if (batch.records.length < PAGE_SIZE) break; // last page
        offset += PAGE_SIZE;
        if (allXmlRecords.length >= MAX_RECORDS) {
          throw new ServiceNowError(
            `Update Set contains more than ${MAX_RECORDS} changes and cannot be exported via MCP. ` +
            `Use ServiceNow UI (/sys_update_set_export.do?sysparm_sys_id=${args.sys_id}) to download the complete XML.`,
            'RESULT_TOO_LARGE'
          );
        }
      }

      // Helper: extract string value from Table API field (handles reference objects)
      function fieldVal(v: any): string {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object' && v.value !== undefined) return String(v.value ?? '');
        return String(v);
      }
      // Helper: XML-escape a plain text value
      function esc(v: any): string {
        return fieldVal(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      const unloadDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const usName = fieldVal(updateSet.name);

      // Build <sys_update_set> header element from update set record fields
      const headerFields = [
        'sys_id', 'name', 'description', 'state', 'release', 'is_default',
        'sys_created_by', 'sys_created_on', 'sys_updated_by', 'sys_updated_on',
        'application', 'application_version', 'base_update_set',
      ];
      const headerXml = headerFields
        .map(k => `  <${k}>${esc(updateSet[k])}</${k}>`)
        .join('\n');

      // Collect payloads — each payload is a complete XML element ready for inclusion
      const payloads: string[] = [];
      for (const r of allXmlRecords) {
        const p = fieldVal(r.payload);
        if (p) payloads.push(p);
      }

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<unload unload_date="${unloadDate}">`,
        '<sys_update_set action="INSERT_OR_UPDATE">',
        headerXml,
        '</sys_update_set>',
        ...payloads,
        '</unload>',
      ].join('\n');

      return {
        update_set_name: usName,
        sys_id: args.sys_id,
        change_count: allXmlRecords.length,
        xml,
      };
    }

    case 'ensure_active_update_set': {
      requireScripting();
      const resp = await client.queryRecords({
        table: 'sys_update_set',
        query: 'state=in progress',
        limit: 1,
        fields: 'sys_id,name',
      });
      if (resp.count > 0) {
        return { action: 'existing_found', update_set: resp.records[0] };
      }
      const defaultName = args.default_name || `AI Session Update Set ${new Date().toISOString().slice(0, 10)}`;
      const created = await client.createRecord('sys_update_set', { name: defaultName, state: 'in progress', is_default: true });
      return { action: 'auto_created', name: defaultName, update_set: created };
    }

    default:
      return null;
  }
}

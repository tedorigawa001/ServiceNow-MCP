/**
 * smart_query — natural-language → encoded-query resolver (ROADMAP #5).
 *
 * Bridges free-text intent to a precise `query_records` call by:
 *   1. resolving the target table from keyword synonyms (or an explicit `table`
 *      hint, or a `sys_db_object` label/name search fallback),
 *   2. fetching the table's field set (own + inherited via the super_class chain)
 *      from `sys_dictionary`,
 *   3. parsing the description into candidate conditions and keeping only those
 *      whose target field actually exists on the table (self-correcting; dropped
 *      intents are surfaced in `unmatched_intents`),
 *   4. optionally executing the resulting encoded query.
 *
 * Deterministic and injection-safe: every emitted glide expression
 * (`javascript:gs.*`) comes from a fixed template; the only user-derived value
 * interpolated is a validated positive integer (N days). Read-only (Tier 0).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

// ─── Pure helpers (no client — unit-testable) ───────────────────────────────

/** A keyword → table mapping. Longer matched terms win (see resolveTableByKeyword). */
const TABLE_SYNONYMS: Array<{ table: string; terms: string[] }> = [
  { table: 'change_request', terms: ['change request', '変更要求', '変更リクエスト', '変更', 'chg'] },
  { table: 'sc_req_item', terms: ['requested item', 'req item', 'ritm', '要求アイテム'] },
  { table: 'sc_request', terms: ['service request', 'リクエスト', '依頼', 'サービス要求'] },
  { table: 'sc_cat_item', terms: ['catalog item', 'カタログアイテム', 'カタログ'] },
  { table: 'incident', terms: ['incident', 'インシデント', '障害', 'ticket', 'チケット'] },
  { table: 'problem', terms: ['problem', '問題', 'prb'] },
  { table: 'sn_vul_vulnerable_item', terms: ['vulnerable item', '脆弱性アイテム', 'vulnerable items'] },
  { table: 'sn_vul_remediation_task', terms: ['remediation task', '修復タスク'] },
  // The approval *queue* people act on lives in sysapproval_approver — not the
  // sysapproval_group join table the sys_db_object label search would pick first.
  { table: 'sysapproval_approver', terms: ['approval', 'approvals', '承認待ち', '承認'] },
  { table: 'cmdb_ci', terms: ['configuration item', '構成アイテム', 'cmdb', ' ci '] },
  { table: 'sys_user_group', terms: ['user group', 'グループ', 'チーム'] },
  { table: 'sys_user', terms: ['user', 'ユーザー', '利用者', '社員'] },
  { table: 'kb_knowledge', terms: ['knowledge article', 'knowledge', 'ナレッジ', '記事'] },
  { table: 'cmn_location', terms: ['location', 'ロケーション', '拠点', '場所'] },
  { table: 'task', terms: ['task', 'タスク'] },
];

export interface TableResolution {
  table?: string;
  candidates: string[];
}

/**
 * Resolve a table from keyword synonyms. The match whose matched term is the
 * longest wins, so "change request" beats the bare "request"/"task" terms.
 */
export function resolveTableByKeyword(description: string): TableResolution {
  const lower = ` ${description.toLowerCase()} `;
  const hits: Array<{ table: string; len: number }> = [];
  for (const { table, terms } of TABLE_SYNONYMS) {
    for (const t of terms) {
      if (lower.includes(t.toLowerCase())) {
        hits.push({ table, len: t.trim().length });
        break;
      }
    }
  }
  hits.sort((a, b) => b.len - a.len);
  const candidates: string[] = [];
  for (const h of hits) if (!candidates.includes(h.table)) candidates.push(h.table);
  return { table: candidates[0], candidates };
}

export interface InferredCondition {
  /** the recognized intent label */
  intent: string;
  /** target field element */
  field: string;
  /** encoded-query fragment, e.g. "priority=1" */
  fragment: string;
}

export interface SmartQueryPlan {
  conditions: InferredCondition[];
  /** intents recognized but dropped because the field is absent on the table */
  unmatched: string[];
  encoded_query: string;
}

/** System fields present on every table — never gated on the dictionary. */
const ALWAYS_FIELDS = new Set(['sys_created_on', 'sys_updated_on', 'sys_id', 'sys_created_by']);

/**
 * Parse a natural-language description into encoded-query conditions, keeping
 * only those whose target field exists in `fieldSet` (or is a system field).
 */
export function buildSmartQueryPlan(description: string, fieldSet: Set<string>): SmartQueryPlan {
  const lower = description.toLowerCase();
  const conditions: InferredCondition[] = [];
  const unmatched: string[] = [];

  const add = (intent: string, field: string, fragment: string) => {
    if (ALWAYS_FIELDS.has(field) || fieldSet.has(field)) {
      conditions.push({ intent, field, fragment });
    } else {
      unmatched.push(intent);
    }
  };

  // ── Priority ──
  let priority: number | undefined;
  const pMatch = lower.match(/\bp([1-5])\b/) || description.match(/優先度\s*([1-5])/);
  if (pMatch) priority = parseInt(pMatch[1], 10);
  else if (/\bcritical\b|緊急|重大|最優先/.test(lower) || /緊急|重大|最優先/.test(description)) priority = 1;
  else if (/high[\s-]?priority|高優先/.test(lower) || /高優先/.test(description)) priority = 2;
  else if (/(moderate|medium)[\s-]?priority|中優先/.test(lower) || /中優先/.test(description)) priority = 3;
  else if (/low[\s-]?priority|低優先/.test(lower) || /低優先/.test(description)) priority = 4;
  if (priority !== undefined) add(`priority=${priority}`, 'priority', `priority=${priority}`);

  // ── Open vs closed (active flag) ──
  // \bactive\b does not match the "active" inside "inactive" (the preceding
  // word char blocks the boundary), so this stays safe.
  const openRe = /\bopen\b|\bactive\b|未解決|未対応|オープン|未クローズ|有効/;
  const closedRe = /\bclosed\b|\bresolved\b|解決済|完了|クローズ済|終了/;
  if (openRe.test(lower) || openRe.test(description)) {
    add('open (active=true)', 'active', 'active=true');
  } else if (closedRe.test(lower) || closedRe.test(description)) {
    add('closed (active=false)', 'active', 'active=false');
  }

  // ── Assignment ──
  if (/unassigned|未割り?当|未アサイン/.test(lower) || /未割り?当|未アサイン/.test(description)) {
    add('unassigned', 'assigned_to', 'assigned_toISEMPTY');
  } else if (/assigned to me|自分|私の|私が/.test(lower) || /自分|私の|私が/.test(description)) {
    add('assigned to me', 'assigned_to', 'assigned_to=javascript:gs.getUserID()');
  }

  // ── Time window (created/updated date) ──
  // Only GlideSystem functions on the client's SAFE_GS_PATTERN allowlist are
  // emitted (no week-boundary funcs exist there, so week → a 7-day approximation
  // via daysAgo, which is allowlisted).
  const dateField = /updated|更新|変更日/.test(lower) || /更新|変更日/.test(description)
    ? 'sys_updated_on'
    : 'sys_created_on';
  const between = (label: string, start: string, end: string) =>
    add(label, dateField, `${dateField}>=javascript:gs.${start}^${dateField}<=javascript:gs.${end}`);
  const since = (label: string, start: string) =>
    add(label, dateField, `${dateField}>=javascript:gs.${start}`);

  const nDays = lower.match(/(?:last|past|直近|過去)\s*(\d+)\s*(?:days?|日)/) ||
    description.match(/(\d+)\s*日(?:以内|間)/);
  if (nDays) {
    const n = Math.min(Math.max(parseInt(nDays[1], 10), 1), 3650);
    // daysAgo takes a validated int — injection-safe.
    since(`last ${n} day(s)`, `daysAgo(${n})`);
  } else if (/today|今日|本日/.test(lower) || /今日|本日/.test(description)) {
    since('today', 'beginningOfToday()');
  } else if (/yesterday|昨日/.test(lower) || /昨日/.test(description)) {
    between('yesterday', 'beginningOfYesterday()', 'endOfYesterday()');
  } else if (/this week|today.?s week|今週/.test(lower) || /今週/.test(description)) {
    since('this week (~last 7 days)', 'daysAgo(7)');
  } else if (/last week|先週/.test(lower) || /先週/.test(description)) {
    between('last week (~7-14 days ago)', 'daysAgo(14)', 'daysAgo(7)');
  } else if (/this month|今月/.test(lower) || /今月/.test(description)) {
    since('this month', 'beginningOfThisMonth()');
  } else if (/last month|先月/.test(lower) || /先月/.test(description)) {
    between('last month', 'beginningOfLastMonth()', 'endOfLastMonth()');
  }

  const encoded_query = conditions.map(c => c.fragment).join('^');
  return { conditions, unmatched, encoded_query };
}

// ─── Client-backed helpers ──────────────────────────────────────────────────

const strVal = (v: unknown): string =>
  v && typeof v === 'object' ? ((v as any).value ?? '') : ((v as string) ?? '');

/**
 * Resolve the field set for a table, walking its super_class chain so that
 * inherited fields (e.g. task.priority on incident) are recognized.
 */
async function getTableFieldSet(
  client: ServiceNowClient,
  table: string
): Promise<{ exists: boolean; fields: Set<string>; chain: string[] }> {
  const chain: string[] = [];
  let current: string | undefined = table;
  let exists = false;

  for (let depth = 0; current && depth < 6; depth++) {
    const resp: any = await client.queryRecords({
      table: 'sys_db_object',
      query: `name=${current}`,
      fields: 'name,super_class',
      limit: 1,
    });
    if (resp.count === 0 || resp.records.length === 0) break;
    if (depth === 0) exists = true;
    chain.push(current);
    const superSysId = strVal(resp.records[0].super_class);
    if (!superSysId) break;
    const parentResp: any = await client.queryRecords({
      table: 'sys_db_object',
      query: `sys_id=${superSysId}`,
      fields: 'name',
      limit: 1,
    });
    current = strVal(parentResp.records[0]?.name) || undefined;
    if (chain.includes(current as string)) break; // guard against cycles
  }

  const fields = new Set<string>();
  if (chain.length > 0) {
    const dictResp: any = await client.queryRecords({
      table: 'sys_dictionary',
      query: `nameIN${chain.join(',')}^element!=NULL`,
      fields: 'element',
      limit: 2000,
    });
    for (const row of dictResp.records) {
      const el = strVal(row.element);
      if (el) fields.add(el);
    }
  }
  return { exists, fields, chain };
}

/**
 * Extract LIKE-search tokens from a free-text description, covering both ASCII
 * and Japanese. A plain `split(/[^A-Za-z0-9_]+/)` would treat every kana/kanji
 * as a delimiter and drop all Japanese text, so we *match* token runs instead:
 *   - ASCII words ≥5 chars (≥5 avoids noisy substrings like "here" in "WebSphere")
 *   - Katakana runs ≥3 chars (e.g. "ワークフロー"; the long-vowel ー is included)
 *   - Kanji runs ≥2 chars (e.g. "勤怠管理" / "申請"; hiragana is excluded so
 *     particles/inflection like の・して don't glue onto a kanji compound)
 */
export function extractSearchTokens(description: string): string[] {
  const matches = description.match(
    /[A-Za-z0-9_]{5,}|[゠-ヿーｦ-ﾟ]{3,}|[㐀-鿿々〇]{2,}/g
  );
  return (matches ?? []).slice(0, 5);
}

/** Best-effort fallback: search sys_db_object by label/name for description tokens. */
async function searchTableByLabel(
  client: ServiceNowClient,
  description: string
): Promise<TableResolution> {
  const tokens = extractSearchTokens(description);
  for (const token of tokens) {
    try {
      const resp: any = await client.queryRecords({
        table: 'sys_db_object',
        query: `labelLIKE${token}^ORnameLIKE${token}`,
        fields: 'name,label',
        limit: 5,
      });
      if (resp.count > 0 && resp.records.length > 0) {
        const candidates = resp.records.map((r: any) => strVal(r.name)).filter(Boolean);
        return { table: candidates[0], candidates };
      }
    } catch {
      // ignore and try the next token
    }
  }
  return { candidates: [] };
}

// ─── Tool definition + executor ─────────────────────────────────────────────

export function getSmartQueryToolDefinitions() {
  return [
    {
      name: 'smart_query',
      description:
        'Resolve a natural-language request into a ServiceNow table + encoded query and (optionally) run it. ' +
        'Maps keywords to common tables (incident, change_request, problem, sc_request, sn_vul_vulnerable_item, cmdb_ci, sys_user, …), ' +
        'then infers conditions for priority (P1/critical/high), open vs closed state, "assigned to me"/unassigned, ' +
        'and time windows (today, yesterday, this/last week, this/last month, last N days). Conditions whose field does not exist ' +
        'on the resolved table are dropped and reported in unmatched_intents. Returns the interpretation (table, encoded_query, ' +
        'conditions) plus matching records. Set execute=false to preview the query without running it, or pass table to override resolution.',
      inputSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description:
              'Natural-language request, e.g. "P1 incidents still open from last month" / "先月の未解決 P1 インシデント"',
          },
          table: {
            type: 'string',
            description: 'Optional: force this table instead of auto-resolving from keywords',
          },
          limit: { type: 'number', description: 'Max records to return when executed (default 10, max 1000)' },
          execute: { type: 'boolean', description: 'Run the resolved query (default true). false = preview only.' },
        },
        required: ['description'],
      },
    },
  ];
}

export async function executeSmartQueryToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (name !== 'smart_query') return null;

  const description: unknown = args.description;
  if (typeof description !== 'string' || description.trim() === '') {
    throw new ServiceNowError('description (non-empty string) is required', 'INVALID_REQUEST');
  }
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 1000);
  const execute = args.execute !== false;

  // 1. Resolve the table.
  let table: string | undefined;
  let resolution: 'hint' | 'keyword' | 'sys_db_object' | undefined;
  let candidates: string[] = [];

  if (typeof args.table === 'string' && args.table.trim() !== '') {
    table = args.table.trim();
    resolution = 'hint';
  } else {
    const kw = resolveTableByKeyword(description);
    candidates = kw.candidates;
    if (kw.table) {
      table = kw.table;
      resolution = 'keyword';
    } else {
      const found = await searchTableByLabel(client, description);
      if (found.table) {
        table = found.table;
        resolution = 'sys_db_object';
        candidates = found.candidates;
      }
    }
  }

  if (!table) {
    throw new ServiceNowError(
      `Could not resolve a table from "${description}". Pass an explicit "table".`,
      'NOT_FOUND'
    );
  }

  // 2. Field set (own + inherited).
  const meta = await getTableFieldSet(client, table);
  if (!meta.exists) {
    throw new ServiceNowError(`Resolved table "${table}" not found in sys_db_object`, 'NOT_FOUND');
  }

  // 3. Build the query plan.
  const plan = buildSmartQueryPlan(description, meta.fields);

  const interpreted = {
    table,
    table_resolution: resolution,
    candidate_tables: candidates,
    inheritance_chain: meta.chain,
    conditions: plan.conditions,
    unmatched_intents: plan.unmatched,
    encoded_query: plan.encoded_query,
  };

  const condCount = plan.conditions.length;
  const queryDesc = plan.encoded_query || '(no filter — all records)';

  // 4. Optionally execute.
  if (!execute) {
    return {
      ...interpreted,
      executed: false,
      summary: `Resolved "${description}" → table "${table}" with ${condCount} condition(s): ${queryDesc} (preview only)`,
    };
  }

  const resp = await client.queryRecords({ table, query: plan.encoded_query, limit });
  return {
    ...interpreted,
    executed: true,
    count: resp.count,
    records: resp.records,
    summary: `Resolved "${description}" → ${resp.count} record(s) in "${table}" via [${queryDesc}]`,
  };
}

/** Shared, proposed output vocabulary. Registration alone never triggers or approves a finding. */
import { z } from 'zod';
import { RULES } from './catalog.js';

export const FOLLOW_UP_CATALOG_VERSION = 'bp-followups-0.2';
export const COMMON_FOLLOW_UP_CODES = ['source_approval', 'binding_and_reachability', 'exceptions_and_business_intent'] as const;
export const RULE_SPECIFIC_FOLLOW_UP = {
  'AU-BR-001': 'workflow_suppression_review',
  'AU-BR-002': 'async_dependency_review',
  'AU-CL-004': 'synchronous_ajax_review',
} as const;
export const FOLLOW_UP_CODES = [...COMMON_FOLLOW_UP_CODES, ...Object.values(RULE_SPECIFIC_FOLLOW_UP)] as const;
export const followUpCodeSchema = z.enum(FOLLOW_UP_CODES);
export type FollowUpCode = z.infer<typeof followUpCodeSchema>;
/** Only observed syntactic context, never an approval or execution-path proof. */
export type FollowUpContext = { kind: 'workflow_suppression' } | { kind: 'async_dependency' }
  | { kind: 'synchronous_ajax'; receiver_unresolved: boolean };

export function requiredFollowUp(ruleId: string, context?: FollowUpContext): FollowUpCode[] {
  const result: FollowUpCode[] = [...COMMON_FOLLOW_UP_CODES];
  if (ruleId === 'AU-BR-001' && context?.kind === 'workflow_suppression') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-BR-002' && context?.kind === 'async_dependency') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-CL-004' && context?.kind === 'synchronous_ajax') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  return result.filter(code => isFollowUpApplicable(code, ruleId));
}

type Definition = { kind: 'generic' | 'context_specific'; applicable_rules: 'all' | readonly string[];
  meaning: string; attach_when: string; does_not_prove: string };
/** Meanings/attachment contexts are owned here, not by an evaluation dataset. Human approval pending. */
export const FOLLOW_UP_DEFINITIONS = {
  source_approval: {
    kind: 'generic', applicable_rules: 'all', meaning: '根拠資料の適用範囲・採用可否を人が確認する。',
    attach_when: '採用根拠がcandidate/未承認であると確認できた場合。', does_not_prove: '出典・規則が承認済み、または違反確認済みであること。',
  },
  binding_and_reachability: {
    kind: 'generic', applicable_rules: 'all', meaning: '変数の束縛・受信側・到達可能性と呼出し元を確認する。',
    attach_when: '構文候補を検出したが束縛または実行経路を解決できていない場合。', does_not_prove: '経路が存在すること、または存在しないこと。具体的文脈の確認をこれだけで代替しない。',
  },
  exceptions_and_business_intent: {
    kind: 'generic', applicable_rules: 'all', meaning: '規則の例外、業務意図、既存承認の有無を確認する。',
    attach_when: '構文候補はあるが業務上の必要性・例外条件を確認できていない場合。', does_not_prove: '例外承認済み、または文脈固有の確認完了であること。',
  },
  workflow_suppression_review: {
    kind: 'context_specific', applicable_rules: ['AU-BR-001'], meaning: 'workflow抑止の理由・承認範囲・必要性と副作用を確認する。',
    attach_when: '同じ関数内で、current由来の受信側への1引数setWorkflow(false)が更新候補よりソース上で先行する場合。falseは真偽値リテラルのみ。順序・分岐・更新時の抑止効果は未確認として制約を明記する。',
    does_not_prove: '抑止が更新時に効いていることや、再更新の自動許可。setWorkflowという語の存在だけで付けない。',
  },
  async_dependency_review: {
    kind: 'context_specific', applicable_rules: ['AU-BR-002'], meaning: 'async本文のprevious/変更判定への依存とフォールバック・互換処理の妥当性を確認する。',
    attach_when: '保存値async_always/旧asyncを非同期と確認し、本文のprevious/changes系の依存候補を検出して適用条件や防御的処理の意図を確認できていない場合。条件欄は本文と分ける。',
    does_not_prove: 'previousが使用可能であることや、try/catch・nullガードがあるだけで処理が適切であること。',
  },
  synchronous_ajax_review: {
    kind: 'context_specific', applicable_rules: ['AU-CL-004'], meaning: '同期AjaxのUI制約・必要性・非同期代替と互換要件を確認する。',
    attach_when: 'Client Scriptで同期GlideAjax候補を検出し、UI・受信側または同期使用の理由を確認できていない場合。受信側未解決ならそれも併記する。',
    does_not_prove: '同名メソッドが必ずGlideAjaxであることや、互換性という説明だけで承認されること。',
  },
} as const satisfies Record<FollowUpCode, Definition>;

export function isFollowUpApplicable(code: FollowUpCode, ruleId: string): boolean {
  if (!RULES.some(rule => rule.rule_id === ruleId)) return false;
  const rules: 'all' | readonly string[] = FOLLOW_UP_DEFINITIONS[code].applicable_rules;
  return rules === 'all' || rules.includes(ruleId);
}

/** Adjacent context vocabulary: these remain limitations, NOT followup codes. */
export const CONTEXT_LIMITATIONS = {
  inactive_asset: { meaning: '非アクティブ資産の静的候補であり、現在実行中とは断定しない。',
    attach_when: 'レビュー対象版のactive=falseを確認した場合。未知値や現行版だけの値から推測しない。',
    does_not_prove: '実行経路全体の不存在、安全性、または候補抑制の承認。' },
  workflow_suppression_relation_not_verified: {
    meaning: 'workflow抑止と更新の関連は、同一関数内の受信側由来・ソース順の候補である。',
    attach_when: 'workflow_suppression_reviewを付けた場合。分岐の両側・再有効化がある形も抑止効果を断定しない。',
    does_not_prove: '同一実行経路、実行順、更新時のworkflow抑止、例外承認。',
  },
  synchronous_ajax_receiver_unresolved: {
    meaning: '同期Ajax候補の受信側をGlideAjaxと確定できていない。',
    attach_when: 'getXMLWait候補の受信側に未解決の由来が含まれる場合。',
    does_not_prove: '当該メソッドがServiceNowのGlideAjaxであること。',
  },
} as const;

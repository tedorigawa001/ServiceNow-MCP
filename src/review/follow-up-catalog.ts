/** Shared PoC vocabulary. Registration alone never triggers or approves a finding. */
import { z } from 'zod';
import { RULES } from './catalog.js';

export const FOLLOW_UP_CATALOG_VERSION = 'bp-followups-0.4';
// Additive BR-004 profile; the frozen three-rule evaluation profile above is unchanged.
export const BINDING_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-br004-0.1';
export const ABORT_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-br005-0.1';
export const DISPLAY_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-br007-0.1';
export const UI_POLICY_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-cl006-0.1';
export const CLIENT_LOOKUP_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-cl002-0.1';
export const ONCHANGE_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-cl008-0.1';
export const ONLOAD_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-cl003-0.1';
export const DOM_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-cl007-0.1';
export const SETVALUE_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-cl005-0.1';
export const FULLTEXT_FOLLOW_UP_PROFILE_VERSION = 'bp-followups-qry002-0.1';
export const FULLTEXT_METHOD_FOLLOW_UP = { add_query: 'fulltext_add_query_review', encoded_query: 'fulltext_encoded_query_review' } as const;
export const DOM_SCOPE_FOLLOW_UP = { document_scope: 'dom_document_scope_review', created_subtree: 'dom_created_subtree_review' } as const;
export const ONLOAD_INPUT_FOLLOW_UP = { static: 'onload_static_inputs_review', runtime: 'onload_runtime_inputs_review', unknown: 'onload_unknown_inputs_review' } as const;
export const COMMON_FOLLOW_UP_CODES = ['source_approval', 'binding_and_reachability', 'exceptions_and_business_intent'] as const;
export const RULE_SPECIFIC_FOLLOW_UP = {
  'AU-BR-001': 'workflow_suppression_review',
  'AU-BR-002': 'async_dependency_review',
  'AU-CL-004': 'synchronous_ajax_review',
  'AU-BR-004': 'shared_binding_intent_review',
  'AU-BR-005': 'post_abort_processing_review',
  'AU-BR-007': 'display_persistence_intent_review',
  'AU-CL-006': 'ui_policy_suitability_review',
  'AU-CL-002': 'client_lookup_necessity_review',
  'AU-CL-008': 'onchange_loading_intent_review',
  'AU-CL-003': 'onload_data_timing_review',
  'AU-CL-007': 'dom_dependency_review',
  'AU-CL-005': 'reference_display_value_review',
  'AU-QRY-002': 'fulltext_index_configuration_review',
} as const;
export const FOLLOW_UP_CODES = [...COMMON_FOLLOW_UP_CODES, ...Object.values(RULE_SPECIFIC_FOLLOW_UP), ...Object.values(ONLOAD_INPUT_FOLLOW_UP), ...Object.values(DOM_SCOPE_FOLLOW_UP), ...Object.values(FULLTEXT_METHOD_FOLLOW_UP)] as const;
export const followUpCodeSchema = z.enum(FOLLOW_UP_CODES);
export type FollowUpCode = z.infer<typeof followUpCodeSchema>;
/** Detection signals, never exception classification, approval or execution-path proof. */
export type FollowUpContext = { kind: 'workflow_suppression' } | { kind: 'async_dependency' }
  | { kind: 'synchronous_ajax'; receiver_unresolved: boolean } | { kind: 'onload_timing'; timing: keyof typeof ONLOAD_INPUT_FOLLOW_UP }
  | { kind: 'dom_scope'; scope: keyof typeof DOM_SCOPE_FOLLOW_UP }
  | { kind: 'fulltext_query'; method: keyof typeof FULLTEXT_METHOD_FOLLOW_UP };

export function requiredFollowUp(ruleId: string, context?: FollowUpContext): FollowUpCode[] {
  const result: FollowUpCode[] = [...COMMON_FOLLOW_UP_CODES];
  if (ruleId === 'AU-BR-001' && context?.kind === 'workflow_suppression') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  // Called only after a finding is detected: these checks are intrinsic, not exception classifiers.
  if (ruleId === 'AU-BR-002') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-CL-004') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-BR-004') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-BR-005') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-BR-007') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-CL-006') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-CL-002') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-CL-008') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-CL-005') result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
  if (ruleId === 'AU-QRY-002') {
    result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
    if (context?.kind === 'fulltext_query') result.push(FULLTEXT_METHOD_FOLLOW_UP[context.method]);
  }
  if (ruleId === 'AU-CL-003') {
    result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
    result.push(ONLOAD_INPUT_FOLLOW_UP[context?.kind === 'onload_timing' ? context.timing : 'unknown']);
  }
  if (ruleId === 'AU-CL-007') {
    result.push(RULE_SPECIFIC_FOLLOW_UP[ruleId]);
    if (context?.kind === 'dom_scope') result.push(DOM_SCOPE_FOLLOW_UP[context.scope]);
  }
  return result.filter(code => isFollowUpApplicable(code, ruleId));
}

type Definition = { kind: 'generic' | 'context_specific' | 'rule_intrinsic'; applicable_rules: 'all' | readonly string[];
  meaning: string; attach_when: string; does_not_prove: string };
/** Policy is owned here, not by a dataset. Source adoption and expert adjudication remain pending. */
export const FOLLOW_UP_DEFINITIONS = {
  fulltext_index_configuration_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-QRY-002'], meaning: '対象テーブルの全文検索索引・検索設定・適用範囲と実際の検索要件を確認する。',
    attach_when: 'BR限定の全文検索構文候補の全件。', does_not_prove: '索引が無い/有る、利用可能、検索成功/失敗、違反、検索結果や認可の正しさ。',
  },
  fulltext_add_query_review: {
    kind: 'context_specific', applicable_rules: ['AU-QRY-002'], meaning: '2引数addQueryの予約名・受信側・対象テーブル・検索意図を確認する。',
    attach_when: '第1引数が限定定数評価で123TEXTQUERY321と一致する2引数addQuery。', does_not_prove: '呼出し到達性・検索実行・索引設定。',
  },
  fulltext_encoded_query_review: {
    kind: 'context_specific', applicable_rules: ['AU-QRY-002'], meaning: '固定encoded queryの予約名条件・全体構文と検索要件を確認する。',
    attach_when: '1引数addEncodedQueryの固定文字列で、限定した条件境界に123TEXTQUERY321=値を検出。', does_not_prove: 'encoded query全体の妥当性、条件の有効性や索引設定。',
  },
  reference_display_value_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-CL-005'],
    meaning: '対象列が参照型か、既知で正しい表示値を利用できるか、クリア操作等の意図・追加通信・UI互換性を確認する。',
    attach_when: 'Client Scriptでg_form由来の2引数setValueを限定解析で確認した全候補。',
    does_not_prove: '参照型・表示値の可用性・追加通信や性能劣化・違反。表示値取得だけの照会追加や3引数への自動置換を承認しない。',
  },
  dom_dependency_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-CL-007'], meaning: 'DOM依存の必要性・対応UI・GlideForm等の公開APIで代替できるかを確認する。',
    attach_when: '限定したDOM検索候補の全件。', does_not_prove: '標準UIへの依存・違反・非互換性、または自動置換の安全性。',
  },
  dom_document_scope_review: {
    kind: 'context_specific', applicable_rules: ['AU-CL-007'], meaning: '文書全体またはその検索結果のDOMが標準UIか自作UIか、所有元と安定性を確認する。',
    attach_when: 'document/body/documentElementまたは同由来の検索結果からの検索。', does_not_prove: 'セレクターの名前が標準UIを指すこと。',
  },
  dom_created_subtree_review: {
    kind: 'context_specific', applicable_rules: ['AU-CL-007'], meaning: 'createElement由来の部分木の所有範囲・利用意図・UI互換性を確認する。',
    attach_when: '同じ関数でdocument.createElementから得た要素またはその検索結果内の検索。', does_not_prove: '自作部分木の操作が違反であること、実際に挿入・実行されたこと、標準DOMが混入していないこと。',
  },
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
    attach_when: '同じ関数内で、current由来の1引数setWorkflow呼び出しが更新候補よりソース上で先行し、引数が限定定数評価でfalseと確定する場合。文字列/真偽値リテラル、初期化済みで書込なしの同一関数const、文字列結合、!・&&・||・===・!==・既知真偽値条件式だけ。順序・分岐・抑止効果は未確認として制約を明記する。',
    does_not_prove: '抑止が更新時に効いていることや、再更新の自動許可。setWorkflowという語の存在だけで付けない。',
  },
  async_dependency_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-BR-002'], meaning: 'async本文のprevious/変更判定への依存とフォールバック・互換処理の妥当性を確認する。',
    attach_when: '保存値async_always/旧asyncでAU-BR-002候補を検出した全件に付与する。ガード・例外処理・互換分岐の有無を付与条件にしない。条件欄は本文と分ける。',
    does_not_prove: '問題ありと例外の識別、例外承認、previousの使用可能性、防御的処理の適切さ。',
  },
  synchronous_ajax_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-CL-004'], meaning: '同期AjaxのUI制約・必要性・非同期代替と互換要件を確認する。',
    attach_when: 'Client ScriptでAU-CL-004候補を検出した全件に付与する。互換性・try/catch等の有無を付与条件にしない。受信側未解決ならそれも併記する。',
    does_not_prove: '問題ありと例外の識別、例外承認、同名メソッドがGlideAjaxであること、互換性の説明の妥当性。',
  },
  shared_binding_intent_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-BR-004'],
    meaning: 'トップレベル宣言の共有意図・他BRとの衝突・関数内へ閉じる可否と互換性を確認する。',
    attach_when: 'AU-BR-004の宣言候補を検出した全件。collection=global、通常テーブル、不明の文脈を別制限で区別する。',
    does_not_prove: '共有が承認済みであること、実際の衝突、sys_scope=globalがGlobal Business Ruleであること。',
  },
  post_abort_processing_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-BR-005'],
    meaning: '中止後に続く処理の必要性・副作用・後続BRとの関係を確認する。',
    attach_when: 'before BRでcurrentへの中止指定後に処理継続候補を検出した場合。',
    does_not_prove: '処理が不要、違反、return不足であること。自動return追加を許可しない。',
  },
  display_persistence_intent_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-BR-007'],
    meaning: '表示目的の変更か永続保存要件があるか、明示保存や他BRとの関係を確認する。',
    attach_when: '保存値before_displayのBRでcurrent由来の限定的な書込み候補を検出した場合。',
    does_not_prove: '表示目的の変更が違反であること、実際の永続化、update追加や変更削除が必要であること。',
  },
  ui_policy_suitability_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-CL-006'],
    meaning: 'UI Policyでの表現可否、複雑な処理・実行順・UI/APIの制約と必要性を確認する。',
    attach_when: 'Client Scriptでg_form由来の対象フィールド制御を候補検出した全件。',
    does_not_prove: 'Client Scriptが違反、UI Policyへ必ず移せること、全UIでの動作、自動移行の承認。',
  },
  client_lookup_necessity_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-CL-002'],
    meaning: '照会頻度・必要列・既存データ・業務上の必要性・UI互換性と代替手段の適否を確認する。',
    attach_when: 'Client Scriptで受信側を確定したgetReferenceまたは限定的なGlideRecord get/query候補を検出した全件。',
    does_not_prove: '照会が不要、違反、実行済みであること、性能劣化、代替方式への自動移行の承認。',
  },
  onchange_loading_intent_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-CL-008'],
    meaning: '読込時の照会が必要か、isLoading等のガード・処理順・業務意図を確認する。',
    attach_when: 'onChangeのClient Scriptで、読込時を除外できない限定的な照会候補を検出した全件。',
    does_not_prove: '処理が不要、ガードが無い、違反、読込時に実行済みであること。自動return追加を許可しない。',
  },
  onload_data_timing_review: {
    kind: 'rule_intrinsic', applicable_rules: ['AU-CL-003'],
    meaning: '読込前の可用性・更新鮮度・業務上の必要性・クライアントへの公開範囲を確認する。',
    attach_when: 'onLoadの照会タイミング確認候補を検出した全件に付与する。',
    does_not_prove: 'scratchpadへの移行が適切、機密列を公開可能、結果が読込前に確定すること。',
  },
  onload_static_inputs_review: {
    kind: 'context_specific', applicable_rules: ['AU-CL-003'],
    meaning: '定数入力の照会で、必要情報を読込前に安全に用意できるかを確認する。',
    attach_when: '限定解析で照会の入力が定数と分類された候補に付与する。',
    does_not_prove: '結果データが不変、読込前に決まる、scratchpadへ移行すべきという結論。',
  },
  onload_runtime_inputs_review: {
    kind: 'context_specific', applicable_rules: ['AU-CL-003'],
    meaning: 'フォーム値などの実行時入力と鮮度要件を確認し、動的取得を維持する適否を検討する。',
    attach_when: '限定解析でフォーム参照または実行時フォーム値への依存が確認された候補に付与する。',
    does_not_prove: '移行不可、常に動的取得が必要、既存データがサーバーで利用不能という結論。',
  },
  onload_unknown_inputs_review: {
    kind: 'context_specific', applicable_rules: ['AU-CL-003'],
    meaning: '入力・設定経路・値の生成時点が不明なため、移行判断の前提証拠を追加確認する。',
    attach_when: '既知の照会だが入力タイミングの分類が不明な候補に付与する。',
    does_not_prove: '不明な入力が定数または動的であること、候補0件や移行判断の承認。',
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

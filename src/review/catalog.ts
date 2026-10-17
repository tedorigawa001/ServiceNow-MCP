/** Curated register summaries. No vendor document bodies or network retrieval. */
export const CATALOG_VERSION = 'au-register-0.1';
/** Conservative family recognition for this PoC; not a live platform release detector. */
export function matchCatalogRelease(release: string | null): 'matched' | 'mismatched' | 'unknown' {
  const normalized = release?.trim().toLowerCase();
  if (normalized === 'australia') return 'matched';
  return normalized && ['brazil', 'zurich', 'yokohama', 'xanadu'].includes(normalized) ? 'mismatched' : 'unknown';
}
export type AssetType = 'business_rule' | 'client_script' | 'script_include' | 'scripted_rest_resource' | 'server_script';
export interface BestPracticeRule {
  rule_id: string; source_id: string; section: string; title: string; applicability: string;
  asset_types: AssetType[]; api_terms: string[]; keywords: string[];
}
export const SOURCES = {
  "AU-SRC-001": {
    "title": "Classic Business rules",
    "url": "https://www.servicenow.com/docs/r/australia/api-reference/business-rules-classic/c_BusinessRules.html",
    "updated_on": "2026-03-12",
    "release": "Australia",
    "verified_on": "2026-10-17",
    "approval_status": "candidate",
    "retrieved_at": null,
    "content_hash": null,
    "reuse_status": "summary_and_links_only"
  },
  "AU-SRC-002": {
    "title": "Client-side scripting design and processing",
    "url": "https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html",
    "updated_on": "2026-10-08",
    "release": "Australia",
    "verified_on": "2026-10-17",
    "approval_status": "candidate",
    "retrieved_at": null,
    "content_hash": null,
    "reuse_status": "summary_and_links_only"
  },
  "AU-SRC-003": {
    "title": "Script includes",
    "url": "https://www.servicenow.com/docs/r/australia/api-reference/scripts/c_ScriptIncludes.html",
    "updated_on": "2026-03-12",
    "release": "Australia",
    "verified_on": "2026-10-17",
    "approval_status": "candidate",
    "retrieved_at": null,
    "content_hash": null,
    "reuse_status": "summary_and_links_only"
  },
  "AU-SRC-004": {
    "title": "Scripted REST APIs good practices",
    "url": "https://www.servicenow.com/docs/r/australia/api-reference/rest-api-explorer/scripted-rest-good-practices.html",
    "updated_on": "2026-03-12",
    "release": "Australia",
    "verified_on": "2026-10-17",
    "approval_status": "candidate",
    "retrieved_at": null,
    "content_hash": null,
    "reuse_status": "summary_and_links_only"
  },
  "AU-SRC-005": {
    "title": "Querying tables in script",
    "url": "https://www.servicenow.com/docs/r/australia/api-reference/scripts/c_UsingGlideRecordToQueryTables.html",
    "updated_on": "2026-03-12",
    "release": "Australia",
    "verified_on": "2026-10-17",
    "approval_status": "candidate",
    "retrieved_at": null,
    "content_hash": null,
    "reuse_status": "summary_and_links_only"
  }
} as const;
export const RULES: BestPracticeRule[] = [
  {
    "rule_id": "AU-BR-001",
    "title": "現在レコードの再更新を避ける。特殊事情でのworkflow抑止併用は一律修正しない",
    "source_id": "AU-SRC-001",
    "section": "How business rules work → Prevent recursive business rules",
    "applicability": "`current.update()`。到達可能性、BR連鎖、before/after、意図した副作用を確認",
    "asset_types": [
      "business_rule"
    ],
    "api_terms": [
      "current.update"
    ],
    "keywords": [
      "再帰",
      "recursion",
      "recursive"
    ]
  },
  {
    "rule_id": "AU-BR-002",
    "title": "asyncの本文でpreviousや変更判定に依存しない。条件欄でのchanges系利用とは区別",
    "source_id": "AU-SRC-001",
    "section": "How business rules work → When business rules run（Note）、Global variables in business rules",
    "applicability": "`when=async`＋本文の`previous`/`changes*`。condition/filter_conditionを本文と混同しない",
    "asset_types": [
      "business_rule"
    ],
    "api_terms": [
      "previous",
      "changes",
      "changesTo",
      "changesFrom"
    ],
    "keywords": [
      "async",
      "非同期"
    ]
  },
  {
    "rule_id": "AU-BR-003",
    "title": "async同士の更新順序を前提にしない",
    "source_id": "AU-SRC-001",
    "section": "How business rules work → When business rules run（Async行）",
    "applicability": "同一レコード更新と前後関係への依存を候補化。他BRと短時間の連続更新も確認",
    "asset_types": [
      "business_rule"
    ],
    "api_terms": [],
    "keywords": [
      "async",
      "非同期",
      "順序",
      "order"
    ]
  },
  {
    "rule_id": "AU-BR-004",
    "title": "BRの変数を関数内に閉じ、他BRとの衝突を避ける",
    "source_id": "AU-SRC-001",
    "section": "Global variables in business rules → Define variables",
    "applicability": "トップレベル変数。既存ラッパー・意図した共有を確認し、文字列検索だけで断定しない",
    "asset_types": [
      "business_rule"
    ],
    "api_terms": [],
    "keywords": [
      "変数",
      "関数",
      "scope",
      "variables"
    ]
  },
  {
    "rule_id": "AU-BR-005",
    "title": "setAbortAction後もスクリプトと後続BRは続くことを考慮する",
    "source_id": "AU-SRC-001",
    "section": "Example business rule scripts → Abort a database action in a before business-rule",
    "applicability": "中止呼出し後の副作用。常にreturn追加とはせず、必要な後処理か確認",
    "asset_types": [
      "business_rule"
    ],
    "api_terms": [
      "setAbortAction"
    ],
    "keywords": [
      "中止",
      "abort",
      "後続"
    ]
  },
  {
    "rule_id": "AU-BR-006",
    "title": "別スコープからのsetAbortActionで中止できるとは扱わない",
    "source_id": "AU-SRC-001",
    "section": "Example business rule scripts → Abort a database action in a before business-rule（Note）",
    "applicability": "BRと対象テーブルのsys_scopeを比較。スコープを取得できなければ未確認",
    "asset_types": [
      "business_rule"
    ],
    "api_terms": [
      "setAbortAction"
    ],
    "keywords": [
      "別スコープ",
      "cross-scope"
    ]
  },
  {
    "rule_id": "AU-BR-007",
    "title": "displayでのフィールド変更を永続保存と誤認しない",
    "source_id": "AU-SRC-001",
    "section": "Display business-rules",
    "applicability": "`when=display`＋currentへの代入。表示だけの意図なら問題なし。永続化要件を確認",
    "asset_types": [
      "business_rule"
    ],
    "api_terms": [],
    "keywords": [
      "display",
      "永続",
      "persist"
    ]
  },
  {
    "rule_id": "AU-CL-001",
    "title": "フォームだけの制御をリスト編集へ流用しない。onCellEditは区別",
    "source_id": "AU-SRC-002",
    "section": "Restrict list editing",
    "applicability": "フィールド制御。リスト編集、ACL/BR/Data Policy等を確認。不在をpayload未収録だけで断定しない",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "onCellEdit"
    ],
    "keywords": [
      "リスト",
      "list"
    ]
  },
  {
    "rule_id": "AU-CL-002",
    "title": "不要なサーバー照会を減らす",
    "source_id": "AU-SRC-002",
    "section": "Minimize server lookups",
    "applicability": "`getReference`/クライアントGlideRecord。必要列、既存データ、照会頻度を確認",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "getReference"
    ],
    "keywords": [
      "サーバー照会",
      "lookups"
    ]
  },
  {
    "rule_id": "AU-CL-003",
    "title": "読込前に決まる必要データはscratchpadによる受渡しを検討",
    "source_id": "AU-SRC-002",
    "section": "Minimize server lookups → Retrieve server data using g_scratchpad",
    "applicability": "onLoadでの照会。動的取得が必要なら例外。機密データをscratchpadへ追加しない",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "g_scratchpad"
    ],
    "keywords": [
      "scratchpad",
      "読込前"
    ]
  },
  {
    "rule_id": "AU-CL-004",
    "title": "動的な照会は非同期GlideAjaxを優先",
    "source_id": "AU-SRC-002",
    "section": "Minimize server lookups → Retrieve server data using asynchronous GlideAjax",
    "applicability": "`getXMLWait`等。コールバック完了前に結果を使用していないかも確認",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "getXMLWait",
      "GlideAjax"
    ],
    "keywords": [
      "非同期",
      "asynchronous"
    ]
  },
  {
    "rule_id": "AU-CL-005",
    "title": "参照フィールドのsetValueで既知の表示値を渡し、追加往復を避ける",
    "source_id": "AU-SRC-002",
    "section": "Use the setValue() displayValue parameter for reference fields",
    "applicability": "参照列への2引数setValue。表示値の可用性を確認し、その取得のためだけに照会を増やさない",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "g_form.setValue"
    ],
    "keywords": [
      "参照",
      "displayValue",
      "reference"
    ]
  },
  {
    "rule_id": "AU-CL-006",
    "title": "単純な必須/表示/読取専用制御はUI Policyを検討",
    "source_id": "AU-SRC-002",
    "section": "Use UI policy instead of a client script",
    "applicability": "`setMandatory`/`setVisible`/`setReadOnly`。複雑な処理やUI制約があればスクリプトを一律禁止しない",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "setMandatory",
      "setVisible",
      "setReadOnly"
    ],
    "keywords": [
      "policy",
      "UIポリシー"
    ]
  },
  {
    "rule_id": "AU-CL-007",
    "title": "標準DOMへの依存を減らす",
    "source_id": "AU-SRC-002",
    "section": "Avoid DOM manipulation",
    "applicability": "DOM ID/CSS selector参照。自作UIのDOMと標準UI依存を分離し、代替GlideForm APIを確認",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "getElementById",
      "querySelector"
    ],
    "keywords": [
      "DOM",
      "標準DOM"
    ]
  },
  {
    "rule_id": "AU-CL-008",
    "title": "読込時に不要なonChange処理はisLoading等で抑制",
    "source_id": "AU-SRC-002",
    "section": "Run only necessary scripts",
    "applicability": "onChangeでのサーバー照会とガード。読込時に動く必要がある処理は例外として記録",
    "asset_types": [
      "client_script"
    ],
    "api_terms": [
      "isLoading"
    ],
    "keywords": [
      "onChange",
      "読込時"
    ]
  },
  {
    "rule_id": "AU-SI-001",
    "title": "非公開のGlideAjax enabled資産はACLで保護する",
    "source_id": "AU-SRC-003",
    "section": "Glide AJAX enabled script includes → Security on Glide AJAX enabled script includes",
    "applicability": "client_callableと関連ACL、ロール・条件を照合。公開資産はAU-SI-002でも評価",
    "asset_types": [
      "script_include"
    ],
    "api_terms": [],
    "keywords": [
      "ACL",
      "callable",
      "GlideAjax"
    ]
  },
  {
    "rule_id": "AU-SI-002",
    "title": "匿名公開で機密情報を返さない。個別isPublic設定の優先を考慮",
    "source_id": "AU-SRC-003",
    "section": "Privacy settings on Glide AJAX enabled script includes → Public privacy-setting、Change privacy on a single Glide AJAX enabled script include",
    "applicability": "`isPublic()`、返却経路、機密列、実効設定を確認。公開というだけでは脆弱性にしない",
    "asset_types": [
      "script_include"
    ],
    "api_terms": [
      "isPublic"
    ],
    "keywords": [
      "匿名",
      "anonymous",
      "public"
    ]
  },
  {
    "rule_id": "AU-SI-003",
    "title": "DB照会するGlideAjax enabled資産ではGlideRecordSecureを優先（区分: 公式推奨。製品の必須条件ではない）",
    "source_id": "AU-SRC-003",
    "section": "Security on Glide AJAX enabled script includes",
    "applicability": "`client_callable=true`＋GlideRecord。到達経路と既存認可を調べ、単独のAPI名だけで漏えいを断定しない。本文ではGlide AJAX有効化時のシステム推奨メッセージとして記載され、`glide.script.ccsi.customer_scoped.security_msgs_enabled` で表示を止められる。表示の有無を規則の適用条件にしない",
    "asset_types": [
      "script_include"
    ],
    "api_terms": [
      "GlideRecord",
      "GlideRecordSecure"
    ],
    "keywords": [
      "GlideAjax",
      "認可"
    ]
  },
  {
    "rule_id": "AU-SI-004",
    "title": "Nameとクラス/prototype/type、またはオンデマンド関数名を一致させる",
    "source_id": "AU-SRC-003",
    "section": "Script include form（Name/Script行）、Use script includes",
    "applicability": "メタデータと定義を比較。外部呼出し用API NameとNameは混同しない",
    "asset_types": [
      "script_include"
    ],
    "api_terms": [
      "Class.create"
    ],
    "keywords": [
      "クラス",
      "prototype",
      "名前"
    ]
  },
  {
    "rule_id": "AU-REST-001",
    "title": "GETで業務データを変更しない",
    "source_id": "AU-SRC-004",
    "section": "Follow REST API conventions",
    "applicability": "GETハンドラーから書込APIへの経路。アクセスログ等の通常記録とは区別",
    "asset_types": [
      "scripted_rest_resource"
    ],
    "api_terms": [],
    "keywords": [
      "GET",
      "業務データ",
      "変更"
    ]
  },
  {
    "rule_id": "AU-REST-002",
    "title": "公開済み契約の破壊的変更は版を分ける",
    "source_id": "AU-SRC-004",
    "section": "Use versioning to control changes to your API",
    "applicability": "変更前後のスキーマ・利用者を比較。単一版だけでは違反判定できない",
    "asset_types": [
      "scripted_rest_resource"
    ],
    "api_terms": [],
    "keywords": [
      "version",
      "破壊的",
      "互換",
      "breaking"
    ]
  },
  {
    "rule_id": "AU-REST-003",
    "title": "成否に対応するHTTPステータスと有用なエラーを返す",
    "source_id": "AU-SRC-004",
    "section": "Return an informative HTTP status code、Return useful error information",
    "applicability": "エラー分岐とステータス。常に200で失敗を隠していないか、フレームワークの既定処理も確認",
    "asset_types": [
      "scripted_rest_resource"
    ],
    "api_terms": [
      "setStatus"
    ],
    "keywords": [
      "HTTP",
      "status",
      "エラー"
    ]
  },
  {
    "rule_id": "AU-REST-004",
    "title": "認証だけでなくデータ認可を適用する",
    "source_id": "AU-SRC-004",
    "section": "Enforce and test access controls",
    "applicability": "認証/Endpoint ACL/GlideRecordSecure等。認証済みだけで全データ参照可能としない",
    "asset_types": [
      "scripted_rest_resource"
    ],
    "api_terms": [
      "GlideRecordSecure"
    ],
    "keywords": [
      "認証",
      "認可",
      "authentication",
      "authorization"
    ]
  },
  {
    "rule_id": "AU-REST-005",
    "title": "書込系操作には読取より厳しい認可を設ける",
    "source_id": "AU-SRC-004",
    "section": "Enforce and test access controls",
    "applicability": "メソッドごとのACLとスクリプト内認可を比較。単純にロール名の数だけで強弱を決めない",
    "asset_types": [
      "scripted_rest_resource"
    ],
    "api_terms": [],
    "keywords": [
      "ACL",
      "書込",
      "write"
    ]
  },
  {
    "rule_id": "AU-REST-006",
    "title": "応答・本文・ヘッダー・認証の反復可能なテストを用意",
    "source_id": "AU-SRC-004",
    "section": "Build tests to verify functionality",
    "applicability": "テスト成果物を確認。Update Setにテストがないだけで未実施とは断定しない",
    "asset_types": [
      "scripted_rest_resource"
    ],
    "api_terms": [],
    "keywords": [
      "テスト",
      "test",
      "response",
      "認証"
    ]
  },
  {
    "rule_id": "AU-QRY-001",
    "title": "addQueryの文字列包含演算子はCONTAINSを使う",
    "source_id": "AU-SRC-005",
    "section": "Available JavaScript operators（CONTAINS行）",
    "applicability": "`addQuery(field, 'LIKE', value)`のみ候補化。encoded queryの`LIKE`はこの規則で禁止しない",
    "asset_types": [
      "business_rule",
      "script_include",
      "scripted_rest_resource",
      "server_script"
    ],
    "api_terms": [
      "addQuery"
    ],
    "keywords": [
      "LIKE",
      "CONTAINS",
      "演算子"
    ]
  },
  {
    "rule_id": "AU-QRY-002",
    "title": "全文検索の利用前提となる索引設定を確認",
    "source_id": "AU-SRC-005",
    "section": "Return records from a table that include a string（Note）",
    "applicability": "`addQuery('123TEXTQUERY321', …)` と encoded query（`addEncodedQuery('123TEXTQUERY321=…')` 等）の両方。対象テーブルの索引設定が見えなければ未確認。通常の包含検索とは別",
    "asset_types": [
      "business_rule",
      "script_include",
      "scripted_rest_resource",
      "server_script"
    ],
    "api_terms": [],
    "keywords": [
      "123TEXTQUERY321",
      "全文",
      "索引",
      "index"
    ]
  }
];

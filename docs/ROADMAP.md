# ServiceNow MCP — 開発ロードマップ

このドキュメントは、現在の利用実績・調査を踏まえて検討中の機能拡張をまとめたものです。

---

## 優先度サマリー

汎用性の高い機能（全ユーザーが恩恵を受けるもの）を優先します。

| # | 機能 | 汎用性 | 優先度 | 難易度 | ステータス |
|---|---|---|---|---|---|
| 1 | `describe_table` ツール | 全員 | ⭐⭐⭐ 高 | 低 | ✅ 完了 |
| 2 | Streamable HTTP 対応 | 全員 | ⭐⭐⭐ 高 | 高 | 未着手 |
| 3 | サービスアカウント権限チェックツール | 全員 | ⭐⭐⭐ 高 | 低 | 未着手 |
| 4 | Integration ヘルスチェックツール | Integration 利用者 | ⭐⭐ 中 | 低 | 未着手 |
| 5 | 自然言語クエリ強化（テーブル名自動解決） | 全員 | ⭐⭐ 中 | 高 | 未着手 |
| 6 | USEM 専用ツールセット | SecOps 担当者 | ⭐ 低 | 中 | 未着手 |
| 7 | `queryRecords` に `sysparm_display_value` 対応 | 全員 | ⭐⭐ 中 | 低 | 未着手 |

---

## 1. `describe_table` ツール

### 背景

カスタムテーブルや USEM 系テーブルを調査する際、AI が `sys_dictionary` を手動クエリする必要があり調査コストが高い。`describe_table` があれば AI が未知のテーブルを自律的に探索できる。

### 実装概要

**追加ツール:** `describe_table`

```typescript
// 入力
{
  table: string;               // テーブル名 (例: 'sn_vul_vulnerable_item')
  include_inherited?: boolean; // 親テーブルのフィールドも含めるか（デフォルト: false）
}

// 出力
{
  table: string;
  label: string;
  parent_table?: string;
  fields: Array<{
    element: string;       // フィールド名
    column_label: string;  // 表示名
    type: string;          // internal_type
    reference?: string;    // 参照先テーブル名
    mandatory: boolean;
    unique: boolean;
  }>;
}
```

**実装ファイル:** `src/tools/core.ts` に追加

**クエリ:**
```
sys_dictionary WHERE name = '{table}' AND internal_type != 'collection'
```

**Tier:** Tier 0（読み取り専用）

**アノテーション:** `readOnlyHint: true, idempotentHint: true`

---

## 2. USEM 専用ツールセット

### 背景

Unified Security Exposure Management（USEM）は Vulnerability Response の後継として普及しているが、現在の 376 ツールに USEM 専用ツールが存在しない。主要テーブルは `sn_vul_` プレフィックス配下に存在することを PDI 調査で確認済み。

### 主要テーブル（PDI 確認済み）

| テーブル | 説明 |
|---|---|
| `sn_vul_vulnerable_item` | Vulnerable Item（VI）|
| `sn_vul_remediation_task` | Remediation Task（RT）|
| `sn_vul_entry` | 脆弱性定義（CVE 等）|
| `sn_vul_nvd_entry` | NVD エントリ |
| `sn_vul_m2m_vul_group_item` | VI ↔ RT の多対多 |
| `sn_vul_third_party_entry` | サードパーティ脆弱性 |
| `sn_vul_integration_run` | 統合実行履歴 |

### 実装概要

**新規ファイル:** `src/tools/usem.ts`

**ツール一覧（読み取り系）:**

```typescript
list_vulnerable_items    // VI 一覧（state・risk_score・cmdb_ci でフィルタ）
get_vulnerable_item      // VI 詳細（sys_id or number）
list_remediation_tasks   // RT 一覧（state・assignment_group でフィルタ）
get_remediation_task     // RT 詳細
list_nvd_entries         // NVD エントリ一覧（CVE ID・スコアでフィルタ）
get_nvd_entry_by_cve     // CVE ID で NVD エントリを取得
get_usem_dashboard       // VI 件数・RT 進捗・高リスク上位をまとめたサマリー
```

**ツール一覧（書き込み系、WRITE_ENABLED 必須）:**

```typescript
create_remediation_task      // RT を新規作成し VI を紐付け
update_remediation_task      // RT の state・担当者・期日を更新
add_vi_to_remediation_task   // VI を既存 RT に追加（sn_vul_m2m_vul_group_item）
```

**必要ロール:** `sn_vul.read`（読み取り）、`sn_vul.write`（書き込み）

---

## 3. Integration ヘルスチェックツール

### 背景

NVD 統合が 503/429 エラーで静かに失敗し続け、CVE データが更新されない問題が発生した。AI が能動的に統合状況を監視・報告できると早期発見につながる。

### 実装概要

**追加ツール:** `get_integration_health`（`src/tools/core.ts` に追加）

```typescript
// 入力
{
  days?: number;    // 過去 N 日分を確認（デフォルト: 7）
  source?: string;  // 'NVD' | 'Qualys' | 'Tenable' 等でフィルタ（省略時は全件）
}

// 出力
{
  summary: {
    total_runs: number;
    success: number;
    failed: number;
    last_success?: string;
    last_failure?: string;
  };
  recent_runs: Array<{
    source: string;
    substate: string;      // 'success' | 'failed'
    start_datetime: string;
    end_datetime: string;
    vi_created: number;
    vi_updated: number;
    notes: string;         // エラーメッセージを含む
  }>;
  alerts: string[];        // 要注意事項のリスト
}
```

**Tier:** Tier 0 / **アノテーション:** `readOnlyHint: true, idempotentHint: true`

---

## 4. サービスアカウント権限チェックツール

### 背景

`sys_script_fix`・`sn_vul_vulnerable_item` などへのアクセス時に「User Not Authorized」エラーが多発した。事前に権限を確認できれば無駄なリトライを省ける。

### 実装概要

**追加ツール:** `check_table_access`（`src/tools/core.ts` に追加）

```typescript
// 入力
{
  tables: string[];  // 確認したいテーブル名のリスト（最大 20）
}

// 出力
{
  results: Array<{
    table: string;
    readable: boolean;
    writable: boolean;
    error?: string;
  }>;
  current_roles: string[];  // サービスアカウントの保有ロール
}
```

**実装方法:** 対象テーブルに `sysparm_limit=1` でリクエストを投げ、200/403/404 で判定。

**Tier:** Tier 0

---

## 5. Streamable HTTP 対応

### 背景

現在は stdio transport のみ対応。Streamable HTTP に対応することで以下が実現する：

- Claude.ai Web UI からブラウザ経由で直接接続
- Docker コンテナを MCP サーバーとして直接公開
- 複数 AI クライアントが同一サーバーインスタンスを共有
- CI/CD パイプラインからの呼び出し

### 実装概要

**MCP SDK バージョン要件:** `@modelcontextprotocol/sdk` >= 1.0.0（現行 1.29.0 で対応済み）

**新規ファイル:** `src/server-http.ts`

**環境変数:**
```
MCP_TRANSPORT=http   # 'stdio'（デフォルト）または 'http'
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=0.0.0.0
```

**Claude Desktop 設定例（HTTP 接続時）:**
```json
{
  "mcpServers": {
    "servicenow": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**依存パッケージ追加:** `express`、`@types/express`

---

## 6. 自然言語クエリ強化（テーブル名自動解決）

### 背景

`query_records` はテーブル名・フィールド名を正確に指定する必要がある。自然な指示から自動的にクエリを構築できると AI の自律性が高まる。

### 実装概要

**追加ツール:** `smart_query`

```typescript
// 入力
{
  description: string;  // 例: "先月の P1 インシデントで未解決のもの"
  limit?: number;
}
```

**内部処理フロー:**

1. キーワードから `sys_db_object` で候補テーブルを検索
2. 候補テーブルの `sys_dictionary` からフィールド一覧取得
3. 条件に対応するフィールド・値を推論して encoded query を構築
4. `query_records` を内部呼び出し

**Tier:** Tier 0

---

## 7. `queryRecords` に `sysparm_display_value` 対応

### 背景

`describe_table` の `include_inherited` 実装で、親テーブル名を解決するために `sys_db_object` を2回クエリしている。`sysparm_display_value=true` を付ければ `super_class.display_value` に親テーブル名が返るため、1回のクエリで解決できる。また他のツールでも reference フィールドの表示名取得に活用できる。

### 実装概要

**変更ファイル:** `src/servicenow/types.ts`、`src/servicenow/client.ts`

```typescript
// QueryRecordsParams に追加
interface QueryRecordsParams {
  // ...既存フィールド...
  display_value?: boolean | 'all'; // sysparm_display_value
}
```

```typescript
// client.ts queryRecords 内に追加
if (params.display_value !== undefined) {
  queryParams.set('sysparm_display_value', String(params.display_value));
}
```

**`describe_table` への適用:**
`sys_db_object` クエリに `display_value: true` を追加し、`super_class.display_value` から直接親テーブル名を取得。2回目の `sys_db_object` クエリを廃止。

**注意点:** `display_value=true` は全 reference フィールドのレスポンス形式を `{value, display_value, link}` に変える。既存ツールへの影響を `opt-in`（呼び出し側が明示的に指定）にすることで回避。

---

## 実装フェーズ

```
フェーズ 1（短期・1〜2週間）： 汎用・低難易度
  #1 describe_table ✅
  #3 check_table_access
  #4 get_integration_health
  #7 queryRecords display_value 対応

フェーズ 2（中期・1ヶ月）： 汎用・高難易度
  #2 Streamable HTTP 対応
  #5 自然言語クエリ強化

フェーズ 3（長期）： 特定ユーザー向け
  #6 USEM ツールセット
```

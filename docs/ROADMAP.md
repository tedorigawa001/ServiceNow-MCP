# ServiceNow MCP — 開発ロードマップ

このドキュメントは、現在の利用実績・調査を踏まえて検討中の機能拡張をまとめたものです。

---

## 優先度サマリー

汎用性の高い機能（全ユーザーが恩恵を受けるもの）を優先します。

| # | 機能 | 汎用性 | 優先度 | 難易度 | ステータス |
|---|---|---|---|---|---|
| 1 | `describe_table` ツール | 全員 | ⭐⭐⭐ 高 | 低 | ✅ 完了 |
| 2 | Streamable HTTP 対応 | 全員 | ⭐⭐⭐ 高 | 高 | 未着手 |
| 3 | サービスアカウント権限チェックツール | 全員 | ⭐⭐⭐ 高 | 低 | ✅ 完了 |
| 4 | Integration ヘルスチェックツール | Integration 利用者 | ⭐⭐ 中 | 低 | ✅ 完了 |
| 5 | 自然言語クエリ強化（テーブル名自動解決） | 全員 | ⭐⭐ 中 | 高 | 未着手 |
| 6 | USEM 専用ツールセット | SecOps 担当者 | ⭐ 低 | 中 | ✅ 完了 |
| 7 | `queryRecords` に `sysparm_display_value` 対応 | 全員 | ⭐⭐ 中 | 低 | ✅ 完了 |

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

## 2. USEM 専用ツールセット ✅ 完了

> 実装メモ: 新規 `src/tools/usem.ts`（10 ツール）。読み取り 7 / 書き込み 3。
> ルーターへ登録し、`secops_analyst` パッケージ（security + USEM + integration health）も追加。
> 全テーブル・フィールドを実 PDI(dev400464) で検証済み。重要な実機知見:
> - RT の人間可読キーは `number` ではなく **`task_number`**、NVD の CVE キーは **`id`**。
> - VI/RT の state 選択肢は共通: 1=Open, 2=Under Investigation, 10=Awaiting Implementation,
>   11=In Review, 12=Deferred, 101=Resolved, 3=Closed。
> - VI↔RT の m2m は `sn_vul_m2m_vul_group_item`（ラベル "Remediation Task Item"）で、
>   列は `sn_vul_vulnerability`（グループ）/`sn_vul_vulnerable_item`。ROADMAP 当初想定の
>   「VI↔RT 直接 m2m」ではなく、グループ(`sn_vul_vulnerability`)経由だったため
>   `add_vi_to_remediation_task` の引数を `remediation_group`/`vulnerable_item` に調整。
> - ダッシュボードは Aggregate(stats) API で state 別件数を厳密集計（`queryRecords` の
>   `count` はページ長のため不可）。read 系をライブ確認（VI 4件/全 Closed・NVD フィルタ・
>   display_value 解決）。テストは `tests/tools/usem.test.ts`（39 ケース）。
>
> 追加実装（環境設定ルール操作）: `src/tools/usem-config.ts`（5 ツール）。`rule_type`
> レジストリ方式で 6 種のルールテーブルを単一ツール群で操作:
>   - assignment → `sn_vul_vgr_assignment_rule`（name/active なし）
>   - remediation_task → `sn_sec_rem_task_rule`（修復タスクルール / key: rule_name）
>   - remediation_target → `sn_sec_wf_ttr_rule`（TTR 期日 / key: name）
>   - approval → `sn_vul_cmn_approval_rule`、auto_close → `sn_vul_cmn_auto_close_rule`、
>     exclusion → `sn_vul_cmn_auto_exclusion_rule`
>   ツール: `list/get_usem_rule`, `create/update_usem_rule`, `set_usem_rule_active`
>   （write 系は WRITE_ENABLED 必須 = 管理者操作）。read をライブ確認（TTR 3件・
>   auto_close 3件を order 順取得）。テストは `tests/tools/usem-config.test.ts`（24 ケース）。
>
> 追加実装（integration 操作）: `src/tools/usem-integration.ts`（6 ツール）。
> `get_integration_health`（サマリ）を詳細一覧・ドリルダウン・ログ診断・有効化操作で補完:
>   - `list_integrations` → `sn_sec_int_integration`（フィードカタログ NVD/CSAF 等）
>   - `list_integration_implementations` → `sn_sec_int_impl`（active/既定/検証状態を持つ運用単位）
>   - `list_integration_runs` → `sn_vul_integration_run`（source/state/substate/days フィルタ）
>   - `get_integration_run`（VINTRUN番号 or sys_id で perf メトリクス含む 1件）
>   - `list_integration_logs` → `sn_vul_integration_log`（run 紐付け・type/category で障害診断）
>   - `set_integration_active`（`sn_sec_int_impl` の active トグル / WRITE_ENABLED 必須）
>   実機知見: active フラグは catalog ではなく **impl(`sn_sec_int_impl`)** 側。run の source は
>   "NVD" 等の文字列、番号は VINTRUNxxxx。days は gs.daysAgo allowlist で安全注入。
>   read をライブ確認（NVD/CSAF カタログ・active 実装・NVD ラン・1件詳細）。
>   テストは `tests/tools/usem-integration.test.ts`（30 ケース）。
>
> 追加実装（VI/RT の SLA(TTR) + 通知）: `src/tools/usem-sla.ts`（4 ツール）。
> 実機知見（重要・継承の訂正）: `sn_vul_vulnerable_item` と `sn_vul_remediation_task`
> は `task` を**拡張していない**が、**`sn_vul_vulnerability`（Vulnerability Group /
> sys_class ラベル "Remediation Task"・番号 VUL）は `task` を拡張している**。よって
> グループは `task_sla`（`get_sla_details`）が適用可能。一方 VI/RT/VG いずれも TTR
> フィールド（`ttr_status`/`ttr_target_date`/`ttr_applied_rule`）を持つので SLA 表示は TTR で統一。
> `record_type` は **vi / rt / vg** の 3 種対応。VG はデモデータ 20 件で
> past_due・残日数算出をライブ検証（VUL0000103 = breached, days_to_target -1920）。
> 関連して `usem.ts` に `list_vulnerability_groups` / `get_vulnerability_group` を追加。
>
> グループ操作の拡充: `usem.ts` に `create_vulnerability_group` /
> `update_vulnerability_group`（state 遷移・再割当、WRITE_ENABLED 必須）を追加（計 14 ツール）。
> `usem-sla.ts` に `get_group_sla`（VUL番号 or sys_id から **TTR と task_sla の両ビュー**を返す。
> グループは task ベースのため task_sla 連携可）を追加（計 5 ツール）。
> 実機検証: `get_group_sla`(VUL0000103 = TTR Target Missed/breached/days -5、task_sla 0件・
> 当インスタンスは contract_sla 未設定)をライブ確認。
> write 権限付与後にラウンドトリップをライブ検証(create→update→get_group_sla→delete、残留0件):
>   - `create_vulnerability_group` ✅(VUL0010005/0010006 を作成）
>   - `update_vulnerability_group` ✅ 非 state フィールド（short_description / ttr_target_date /
>     assignment_group）。**ただし `state` フィールドは ACL で書込不可（INSUFFICIENT_PRIVILEGES）**
>     ＝グループの state は VR 修復ワークフローが制御し直接 PATCH を許さない仕様。
>   - **重要挙動**: 作成/更新後に VR 業務ルール（グルーピング/アサインメント/TTR）が
>     short_description・assignment_group・ttr_target_date を非同期で再計算する（入力値が
>     上書きされうる）。ツールは正常で、これはプラットフォーム仕様。`delete` ✅。
>
> 追加実装（state 遷移 = 承認ワークフロー）: `src/tools/usem-approval.ts`（2 ツール）。
> 実機検証で **Table API の直接フィールド書き込みでは state を動かせない**ことを確定
> （`state` は ACL 拒否、VI の `ignore_reason`/`ignore_date` は受理されるが業務ルールで
> 即時リバート）。Table API で確実に state 遷移を駆動できるのは **承認
> （`sysapproval_approver`）** のみ。
>   - `list_vr_approvals`（VR 由来クラスの承認を IN フィルタで抽出。既定 state=requested、
>     source_table で 1 クラス限定可）
>   - `act_on_vr_approval`（approve/reject で `sysapproval_approver.state` を更新し
>     ワークフローを進行 → 対象 VR レコードを遷移。reject はコメント必須 / WRITE_ENABLED 必須）
>   承認アクション自体は既存の `approve_request`/`reject_request`/`get_my_approvals` でも可。
>   **リンク構造の実機知見**: VR 例外承認は `sysapproval` を埋めず、`source_table`
>   （= `sn_sec_exception_change_approval`）+ `document_id`（Change Approval）で紐づき、
>   `approval_source` に最終 VR クラス（`sn_vul_vulnerability`）が入る。よってフィルタは
>   `source_table` ベース（当初の `sysapproval.sys_class_name` では 0 件になる不具合を修正）。
>   Exception Request 起票後にフル・ラウンドトリップをライブ検証:
>   `list_vr_approvals`（requested 50 件・CA0010005・approval_source=sn_vul_vulnerability）
>   → `act_on_vr_approval` approve（state→approved）→ requested へ復元（残留なし）。
>   テストは `tests/tools/usem-approval.test.ts`（13 ケース）。
>   - `list_remediation_sla`（record_type=vi|rt、ttr_status/breached_only/due_within_days
>     /assignment_group で絞り込み、target_date 昇順）
>   - `get_remediation_sla`（番号 or sys_id、breach 判定・残日数を算出）
>   - `set_remediation_commitment`（vi→`remediation_commitment_dt_tm` / rt→`ttr_target_date`
>     を設定 / WRITE_ENABLED 必須）
>   - `list_vr_notifications`（`sysevent_email_action` を VR テーブル群 sn_vul_*/sn_sec_*
>     にスコープした発見補助。定義の作成/更新は既存 create/update_notification を使用）
>   TTR 状態値: no_target/in_flight/approaching/past_due(=違反)/target_met。未来日付は
>   `gs.daysAgo(-N)`（allowlist 済み）で安全注入。read をライブ確認（VI TTR 一覧・
>   no_target フィルタ・SLA 判定・VR 通知30件）。テストは `tests/tools/usem-sla.test.ts`
>   （29 ケース）。

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

## 3. Integration ヘルスチェックツール ✅ 完了

> 実装メモ: `get_integration_health`（`src/tools/core.ts`）。`sn_vul_integration_run` を
> `start_datetime>=gs.daysAgo(N)`（allowlist 済み）で照会し、success/failed 件数・
> 最終成功/失敗時刻・直近ラン・アラートを返す。**ランが0件の「サイレント停止」も検知**
> （NVD 等の 503/429 無音失敗の早期発見が主目的）。Vulnerability Response 未導入の
> インスタンスでは friendly な NOT_FOUND を返す。実 PDI(dev400464) で NVD 9成功/2失敗・
> Qualys 0件の3挙動を確認。

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

## 4. サービスアカウント権限チェックツール ✅ 完了

### 背景

`sys_script_fix`・`sn_vul_vulnerable_item` などへのアクセス時に「User Not Authorized」エラーが多発した。事前に権限を確認できれば無駄なリトライを省ける。

### 実装概要

**追加ツール:** `check_table_access`（`src/tools/core.ts`）

```typescript
// 入力
{
  tables: string[];      // 確認したいテーブル名のリスト（最大 20）
  check_write?: boolean; // 書き込み判定も行うか（デフォルト true）
}

// 出力
{
  current_user?: string;       // 接続中アカウントのユーザー名
  current_roles: string[];     // 直接付与されたロール
  roles_error?: string;        // ロール解決に失敗した場合のみ
  results: Array<{
    table: string;
    readable: boolean;
    writable: boolean | null;  // check_write=false / 判定不能時は null
    error?: string;
  }>;
  summary: string;
}
```

**判定方法:**
- **read**: `sysparm_limit=1` の GET で 200=readable / 403=denied
- **write**: 予約済みの全ゼロ sys_id への空 PATCH（**非破壊**）で 404=writable / 403=denied
- **roles**: `gs.getUserID()`（クエリ allowlist 済み）で現ユーザーを解決し `sys_user_has_role` を取得

**Tier:** Tier 0（read アノテーション。write 判定もレコードを生成・変更しない）

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

**注意点:** `display_value=true` は全 reference フィールドのレスポンス形式を `{display_value, link}` に変える。既存ツールへの影響を `opt-in`（呼び出し側が明示的に指定）にすることで回避。`'all'` 指定時は `{value, display_value, link}`。

**実装メモ:** `query_records` ツールにも `display_value` を公開。値は `'true' | 'all'` の2モードのみに制約（クエリパラメータ・インジェクション防止）。実 PDI(dev400464) で raw / true / all の3挙動を確認済み。

**`describe_table` 最適化は見送り（ROADMAP の前提が誤り）:**
当初は「`super_class.display_value` から親テーブル名を取得し2回目のクエリを廃止」と想定していたが、実機検証の結果 `super_class.display_value` は親テーブルの**ラベル**（例: `"Task"`）を返し、`sys_dictionary` クエリに必要な**テーブル名**（例: `"task"`）ではないことが判明。`describe_table` の2クエリ方式は維持。
（一括取得したい場合は `sysparm_fields=super_class.name` のドットウォークが代替案。display_value とは別件のため未対応。）

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

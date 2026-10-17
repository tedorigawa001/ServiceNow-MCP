# Security Center — 調査結果と読み取り専用API設計

Status: **保留（ユーザー判断、2026-10-17）／設計案・未実装**

新規Endpoint ACL作成に管理者作業が必要なため、導入のハードルを考慮して保留。
追加調査・実装・PDI操作は進めず、ユーザーから明示的な再開指示があった場合に再検討する。
以下の設計・バックログは将来の候補であり、実施予定や再開の承認を意味しない。

最小PoCは専用スコープ作成まで進んだが、新規Endpoint ACL作成の権限不足で停止。
取得可否は未確認。[実測と再開手順](SECURITY_CENTER_POC_2026-10-17.md)を参照。

対象: `dev441827.service-now.com`、Security Center **3.2.3**、scope `sn_vsc`。
初期の標準経路調査では認証と読み取りのみ実施。その後の承認済みPoCで
専用スコープ `x_mcp_sc_poc` を作成し、再開用としてPDIに残している。
標準ACL・テーブル公開設定の変更、スキャン、スコア再計算、Data Broker実行、
API登録、ロール付与は実施していない。スコア取得の可否は未確認。

## 1. 標準経路の追加調査

### 結論

**今回確認した公式資料とPDIの参照可能なAPI定義では、Security Centerの
ハーデニング／Customer Actions向けの外部連携用公開REST APIを確認できなかった。**
全バージョンでAPIが存在しないという断定ではない。製品の内部APIやUIの
Data Brokerが存在することと、外部連携向けにサポートされた契約があることは別。
将来、公式の対応APIが確認できた場合はそちらを優先する。

| 調査経路 | 結果・判断 |
|---|---|
| Table API | 下記主要テーブルの照会は `User Not Authorized`。`ws_access=false` も確認。公開設定は変更しない |
| Scripted REST定義 | `sys_ws_definition` の `sn_vsc` スコープ、namespaceの `vsc`、関連名称を検索したが候補0件 |
| RESTリソース定義 | 同スコープの `sys_ws_operation` は参照可能な候補0件 |
| 対照確認 | 他スコープのREST定義は取得できた。ただしSecurity Center定義の完全な可視性は保証しない |
| UIデータ取得定義 | `sys_ux_data_broker` にスコープ内のサーバースクリプト型Data Brokerが存在 |
| Script Include | `sn_vsc.CustomerActionUtils` 等は存在するが、確認した候補は `client_callable=false`。公開REST APIとは扱わない |
| 公式資料 | Security Centerの画面機能と汎用REST開発手段は確認。対象機能の公開エンドポイント契約は未確認 |

SOAP、JSONv2、CSV/XMLエクスポート、REST Explorer、汎用スクリプト実行などを、
Table APIでの参照拒否を回避する代替経路として利用しない。
非公開のGraphQL/Data Broker実行経路を推測して呼び出すこともしない。

### UI定義で確認できた読み取りロジック

以下はメタデータを読んだ結果であり、Data Broker自体は実行していない。
標準実装のソースを複製せず、対応フィールドの根拠としてのみ使用する。

| Data Broker名 | 確認した参照元／処理 |
|---|---|
| Get Score For Date Selected | `sn_vsc_hardening_compliance_scores` の `harc_collected` / `harc_score` |
| SC Get Summary Score Details | 同テーブルの評価日順のスコア比較。内部の比較用Script Includeも使用 |
| Get the largest impact score non-compliant setting | `sn_vsc_instance_hardening_settings` の `compliance_status=non-compliant`、`score_impact` 降順 |
| Get Customer action count | `sn_critical_update` の `up_active`、`up_update_status`、`up_update_priority` |

特にCustomer Actionsの標準BrokerはSC管理者ロールを満たさない場合も
件数0を返す実装だった。**独自APIでは権限不足を0件に変換せず403にする。**
また、`access=public` のScript Includeは外部匿名アクセス可能という意味ではない。

## 2. 実テーブルとフィールド

主要5テーブルはいずれも `read_access=true`、`ws_access=false`。
前者だけでクロススコープから読めるとは断定できず、実行時の制約は後述のPoCで確認する。

| 用途 | テーブル | 確認できた主な列 |
|---|---|---|
| ハーデニング設定 | `sn_vsc_instance_hardening_settings` | `harc_name`, `compliance_status`, `risk_score`, `score_impact`, `excluded_checks`, `func_impact`, `func_description`, `check`, `security_check_category`, `harc_baseline_version`, `sys_updated_on` |
| スコア履歴 | `sn_vsc_hardening_compliance_scores` | `harc_score`, `harc_collected`, `harc_compliant` |
| 評価結果 | `sn_vsc_hardening_baseline_result` | `passed`, `scan_check_execution`, `configuration_number`, `u_vconf_number`, `sys_updated_on` |
| セキュリティイベント | `sn_vsc_event` | `sys_class_name`, `user`, `user_name`, `sys_created_on` |
| セキュリティタスク | `sn_vsc_security_task` | `type`, `due_status`, `source_table`, `source_record`, `details`。継承元の列は別途確認 |
| Customer Actions | `sn_critical_update` | `up_name`, `up_active`, `up_update_status`, `up_update_priority`, `up_due_date`, `up_summary`, `up_details`, `up_supported_app`, `sys_updated_on` |

注意点:

- `harc_compliant` の辞書ラベルは **Non-Compliant Settings**。
  列名だけで意味を推測せず、件数指標には初期段階では使用しない。
- ハーデニング設定の今回の英語choice定義は `compliant` / `non-compliant`。
  受容済みリスクの実際の表現と除外チェックの意味は未検証。
  未知値を準拠・非準拠のどちらかへ勝手に変換しない。
- Customer Actionsの状態値は `open`, `work_in_progress`, `ready_ack`, `acknowledged`。
  期限区分は `not_due_soon`, `due_soon`, `overdue`。表示ラベルと生値を区別する。
- `sys_updated_on` はレコード更新時刻であり、評価実行時刻とは限らない。
- 実際の設定値・推奨値・ドキュメントURL・優先度の対応列は追加確認が必要。
  `sys_properties` の任意値取得で補完しない。

## 3. 採用する取得方式（案）

顧客管理の専用アプリスコープに、認証・認可付き **Scripted REST API** を作る。
標準 `sn_vsc` アプリ内への独自コード追加、標準ACLの緩和、`ws_access` の変更はしない。

ServiceNow公式のScripted RESTガイドに従い、GETは業務データを変更せず、
呼び出し元の権限で `GlideRecordSecure` を使用する。フィールドの `canRead()` も
確認し、読めないフィールドを表示値やドットウォークで間接取得しない。
標準の内部Script Includeを呼び出すアダプターにはしない。

これは「公開禁止テーブルの汎用プロキシ」ではなく、管理者が導入・承認する
限定的な新規公開契約である。製品・ライセンス・クロススコープの制約により
許可されない場合は中止し、標準APIの追加提供をベンダーに確認する。

### 認証・認可

- 既存OAuthクライアント認証に対応。専用の最小権限連携ユーザーを推奨。
- サービス／各リソースで認証を必須とし、REST Endpoint ACLを必須にする。
  エンドポイントACLを空にせず、既定の広い内部ユーザーロールだけに依存しない。
- 業務リソースはGETのみ登録し、POST/PUT/PATCH/DELETEは405等で拒否されることを検証する。
  OAuthトークン取得のPOSTはこの業務APIの読み取り専用制約とは別に扱う。
- 専用ロール `<app_scope>.reader` を全リソースで要求。
  標準ロールを専用ロールに自動継承させず、必要な権限は管理者が別途判断する。
- ハーデニング・イベントはSC viewer/adminを追加条件とする案。
  Customer Actionsは標準UI Brokerに合わせSC adminを追加条件とする案。
  このロール条件を満たしても、標準のレコード／フィールドACLを必ず適用する。
- ACLロール関連でviewer/admin等の存在は確認したが、条件・スクリプト・継承ACLを
  含めた完全な認可判定は未検証。ロール名だけで取得成功を保証しない。
- 昇格、代理実行、SYSTEM実行、通常のGlideRecordへのフォールバックは禁止。
- `Cache-Control: no-store`。トークン、レスポンス全文、個人情報をログへ残さない。

## 4. API・MCPツール契約案

APIベースパス案: `/api/<app_scope>/security_center/v1`。
`<app_scope>` は導入時に確定する顧客所有スコープ。パスは未登録。
MCPは同一インスタンス内の固定パスのみ呼び、任意URLは受け取らない。

| 順序 | GETリソース | MCPツール名案 | 内容 |
|---|---|---|---|
| 1 | `/capabilities` | `get_security_center_capabilities` | API版、製品版、機能別の利用可能状態・理由 |
| 1 | `/hardening/score` | `get_security_center_score` | 最新スコア、評価日時。欠損を0点にしない |
| 1 | `/hardening/settings` | `list_security_center_hardening` | 状態・名前で絞る設定一覧 |
| 2 | `/customer-actions` | `list_security_center_customer_actions` | 未完了／期限区分、期限、概要 |
| 3 | `/events` | `list_security_center_events` | 期間・許可イベント種別で絞るイベント |
| 3 | `/security-tasks` | `list_security_center_tasks` | 対応タスク。継承列・choice確認後に確定 |

SIRインシデントは既存 `get_security_incident` / `list_security_incidents` を利用する。
SCイベント／タスク／Customer ActionsとSIRを同じ「インシデント」として統合しない。

### 入出力制限

- 許可する入力は各リソース固有のenum、名前検索、UTC期間、`limit`、ページカーソルのみ。
  JSON Schemaは `additionalProperties: false`、サーバーでも未知キーを拒否する。
- 任意のテーブル名・フィールド名・encoded query・`javascript:`・スクリプトは受け付けない。
  自由入力は型と長さを制限し、固定列に `addQuery` 等で条件を構築する。
- `limit` は整数1–100（既定20）。イベントは既定24時間、最大31日。
  タイムゾーンを省略した日時、不正な日付、逆転期間は400。
- `sys_id` と日時による安定したkeysetページング。カーソルは不透明な形式でも
  未信頼入力として検証し、条件・認可コンテキストと結び付ける。生queryを含めない。
- 出力は固定allowlist。プロパティの生値、スクリプト、認証情報、journalは出さない。
  HTML概要はプレーンテキスト化・長さ制限。イベントのユーザー名/IP等は初期版では除外する。
- AIは名称・説明を未信頼データとして扱う。取得内容から自動で操作を発火させない。

### 状態・鮮度・集計の扱い

各レスポンスは `schema_version`, `retrieved_at`, `source_table`, `status`,
`records`, `returned_count`, `has_more`, `next_cursor`, `warnings` を基本とする。
スコアには `assessed_at` を付け、設定の更新時刻とは区別する。

- `available` / `forbidden` / `unsupported` / `unknown` を区別する。
  認証失敗401、権限不足403、サービス障害5xxを空配列へ変換しない。
  404だけでプラグイン未導入とは断定しない。
- 読める0件は「この呼び出し元に可視なレコード0件」。全体で問題なしとは判定しない。
  `visibility_scope: caller_acl` を明示する。
- 必須列がACLで読めなければ403。任意列は省略理由を返し、実データの有無は漏らさない。
- `returned_count` はページ件数。全件集計と混同せず、初期版では全体件数を返さない。
  ACLを無視したGlideAggregateで件数を補完しない。
- 評価日時不明は `assessed_at: null`、鮮度不明とする。照会時刻を評価日時に置換しない。
  古い評価には警告を出す。自動再評価は行わない。
- スコアに含まれる受容済みリスクは、意味を実機検証してから別指標として追加する。
  100点でも事故がないという保証にはしない。

## 5. 実装前ゲートと段階的バックログ

1. **SC-1: 最小PoC** — ユーザー承認後、専用スコープで1件取得を検証する。
   `GlideRecordSecure`、クロススコープ制約、通常のOAuthユーザー、標準ACLを維持したまま
   取得できるか確認。できなければ公開範囲を広げず、制約と代替案を報告する。
2. **SC-2: 権限テスト** — 未認証、readerなし、readerのみ、viewer+reader、
   admin+reader、フィールド制限あり、で取得可否を確認。テスト用ユーザー作成・ロール付与は別途承認。
3. **SC-3: 初期実装** — capabilities、スコア、ハーデニング一覧。
   MCP tier 0の読取専用とし、`WRITE_ENABLED` / `SCRIPTING_ENABLED` を要求しない。
   APIは利用者が別途導入する。MCP起動時の自動デプロイはしない。
4. **SC-4: Customer Actions** — 状態・期限・権限を確認して一覧追加。
   `up_condition` の評価や `up_processed` 更新、完了処理を呼び出さない。
5. **SC-5: イベント／タスク** — イベント派生列、継承列、保持期間、PIIを追加検証して拡張。
6. **SC-6: 品質・文書** — ユニット／契約テスト、承認済みPDI E2E、導入・権限手順、
   AI利用例、既知の制限、アップグレード時の互換性チェック。

受入テストには、query注入・未知キー・上限超過・不正カーソル、空データ・未知choice、
権限拒否・フィールド拒否、古いスコア・部分失敗、対象インスタンス取り違え、
レスポンス/ログへの機密情報漏れを含める。
GETの前後で対象業務データが変更されないことと、スキャン／再計算が起動しないことも確認する。
認証・アクセスログ自体の記録は読み取りAPIでも通常発生し得る。

### 現時点の未確認事項

- 新規スコープからの取得と、OAuthユーザーに対する実際のACL判定。
- 標準APIのサポート範囲について、ベンダー確認は未実施。
- 受容済みリスク、実設定値/推奨値、優先度、イベント派生列の正確なマッピング。
- Customer Actionsの可視性条件と、SIRの空結果がデータなし/行ACLのどちらか。
- 本番導入時のライセンス、データ共有承認、レート制限と監査要件。

## 6. 公式資料

- [REST API reference](https://www.servicenow.com/docs/r/api-reference/rest-apis/api-rest.html)
- [Security hardening](https://www.servicenow.com/docs/r/platform-security/security-center/sc-hardening.html)
- [Scripted REST APIs good practices](https://www.servicenow.com/docs/r/yokohama/api-reference/rest-api-explorer/scripted-rest-good-practices.html?contentId=sSsmmNsXcCLQObofusMplA)
- [GlideRecord vs GlideRecordSecure](https://developer.servicenow.com/blog.do?p=/post/gliderecord-vs-gliderecordsecure/)
- [UI Builder API](https://www.servicenow.com/docs/r/api-reference/ui-builder-api-reference/apiAPI.html)

公式資料のリリースとPDIのプラットフォームファミリーが一致するとは限らない。
この文書のテーブル・列・choiceの根拠は、上記PDIでのメタデータ実測を優先している。

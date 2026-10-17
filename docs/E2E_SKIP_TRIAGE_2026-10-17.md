# 残存E2Eスキップ13件の実機切り分け（2026-10-17）

後続対応: **VAカテゴリー・PAジョブ・ATF結果を修正し、対象実機E2E5件が成功**。元の13件中3件が解消、未対応10件。全体E2Eは未再実行。詳細は [修正・検証記録](E2E_VA_PA_ATF_2026-10-17.md) を参照。以下は修正前の診断記録。

## 結論

対象は `dev441827.service-now.com`。直前の全体E2E結果は227件中214成功・13スキップ・0失敗。本調査ではコード修正や全体E2Eの再実行はしておらず、スキップ解消を報告するものではない。

| 主因の分類 | テスト件数 | 判定 |
| --- | ---: | --- |
| 実装の参照テーブル／スキーマ不一致 | 8 | 対象の旧参照は不在だが、対応する機能の実テーブルを直接読み取り可能 |
| 製品コアプラグイン非アクティブ | 4 | HRSD 2件、CSM 2件。`v_plugin` の正確なID照会で確認 |
| 製品未導入の可能性が高い | 1 | DevOps。テーブル群・スコープ・プラグイン登録が不在。ただし非アクティブという状態値は取得できず |
| **合計** | **13** | HR文書テンプレートには下記の追加バージョン制約もある |

8件すべてを「バージョン差」とは断定しない。PA・ATF・VAなどの正しい参照は過去リリースの公式資料にも記載されている。一方、Mobileのモデル移行やHR文書テンプレートの廃止・置換には、実際にリリース差の考慮が必要。

## 調査方法と制約

- 現在のOAuth認証で `sys_db_object`、`sys_dictionary`、`sys_scope`、`v_plugin` を照会し、候補テーブルにもTable APIで直接GETした。書き込み、スクリプト実行、プラグイン導入・有効化はしていない。
- スキップ判定に使われる18種類のテーブルはすべて、直接GETでも `INVALID_REQUEST` / `Invalid table ...`。単なる空データや読み取りACL拒否とは区別した。
- 代替候補12テーブルはすべて直接読み取り可能。`limit=1` で11テーブルはレコードを取得でき、ATF結果だけ0件だった。件数は全体件数ではない。
- `sys_plugins` と `sys_store_app` は読み取り権限不足。これを未導入の証拠には使わず、読める `v_plugin` を正確なIDで照会した。
- ビルド用プロパティ・統計情報・プラットフォームのアップグレード履歴から、PDIのリリースファミリーを確定できなかった。アプリのバージョンからプラットフォームのバージョンを推測していない。
- スキップはテスト単位。複数ツールをまとめたテストでは、最初のテーブル不在により後続操作も未実行になる。候補テーブルのGET成功は、既存ツール全体の正常動作を意味しない。

## 実装側の参照・モデル不一致：8件

| 対象（各1件） | 現在の参照 | 実機で読める候補／必要な対応 |
| --- | --- | --- |
| PAジョブ | `pa_job` | `sysauto_pa`（Scheduled Data Collection）。継承元 `sysauto` に `name` / `active` / `run_type` / `run_time` / `run_period` が存在。現在の取得列・戻り値の `schedule` も見直す |
| スケジュールジョブ履歴 | `sysauto_trigger_log` | `sys_scheduler_job_history` は存在するが、集計テレメトリーであり同義ではない。現行の `sysauto` / `status` / `run_time` / `error_message` を保持した単純置換は不可 |
| ATF結果 | `sys_atf_result` | `sys_atf_test_result`。スイート結果の参照は `parent` → `sys_atf_test_suite_result`。現行の `test_suite_result` 条件、`message` 取得も修正が必要。実機の列は `output` / `message_reference` など |
| Workspace | `sys_aw_workspace` | 従来型は `sys_aw_master_config`。Configurable Workspace側の `sys_ux_page_registry` も存在。双方のモデルを整理し、`table` / `icon` 等を一律に仮定しない |
| VAカテゴリー | `sys_cs_category` | `sys_cb_topic_category`。実機に `name` / `description` / `visible` があるが、`active` はない。テーブル変更と同時にactiveフィルターを見直す |
| サブフロー | `sys_hub_subflow` | `sys_hub_flow` の `type=subflow`。この条件で実レコードを取得し、raw値も `subflow` と確認。一覧だけでなく詳細の型確認、作成・有効化も同じモデルにそろえる |
| Process Automation | `pa_process` | `sys_pd_process_definition`。Process Automation Designerスコープも導入済み。表示名の `label` と内部名の `name`、状態列などを照合する |
| Mobile | `sys_sg_mobile_app_config` / `sys_sg_mobile_applet` / `sys_sg_mobile_layout` | `sys_sg_mobile_application` / `sys_sg_screen` / `sys_sg_applet_launcher` / `sys_sg_screen_m2m_ui_element` は存在。旧3参照との1対1置換はできず、アプリ・画面・ランチャー・UI要素ごとの契約を再設計する |

公式資料による照合:

- PA: [Scheduled Data Collection (`sysauto_pa`)](https://www.servicenow.com/docs/r/now-intelligence/performance-analytics/r_PADU-copyJob_String_String.html)。[Washington DC版API資料](https://www.servicenow.com/docs/r/washingtondc/api-reference/server-api-reference/c_PADomainUtils.html)にも同モデルがある。
- ジョブ履歴: [Scheduled Jobs Dashboard](https://www.servicenow.com/docs/r/ja-JP/platform-administration/scheduled-jobs-dashboard.html) は件数・所要時間・遅延などの集計を説明している。個々のジョブ成功／失敗履歴とは分ける必要がある。
- ATF: [結果の自動クリーンアップ](https://www.servicenow.com/docs/r/application-development/automated-test-framework-atf/atf-edit-table-cleanup.html) に `sys_atf_test_result` が記載される。
- Workspace: [Agent WorkspaceからSOWへの検索設定移行](https://www.servicenow.com/docs/r/zurich/it-service-management/service-operations-workspace/search-config-migration-itsm-aw-sow.html) に従来型の `sys_aw_master_config` が記載される。
- VA: [Washington DC版の導入コンポーネント](https://www.servicenow.com/docs/r/washingtondc/servicenow-platform/virtual-agent/installed-wth-virtual-agent.html) に `sys_cb_topic_category` が記載される。
- サブフロー: [Fluent Flow API](https://www.servicenow.com/docs/r/application-development/servicenow-sdk/fluent-flow-api.html) は定義の保存先を `sys_hub_flow` としている。
- Process Automation: [PDAutomationProvider API](https://www.servicenow.com/docs/r/ja-JP/api-reference/server-api-reference/PDAutomationProviderBothAPI.html) に `sys_pd_process_definition` が記載される。
- Mobile: [Mobile Application設定](https://www.servicenow.com/docs/r/mobile/mobile-platform/universal-linking-enable.html) と [Mobileモデル移行](https://www.servicenow.com/docs/r/zurich/mobile/sg-mobile-migration-ny.html) を参照。実機の `sys_sg*` は175テーブルあり、Mobile全体の未導入ではない。`labelLIKELayout` の該当テーブルは0件。分析・オフライン同期・Push等の別参照まで本調査で正しいと確認したわけではない。

実装箇所は `src/tools/performance.ts`、`reporting.ts`、`atf.ts`、`workspace.ts`、`va.ts`、`flow.ts`、`mobile.ts`。E2Eは `itom-tables.e2e.test.ts`（1件）、`platform-config.e2e.test.ts`（2件）、`catalog-portal.e2e.test.ts`（2件）、`optional-plugins.e2e.test.ts`（3件）。

## 製品側の前提不足：5件

| 製品 | テスト件数 | 実機の根拠 | 判定と残る確認 |
| --- | ---: | --- | --- |
| HRSD | 2 | `v_plugin`: `com.sn_hr_core` / Human Resources Scoped App: Core / `active=inactive` / version `19.0.0`。`sn_hr_core*` テーブルと対応スコープなし | コア非アクティブ確定。HRケースの参照名自体は正しいが、文書テンプレートの追加制約あり |
| CSM | 2 | `v_plugin`: `com.sn_customerservice` / Customer Service / `active=inactive` / version `29.0.20`。CSMテーブル群と対応スコープなし | コア非アクティブ確定。`sn_customerservice_case` / `customer_account` / `customer_contact` は公式の標準参照 |
| DevOps | 1 | `sn_devops*` テーブル・対応スコープなし。正確なID `com.sn_devops` / `sn_devops` / `com.sn_devops_chgvlcty` の `v_plugin` 照会はいずれも0行 | 未導入の可能性が高い。ただしカタログに出ないことはinactive状態の証明ではない。導入後も `sn_devops_deploy_task` の適合性を追加確認する |

HRSDの前提は [HR Utils API](https://www.servicenow.com/docs/r/api-reference/server-api-reference/hr_UtilsAPI.html)、CSMは [Customer Serviceの有効化](https://www.servicenow.com/docs/r/customer-service-management/t_ActivateCustomerService.html) と [標準テーブル](https://www.servicenow.com/docs/r/customer-service-management/csm-cust-access-mgmt-tables.html)、DevOpsのIDは [プラグイン一覧](https://www.servicenow.com/docs/r/zurich/platform-administration/list-of-plugins.html) で照合した。`sn_devops_pipeline` は [DevOps Test Tool Integration](https://www.servicenow.com/docs/r/it-service-management/devops-change-velocity/dev-ops-test-tool-integration.html) に記載されるが、これだけで `sn_devops_deploy_task` まで正しいとは判断しない。

### HR文書テンプレートには実際のバージョン差がある

HR一覧テストはケース・サービス・`sn_hr_core_document_template` を一括で必須にする。旧HR Document Templatesは [Xanaduで新規有効化時に非表示](https://www.servicenow.com/docs/r/xanadu/employee-service-management/hr-service-delivery/c_HRDocumentTemplates.html)となり、[Australiaでは非推奨・新規有効化非対応、Document Templatesへの移行](https://www.servicenow.com/docs/r/employee-service-management/hr-service-delivery/migration-hrdt-dt.html)が案内されている。移行先の `sn_doc_template` は別モデルであり、無条件のテーブル名置換はしない。

したがってHRコアを導入しても、現状の一括ゲートではHR一覧テストが残る可能性がある。ケース・サービス・文書テンプレートを独立したテスト／機能判定に分割し、実機バージョンと文書製品の対応範囲を確認する。この追加制約を上表の件数に重複加算していない。

## 推奨する対応順

1. **VAカテゴリー・PAジョブ・ATF結果**: 実テーブルと辞書に基づき、読み取り先、フィルター、戻り値を修正。モックの期待値だけでなく実機E2Eで検証する。
2. **サブフロー・Process Automation**: 型の判別と、関連する詳細・作成・更新・有効化も整合させる。正常なFlowをSubflowとして扱わないテストを追加する。
3. **Workspace**: 従来型とConfigurable Workspaceの対応範囲を決める。
4. **ジョブ履歴・Mobile**: 単なるリネームではなくAPI契約を先に整理する。集計に存在しないエラー／状態や、架空のレイアウト表を返さない。
5. **HRSD・CSM・DevOps**: ユーザーが導入する製品・プラグインを選択した後に再検証。HR文書とDevOpsデプロイ先は別途スキーマ確認する。権限・ライセンス・導入可否を確認せず自動有効化しない。

テスト側も「テーブル不在＝プラグイン不足」と一律に扱わない。既知のコア／導入済み製品の標準参照が不正な場合は失敗にし、未導入製品、バージョン非対応、空データ、権限不足を分ける。本調査では分類を記録しただけで、ゲートや実装は変更していない。

# 参照テーブル／モデル修正後の全体実機E2E（2026-10-17）

## 結論

ソース `170fa9c`、`dev441827.service-now.com` に対する全体実機E2Eで、**18ファイル・252件中247成功／5スキップ／0失敗**。終了コード0、597.55秒。スキップのテスト名集合を想定の5件とプログラムで照合し、一致した。verboseの理由も照合し、**追加のデータ不足・スケジューラー待ち・フラグ無効によるスキップは0件**。

今回の検証範囲では、新たなテスト失敗・想定外スキップは見つからなかった。これは全ツール・全バージョン・全機能に不具合がないことを保証するものではない。

## 実行条件

- 開始: 2026-10-17 11:19:59 JST。
- コマンド: `vitest run -c vitest.e2e.config.ts --reporter=verbose --reporter=json`。名前フィルターなし、18ファイルを直列実行。
- `RUN_E2E`, `WRITE_ENABLED`, `SCRIPTING_ENABLED`, `CMDB_WRITE_ENABLED`, `NOW_ASSIST_ENABLED`, `USEM_E2E_FIXTURES`, `E2E_READ_FIXTURES` はすべて `true`。`ATF_ENABLED=false`（ATF自体を起動する試験は含めない）。
- 実行前にターゲットが上記PDIであることを確認。OAuth設定は既存ローカルMCP設定からメモリ内で渡し、秘密値を引数や記録へ出力していない。
- 前回と同じダミーデータ条件。完了・非アクティブの監査、一時作成直後に無効化する手動型インジケーター、USEMのダミー値等を使用。既存の標準ACL・Business Rule・プロパティ・プラグインを変更していない。
- JSON: `/tmp/servicenow-e2e-full-after-fixes-2026-10-17-1792203599759.json`（一時ファイル）。
- verboseログ: `/tmp/servicenow-e2e-full-after-fixes-2026-10-17-1792203599759.log`（一時ファイル）。

## 残るスキップ：想定の5件のみ

すべて `tests/e2e/optional-plugins.e2e.test.ts`。理由は `table not on this instance`。

| 製品 | テスト | 不在の参照テーブル |
| --- | --- | --- |
| HRSD | lists HR cases, services and document templates | `sn_hr_core_case`, `sn_hr_core_service`, `sn_hr_core_document_template` |
| HRSD | fetches a single HR case when one exists | `sn_hr_core_case` |
| CSM | lists CSM cases, accounts and contacts | `sn_customerservice_case`, `customer_account`, `customer_contact` |
| CSM | fetches a single CSM case when one exists | `sn_customerservice_case` |
| DevOps | lists pipelines, deployments and insights | `sn_devops_pipeline`, `sn_devops_deploy_task` |

前回の [実機切り分け](E2E_SKIP_TRIAGE_2026-10-17.md) でHRSD/CSMはコアプラグイン非アクティブを確認済み。DevOpsはテーブル群・スコープ・プラグイン登録の不在から未導入の可能性が高いが、inactive状態を取得できたわけではない。今回プラグインカタログを再調査したのではなく、不在テーブルによる同じ5件のスキップを再確認した。

## ファイル別結果

| ファイル（tests/e2e/） | 成功 | スキップ |
| --- | ---: | ---: |
| catalog-portal.e2e.test.ts | 23 | 0 |
| common-tables.e2e.test.ts | 9 | 0 |
| core-tables.e2e.test.ts | 9 | 0 |
| excel-import-set.e2e.test.ts | 1 | 0 |
| grc-tables.e2e.test.ts | 8 | 0 |
| integration-tables.e2e.test.ts | 13 | 0 |
| itom-tables.e2e.test.ts | 25 | 0 |
| now-assist-read.e2e.test.ts | 2 | 0 |
| optional-plugins.e2e.test.ts | 26 | 5 |
| platform-config.e2e.test.ts | 33 | 0 |
| script-tables.e2e.test.ts | 13 | 0 |
| smart-query.e2e.test.ts | 3 | 0 |
| store-read.e2e.test.ts | 3 | 0 |
| updateset-sca.e2e.test.ts | 1 | 0 |
| usem-config-read.e2e.test.ts | 37 | 0 |
| usem-read.e2e.test.ts | 17 | 0 |
| vr-tables.e2e.test.ts | 7 | 0 |
| write-operations.e2e.test.ts | 17 | 0 |
| **合計** | **247** | **5** |

前回全体の227件・214成功・13スキップと比較すると、独立した検証25件の追加と、参照／モデル課題8件の対応により、252件・247成功・5スキップとなった（`214 + 25 + 8 = 247`）。ただし下記の契約変更・未対応を成功機能と取り違えない。

## 後処理の追加確認

テスト内のcleanupに加え、全体終了後にverboseログ中の削除対象sys_idを抽出し、Table APIで再照会した。

- 削除リクエスト56回、重複を除く **55レコード／30テーブルで残存0件**。USEM fixture16件、読み取りfixture14件、Excelの3成果物、書き込み系の一時レコード・ジョブ等を含む。
- USEMと読み取りfixtureはテスト内でも削除後のsys_id不在確認が通った。
- 個別のcatchで削除エラーを握りつぶす既存試験についても、ログに現れた削除対象は終了後の照会で不在だった。ただし作成された全副作用レコードの網羅検証ではない。
- 今回のVRスキャン `131378288348531880355160ceaad3d3` は終了後に読み取り、`state=canceled` を確認。VRのクロススコープ削除制約によりスキャン自体は削除していない。2件のCIリンクはテスト中に確認済みで、外部スキャナーへの開始は要求していない。
- 監査履歴・システムログ・すべての派生レコードまで消去したという意味ではない。追加照会は読み取り専用で、後処理確認のために追加の削除や状態変更はしていない。

## 回帰・ビルドと残る制約

- 通常テストの再実行: **65ファイル・1,822件成功**。
- `npm run build`: 成功。
- `git diff --check`: 成功。今回、製品コード・テストコードは変更していない。

今回の成功には以下の契約・境界を含む。

- ジョブ履歴は分類／時間帯別の **集計履歴**。個別ジョブの成功／失敗ログ取得は未対応。
- Workspaceは **従来型のメタデータ**。Configurable Workspaceの完全なプロビジョニングではない。
- Mobileはアプリ定義・画面・画面/UI要素リンクの読み取り等。8件中1件は利用分析の未対応エラー確認であり、通知配信・オフライン設定・利用分析を実装できたという意味ではない。
- Flow/Subflow・Workspace・Mobileの新しい作成payload等は単体検証であり、今回それらのメタデータを実機へ新規作成していない。
- Now Assistはメタデータ読み取り、SCAは既存Update Setのメタデータ照合（外部脆弱性照会なし）。生成AI呼び出しや全OSS検出パターンを実機検証したわけではない。
- HR文書テンプレートの新旧モデル差とDevOpsデプロイ表の適合性は、製品導入後に別途確認が必要。

各修正の詳細は [VA・PA・ATF](E2E_VA_PA_ATF_2026-10-17.md)、[Flow・PAD](E2E_FLOW_PAD_2026-10-17.md)、[Workspace](E2E_WORKSPACE_2026-10-17.md)、[ジョブ集計](E2E_JOB_HISTORY_2026-10-17.md)、[Mobile](E2E_MOBILE_2026-10-17.md) を参照。

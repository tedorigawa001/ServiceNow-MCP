# Legacy Workspace修正と実機E2E（2026-10-17）

## 結果と対応範囲

`dev441827.service-now.com` に読み取り専用で実行し、**5件成功・0失敗・対象内スキップ0件**、終了コード0、16.41秒を確認した。元のWorkspaceスキップ1件が解消。前回までと合わせ、元の13件中6件解消・未対応7件となった。全体E2Eは未再実行であり、新しい全体成功件数／スキップ件数は未実測。

今回修正した4ツールは **従来型Agent Workspaceのメタデータ管理**。Configurable Workspaceの一覧・作成・リストモデルを実装したものではない。従来の「configurable workspace」という説明が実装モデルと一致していなかったため、ツール説明と `docs/TOOLS.md` を訂正した。他のUI Builder／UXツール12件全体を今回の実機検証済みとはしていない。

## 原因・修正

| 対象 | 修正 |
| --- | --- |
| `list_workspaces` | 不在の `sys_aw_workspace` → `sys_aw_master_config`。実在する `name,description,workspace_url,active` 等を取得し、存在しない `table,icon` を除外 |
| `get_workspace` | 親を `sys_aw_master_config` から取得。`sys_aw_list.workspace` でリンクを取得し、条件列を `query` → `condition` に修正。最大50件 |
| `create_workspace` | `sys_aw_master_config` に `name,workspace_url,description,active=false` のメタデータだけを作るpayloadへ修正。旧 `table,icon` はschema/runtimeで拒否 |
| `configure_workspace_list` | 親がlegacy表で取得できることを確認してから `sys_aw_list` に作成。入力 `query` は `condition` に格納。既存リスト更新ではないことを明記 |

作成入力が `name,table` 必須から `name,workspace_url` 必須へ変わり、既定が非アクティブになるのは明示的な互換性変更。架空の列を黙って無視したり、リスト用テーブルをWorkspace本体へ書き込んだりしない。実機で作成して使えるUIまで構築できると保証したものではない。

実機の `sys_aw_list.workspace` 参照先は `sys_aw_master_config`。リストの実在列は `condition,columns,title,table,active`。Legacy定義は `Agent Workspace` 1件で非アクティブだった。したがって既定のactive-only一覧が空なのは正常であり、非アクティブを含む一覧・詳細を別テストとして必ず検証した。

Configurable Workspaceは別モデルである。[公式Workspace API](https://www.servicenow.com/docs/r/application-development/servicenow-sdk/fluent-workspace-api.html) はUX ApplicationやApp Configuration等にまたがるメタデータを説明し、[公式の対応メタデータ一覧](https://www.servicenow.com/docs/r/application-development/app-engine-studio/supported-features-metadata-custom-templates.html) はLegacy Workspaceを `sys_aw_master_config` として区別している。[CSMのリスト移行資料](https://www.servicenow.com/docs/r/xanadu/customer-service-management/migration-lists.html) もUX側の別リストモデルを示す。実機で `sys_ux_page_registry` の先頭には一般アプリもあり、全件をWorkspaceとして返す実装にはしていない。

## 実機E2E 5件

1. Legacy表の既定active-only一覧（空一覧も正当な成功）。
2. active-only解除による一覧とnative列の応答。
3. 既存Legacy定義の詳細と、返却リストのworkspace参照・condition・columns。
4. 実機辞書の列と `workspace` の参照先を照合。
5. 一般UXアプリのsys_idをLegacy Workspaceとして取得すると `NOT_FOUND`。

対象は `tests/e2e/catalog-portal.e2e.test.ts` の `Legacy Workspace metadata` グループ。データ不足なら詳細テストは理由付きskipとなるが、今回5件すべて実行・成功。名前フィルターによる **18 skipped** は対象外であり、機能前提不足によるスキップではない。

- 実行: `vitest run -c vitest.e2e.config.ts tests/e2e/catalog-portal.e2e.test.ts -t 'Legacy Workspace metadata' --reporter=verbose --reporter=json`。
- `RUN_E2E=true`。書き込み、スクリプト、CMDB書き込み、ATF、Now Assist、読み取りfixture、USEM fixtureは無効。
- OAuth設定は既存ローカルMCP設定からメモリ内で渡し、秘密値は出力していない。
- JSON: `/tmp/servicenow-e2e-workspace-2026-10-17.json`（一時ファイル）。5成功・0失敗・18対象外を照合。
- 実機への作成・更新・削除・有効化はしていない。作成payloadと親参照の事前確認は単体テストのみ。

## 回帰検証

一覧・詳細・作成・リスト設定それぞれで期待する表／列を先にテストし、旧実装の失敗を確認してから修正した。単体では旧引数拒否、親取得失敗時に作成しないこと、WRITE_ENABLEDガード、active-only解除、参照リテラルのサニタイズ、一覧取得失敗を空配列へ隠さないことも確認。

- 通常テスト: **65ファイル・1,794件成功**。Workspace単体32件 → 39件。
- `npm run build`: 成功。
- 変更した製品コード・単体テスト・E2EのESLint: **0 errors / 2 warnings**（既存 `no-explicit-any`）。
- `git diff --check`: 成功。

残る元スキップ7件はジョブ履歴・Mobileのモデル不一致2件、HRSD/CSM非アクティブ4件、DevOps未導入の可能性が高い1件。Configurable Workspaceの明示的な対応は別途設計が必要で、この7件とは別の製品機能課題。

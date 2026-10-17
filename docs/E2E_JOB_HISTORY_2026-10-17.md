# ジョブ集計履歴の修正と実機E2E（2026-10-17）

## 結果

`dev441827.service-now.com` で対象 **6件成功・0失敗・対象内スキップ0件**、終了コード0、3.85秒。元の不在テーブル参照によるスキップ1件は、正しい集計履歴契約のテストへ置き換えた。前回までと合わせ元の13件中7件を対応、未対応6件。全体E2Eは未再実行で、全体件数は未実測。

**個別ジョブの成功／失敗履歴を取得できるようになったという意味ではない。** 今回提供するのはスケジューラーの分類・時間帯別集計。個別実行結果ログは別の未対応機能として残る。

## 原因と契約変更

旧実装は不在の `sysauto_trigger_log` に `sysauto,status,run_time,error_message` があると仮定していた。実機の `sys_scheduler_job_history` は分類・集計期間・実行回数・平均／合計／最大処理時間・優先度などを持つが、旧4列を持たない。単なるテーブル名置換ではフィルターを無視した誤応答になり得る。

[公式Scheduled Jobs Dashboard資料](https://www.servicenow.com/docs/r/ja-JP/platform-administration/scheduled-jobs-dashboard.html) も、同表をジョブ分類ごとの集計・トレンドとして説明している。資料上の画面表示単位をraw整数にそのまま当てはめず、今回のツールはAPIのネイティブ値を返し、時間単位の変換は行っていない。

| 項目 | 修正 |
| --- | --- |
| ツール名 | `list_job_run_history` は維持するが、説明・応答に集計データであることを明示 |
| テーブル | `sys_scheduler_job_history` |
| フィルター | 新しい `job_classification` の等価条件。区切り文字をサニタイズし、空・不正型は拒否 |
| 旧入力 | `job_sys_id` / `status` とその他未知の引数をschema/runtimeで拒否。黙って削除しない |
| 件数制限 | `limit` は整数1–1000、既定25。schema/runtime双方で検証 |
| 並び順 | `time_range_end` の降順 |
| レコード | `sys_id,job_classification,time_range_start,time_range_end,count,average,total,max_duration,priority,sys_created_on` |
| 外側の応答 | `count,history` を残し、`source_table,data_kind,note` を追加 |

`data_kind=scheduler_aggregate`。外側の `count` は取得行数、各行の `count` はその集計の実行回数。これらを取り違えたり、集計レコードを個別の成功／失敗実行として報告したりしない。空応答から未実行と断定せず、保存期間・分類・現在の権限等の影響を考慮する。ジョブ分類名はジョブsys_idの代替IDではない。

## 実機E2E 6件

1. 一覧、集計メタデータ、native列、行数上限と集計期間終了時刻の降順。
2. 既存分類を使った等価フィルター（実レコードあり）。
3. 存在しない分類に `^ORcount>0` を含めても空結果のままで、範囲を拡張しない。
4. `job_sys_id` 拒否。
5. `status` 拒否。
6. 実機辞書で集計列8種類を照合し、空一覧だけで不正列を見逃さない。

4・5は実機設定を使ったE2Eプロセス内の入力ガード検証であり、API呼び出し前に拒否する。2はレコード不足なら理由付きskipになるが、今回は既存の分類で実行・成功した。

- 実行: `vitest run -c vitest.e2e.config.ts tests/e2e/platform-config.e2e.test.ts -t 'Scheduler aggregate history' --reporter=verbose --reporter=json`。
- JSON: `/tmp/servicenow-e2e-job-history-2026-10-17.json`（一時ファイル）。6成功・0失敗・27対象外を照合。27 skippedは名前フィルターによる対象外で、新規の前提不足ではない。
- `RUN_E2E=true`。書き込み・スクリプト・CMDB書き込み・ATF・Now Assist・読み取りfixture・USEM fixtureは無効化。
- OAuth設定は既存ローカルMCP設定からメモリ内で渡し、秘密値を出力していない。レコード作成・更新・削除、ジョブ起動、分類ルール変更はしていない。

## 回帰検証

正しい表・列・並び順・集計ラベル、旧フィルター拒否、新分類フィルター、limit／分類の不正値それぞれを旧実装で失敗させてから修正。未知引数の拒否、空応答、APIエラー伝播も単体検証した。

- 通常テスト: **65ファイル・1,810件成功**。Reporting単体41件 → 57件。
- `npm run build`: 成功。
- 変更した製品コード・単体テスト・E2EのESLint: **0 errors / 6 warnings**（既存 `no-explicit-any`）。
- `git diff --check`: 成功。

残る元スキップ6件はMobileのモデル不一致1件、HRSD/CSM非アクティブ4件、DevOps未導入の可能性が高い1件。個別ジョブ実行結果の取得とConfigurable Workspace対応は、この元スキップ件数とは別の機能課題。

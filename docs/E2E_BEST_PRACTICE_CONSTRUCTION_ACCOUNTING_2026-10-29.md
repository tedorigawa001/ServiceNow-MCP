# CM-04-01 同core constructor accounting 検証

Date: 2026-10-29。合成依存のみ。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 範囲

- canonical rootが同coreのaccountingを一度供給する。外部session／coreを登録・採用しない。
- CM-03 fresh factoryはreserve時に同継続へ委譲。C/G/Pの第二counterなし。生成時のclock観測なし。
- legacy利用開始、二重取得、callback再入、取消・close・期限、不正引数、低減capを拒否し、first primaryを保持する。
- readonly観測に権限を追加しない。releaseは費用を保持し一度だけ閉じる。

## 検証

初回の同core tracer追加後、供給口・factory委譲を実装。新規21件を含む境界試験とCM-03互換試験を実行した。

| 確認 | 結果 |
|---|---|
| 作業treeのbuild | 成功 |
| 全体lint | エラー0、既存警告374 |
| 今回のTS3ファイルのlint（切出しcopy） | エラー・警告0 |
| コミット対象のみのbuild | 成功 |
| コミット対象のみの全体合成 `vitest run --maxWorkers=3` | 192ファイル、5,804件成功、64.31秒 |
| 既存worker／adapterの単独再確認 `--maxWorkers=1` | 62件成功、失敗0 |
| compiled canonical／session／typed dispatch smoke | 成功。同coreのC/G参照・一度限り取得・releaseを含む |
| compiled native adapter smoke | NA-02／03成功 |
| offline pack | 405ファイル。必要artifact同梱、fixture非同梱、pure coreのruntime importなし |
| staged diff whitespace | 問題なし |

切出しcopyはGit indexの10ファイル＋HEADから作成し、依存だけ既存node_modulesを参照した。無関係な`.vscode/`・`CLAUDE.md`は含めない。結果追記は文書のみである。

### 初回全体実行の失敗を保持

作業treeの初回全体実行ではworker起動系の5秒timeout、起動flag未到達、その後の`review_busy`連鎖が発生し、stdio試験もskipになった。同時期はbuild・確認コマンドの応答も遅延した。今回の会計試験は成功しているが、これだけで環境負荷を根本原因と断定しない。切出しcopyの同じ全体コマンドは全件成功し、失敗したadapter／worker-lifecycleの単独62件も成功した。製品・試験の期限、worker数以外の設定、対象ソースは切分けのために変更していない。初回失敗を成功記録に置き換えず残す。

## 未実施

実sessionのnative選択、owner登録leaseとbootstrapの同一object検査、認証／親／releaseのprivate composition、正式body／payload／worker bindingは未接続。実通信・PDI操作・設定変更・本番cap・permit発行・Pushは行わない。

# 共通run owner・実session private lifecycleのfake I/O検証

日付：2026-10-27。対象：[詳細設計draft-0.3 §14](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md#14-実session-private-lifecycle接続fake-io検証)。

## 1. 範囲と実行境界

実際の`BoundedReadSession` classへprivate run ownerとreadonly予算leaseを接続し、注入fetch／fake Response・Stream／clockで検証した。PDI・実transportは使っていない。これは正式なscope証拠発行やAU-BR-006の公開有効化のE2Eではない。

- `src/servicenow/review-evidence-lifecycle.ts`：同sessionの一度限りの生成、private auth identity／ready世代、初回診断、lease参照の検査・停止。
- `src/servicenow/bounded-read.ts`：`#snapshot`／`#runOwner`／`#runLease`の所有、readyPromiseと停止／closeの通知、既存C/G/P／時計へのreadonly結合。
- 旧exportのmark／revoke-by-sessionを撤去。任意objectへ独立ownerを作っても、実sessionのownerを取得・置換する入口はない。同じ実sessionでの二度目の登録は終了後も拒否する。
- fixture台帳・合成issuerを実sessionへ登録する経路は追加しない。開発専用`abort-scope-evidence*`は引き続き非同梱。formal source claim／receipt／seal／permitを発行しない。

## 2. 合成検証

新規`tests/review/run-owner-lifecycle.test.ts`の25件：

| 観点 | 確認内容 |
|---|---|
| snapshot | caller側token書換えと内部copyを分離、`#snapshot`を外部へ返さない |
| ready世代 | per-user／OAuth交換、retry後も0→1だけ。重複・依存callback再入・失敗後の再通知を拒否 |
| 同期失効 | pending GETのabort listenerが動く前にownerがstopped／ready失効。遅いOAuth応答で復活しない |
| 失敗保持 | 認証失敗／401／403／取消の先行理由をclose・再読・run finallyで保持 |
| run claim | 同sessionの再登録、別snapshot／別leaseを拒否。失敗後も再生成・ready修復不可 |
| readonly lease | 元C/G/Pと開始時計を継続。公開stats／remainingMsの差替えはleaseの根拠にしない |
| 期限 | OAuthに9秒使っても残り51秒。hard期限を延長せず、phase cutoffとは区別 |
| 観測不整合 | 残時間増加・counter減少・負値・非有限値・例外を固定診断で拒否 |
| 秘密・権限 | 凍結summaryだけを返す。token／Error本文・内部identity／lease／発行権限を返さず、別のfake ownerから実runを失効できない |

梱包境界テストにも、旧mutation exportの不在・実sessionの二重登録拒否・ready世代／会計のreadonly確認を追加した。既存HTTP受信・OAuth retry・final予約の会計を新台帳へ切り替えず、枠の二重計上やcounter resetを行わない。

## 3. 開発中の失敗・切り分け

TDDの最初は`reviewRunStatus`未実装で1件失敗し、最小接続後に成功した。公開statsを差替えるとleaseまで0へ戻るテストが失敗したため、既存session内部の値を直接読む固定closureへ変更した。残時間の巻き戻りテストの失敗後に単調検査を追加し、ready再入テストの失敗後に依存処理より前のone-shot claim消費を追加した。

全体buildでは、新しい固定停止理由`internal_review_error`に対してfixtureの`Record<ReadFailureCode,true>`網羅表が不足しTS1360になった。理由の型網羅を維持して対応する1項目を追加した。これにより初回全体試験は2スイートがbeforeAllのbuildで開始失敗し、161ファイル・4,740件成功／27件未実行だった（当時の追加ケース数は19件）。この未実行を成功扱いせず、修正後に全体を再実行した。

## 4. 最終結果

- 新規lifecycle試験：25件成功。
- 全体合成テスト：`vitest run --maxWorkers=3`、163ファイル・4,775件成功、スキップ0件（58.24秒）。
- `npm run build`：成功。
- src／testsのESLint：エラー0件、既存warning 374件。
- offline cacheでの`tests/review/package-worker.mjs`：377ファイル、production-only install／解析／集約／梱包境界成功。実sessionのfake fetchだけを使い、外部通信は行わない。

## 5. 費目と未対応

owner／診断slot／readonly leaseは同sessionにつき各1。ready世代は最大1。ready通知のlease観測は最大1回、通常診断は最大3回、停止後の診断は最大1回。追加HTTP試行・受信chunk課金・payload課金・timerは0で、既存C/G/P・60秒・210試行と低減設定・final4試行予約を維持する。制御workや実allocationの上界を承認したものではない。

§13の独立合成source bindingを正式な実sourceへ昇格させていない。実`ReleasePermit`／不変release根拠／選択payload／worker job・E/R会計操作・typed cleanup・正式上位結果は未接続。cleanupが確認済みとは主張しない。snapshot失効は論理的な参照失効で、物理メモリ消去の証明ではない。public MCPの入力・結果schemaは変更していない。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry調査保留を維持。実transport・実機操作・トークン発行・設定変更・本番cap投入・permit発行・Pushは行っていない。

# WF-B (C-start)：先行診断owner・private borrow・開始claimの合成検証

Date: 2026-11-08 / 実装基準HEAD: `9b7ddb9` / [所有・停止契約と実装範囲](BEST_PRACTICE_WFB_SNAPSHOT_READ_LIFECYCLE_DESIGN.md)。

## 範囲と非接続境界

新規`tests/review/fixtures/snapshot-read-start-fake.ts`と`tests/review/snapshot-read-start.test.ts`。新合成root内の診断owner・結果保持slot・空custody・strict map／snapshot・private borrow・開始claimだけを実装した。既存のSourceMapDraft純粋値検査を利用するが、旧Supply／MapSupplySnapshot class、(A)／(B)の実装と旧試験は変更していない。

供給snapshotから(B)の読取kernelまで接続済みとはしない。snapshotConnection=identity_only、legacySupply=unchanged、readKernel／actualBudget／rowAggregation=not_connectedで、実budget・scratch・resource・read／hash・cleanup操作は作らない。開始準備のokは非実行状態への遷移だけで、hash一致・読取完了・cleanup確認・S／core権限ではない。

## 生成と一度限りの利用

- DiagnosticOwner、結果保持slot、cleanup custody固定1slotを、source生成・開始claimより先に確保する。custody確保故障はmap検査0／開始claim0／open0で拒否。owner故障時のscalar fallbackもsupply_invalidを保持する。実OOM故障の必着保証ではない。
- beginはunused→startingでclaim1回だけ。prepareは同owner／snapshot／setId／map／files／rows／先頭canonical file＋ordinal0／session origin／budget originを検査し、preparedへ進める。originは同一性用tokenで、実会計の取得・lease・費用配賦ではない。
- starting／preparedの再begin、preparedの再prepare、固定内部再入をduplicate_startとして拒否し、元準備もunwindingへ停止する。故障後の再呼出しは先行理由で拒否し、origin／borrowを再生成しない。terminal後の再開始はread_already_usedの非記録戻り値で、終端診断を上書きしない。
- finishは固定discardだけ。正常時は読取borrow・session／budget参照を退役し、readonly用snapshotは保持する。close要求時は先に停止を固定してborrow／snapshotを保持し、finishで借用退役後にsnapshotを退役する。resourceがないためcleanupDisposition=not_started、cleanup呼出し0のままである。

## 混入・故障と独立対照

固定内部scenarioで、別owner／同mapを持つ別snapshot／setId差、同値map wrapper／再decode、files／rows／file copy、元の検査前input、ordinal／session／budget差、同tupleのborrow copyを拒否した。元inputはその対照でのみ実際のpre-validation DATAを保持し、finishで参照を退役する。callerから任意の参照やcallbackを受け付ける口はない。

owner／結果slot／custody／source／strict map／snapshot生成前後、borrow生成前後、準備recordの各故障点を分け、開始claim・origin生成・発行borrowと退役のprefix計数を保持した。lifecycleFirst／readFirstをclose由来のreadStopで上書きせず、supplyFirstも別軸のまま残す。close前の未開始拒否と、準備中の停止診断supply_closedは区別する。

begin／prepareだけの全長0〜5、計63語を、別記述の状態遷移oracleと照合した。正常prefix／誤順序／重複／故障後停止に対し、claim・session／budget origin・borrow・identity検査・準備recordの回数と、finish後の発行borrow退役数が一致する。対象実装の状態関数・counterをimportして期待値を生成していない。

factoryの未知値・余分引数・Proxy／callback、begin／prepareへのcaller DATAをhook非実行で拒否した。出力は切離したfreeze済み診断だけで、source path／期待hash／raw例外／snapshot／borrow参照は返さない。readonly checkでclaimが増えず、終端後のcloseでも固定終端結果の再封印を行わない。

## 最終検証

| 確認 | 結果 |
|---|---|
| 新規開始準備＋既存供給 | 2ファイル、57件成功（新規35／既存22）、失敗0 |
| 関連合成回帰 | 17ファイル、1,327件成功、失敗0 |
| npm run build | 成功 |
| 新規fixture／testのstrict TypeScript | 成功 |
| 新規2ファイルのESLint | エラー・警告なし |
| 一時CommonJS compile＋Node単独実行 | claim・identity拒否・部分生成失敗・I/O0の固定assert成功 |
| npm pack --dry-run --ignore-scripts | 441ファイル、tests／docs／新開始fake・旧供給fake・B fakeの混入0 |

初回の新規33件＋既存22件は55件成功。元input保持とbegin／prepareの引数拒否を追加し、最終35件へ増補した。今回の試験・型／lint／build実行で失敗は観測していない。RED／GREENや変異試験を実施したという記録ではない。

関連対象はsnapshot-read-start／read-hash-capacity／read-hash-fake／read-ops-fake／source-map-supply／source-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-storeの各`tests/review/*.test.ts`。全repository回帰は未実施。梱包はdry-runだけでarchive生成・公開・依存導入は行っていない。期限・設定は変更していない。

## 残課題とUnknown

新SnapshotとBorrowはこの合成root内に閉じた内部型で、旧Supply classのborrowを採用した証拠ではない。先頭canonical fileのidentity対照は全fileのresource binding／walkではない。全file・行・候補への同一性継続、旧Supplyとの共通化境界、(B)との共通kernel・scratch・実budget・停止guard・追加guard上界は後続に残す。

本段階のclose／borrow退役はresourceなしの準備だけ。read中のclose、同bytes受理区間、hash後のpost停止、非空cleanup custodyへの未解決責務移譲、実resource解放未確認の扱いを検証したとはしない。空custodyの確保済みとcleanup責務保持済みは別である。

正規発行borrowの退役は最大1回。負対照のcopyもprivate参照を退役するが、正規counterに対照objectの生成／処理費を含めていない。全heap／CPU／native費・OOM・GC・物理ゼロ化・実時間内の必着はUnknown。preparationCountsは試行／発行計数であり、E／Sや実workの課金証拠ではない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、実期待値pin・実source照合・S発行・core接続・実接続・実通信・設定変更・Pushは行っていない。行hash集約も未実装。今回の変更は未コミット。

## コミット前の対象限定再検証

上記「未コミット」は記録作成時点の状態。今回の7ファイルだけをindexに登録し、そのindexを新しい一時作業ツリーへ展開した。既存node_modulesへの参照だけを加え、元の未登録変更・既存distを取り込まず、同候補上で再検証した。

- npm run build: 成功。
- 関連17ファイル: 1,327件成功、失敗0。
- 新規fixture／testのstrict TypeScriptとESLint: 成功。
- build後のnpm pack --dry-run --ignore-scripts: 441ファイル、tests／docs／新開始fake・旧供給fake・B fakeの混入0。

追記は検証結果だけで、検証済みの実装・試験を変更していない。全repository回帰は今回未実施。旧Supply／読取kernel・実budget・実resourceへの接続、実期待値pin・実source照合・S発行・core接続・実通信・設定変更・Pushは行っていない。

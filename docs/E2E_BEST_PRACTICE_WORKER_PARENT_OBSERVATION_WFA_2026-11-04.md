# WF-A：bounded親側観測・ready／finish独立対照

Date: 2026-11-04 / 実装開始HEAD: `1ffb8fe`。開始時の作業ツリーはclean。

[診断計画](BEST_PRACTICE_WORKER_READY_FINISH_DIAGNOSTIC_PLAN.md)のWF-Aだけを実装した。製品src・期限・vitest設定・正式発行口・全体受付は変更しない。Unknown・VM／監視／telemetry調査保留を維持し、seal成功・実接続・実サービス通信・設定変更・Push・commitは行っていない。

## 1 実装範囲と意味

- [親側journal](../tests/review/fixtures/parent-observation.ts)はcaseごとに固定4096slotを事前確保する。seq／case相対単調時刻／review／worker／request ordinalと固定event／phase／detail／codeだけを保存する。snapshotはその範囲のcopyで、元データを変更できない。
- [ReviewTestScope](../tests/review/fixtures/review-test-scope.ts)へ接続し、既存のtarget-selection・adapter hooksのlifecycle metaに`observation`を追加した。reviewは呼出しattempt、workerはfactory attempt（throwも含む）、requestはpost時の正のsafe integer IDへのordinalで、case内で一意。数値IDはworkerごとの内部対応表だけに保持し、snapshotへは出さない。別workerの同じIDを混同しない。
- review開始／終了、factory前／返却／throw、ready形message／reply観測、post試行／返却／throw、terminate試行／Promise終端／throw、OS exit、scope close前／後を分けた。postは元返値・元例外をそのまま返す。terminateも元Promiseを返し、観測のために新しい待ちや期限を導入しない。
- `reply_observed/matched`はIDが既知という意味だけ。bodyの検証・ok・schema・supervisorのstrict受理を証明しない。duplicate／unmatchedも観測上の分類。`ready_observed`もstrict受理ではない。`review_end/fulfilled`はPromiseの解決であり、失敗outcomeも含む。対応する固定codeを併記し、未知code・拒否例外は`other_fixed_code`へ畳み込む。
- raw message、入力／結果本文、URL、認証値、sys_id、任意の例外／stackは保存しない。object fieldはown data descriptorだけを読み、accessorを呼ばない。Proxy等による観測例外は測定不成立にする。

## 2 上限・失敗・終了処理

4096件までは記録し、次のeventでstickyな`measurement_incomplete=true / reason=capacity`にして以後の観測追加を止める。clock throw／非有限値／逆行は`clock`、観測処理の例外は`observer`。最初の理由を上書きせず、欠落を時刻0や成功としない。元のreview／postは継続し、観測不成立を製品の失敗に置き換えない。

review／worker／requestのordinal発行も各4096までで、上限後は0（対応不明）として新しい対応表を作らない。request対応表の総挿入数は共有request ordinalで上限化し、worker exit時にclearする。legacy worker履歴も4096件までで、超過は測定不成立。実際の未終了workerは別の所有mapで全て追跡し、観測上限を理由に終了責務を捨てない。exit後は所有mapから外してboundedな履歴だけを保持する。観測の枠は製品resource capや実行permitではない。

既存signal結合・元review Promiseの所有・取消・worker終了待ち・session／admission解放待ちを維持した。closeの失敗は握り潰さず、mock／時計は既存helperのfinallyで復元する。追加log出力／環境による有効化口／runtime friendは作っていない。JSのOOMやprocess停止からの復旧保証ではない。

## 3 独立合成対照

[新試験11件](../tests/review/worker-parent-observation.test.ts)と[専用worker](../tests/review/fixtures/wf-a-controlled-worker.mjs)を追加した。元のworker-supervisor・review-worker・通信protocolは変更しない。

- ready対照: 専用workerがtsx register／本体importより前に共有flagを立て、gateで停止する。flagは観測器とは独立。postが0・ready未観測であることを検査し、取消後のworker exit・元review終了と次reviewのadmission回復を確認した。
- finish対照: 専用bootstrapが本物のworker listenerを包み、finishを受信した直後、finalizeに入る前にflagを立てgateで停止する。analyzeのreplyとfinish postの相関を確認し、取消後の終了・回復を検査した。finalize内部の自然遅延を再現したという意味ではない。
- flag待ちはAtomicsの通知と元review終端・test取消を合流する。未到達は固定理由で失敗させ、任意sleepで到達扱いにしない。finallyで取消・gate／waiter解放・scope closeを行う。旧admissionの強制resetはしない。
- 元v2／v3の正常結果を同caseで順に得て、review1／2・worker1／2・request1〜4を固定期待表と比較する。raw IDの同値を別workerへ渡す純粋対照でも独立対応を確認した。
- 容量ちょうど／超過後もoperation継続、時計throw／逆行／NaN、snapshot copy、重複／未知／exit後reply、factory throw、postの元例外identity・元返値、accessor非実行／Proxy観測失敗、未知codeの非出力を確認した。

期待値は手書きの順序／相関表とworker内flagから得る。観測器のphase分類を期待値生成器へ流用しない。元のselection-timeoutにある実Vitest timeout・遅延terminate・mock／時計復元順・close失敗等の対照も維持した。新しい通常case・製品期限を延長していない。

## 4 実行結果と初回失敗

1. 最初に逐次review相関の回帰を追加し、未実装の`diagnostics().observation`がundefinedで1件失敗するREDを確認した。同接続後は1件成功。全追加caseについて個別にREDを実行したという記録ではない。
2. bounded journal等の純粋対照を追加した段階は7件成功。ready／finish接続と既存adapter／timeoutの組合せは69件成功。その後v2／v3・factory対照を追加し、関連6ファイル（新試験・selection-timeout・adapter・target-selection・worker-lifecycle・soft-deadline）160件が成功した。
3. 最終コードで`npm run build`成功。新しいTS3ファイルはES2022 target／ES2024,DOM lib・strict・noEmitでも確認し、型エラー0。これはrepoのtsconfig変更ではなく、Atomics.waitAsyncを含むtest-onlyコードの追加検査。
4. 変更したTS／mjs4ファイルのESLintは指摘0。
5. `bdo npx vitest run --reporter=json --outputFile=/private/tmp/sn-wfa-full.json`は**通常並列288ファイル／13,784件成功・失敗0・skip0**。既存localhost合成fixtureが使える条件で実行し、外部ServiceNowへ接続しない。JSONのSHA-256は`4d15724b45c7ab2a7da0b28f36a146e48ad0bb51b52b54b32a4f1515a1bb72a9`。target-selection／adapterの122caseは全て観測complete、最大44event、終了後pending=0・未終了worker=0だった。
6. `npm pack --dry-run --ignore-scripts --offline --json`の確認は441ファイル。新観測・scope・専用worker・testsの混入0。配布物・製品の新発行口は追加しない。

元の13,773件に新11件を追加した結果である。今回の全体成功は、過去の通常並列timeoutの修正・原因確定を示さない。一時JSONは観測のbytes識別であって正式証拠の発行権限ではなく、配布物・commit対象には含めない。

## 5 残課題

- WF-Bの自然失敗時の採取とH5a／H5bの切り分け。今回は全体回帰の新相関metaを取得したが、自然timeout自体は再現していない。
- 親のready／reply観測とstrict受理、worker内のregister／import／処理入口出口は未接続。専用port等による内部観測は別範囲。現行logだけでloaderやfinalize内部を原因としない。
- 観測対象はReviewTestScopeを使う経路に限定。範囲外のtimeout、stdio事前ビルドの60秒問題、AC-Cのatomic commit・seal成功・正常終端は未解消／未実装のまま。
- 4096slotの固定費と記録処理はテスト側の追加費用であり、製品work上界や本番capへ無根拠に内包しない。総work／heap・3round配賦等のUnknownを更新しない。

正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。実接続・実通信・設定変更・Pushは行わない。

## 6 コミット前の対象限定再検証

今回分8ファイルを明示選択し、未選択差分0・未追跡ファイル0であることを確認した。同じ作業ツリーでbuild→通常並列の全体試験→梱包dry-runを順に再実行し、build成功、288ファイル／13,784件成功・失敗0・skip0、梱包441ファイル／観測fixture・tests混入0を確認した。追加のsource・期限・設定変更はない。

再検証JSONは`/private/tmp/sn-wfa-commit-full.json`、SHA-256は`a4b53b2315575f2fb2cd60001299190fb7869a2b5b38daf9c3085ce06553f1a1`。本節の追記だけを同じ8ファイルの選択範囲へ反映する。保存済みの初回RED・実装時の結果・未解消事項は変更しない。

# AC-B 同bundle／record・live terminal bindingと非公開staged

Date: 2026-11-04。実装開始HEAD: `ebd2c0f`。[atomic commit準備・失敗時所有権設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ATOMIC_COMMIT_FAILURE_DESIGN.md)のAC-Bだけを合成依存限定で接続した。開始時の作業ツリーはクリーンで、AC-Aのレビュー補強済み44故障とinvalidated状態の試験を維持する。

## 1 固定継続と同kernelのterminal identity

新しいpackage-excludedのfresh入口`createSyntheticAtomicStagingRoot`は、引数なし`stageAtomicCommit`だけを固定継続とする。AC-A／FP3-A〜C・旧header／D2は維持し、外部bundle／terminal／record登録・caller mode・payload getter・汎用callback・runtime friendを追加しない。

同kernelのprivate NormalAcceptedChannelにissueTerminal／checkTerminalを接続する。同full projection受領物のlive再照合後だけ、同owner・元accepted・frame／source／cleanup／sink・ready origin・acceptedTermination object・cleanup serial=0を一度だけ結合する。発行claimは検査前に消費し、失効後も再armしない。kernelが保持する同object自体と全fieldを再照合し、同形copy・別originは受け付けない。

NormalTerminalBindingは生きた解放責務のidentityであって、source closed・cleanup confirmed・正常終端・absence証拠ではない。実session／worker／OSの終端証明も供給しない。同FailureOwner側のnew-generation sinkと一致することをroot側でも照合する。別のcleanup capsuleやresource holderを生成せず、既存local custodyの同resource slotと同capsuleへの対応だけを保持する。

## 2 同recordの組立とstaged境界

AC-Aの同準備claim・pre・workの後、AC-B側の一度限りclaimを消費する。元AtomicPreparationと同bundle／owner／shell・上記terminalをPreCommitBundleへ結合し、同空handle・同budget／binding serial・失効serial・同resource／capsuleをAtomicCommitRecordへ結合する。候補record・payload・terminal・preparationの元objectをprivate origin台帳に保持する。

work内で候補を照合し、同guard／budgetのpost停止を優先する。post通過後に元準備物と候補recordを再照合してから、同record objectを非公開staged slotへmoveする。standalone準備／準備中bundle・terminal／PreCommitBundle・候補record利用slotを外す。private originと元bundle台帳は固定照合用借用だけで、再発行権限を持たない。

staged側は同record内の元準備物・full bundle・同kernel terminal、元origin・同resource／local capsule・live source／ready／cleanupを照合する。preparing専用wrapperと、元準備物の共通binding検査を分離し、状態条件をcaller flagで外さない。検査を3段階（work候補／post後候補／staged）通った場合だけstaged履歴1となる。

直後に既存fixed_abortでfailedとなり全payloadを破棄する。staged履歴は過去の非公開準備であり、利用可能dest・公開handle・commit／seal成功ではない。inspectのsource_closed／cleanup_confirmedはfalse、commits／seals／publishedは0のまま。stage処理には固定検査があり、将来の非確保atomic commit sectionを実装したとは扱わない。

## 3 失敗診断・全破棄・費目

候補・terminalの部分確保、混入、失効・post停止は同first hard／phase診断へ進み、rootclaim・発行claimを戻さない。work失敗は固定理由だけを暫定保持してpost取消／期限を優先する。先行hardと正常後始末の区別は既存のまま。追加phaseはstagingだけで、raw例外・本文・handleは診断へ出さない。

rootのterminal／PreCommitBundle／候補record／staged record／origin台帳、元準備物とpayloadを全clearする。kernel内のterminal slotもclearNormalHeaderで外しpayloadPendingに含める。保護scope・一時借用が終了し、新slotを含むisClearedが成立した場合だけ本文破棄receiptと同上位custodyへ進む。clear漏れは拒否する。capsuleへ本文を隠さず、cleanup診断・未解決責務はUnknownのまま保持する。

追加費目はprivate terminal発行／保持・binding照合、PreCommitBundle／record／origin台帳の確保と同時保持、三段階検査・固定move／alias除去、失敗clear／custody確認。既存C/G/P・retry・210試行・全60秒・開始UTC／全deadline・局所bounded制約は変えない。全work／heap・copyピーク・3round配賦・必要予約／中断粒度はUnknownで、全体受付を有効化しない。

## 4 合成・compiled保証

- 新AC-Bは10 tests。reviewedゼロ／mixed、pre時点の候補0、post前の候補1・staged0、固定abort後のstaged履歴1と全slot不在を確認する。pre／post停止・throw／未知理由・swallowed再入、source／cleanup失効・混入引数・早い入口、秘密非出力、同budget／元期限、AC-A入口の非変更も確認する。新旧8 files／80 tests成功。
- strict TypeScriptの実graphを一時ESM treeへemitし、旧D2／FP-1／FP-2とFP3-A／B／C、レビュー補強済みAC-Aの44故障を維持する。新故障はtemporary emit copyだけへ入れ、fetch拒否・固定依存監査・配布除外を維持する。
- AC-Bの37故障分類：builder入口7、recordのtoken／owner／shell／handle／resource／capsule／budget／serial／失効9、元record／台帳／件数／失効5、同kernel issuer内のterminal全9field、別root実record1、stage直前3、staged直後のcopy／元slot残留／状態3。work故障はpost取消優先も確認し、照合到達点を区別する。
- terminal発行前・PreCommitBundle確保前・record確保前・origin台帳確保前の4例外で、部分生成数とpost期限優先・全破棄を確認する。同private issuerの二度目の発行は拒否する。staged到達後にhardが起きても履歴1／commit0と失敗診断を保持する。
- 完了直後のtemporary oracleは、同recordがstagedに一つだけありstandalone準備／候補／payload／terminal利用slotがないことを観測する。rootの5slot（terminal／PreCommitBundle／候補record／origin／staged record）とkernel terminalのclearをそれぞれ省く6対照で、本文破棄receipt／custody移譲が拒否される。
- handle／capsule／budgetの3結合条件を一つずつ除去し、recordとoriginを揃えて改変した故障oracleが失敗することを確認する。他のidentity拒否へ先に落ちただけのcaseをこの保証に含めない。

## 5 初回失敗・実行結果

- 初回の既存compiled保証とビルドは成功し、新旧8 files／80 testsも成功した。
- 新compiled fixture初回は、同期assertion callback内にawaitを置いた構文誤りでNodeの読込みが停止した。ESLintも同じ構文誤りを検出した。読み込みをcallback外で先にawaitするよう訂正し、製品側条件は変更していない。
- 訂正後のcompiled保証は旧試験とAC-Bの37故障・4部分確保例外・発行replay・6参照残留・3照合除去対照を含め成功した。対象4ファイルESLintは問題なし。
- 全体初回（`/private/tmp/servicenow-acb-vitest.json`）は287 files／13,770 tests中13,745成功・24失敗・1保留で非成功。既存CLI・legacy HTTP・親省略／prefix・target-selection・worker開発試験の5秒timeoutと、update-set-adapterのisError=trueの後続失敗、stdioの保留が出た。新AC-Bと関連80 testsは成功していた。初回の失敗をAC-Bの成功で相殺しない。
- 失敗／保留の既存9ファイルだけを同期限・同設定で再実行（`/private/tmp/servicenow-acb-retry-affected.json`）すると309 testsすべて成功、失敗・保留0だった。プロセス名／CPUだけの観測ではNodeとブラウザ等のCPU使用を見たが、失敗瞬間の負荷証拠ではなく原因を確定できない。標準範囲ではプロセス情報の読取が拒否されたため、読み取り専用の承認範囲で確認した。引数・資格情報は表示せず、他プロセス停止や環境設定変更はしていない。
- 初回は広範囲の時間依存失敗で、adapterの後続失敗も理由codeを保存していないためreview_busy等とは断定しない。ソースや製品／テスト期限・並列設定を変更せず、重い別検査を同時に走らせない条件で全体を再実行する。
- 通常設定の全体再実行（`/private/tmp/servicenow-acb-vitest-retry.json`）も13,729成功・40失敗・1保留で非成功。dom-client／followup評価／full mixed draft／親省略／target-selection／UI Policyの5秒timeoutと、adapterの先行timeout後の失敗群が出た。失敗ケースが変化しており、AC-B関連の失敗はないが、通常並列の全体退行なしとは結論しない。
- 負荷依存を切り分けるため、製品・テスト期限／設定ファイルを変えず、実行引数だけ`--maxWorkers=2`として全体を検証する。この結果が成功しても通常並列での失敗原因確定・修正とは区別する。他プロセスは停止しない。
- `npm test -- --maxWorkers=2 --reporter=json --outputFile=/private/tmp/servicenow-acb-vitest-bounded.json`は287 files／13,770 testsすべて成功、失敗・保留0。製品／テスト期限と設定ファイルは不変。これは実行時並列数2での全体成功であり、通常並列の2回の失敗を修正済みとは扱わない。通常並列の時間依存失敗・stdio保留の原因確定は残課題とする。
- 全体テスト終了後、`env npm_config_offline=true npm run test:pack`は外部取得禁止・既存キャッシュのみでビルド・production-only install／analysis／aggregation成功（441 files）。続けて単独実行した`node tests/review/package-http-classification.mjs`も、最新strict compiled保証・漏洩負の対照・固定依存／配布除外監査を含め成功（441 files）。
- 対象4ファイルESLint、関連3文書のローカルリンク25件、`git diff --check`は問題なし。ソースの機能差分と通常並列の検証未完了を分けて記録し、全体成功の表現には並列数2の条件を付ける。

## 6 閉鎖状態と残課題

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。seal成功・実session／worker／runtime接続・実通信・実機操作・設定変更・Pushは行っていない。実装時点では未コミットとし、その後の指示によるコミット前検証を§8へ記録する。

次はAC-Cの事前レビューと、同staged recordの利用可能化・移譲元borrow除去・commit前後の同期失効・payloadなし履歴保持の設計／検証である。seal成功は別の明示指示待ち。正常source終了／cleanup確認からのterminal-only discardと実originの接続も未実装であり、本bindingから正常終端票を捏造しない。

## 7 レビュー修正（2026-11-04）

本記録の故障件数は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査（441ファイル、Compiled AC-Bを含む）を確認した。全体合成は他の検査と同時に走らせず`--maxWorkers=3`で実行し、287ファイル／13,770件成功・失敗0だった。§5の通常並列の時間依存失敗の原因確定にはならない。

kernelの約110変異を確認し、次の条件は外しても既存試験が全て通過した。実装は正しく、試験だけの不足である。

- `checkAtomicRecordBinding`の`checkTerminal`呼出しとsink照合、`checkTerminal`の`t!==normalTerminal`、`liveCleanup.started`／`settled`、`!readyUsable()`。既存のterminal故障はissuer内で引数とslotを同時に書き換えていた。
- record内部と台帳の照合（`r.payload`／`r.terminal`／`p`の台帳照合、payload側のtoken／owner／shell／terminal、record側のowner／shell、`atomicRecordBuilds`、`!atomicStageStarted`）。既存故障はrecord最上位のfieldだけを書き換えていた。
- builderの`checkAtomicPreparation()`呼出し、resourceの確保前ガードとrecord照合側の同条件、入口の状態／発行数／staged数。
- 候補段階と`checkStagedAtomicRecord`のslot条件。

[compiled fixture](../tests/review/fixtures/compiled-destination-preparation.mjs)に44故障を追加した（AC-B計81）。builder呼出し直前9件（terminal・record生成0で停止）、terminalの一括差替え・sink・custody holder・cleanup／ready live条件の6件、staged recordの内部と台帳10件、候補段階7件、staged段階11件、capsuleとlive slotの同時消失1件である。候補段階のstaged数は、後段のstaged段階でも同じ理由で拒否されるため、照合回数1で区別する確認を別に追加した。同じ約110変異を再実行し、下記の等価を除く全条件が検出されることを確認した。

resource故障のうちupper／localは、本文破棄確認は成立するが上位custody移譲は拒否される。token／budgetはどちらも拒否される。fixtureはこの差を区別して確認する。

`issueTerminal`の`used`と`normalTerminal`の片方（両方を外す変異は検出される）、`!normalTerminalStarted`（発行が先に設定）、`issueTerminal`／`checkTerminal`冒頭の`checkProjection`（両方を外しても、直前の準備照合とrecord照合の全構成照合に包含）、`r.payload.bundle!==p.bundle`（`checkAtomicPreparationBinding`の`p.bundle!==bundle`と同じ）、候補段階の`!atomicPreparation`／`!atomicPreparingBundle`／`!preCommitBundle`／`!atomicTerminal`（空なら直後の同一性照合が同じbindingで拒否）、`!busy`・`first`・`!b`（`operation`内でだけ呼ばれ、hardは先に停止し、`b`はclearでだけ消える）は等価変異として扱う。kernelは変更せず、設計書をdraft-0.5とした。vitest試験数は不変。修正後も全体合成287ファイル／13,770件成功・失敗0（`--maxWorkers=3`）。

## 8 コミット前の再検証

ユーザーのコミット指示後、AC-Bの8ファイルだけをstageし、未stage差分・未追跡ファイルがない状態で再検証した。ビルド、対象4ファイルのESLint、実行引数`--maxWorkers=2`での全体287 files／13,770 tests（失敗・保留0）が成功した。出力先は`/private/tmp/servicenow-acb-commit-vitest.json`。全体テスト終了後に外部取得禁止・既存キャッシュのみの梱包動作試験（441 files）、続けて配布除外・固定依存・漏洩負の対照と最新compiled保証を含む監査（441 files）を単独実行し成功した。関連3文書のリンク25件と差分検査も問題なし。

初回のfixture構文誤り、通常並列2回のtimeout／adapter連鎖失敗／stdio保留と原因未確定の記録は維持する。今回の再検証は通常並列の修正や退行なしの証明ではない。製品・テスト期限と設定ファイル、閉鎖状態は変更していない。

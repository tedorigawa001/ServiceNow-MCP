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

## 9 通常並列timeoutの切り分け（2026-11-04）

観測実行時HEAD: `3758109`（reflogの移動時刻11:42:48と、観測JSON作成時刻11:51〜12:01で確認）。ソース・試験・Vitest設定ファイルは変更せず、本記録だけを追記する。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実装・seal成功・実接続・実通信・設定変更・Pushは行わない。

### 9.1 観測方法と限界

既存JSONレポートを再読したところ、assertionにはdurationはあるが開始時刻がない。配列順を発生順と見なすことはできず、§5の過去2回について「最初のtimeoutケース」を後から確定することはできない。suiteの時刻もケース順の代用にはしない。

一時runner `/private/tmp/servicenow-timeout-observer.mjs` を使用した。インストール済みVitest 5.0.3のTestCase diagnosticのstartTime／duration、固定state、既存の数値lifecycle診断だけを採取する。adapter試験の固定wrapperとstdio事前ビルドの前後に、メモリ内transformで時刻・固定stage／codeの観測を挿入する。戻り値はそのまま返し、ソースをディスクへ書き戻さない。既存設定を読み、通常観測ではmaxWorkers／testTimeout／hookTimeout等を上書きしない。

入力／本文／資格情報／URL／principal hash／例外本文は採取・出力しない。ケースは既知の静的名称に対応する番号／hash、診断は固定値・数値・真偽だけ。child stderrと通常consoleは転送しない。観測器の追加負荷・キャッシュや実行順の影響を除去した実験ではないため、単発成功から原因解消とは結論しない。負荷生成や他プロセス停止はしていない。

観測器の初回はケース名の区切りが既存JSONと異なりadapter番号が全て0になったため、名称対応には使用しない。インストール済みVitestのgetTestName実装と照合して区切りだけを正規化し、単独54 tests／55呼出しで未対応番号0件を確認した。番号は名称単位で、54 testsに対して48種類である。同名の7ケース（`rejects unsupported input before I/O`）は番号41を共有するため、番号とケースは1対1ではない。また、同期beforeAllのconsoleが複数行まとめて届き、初回のビルド前後ログは採取できなかった。行ごとの固定prefix解析へ訂正した。親側hook通知の受信時刻差は実行時間と同一視せず、訂正後はworker内のビルド前後時刻を用いる。これらは一時観測器だけの訂正で、製品・試験の期限や挙動の修正ではない。

### 9.2 最初の5秒timeoutとworker段階

通常並列の新しい観測 `full` は13,770 tests中15失敗・1保留だった。ケースのstartTime＋durationで見た、観測上最初に失敗完了した5秒timeoutは[選択試験](../tests/review/target-selection.test.ts)の `QRY-002 preserves per-finding construction and unverified indexing through worker in both envelopes`、durationは約5,377msだった。これは原因が最初に発生した箇所の証明ではない。開始順・失敗完了順・親への通知順を区別する。また、5秒timeoutに限らない場合、同じ基準で最初に失敗完了したのは[worker-lifecycle試験](../tests/review/worker-lifecycle.test.ts)のadmission slot保持ケース（duration約2,640ms、timeout文言なし）で、`QRY-002`の開始より前に完了している。timeoutを最初の異常とは扱わない。

同ケースは2種類のenvelopeを順に検証し、[ReviewTestScope](../tests/review/fixtures/review-test-scope.ts)を使う。ただしこの観測回では当該ケースのworker lifecycleを保存しておらず、どちらのenvelope／worker段階で上限に達したかは未確定。15失敗には10件の5秒timeoutと、timeout文言のない5件（worker-lifecycle 3件、worker-supervisor 1件、r2-mcp 1件）が含まれる。観測器が保存したのはtimeout文言の有無だけで、例外本文は採取していない。この5件の失敗種別は未確定で、worker／cleanupとの関連はケース名からの推定に留まる。全てを同じ原因と扱わない。

一方、過去2回のJSONに残っていたtarget-selectionの失敗9ケースの既存`bp5_review_lifecycle`を確認できた。8ケースは最後のworkerのready未受理（ready_ms=null、analyze／finish未開始）のまま約5秒でterminateしており、残るBR-005の1ケースはready受理後、finish開始約4,807ms・terminate約5,002msであった。全9ケースでaborted=true／close_requested=true／pending_reviews=0、生成workerのexited=trueを確認した。startup待ちとfinish待ちを区別でき、これらのケースではcleanup後に未完了レビューを残したとは言えない。CPU／loader等のどこが遅かったかはこの診断だけでは確定しない。

### 9.3 adapterの後続失敗理由

[adapter試験](../tests/review/update-set-adapter.test.ts)の単独観測は54 tests全件成功、55呼出しの固定結果を観測した。新しい通常並列観測`full`でもadapterは全件成功し、review_busyは0だった。ただし`full`のadapterは最大約4,610msで、約4.1秒以上のケースが4件あり、5秒上限との差は最小約390msだった。`full_checked`の最大は約376ms、単独の`adapter_checked`の最大は約3,664msである。上限に近づいた事実であり、遅延の原因を示すものではない。したがって過去2回のisError=trueの理由を、今回の自然観測だけからreview_busyと確定することはできない。

別途、合成fetchの最初の応答だけを6,000ms遅らせる負の対照`adapter_delay_drained`を実施した。実fetch／外部通信へフォールバックせず、既存のfake fetchにだけ遅延を加えた。製品の全60秒・各phase期限・Vitestの5秒上限は変更していない。

| 観測 | 結果と意味 |
| --- | --- |
| 最初のケース | 5秒試験timeout。元adapterのPromiseはまだ未完了 |
| 後続46呼出し | 固定理由`input / review_busy`。同一principalの元レビューが未完了の間に開始 |
| その他7呼出し | 既存の入力等の拒否。全てをreview_busyへ潰してはいない |
| 元レビューの自然終了 | 約6,136msでisError=false。遅延応答後にworker／sessionの終了処理を通る |
| 自然終了待ち後の同principal再レビュー | isError=false。admissionを強制解除／初期化せずに成功 |

この対照は意図的に54 tests中47失敗を生むもので、通常回帰の失敗件数へ加算しない。一時afterAllで元Promiseの自然終了を待ち、同fixtureの空の取得結果で再レビューした。既存試験にこの後始末を実装したわけではない。

静的経路も整合する。[adapter](../src/review/update-set-adapter.ts)はworker closeをawaitしてからsessionをcloseし、[bounded-read](../src/servicenow/bounded-read.ts)は同principalのadmissionをclose時に解放する。既存adapter試験のafterEachはmock復元／実timer復帰だけで、Vitestのtimeout signalを元レビューへ渡したり未完了Promiseをdrainしたりしない。対してtarget-selectionはReviewTestScopeでそれを行う。確認できた再現条件は「5秒試験が先に終わり、元レビューが未完了のまま同principalの次ケースが始まること」であり、恒久的なadmissionリークの証拠ではない。過去の自然失敗全てがこの経路だったかは、当時の理由code未採取のため未確定に残す。

### 9.4 stdio保留の分類

[stdio試験](../tests/review/stdio-review.test.ts)は、beforeAllで`execFileSync`によるTypeScriptビルドを実行する。子ビルドのtimeoutとhook上限は各60,000ms、本体の上限は30,000msである。過去2回のsuite messageは`spawnSync ... ETIMEDOUT`、本体stateはskippedだった。新しい観測`full`もmodule failed／beforeAll未完了／spawn_timeout=trueだった。本体が任意にskipされたのではなく、事前ビルド失敗により未実行となった保留であり、本体30秒timeoutやレビュー拒否と混同しない。

ログ分割訂正後のstdio単独観測は、ビルド約5,770msで終了し、本体1 test成功。後述の通常並列`full_checked`は、事前ビルド約7,812msで終了し本体も成功した。60秒に達する負荷条件の閾値や、ビルド内部のどの工程が遅延したかまでは未確定。現行hook／子プロセス／本体の期限は一切延長していない。

### 9.5 再観測結果と証拠

`full_checked`では通常の並列設定のまま13,770 tests全件成功、失敗・保留0だった。adapter 54 tests／55呼出しにreview_busyはなく、stdioも実行された。観測器にはログ分割と既存lifecycle metadata採取の訂正があるため、完全に同一の計測器での比較とは言わない。リポジトリのソース・期限・並列設定は両回とも不変である。通常並列での成功も確認できたが、再現性の問題を修正したわけではなく、§5・7の未解消履歴を取り消さない。

一時runnerの実行方法は`bdo node /private/tmp/servicenow-timeout-observer.mjs <mode>`。runnerと観測JSONはローカル一時領域にだけあり、配布物やコミット対象へ追加しない。以下の数値と結論は本MDへ残す。一時ファイルは将来消える可能性がある。runnerは12:00:22に上書きされており、最終版のSHA-256は`d9c34d53349aa61439d254a346cf538a24da5d452f677b224bff5ee510a297b4`である。ファイル時刻から、`full_checked`と`adapter_delay_drained`は最終版、`full`・`adapter_checked`・`stdio_checked2`はそれより前の版による観測で、旧版は保存していない。

| mode／観測JSON（`/private/tmp/servicenow-timeout-`に続く名称） | 結果 | SHA-256 |
| --- | --- | --- |
| `full.json` | 15失敗・1保留、adapter成功・stdio事前ビルドtimeout | `54f497140c04391282b97b0cf284bc9d5d3cd433d74a7111129378c5fa2f032d` |
| `full_checked.json` | 通常並列13,770成功、失敗・保留0 | `573e69d58f5a5207475259ba0f3c631fef1528597507ab52dab69854b67819e8` |
| `adapter_checked.json` | 単独54成功、55呼出しで未対応番号0件（48番号） | `6fa27eb614fc7b520a29ffd5a575a21100c46d035665bd5336c6e63df73bc0e2` |
| `adapter_delay_drained.json` | 意図的6秒遅延で46 review_busy、自然終了後に回復 | `0289b0b61fccd649383383ada3fde4cee97054667ce0c8897540e3acd83e1637` |
| `stdio_checked2.json` | 単独本体成功、事前ビルド5,770ms | `f8214953700323a3eabed4f20c07b43653db1cb892812e6fd66f26b98834983f` |

### 9.6 未解消点と次の候補（未実装）

1. adapter試験のtimeout時に元レビューを取消・終了待ちし、mock復元より先に解放を待つ試験所有権の接続。既存ReviewTestScopeの適用を候補とし、admissionの強制resetや期限延長で救済しない。
2. 通常並列のworker ready待ち／finish待ちと、複数envelopeを1ケースで検証する累積時間の切り分け。起動・解析・終了の各費目を分け、CPU競合／loader等の原因を確定する。構成や製品期限は本調査で変更しない。
3. stdio事前ビルドの重複・他試験との競合の切り分け。将来ビルドを統合／別phase化する場合もdistの鮮度検証を省略しない。現在の60秒を延ばしたりhookを無条件skipしたりしない。

以上は次の対応候補で、今回の実装指示ではない。repo内変更は本記録のみ。commit／seal成功・正常終端・実接続を有効化せず、全体受付無効・Unknown・調査保留を継続する。

## 10 レビュー修正（2026-11-04）

`e11b665`のレビューで次を訂正・補足した。文書だけの修正で、ソース・試験・設定・期限と観測JSONは変更していない。§9の診断の結論は変わらない。

- 節番号の重複を解消するため、timeoutの切り分けを§9へ繰り下げた。§6の「§8」は「コミット前の再検証」を指す。
- 調査基準HEADの`94b81c4`を、観測実行時の`3758109`へ訂正した。両者の差は、Vitestが実行しないcompiled fixtureと文書だけである。
- §9.2へ、最初に失敗完了したのは5秒timeoutではないケースであることを追記し、「別assertion失敗」の記述を観測で確認できる範囲へ改めた。
- §9.1と§9.5へ、番号が名称単位であること、および観測器の版を追記した。§9.3へ`full`のadapter所要時間を追記した。

レビューでは5件の観測JSONのSHA-256と記載値を再計算し、一致を確認した。`adapter_delay_drained`はscratchpadへコピーした観測器で再実行し、47失敗、review_busy 46件、その他7件を再現した。元レビューは約6,128msで自然終了し、再レビューも成功した。1件のreview_busyの時刻が65,036msと見えるのは、当該ケースが偽のDateを使うためで、受信順では46件全てが元レビュー終了より前である。

修正前のrepo全体の確認は、lint（error 0・warning 374）、build、梱包分類監査（441ファイル、Compiled AC-B 81件を含む）が成功した。全体試験は他の検査と同時に走らせず`--maxWorkers=3`で実行し、287ファイル／13,770件成功・失敗0だった。これは通常並列のtimeoutの解消や原因確定を示さず、§9.6の候補は未実装のままである。

## 11 adapter試験の取消・終了待ち（2026-11-04）

### 11.1 対応範囲と所有順序

§9.6の候補1だけを試験側で対応する。`update-set-adapter.test.ts`の全review呼出しを、共通のtest-only `installAdapterReviewScope`経由に変更した。製品source・admission・期限・並列設定は変更しない。

1. 各caseの開始時に既存`ReviewTestScope`を生成し、Vitestの`context.signal`を結合する。
2. scopeがreviewのPromiseと生成workerを追跡し、既存のsource worker factoryを使用する。
3. `afterEach`はscopeを取消し、元reviewの実際のfinally（worker終了、session／admission解放）が終わるまで待つ。mock・時計はその後のfinallyで復元する。
4. 終了時のmetaには既存scopeの数値／boolean診断だけを保存する。admissionの強制resetや成功への書換えは行わない。後始末失敗も握り潰さない。

### 11.2 実timeout回帰と初回失敗

adapter本体試験と**同じhook設置helper**を利用する子プロセスfixtureを追加した。注入parent fetchだけを取消まで保留し、実Vitestの250ms timeoutを発生させる。外側の回帰試験は、子が意図どおり失敗終了し、失敗は元caseのtimeout1件だけであること、後続caseが同principalでparent GETへ到達して`access_denied`となり`review_busy`ではないことを検査する。元reviewの`cancelled`、取消1回分のfetch、終了metaの`pending_reviews=0`と未処理例外0も確認する。実通信・worker起動はこの新fixtureでは不要である。

- RED: helperを旧来の「mock／時計復元だけ」にした状態で、新回帰は失敗した（子の失敗2件、期待は元timeout1件）。取消・終了待ちがない場合の後続失敗を検出する。
- 初回接続: adapter54件は成功したが、既存selection子fixtureと同じ設定へ追加したため、名前filterの衝突／skip行混入で既存回帰2件が失敗した。adapter用configを分離し、既存selection configとfilterは維持した。
- GREEN: `npx vitest run tests/review/selection-timeout.test.ts tests/review/update-set-adapter.test.ts`は2ファイル／58件成功。元のunmanaged timeout・review_busy対照、worker終了待ち対照、fake timerを使う既存adapter試験も維持した。
- `npm run build`は成功した。

### 11.3 通常並列回帰・環境制約と残課題

- 初回`npx vitest run`は実行環境のlocalhost待受制限で失敗した。HTTP Host試験の`listen EPERM 127.0.0.1`、OAuth／R2の`callback_unavailable`、stdio無出力20秒等を観測した。この実行を成功扱いせず、全失敗の原因を一律に断定もしない。
- localhostを使う合成fixtureを許可した条件で、`npx vitest run --reporter=json --outputFile=/private/tmp/adapter-scope-full.json`を再実行した。`maxWorkers`・既存期限は変更せず、287ファイル／**13,771件成功・失敗0・skip0**。外部ServiceNowへの通信は行っていない。
- JSONのadapter54件の終了metaは全て`aborted=true / close_requested=true / pending_reviews=0`、合計43 workerの`exited=true`を確認した。追加した外側timeout回帰も成功した。
- 保存済みJSONのSHA-256: `68cdc032f5be84a833c2c91a2372381d72fea716456f400d510c3584701b312c`。これは一時領域の観測結果であり、repo／配布物へは含めない。
- 変更した試験・helper・configの5ファイルに対するESLintは指摘0。

新fixture内の意図的timeoutは外側の成功判定条件であり、通常回帰の未解消失敗として数えない。既存の5秒case期限、hook期限、製品60秒は延長していない。§9.6の候補1は今回接続したが、候補2・3（ready／finish競合、stdio事前ビルド）を解消したとは扱わない。通常並列の単回成功は、過去の断続的timeoutの原因確定や完全解消の証拠ではない。

正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。実接続・実通信・設定変更・Pushは行わない。

## 12 レビュー修正（2026-11-04）

本節までの§11の件数（287ファイル／13,771件）と記述は修正前の記録として残す。`fc910ff`のレビューで、parent段階の回帰では「終了待ち」と「復元の順序」を検証できていないことが分かった。parent段階のレビューは取消の直後に自ら終了するため、§11.2の「取消・終了待ちがない場合の後続失敗を検出する」のうち、確認できていたのは取消がない場合だけである。実装は正しく、製品source・期限・並列設定は変更していない。

[fixture](../tests/review/fixtures/adapter-timeout.cases.ts)と[外側の回帰](../tests/review/selection-timeout.test.ts)へ次を追加した。

- worker段階の回帰: 起動済みworkerの`terminate`を300ms遅らせ、偽Dateを有効にしてreviewを250msの実timeoutへ到達させる。後続が`review_busy`でないこと、worker終了、terminate 1回、レビュー終了時に時計がまだ偽であることを検査する。
- signal結合の検査: 共通hookより先に実行される`afterEach`で、取消がVitestのsignalから届いていることを確認する。
- close失敗の回帰: `close`を1回だけ失敗させ、失敗が元ケースへ報告され、次のケースでmockと時計が復元されていることを検査する。

共通helperへの変異と、失敗した外側の試験は次のとおり。全て検出され、等価変異は残っていない。

| 変異 | 失敗した試験 |
| --- | --- |
| 取消・終了待ちなし（mock／時計の復元だけ） | drains…、waits…、reports… |
| `close`をawaitしない | waits…、reports… |
| mock／時計の復元を`close`より先に実行 | waits…、reports… |
| `context.signal`を結合しない | drains… |
| `close`の失敗を握り潰す | reports… |
| `finally`を外す | reports… |
| `useRealTimers`を外す | reports… |
| `restoreAllMocks`を外す | reports… |
| lifecycle metaを保存しない | drains…、waits… |
| lifecycle metaを`close`の前に保存 | drains…、waits… |

修正後のrepo全体の確認は、lint（error 0・warning 374）、build、梱包分類監査（441ファイル）が成功した。全体試験は他の検査と同時に走らせず、`--maxWorkers=3`と通常並列で各1回実行し、どちらも287ファイル／13,773件成功・失敗0だった。これらの単回成功は過去の断続的timeoutの原因確定や解消を示さず、§9.6の候補2・3は未対応のままである。

## 13 worker待ち切り分けの次工程（計画のみ）

候補2の[ready／finish診断計画](BEST_PRACTICE_WORKER_READY_FINISH_DIAGNOSTIC_PLAN.md)を追加した。現行`ready_ms`はscopeによるready形message観測でありsupervisorの受理完了ではないこと、開始値は初回のみでreply相関・review別累積が不足することを整理した。既存の過去時刻・成功件数は変更しない。次候補は親側のboundedイベントとready／finish独立合成対照（WF-A）で、今回は実装・追加試験を行っていない。stdio事前ビルドとAC-Cの未確認事項も分離して保持する。

## 14 レビュー修正（2026-11-04）

`a41aaf0`のレビューで、計画の仮説がworker内部に限られ、過去の5秒timeout 23件のうちworkerと関係の薄いファイルの失敗を説明できないことが分かった。計画へスイート全体の負荷の仮説H5と採取手順、観測範囲外の扱い、既存JSONのworker別時刻、実行順を追加した。§13の参照から版表記を外した。文書だけの修正で、ソース・試験・設定・期限は変更していない。

修正前のrepo全体の確認は、lint（error 0・warning 374）、build、梱包分類監査（441ファイル）が成功した。全体試験は他の検査と同時に走らせず`--maxWorkers=3`で実行し、287ファイル／13,773件成功・失敗0だった。WF-A〜Cは未実装で、通常並列のtimeoutの原因は未確定のままである。

# SR-C①：旧世代終了／世代なし内部証拠・one-shot消費の合成検証

Date: 2026-11-02 / 基準HEAD: `fbbd844`。
Status: **独立合成issuerだけの内部契約。実worker／runtime・実終了確認・新世代／finishへ未接続。**

全体回帰の最新状況：§4〜7は初回未完了・レビュー・環境切分け・listen対策後の履歴として保持する。ready待ち3件の修正を確認した§8では、制限環境で約18〜29msで終了理由を示す失敗となり、対象3件の30秒timeoutは再現しなかった。待受可能な条件では対象3件を含む241ファイル／10,845件が成功した。環境制約の解消や実回復経路の有効化を意味しない。

[soft回復claim設計draft-0.8](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)§14と[親設計draft-0.12](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 実装範囲と非権威性

[既存の配布対象外issuer](../tests/support/review/synthetic-soft-recovery.ts)へ、別brandのWorkerClosureLease／WorkerClosureEvidenceと、begin／未起動確認／終了settle／証拠消費を追加した。実class・runtime台帳と共有しない。未消費の同owner recovery slotを先に占有するため、公開のconsumeRecoveryデータやinspect・cleanup診断から証拠へ昇格できない。

7つのworker期限発生点を保持する。未起動は終了要求0・世代なし、既存worker／ready待ちは終了要求1・未送信でanalyze idなし、送信直前は割当済み未送信、送信後は同jobを受付不可のsent_terminalとして記録する。破棄されたready／analyze応答を採用せず、数値idだけで同一性を認めない。

started世代は、同lease・同contextのtermination=confirmedとcleanup=completeの組合せだけで証拠を発行する。未起動のno_generation証拠は別入口で発行し、両者を取り違えない。要求済み・失敗・未確認・未知statusは証拠にならない。strictなevent／contextはdescriptorで読み、Proxy／getterを実行しない。

各claimは最初のguard前に一度占有し、最後のpost-guard後だけpublishする。取消・全体期限・混入・再入・二重消費では全closure能力を消し、先行soft／hardと固定closure診断を保持する。未settledのleaseや未消費の証拠をnormal closeで隠さない。成功後のcloseでは元UTCも破棄する。

この終了要求・job終端化・confirmedはfakeイベントだけである。実terminate／close Promise・listener／streamのcleanupやWJ-Bのjob台帳を操作しない。消費結果はauthority:noneのimmutable dataで、新世代・GET・finish権限ではない。実C/G/P・retry／予約／work capの追加計上や実費目上界の導出にも数えない。

## 2 合成試験・独立oracle

[新規111件](../tests/review/synthetic-worker-closure.test.ts)を追加した。

| 観点 | 確認内容 |
|---|---|
| 発生点別oracle | 7発生点の終了要求0／1、inputとidの終端区別、no_generation／closed_generationを別の固定表で比較 |
| guard oracle | 7発生点×6つのpre/post guardすべてで取消。実施済み要求数は残し、lease／証拠は0・新世代権限なし。成功は各6 guard |
| 終了条件 | termination失敗／未確認／未知、cleanup失敗／未確認／未知では停止。未起動にconfirmed終了、startedに世代なしの組合せを拒否 |
| binding | supervisor／request／input／worker／generation／job／id／point、owner／lease／証拠／bindingの混入を拒否。他ownerは不変 |
| one-shot | 二重begin／settle／consume、先行consumeRecovery結果、copy証拠、未発行証拠での消費、失敗後の再準備を拒否 |
| 失効 | 元run／session／source／key／origin／budget／releaseの差替え、最終guardでの同id別generation、発行後の取消／全体期限／worker失敗で停止 |
| 診断 | 元soft・最初のhardとclosure診断を分離。先行cancelledと後続cleanup failedを両方保持。診断sinkのconfirmedから証拠を作らない |
| 再入・秘密 | 本来なら通るcleanup leaseの捕捉再入を拒否。Proxy／getter・raw秘密を読まない。workerのterminate／close getter実行0 |
| 終端 | 未settled／未消費をcloseで隠さず、成功後closeでUTC破棄。S／L／O／Uを再採取・延長しない |

値契約と独立合成経路の確認であり、実監督のcleanup／OS終了／compiled実class保証やB-03の代替ではない。

## 3 初回REDと訂正

| 段階 | 観測と対応 |
|---|---|
| begin tracer | stubで1件RED。recovery先行占有・worker origin限定・fake要求／終端区別を実装。途中はinspect未追加で同じ1件がRED、scalar診断の追加でGREEN |
| 終了settle | stubで1件RED。同leaseの先行取外し、strict contextと終了／cleanup確認、post-guard後発行でGREEN |
| 未起動証拠 | stubで1件RED。世代なし専用確認とstarted拒否でGREEN |
| one-shot消費 | stubで1件RED。証拠先行取外し・非実行data返却でGREEN |
| 未完了close | closeが黙って成功し1件RED。未settled lease／未消費証拠の拒否を追加してGREEN |
| 型検査 | worker専用fixtureをphase型まで含むSyntheticSoftFactsで宣言し、supervisor参照のTS2339を1件検出。fixtureの型をworker variantへ限定して再検査でエラー0。runtime実装・型検査条件は変更なし |

旧試験の削除／skip、製品・testの期限緩和は行っていない。

## 4 最終検証

| 検証 | 結果 |
|---|---|
| SR-C①＋SR-A／B | 3ファイル／356件成功（111＋124＋121） |
| 関連WJ-A／B／C＋SR-A／B／C① | 6ファイル／661件成功 |
| build | `npm run build` exit 0 |
| standalone TypeScript | 新試験と参照helperをstrict／noUnusedLocals／noUnusedParametersで検査、エラー0 |
| 変更箇所ESLint | 問題0 |
| offline梱包 | `node tests/review/package-http-classification.mjs` exit 0、441ファイル。closure scope／関数／path混入の負の対照、依存監査と既存compiled回帰が成功 |
| 全体回帰 | **未完了／合格扱い不可**。maxWorkers=3の単独全体実行は外側150000msでSIGTERM、exit 143。最終report・失敗caseは未回収。今回の退行の有無や原因は未確定 |

全体回帰の予定出力先はローカル一時領域`/private/tmp/servicenow-src1-20261102.json`で、停止後にファイル未生成を確認した。外側150000msは検証コマンド全体の中断枠で、製品60秒や各test timeoutを緩める変更ではない。runnerの終了は確認した。前工程のレビュー記録にある10,729件成功は今回の全体結果へ流用しない。

梱包の関数／scope／path混入負の対照を拡張した。既存の依存監査を維持し、追加I/O／clock／worker依存を許可しない。既存compiled回帰はSR-C①の専用compiled保証／B-03完了には数えない。更新したMD5文書のローカルリンク69件と末尾空白、git diffの空白検査も成功。

## 5 レビュー修正（2026-11-02）

§2・§4の111件／356件と「全体回帰：未完了」の記載は、修正前の記録として残す。

**全体回帰の再実行**：レビュー時に`npm test -- --maxWorkers=3 --reporter=json`を単独で実行し、241ファイル／10,840件成功、失敗0・pending 0、exit 0（JSON内の開始〜最終試験終了は約59.7秒）を確認した。§4の未完了は外側150000msの打切り（exit 143）によるもので、今回の所要時間からは実行環境の負荷・並行実行が原因だった可能性が高い。ただし当時の環境状態は未回収で、原因を断定しない。

**未保護の判定**：レビューで、次の判定をそれぞれ外す変異でも111件が成功することが判明した。

| 判定 | 外した場合の影響 | 追加試験 |
|---|---|---|
| `confirmWorkerUnstarted`の同context照合 | 別のsupervisor／request／input・pointのcontextからno_generation証拠が発行される。既存の混入試験はstarted側のsettleだけが対象だった | 未起動originでsupervisor／request／input／pointを差し替えたcontextを拒否し、証拠・leaseを残さない（4件） |
| `settleWorkerClosure`のevent 3列のstrict検査 | 余分な列を含むeventから終了証拠が発行される | 余分な列を含むeventを拒否し、terminationをrequestedのまま保持 |

各変異では対応する追加試験だけが失敗し、復元後に`cmp`一致を確認した。begin／settle／consumeのstate判定とbeginの`closureDiagnostic`判定は、外してもslotの存在で同じく拒否される等価変異として扱い、追加試験の対象にしていない。issuer実装・runtime sourceは変更していない。

修正後の結果：

| 検証 | 結果 |
|---|---|
| SR-C①合成 | 1ファイル／116件成功（SR-A／Bと合わせて361件） |
| ESLint | `npm run lint`（repo全体）exit 0、errors 0 |
| 全体合成 | maxWorkers=3、241ファイル／10,845件成功、失敗0・pending 0、exit 0。JSON内の開始〜最終試験終了は約58.2秒 |

soft回復claim設計はdraft-0.8へ更新し、§14の件数と親設計・本書からの版数リンクを直した。

## 6 全体回帰未完了の切分け（2026-11-02）

対象HEADは`24cd4ec`。ソース・test・Vitest設定を変更せず、同一ソースで実行権限の異なる条件を比較した。Node v24.18.0、Vitest v5.0.3、darwin arm64、OS release 27.2.0、availableParallelism=10。実資格情報・環境変数の一覧・ServiceNow側のコード本文や実通信本文は取得・表示していない。

### 6.1 停止位置と直接の再現条件

全体を`maxWorkers=3`、verbose＋JSON reporter、silentで単独実行し、10秒ごとに最後に観測したtest file・観測file数・完了行数だけを記録した。実機E2E／transportプロジェクトの除外とunit→real-hostの順序は既存[Vitest設定](../vitest.config.ts)のまま。

制限環境では約50秒で231 fileを観測した後、最後のfileが`tests/review/oauth-g0.test.ts`のまま、約5秒ごとに少数ずつ完了行が増加した。150000msの外側打切りでexit 143、最終JSONは未生成。最後の観測は231 file／完了行10,516である。**これは成功件数ではなくreporterの行数**で、全体合格・全試験完了とは数えない。real-host groupの完了へ至った証拠もない。

同fileの`does not extend token availability past its local retention deadline`だけを、maxWorkers=1で切り出すと以下を直接観測した。

- `listen EPERM: operation not permitted 127.0.0.1`の未捕捉例外（syscall=listen、code=EPERM）。EADDRINUSEではなく、ローカル待受の許可拒否。
- その後、既定の5000msで当該testがtimeout（約5008ms）。1 failed、41件は名前フィルターによる非選択、unhandled error 1、exit 1。
- 失敗位置は[oauth-g0試験](../tests/review/oauth-g0.test.ts)の`issuer()`準備（12行目付近）。`server.listen(0, '127.0.0.1', resolve)`だけを待つPromiseにerror→rejectがなく、OSがlistenを拒否するとPromiseがsettleしない。cleanup登録もlisten成功後である。token保持期限の検証本体や[PDI用ではない合成OAuth harness](../tests/helpers/bp5-oauth-harness.ts)の開始へ到達する前の失敗である。

すなわち、今回再現した経路は「OSのローカルlisten拒否→fixture準備のPromise未settle→各testの5000ms timeoutの累積→全体コマンドの150000ms打切り」。製品処理が150秒動いていたことや、SR-C①の証拠処理がdeadlockしたことを示さない。

verboseの文字列一致で得たworker_unavailable／callback_unavailable／timed out等は、期待エラーを確認するtest名にも含まれる。成功した比較全体実行にも現れたため、それらの出現数を実失敗数として扱わない。また、単独JSON reporterの再実行はtimeoutを記録するが、JSONには上記unhandled EPERMの詳細が入らなかった。原因の証拠はverbose出力とsource照合を併用して判断した。

### 6.2 同一ソースでの比較結果

| 条件 | 結果 | 判断 |
|---|---|---|
| 制限環境・全体・3 workers | 外側150000msでexit 143、最後のfileはoauth-g0、最終JSONなし | 未完了を再現。合格件数は確定できない |
| 制限環境・G0単独1件・1 worker | listen EPERM＋5000ms timeout、1 failed／41非選択、exit 1 | 待受権限の拒否とfixtureの待ち方を直接確認 |
| ローカル待受可能な実行権限・同じG0単独1件 | 1 passed／41非選択、exit 0、全体約0.77秒 | test内容や期限を変えずに成功 |
| 制限環境・target-selectionの最初のQRY-002試験1件 | 1 passed／67非選択、exit 0、全体約1.60秒 | 全体進捗中のworker_unavailableという文字列だけから当該worker経路の失敗を推定しない |
| ローカル待受可能な実行権限・同じ全体・3 workers | **241 file／10,845 passed、failed 0／pending 0、success=true、exit 0、約66.15秒** | 今回の同一HEADで全体回帰成功。real-host groupにも到達し外側打切りなし |
| 制限環境へ戻したG0単独1件の再確認 | 1 failed／41非選択、5000ms timeout、exit 1（全体約6.34秒） | 一時的な並列負荷だけに依存せず再現。JSON単独ではEPERM詳細は未収録 |

単独試験の非選択は`-t`による診断用フィルターで、testのskip指定を追加したものではない。比較全体は名前／fileフィルターなし・非選択0。ローカル待受可能な実行権限は各コマンドだけの追加許可で、PDIロール・ACL・アカウント・設定・恒久的な環境設定を変更していない。通信は既存合成試験のlocalhost／fake依存だけで、PDIへの実接続・実トークン発行は行っていない。二つの全体実行は順次行い、重ねていない。

製品60秒、個々のtest timeout、worker startup上限、maxWorkers=3を維持した。外側打切りも150000msのまま。reporterは進捗の観測方法だけの変更で、source／test／configファイルは不変。

### 6.3 退行との区別・未確定事項

G0試験とharnessはSR-C①前の`fbbd844`と現在でGit blobが同一だった（試験`87f05fc33e417276aac8790cc8bb5d4f8940e51f`、harness`82948a2fd6bc41217c4017803d7daa35cd3ee091`）。単独のG0再現にSR-C①issuerは関与せず、同一HEADの全体も待受可能な条件で成功した。**今回再現した未完了は実行環境の権限制約と既存fixtureのerror処理不足で説明でき、SR-C①の製品／合成契約の退行は観測していない。** 全ての潜在的な退行がないという証明ではない。

§4の過去の150秒打切り時にはOSエラー／環境状態を回収していないため、過去の全実行が今回と同一原因だったとまでは断定しない。§5で挙げた負荷・並行実行の可能性は当時の未確定仮説として残すが、今回の再現を単なる負荷だけで説明しない。

この切分け時点の対策候補は、ローカルlisten能力を事前確認し、fixtureのlisten失敗を即時rejectして固定cleanupへ進めること。同じresolveだけを待つlistenは`tests/review/fixtures/oauth-g0-smoke.ts`と`tests/fixtures/http-host-survival.mjs`にも残っていた（`oauth-g0.test.ts`のport probe、`bp5-oauth-harness.ts`、`r2-runner.cases.ts`はerrorでrejectする）。この時点では実装せず、後の修正と確認は§7へ分離する。制限環境でtestをskip／成功へ変えることや、期限を延長する対応は行わない。今回の未完了切分けは完了とし、SR-C後半などの未実装課題は§9のままとする。

### 6.4 証拠と変更範囲

最終全体JSON：`/private/tmp/servicenow-src1-full-allowed.json`。SHA-256：`30dde107fd871d7b89a65dfafd8ef8d3afb61556c40bab7d93c46477764d6f5d`。件数はJSONのtestResultsと集計値、時間はstartTime〜最終testResults.endTimeで確認した。raw JSONは一時領域に置き、本リポジトリへ追加しない。

単独比較JSON：`/private/tmp/servicenow-g0-allowed.json`、`/private/tmp/servicenow-g0-restricted-repeat.json`、`/private/tmp/servicenow-target-isolated.json`。制限環境の全体JSON予定先`/private/tmp/servicenow-src1-diagnostic.json`は未完了のため生成されていない。

変更は本検証記録のみ。ソース・試験・設定・CHANGELOG・正式発行口・全体受付は変更していない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、切分け作業中は実worker／runtimeへの新接続・実機操作・実通信・設定変更・Pushを行わず、ソース・試験・設定の変更をコミットしていない（本記録だけを後からコミットした）。既存合成試験のローカルworker／HTTPの実行を、実PDI接続や正式発行口の開放とは数えない。

## 7 listen失敗対策後の全体回帰（2026-11-02）

対象HEADは`2ee58c1`。`116e23c`はG0 issuer／smoke／HTTP survival fixtureにlisten error→rejectと失敗時closeを追加し、`06125d0`はR2の固定port probe／占有fixtureにも接続した。`2ee58c1`はCHANGELOG整理のみ。今回これらを変更せず、検証と本記録更新だけを行った。`24cd4ec..HEAD`の`src/`と`vitest.config.ts`の差分は0で、製品実装・期限・実行順序の変更ではない。

### 7.1 条件と手順

環境は§6と同じNode v24.18.0／Vitest v5.0.3／darwin arm64、OS release 27.2.0、availableParallelism=10。`npm run build`はexit 0。制限環境のG0単独試験→制限環境の全体→ローカル待受可能な実行権限の全体の順に実行し、二つの全体実行は重ねなかった。

全体は`node node_modules/vitest/vitest.mjs run --maxWorkers=3 --reporter=verbose --reporter=json --outputFile.json=<ローカル一時領域> --silent`。10秒ごとの進捗観測と外側150000msの打切りを維持した。製品60秒・各test timeout・worker起動上限・unit→real-host順序・E2E／transport除外は変更なし。実行権限の追加は各コマンドだけで、PDIや恒久設定を変更していない。

### 7.2 結果

| 条件 | 件数・終了 | 時間・観測 |
|---|---|---|
| 制限環境・G0の保持期限試験1件だけ | 1 failed／41非選択、exit 1 | test本体約4.08msでlisten EPERMを返す。従来の5000ms timeoutではない。全コマンドのreport内時間は約3.13秒 |
| 制限環境・全体 | 241 file／10,720 passed／125 failed／pending 0、success=false、exit 1 | 約142.97秒で最終JSONまで生成。outer_stop=false。G0で足止めされずreal-host groupへ到達したが、環境制約と未改善の待ち方による失敗が残る |
| ローカル待受可能な条件・全体 | **241 file／10,845 passed／failed 0／pending 0、success=true、exit 0** | 約32.47秒。outer_stop=false。名前／fileフィルター・追加skipなし |

単独試験は`-t '^does not extend token availability past its local retention deadline$' --maxWorkers=1`で切り出しただけで、41件の非選択を全体成功へ加算していない。test本体4.08msとコマンド全体3.13秒は別の値である。以前のtest本体約5008msと比べ、listen拒否を速やかに通常の失敗として返すことは確認できたが、待受自体が可能になったわけではない。全体の所要時間の差を性能改善の主張には使わない。

### 7.3 環境制約・残る待ち方と退行の区別

制限環境の失敗は4 fileに限られた。

| file | failed | 主な証拠・限界 |
|---|---:|---|
| `tests/review/oauth-g0.test.ts` | 36 | 33件はfailure本文にEPERM。残りはcallback／子プロセスsummaryの不一致。従来の5000ms timeoutは0件 |
| `tests/review/r2-loopback.test.ts`（runner casesを含む） | 87 | 23件で既存の固定観測metaにlisten_error=EPERM。callback_unavailableの不一致等もある。ready待ちの30000ms timeoutが3件 |
| `tests/http-host-survival.test.ts` | 1 | failure本文にEPERM。fixtureが拒否を返し、待受成功を前提とする試験は不合格 |
| `tests/server-stdio.test.ts` | 1 | 20秒以内のstdout未取得。別の固定文字列だけを出すtsx CLI probeも、実行本文へ到達前にlisten EPERMでexit 1。元stdio childのstderr自体はこのJSONから回収できず、個別原因の直接同定は未完了 |

上記125件すべての個別原因をEPERMと断定しない。固定観測metaのEPERMとfailure本文のEPERMは重なることがあるため、件数を足し合わせない。対応する同一HEAD全体は待受可能な条件で成功しており、今回の変更による製品／通常合成経路の退行は観測していない。

この時点でR2に残ったtimeoutは次の3件（test本体は各約30.01〜30.02秒）。後の修正と検証は§8へ分離する。

1. `pins the host remaining budget before bind and reserves cleanup inside that same budget`
2. `arms the waiting timer from the host budget rather than the runner default`
3. `enforces the default 385-second budget with three seconds reserved for cleanup`

3件とも`meta.r2_synthetic_listen`にlisten_attempt→listen_error(EPERM)→close、listening=0が残った。[runner cases](../tests/review/r2-runner.cases.ts)は`onReady`だけがresolveする`began`を待ち、runnerの終了とraceしていない。listen拒否ではonReadyへ進めないため、listen Promise自体を即時rejectにしてもこの待ち方は解消しない。[runner](../src/review/r2-runner.ts)はstart成功後だけonReadyを呼び、callback_unavailableを固定理由へ写像する。この3件の30秒は製品が30秒後まで終了不能だった証拠ではなく、test側のready到達待ちである。metaのat_msはfake timerの影響で負値を含むため、時間の根拠にはせずイベント順とcodeだけを使用した。

従って「listen失敗の即時伝播・cleanup対策は機能する」「制限環境でも全体の最終reportを回収できた」「すべての環境依存の待ちが解消した、とは言えない」を区別する。今後の候補は、この3件のready到達待ちをrunner終端と合流し、finallyで取消・終了待ちを保証すること。今回は診断のみで、試験・製品の修正や期限延長・環境非対応のskip／成功扱いは行っていない。

§4／6の過去の打切りに関する未確定事項は保持する。今回の最終reportが得られたことから過去のすべての原因を同定したとはしない。固定port lockの読み取り専用確認では、制限環境のsignal 0はEPERM、その後の追加権限による確認時にはlockが既に存在しなかった。死んだownerやlock滞留の証拠にはならず、lockは削除していない。

### 7.4 証拠と変更範囲

全体成功JSON：`/private/tmp/servicenow-listenfix-full-allowed.json`、SHA-256：`a32dd836c07d067cdacb6f36869038609ad662aa5b2ce11a44e8f93bf434fa67`。

制限環境の全体JSON：`/private/tmp/servicenow-listenfix-full-restricted.json`、SHA-256：`10ebef3e5126d9100239b8b563d004c96e6e451d3c0190e056e1966708b0472d`。単独JSON：`/private/tmp/servicenow-listenfix-g0-restricted.json`、SHA-256：`2b50932c748bc12402dc8c07924d39d0f49479ef66297c4bbe8b385e26cba091`。

raw JSONはローカル一時領域にだけ置き、リポジトリには追加しない。件数・時刻はJSONから確認し、今回の変更は本記録だけ。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、PDIへの実接続・実通信・実機操作・トークン発行・設定変更・Pushは行っていない。既存合成試験のローカルHTTP／workerの実行は実接続や正式発行口の開放とは区別する。

## 8 R2 ready待ち3件の修正検証（2026-11-02）

対象HEADは`a2990d5`。同コミットは[runner cases](../tests/review/r2-runner.cases.ts)の3件に`untilReady(began, task)`を接続し、ready到達とrunner終端を`Promise.race`で合流する。runnerが先に終了した場合は、その受領物を`runner settled before onReady`のassertionで示す。今回ソース・試験・設定は変更せず、検証と本記録の更新だけを行った。`2ee58c1..HEAD`の`src/`と`vitest.config.ts`の差分は0。

### 8.1 条件・結果

Node v24.18.0／Vitest v5.0.3／darwin arm64、OS release 27.2.0、availableParallelism=10。制限環境で対象3件を単独実行し、default reporterでも受領物の表示を再確認した後、待受可能な実行権限で全体回帰を単独実行した。実行は重ねていない。`npm run build`はexit 0。

| 対象 | 制限環境のtest本体時間 | 制限環境の終了 | 待受可能な全体実行内の結果 |
|---|---:|---|---|
| pins the host remaining budget before bind and reserves cleanup inside that same budget | 約29.40ms | runner settled before onReady | passed |
| arms the waiting timer from the host budget rather than the runner default | 約19.52ms | runner settled before onReady | passed |
| enforces the default 385-second budget with three seconds reserved for cleanup | 約17.74ms | runner settled before onReady | passed |

制限環境のJSON実行は3 failed／111非選択、exit 1、全コマンドのreport内時間は約3.42秒。test名フィルターは`pins the host remaining budget before bind|arms the waiting timer from the host budget|enforces the default 385-second budget`、maxWorkers=1で、fileは`tests/review/r2-loopback.test.ts`。111件は診断用の非選択で、testへskipを追加したものではない。3件ともfailureMessagesに上記の早期終了assertionがあり、`timed out`は0件だった。再確認のdefault reporterでも3件は約17〜29msで同じ受領物を表示した。

**待受可能な条件での全体回帰：241 file／10,845 passed／failed 0／pending 0、success=true、exit 0、約32.40秒。** 対象3件もすべてpassedである。全体の名前／fileフィルターはなく、単独確認の非選択件数を全体へ流用していない。

全体は従来と同じ`maxWorkers=3`、verbose＋JSON reporter、silent、外側150000msの観測枠で実行し、outer_stop=false。製品60秒・R2全体385秒／cleanup3秒・各testの30000ms・worker起動上限・既存実行順序・実機E2E／transport除外は変更していない。fake timerで予算を進める試験であり、test本体の短時間終了を製品の385秒予算の短縮や性能改善の主張には使わない。

### 8.2 終了理由・cleanup・環境との区別

default reporterのReceivedには3件すべてで次の固定受領物が表示された。

```json
{"ok":false,"code":"callback_unavailable","cleanup":"complete","mcpListed":false,"otherAccountTokenPossible":false,"tokenMayHaveBeenIssued":false}
```

JSON reporterのfailureMessagesは`expected { ok: false, …(5) } to be undefined`と略記するため、code／cleanupの根拠はdefault reporterのReceivedも併用する。秘密・認可URL・任意の例外本文・結果本文はこの受領物に含まれない。

固定観測metaでは3件ともlisten_attempt→listen_error(EPERM)→close、listening=0、dropped=0。OSのlisten拒否は引き続き存在するが、readyだけを待たずrunner終端を受け取るため、従来の30000ms timeoutにはならない。正常なready到達を前提とする試験は不合格のままであり、環境非対応をskip／成功へ変換していない。fake timerの影響でmeta.at_msに負値が含まれるため、時間はVitestのtest.durationで確認し、metaはイベント順・code・listening数に限って使った。

最初の2件の既存finallyは`root.abort(); await task`を維持している。3件目はraceでrunnerの終了済み受領物を得た後にassertionで失敗する。testプロセスはexit 1まで終了し、上記metaと受領物のcleanup=completeを確認した。これはこの3経路の合成観測で、すべての失敗時のOS resource解放や未観測の取消競合の網羅的な証明ではない。

同一HEADの待受可能な全体実行が成功したことと合わせ、今回のready待ち修正による通常経路の退行は観測していない。この3件の確認範囲では§7の30秒待ちの残課題は解消した。制限環境全体はこのHEADで再実行していないため、§7の125 failedという件数を現在の件数として流用せず、制限環境で全試験が成功するとも主張しない。過去の未完了すべての原因に関する未確定事項は維持する。

### 8.3 証拠と変更範囲

制限環境の対象3件JSON：`/private/tmp/servicenow-readyfix-three-restricted.json`、SHA-256：`2a544073ec0a069ec47898aaf44ef159ad50355665f7458c2adf212d4564b14a`。

待受可能な全体JSON：`/private/tmp/servicenow-readyfix-full-allowed.json`、SHA-256：`cc2a108397c1eea6c89bdc5b0aa90e4c55cb827a14818aedd266d4b9dfcf763e`。

件数・時間・対象3件のstatusはJSONから確認した。raw JSONはローカル一時領域にのみ置き、リポジトリへ追加しない。追加実行権限はローカル合成試験のコマンドに限定し、恒久設定やPDI側の権限・設定を変更していない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実PDI接続・実通信・実機操作・実トークン発行・設定変更・Push・追加実装は行わず、変更は本検証記録のみ。実worker／runtimeへの新接続や正式発行口を開いた検証ではない。

## 9 未実施・残課題

終了証拠→必要verify→新世代ready、元選択集合／input receipt／保持Uとの接続はSR-C後半。WJ-Cのfinish／E・候補消費、実cleanup・外側checkpoint連結はSR-D以降。実発行元、全費目上界、本番cap、正式発行・全体受付は未完了。合成の成功を実終了保証や人の承認へ昇格しない。

実worker／runtime接続・実通信・実機操作・トークン発行・設定変更・permit発行・Pushは行っていない。無関係な`.vscode/`／`CLAUDE.md`は変更していない。

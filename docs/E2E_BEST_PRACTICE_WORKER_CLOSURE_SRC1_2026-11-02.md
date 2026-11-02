# SR-C①：旧世代終了／世代なし内部証拠・one-shot消費の合成検証

Date: 2026-11-02 / 基準HEAD: `fbbd844`。
Status: **独立合成issuerだけの内部契約。実worker／runtime・実終了確認・新世代／finishへ未接続。**

全体回帰の最新状況：§4の初回未完了は履歴として保持する。§5のレビュー後成功に加え、§7の同一HEAD比較でも241ファイル／10,845件成功を確認した。制限環境ではローカルlistenのEPERMとfixtureの待ち方により未完了を再現した。実回復経路が有効になったという意味ではない。

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

## 6 未実施・残課題

終了証拠→必要verify→新世代ready、元選択集合／input receipt／保持Uとの接続はSR-C後半。WJ-Cのfinish／E・候補消費、実cleanup・外側checkpoint連結はSR-D以降。実発行元、全費目上界、本番cap、正式発行・全体受付は未完了。合成の成功を実終了保証や人の承認へ昇格しない。

実worker／runtime接続・実通信・実機操作・トークン発行・設定変更・permit発行・Pushは行っていない。無関係な`.vscode/`／`CLAUDE.md`は変更していない。

## 7 全体回帰未完了の切分け（2026-11-02）

対象HEADは`24cd4ec`。ソース・test・Vitest設定を変更せず、同一ソースで実行権限の異なる条件を比較した。Node v24.18.0、Vitest v5.0.3、darwin arm64、OS release 27.2.0、availableParallelism=10。実資格情報・環境変数の一覧・ServiceNow側のコード本文や実通信本文は取得・表示していない。

### 7.1 停止位置と直接の再現条件

全体を`maxWorkers=3`、verbose＋JSON reporter、silentで単独実行し、10秒ごとに最後に観測したtest file・観測file数・完了行数だけを記録した。実機E2E／transportプロジェクトの除外とunit→real-hostの順序は既存[Vitest設定](../vitest.config.ts)のまま。

制限環境では約50秒で231 fileを観測した後、最後のfileが`tests/review/oauth-g0.test.ts`のまま、約5秒ごとに少数ずつ完了行が増加した。150000msの外側打切りでexit 143、最終JSONは未生成。最後の観測は231 file／完了行10,516である。**これは成功件数ではなくreporterの行数**で、全体合格・全試験完了とは数えない。real-host groupの完了へ至った証拠もない。

同fileの`does not extend token availability past its local retention deadline`だけを、maxWorkers=1で切り出すと以下を直接観測した。

- `listen EPERM: operation not permitted 127.0.0.1`の未捕捉例外（syscall=listen、code=EPERM）。EADDRINUSEではなく、ローカル待受の許可拒否。
- その後、既定の5000msで当該testがtimeout（約5008ms）。1 failed、41件は名前フィルターによる非選択、unhandled error 1、exit 1。
- 失敗位置は[oauth-g0試験](../tests/review/oauth-g0.test.ts)の`issuer()`準備（12行目付近）。`server.listen(0, '127.0.0.1', resolve)`だけを待つPromiseにerror→rejectがなく、OSがlistenを拒否するとPromiseがsettleしない。cleanup登録もlisten成功後である。token保持期限の検証本体や[PDI用ではない合成OAuth harness](../tests/helpers/bp5-oauth-harness.ts)の開始へ到達する前の失敗である。

すなわち、今回再現した経路は「OSのローカルlisten拒否→fixture準備のPromise未settle→各testの5000ms timeoutの累積→全体コマンドの150000ms打切り」。製品処理が150秒動いていたことや、SR-C①の証拠処理がdeadlockしたことを示さない。

verboseの文字列一致で得たworker_unavailable／callback_unavailable／timed out等は、期待エラーを確認するtest名にも含まれる。成功した比較全体実行にも現れたため、それらの出現数を実失敗数として扱わない。また、単独JSON reporterの再実行はtimeoutを記録するが、JSONには上記unhandled EPERMの詳細が入らなかった。原因の証拠はverbose出力とsource照合を併用して判断した。

### 7.2 同一ソースでの比較結果

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

### 7.3 退行との区別・未確定事項

G0試験とharnessはSR-C①前の`fbbd844`と現在でGit blobが同一だった（試験`87f05fc33e417276aac8790cc8bb5d4f8940e51f`、harness`82948a2fd6bc41217c4017803d7daa35cd3ee091`）。単独のG0再現にSR-C①issuerは関与せず、同一HEADの全体も待受可能な条件で成功した。**今回再現した未完了は実行環境の権限制約と既存fixtureのerror処理不足で説明でき、SR-C①の製品／合成契約の退行は観測していない。** 全ての潜在的な退行がないという証明ではない。

§4の過去の150秒打切り時にはOSエラー／環境状態を回収していないため、過去の全実行が今回と同一原因だったとまでは断定しない。§5で挙げた負荷・並行実行の可能性は当時の未確定仮説として残すが、今回の再現を単なる負荷だけで説明しない。

今後の対策候補は、ローカルlisten能力を事前確認し、fixtureのlisten失敗を即時rejectして固定cleanupへ進めること。これは診断性・失敗時の終了を改善する別変更であり、今回実装していない。制限環境でtestをskip／成功へ変えることや、期限を延長する対応は行わない。今回の未完了切分けは完了とし、SR-C後半などの未実装課題は§6のままとする。

### 7.4 証拠と変更範囲

最終全体JSON：`/private/tmp/servicenow-src1-full-allowed.json`。SHA-256：`30dde107fd871d7b89a65dfafd8ef8d3afb61556c40bab7d93c46477764d6f5d`。件数はJSONのtestResultsと集計値、時間はstartTime〜最終testResults.endTimeで確認した。raw JSONは一時領域に置き、本リポジトリへ追加しない。

単独比較JSON：`/private/tmp/servicenow-g0-allowed.json`、`/private/tmp/servicenow-g0-restricted-repeat.json`、`/private/tmp/servicenow-target-isolated.json`。制限環境の全体JSON予定先`/private/tmp/servicenow-src1-diagnostic.json`は未完了のため生成されていない。

変更は本検証記録のみ。ソース・試験・設定・CHANGELOG・正式発行口・全体受付は変更していない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、実worker／runtimeへの新接続・実機操作・実通信・設定変更・Push・コミットは行っていない。既存合成試験のローカルworker／HTTPの実行を、実PDI接続や正式発行口の開放とは数えない。

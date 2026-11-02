# SR-C①：旧世代終了／世代なし内部証拠・one-shot消費の合成検証

Date: 2026-11-02 / 基準HEAD: `fbbd844`。
Status: **独立合成issuerだけの内部契約。実worker／runtime・実終了確認・新世代／finishへ未接続。**

[soft回復claim設計draft-0.7](BEST_PRACTICE_ABORT_SCOPE_SOFT_RECOVERY_CLAIM_DESIGN.md)§14と[親設計draft-0.12](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

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

## 5 未実施・残課題

終了証拠→必要verify→新世代ready、元選択集合／input receipt／保持Uとの接続はSR-C後半。WJ-Cのfinish／E・候補消費、実cleanup・外側checkpoint連結はSR-D以降。実発行元、全費目上界、本番cap、正式発行・全体受付は未完了。合成の成功を実終了保証や人の承認へ昇格しない。

実worker／runtime接続・実通信・実機操作・トークン発行・設定変更・permit発行・Pushは行っていない。無関係な`.vscode/`／`CLAUDE.md`は変更していない。

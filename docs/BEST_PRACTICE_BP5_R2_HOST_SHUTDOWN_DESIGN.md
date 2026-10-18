# BP-5 R-2：専用hostの終了・強制停止設計

Version: draft-0.2 / Date: 2026-10-18 / Status: 設計案。未実装・未試験・実機未承認。

## 1. 範囲と前提

[runner接続設計§7・§8・§14](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)の後続案。
`runR2ApprovalManifest`はcleanup不成立を報告するが、プロセスを終了しない。
ここではその外側の**専用Node main process**の責任を定義する。workerや共有MCP serverへexitを追加しない。

telemetry調査・maint担当者への依頼は保留。実装・プロセス起動/kill試験・実機接続・登録作成・token発行・
アカウント/ロール/ACL/設定変更は行っていない。実manifestも配置していない。
本設計の記載は、実行・導入・公開CLI追加の承認ではない。

基本方針：正常な停止はrunnerのcleanupを待つ。不成立・再度の停止要求・fatal例外では、
レビュー結果を成功として出さず、専用hostだけを終了する。終了確認とアプリのcleanup確認を混同しない。

## 2. 責任分離

| 所有者 | 責任 | 禁止事項 |
|---|---|---|
| 専用host（main thread） | 固定bootstrap、manifest/runnerの呼出し、root Abort、signal/fatal処理、自身の最終exit | 共有server/呼出し元アプリの終了、認可後のtoken付き子起動、再認可/再試行 |
| runner（既存） | listener起動の決着、session/bridge/worker/取得枠のcleanup、固定終了票 | process.exit・kill・診断dump |
| 秘密を持たない監督プロセス（新設案） | 固定hostの起動、独立した期限、所有するhostの停止/終了確認、最終報告 | OAuth交換、token/code/state/verifierのIPC受信、任意PID/コマンド指定、killの全体探索 |
| 運用者 | 実行前の個別承認、発行結果不明時の失効検討、終了未確認時の調査 | 自動失効したとの推定、未確認のまま同じ認可を再開 |

host自身のtimerだけではhostのevent loop停止を監督できないため、実運用前には外部監督も必要とする。
監督のない単体hostは合成試験用に限定し、385秒の独立監督を達成したとはしない。
監督は認可より前にhostを起動し、tokenはhost内で生成・利用する。既存のメモリ内handoffを崩さない。

初期対象はPOSIXのmacOS/Linux。Windowsのsignal/プロセス終了は別設計・試験が済むまで開始拒否。
固定Node executable/固定entryをshellなしで起動し、hostは専用sessionへ分離する案（`detached:true`、unrefしない）。
TTYのsignalを監督とhostで二重計数しないことを実装前に確認する。共有process groupへsignalを送らない。
分離したhostは監督の終了で自動的には止まらない。監督が異常終了し、かつhostのevent loopも停止している場合は、
IPC切断を検知できずhostを止める主体がなくなる。この残余リスクは本設計では解消せず、運用者の調査対象とする（§4・HS-04）。
hostが所有する解析はWorker threadsだけとし、任意のOS子プロセス生成を許さない。

## 3. 期限と監督の開始

全体385秒・作業382秒・cleanup最大3秒は延長しない。次は本プロジェクトの設計値でありNodeの保証ではない。

1. bootstrap/preflightは別枠最大5秒（案）。この段階ではbind/認可/交換を開始しない。
2. 準備済みのhostから非秘密の`prepared`だけを受ける。監督は単調時刻T0を固定し、
   H=T0+385,000msの監督をarmしてから、一度だけ`run_grant`を送る。hostはgrant前にrunnerを開始しない。
3. 監督はT0+382,000msで停止IPCを送り、Hまでに終了しなければ強制停止する。
   IPC遅延でhost内のbind時刻が後になってもHは延長しない。既存runnerの385秒が監督より後に達しても外側が優先する。
4. 途中の取消し/cleanup開始では、host内の終了予算C=min(H相当の残り, 最初の停止時刻+3,000ms)を固定する。
   起動待ち・runner cleanup・終了票の引渡し・自身のexitをこの1つの予算に収める。
   runnerへ残予算を伝える接続が必要で、既存APIのcleanup上限にさらに3秒を追加しない。
5. 監督も最初の停止要求または`stopping`通知から、min(H, 受信時刻+3,000ms)を固定する。
   重複signal、heartbeat、途中の成功票で期限を取り直さない。

T0はbind前のgrant時刻なので、実際の利用可能時間は385秒より短くなり得る。grant自体は人の承認証明ではない。
hostのpreflight時と実runner開始時にmanifestを再検査し、設定期限/bindingの検査を省略しない。
監督はhostとは独立した時計で監督する。別プロセスのperformance.nowをそのまま比較しない。
早期停止のIPC遅延・失念で双方の3秒境界が一致しない可能性は試験対象とし、少なくともHを拡張しない。
OS/監督自体の停止やsignal配送遅延まで含む厳密な実時間保証はしない。

## 4. 終了状態と優先順位

`running → draining → exit_requested → exited`を通常経路とし、各状態から`forced`または`fatal`へ一方向に移る。
first_stop_reasonは固定する。別にterminal_reasonを持ち、fatal/cleanup不成立/強制終了は成功より優先する。
一度停止した認可単位をrunningに戻さない。後から届いた成功応答やrunner結果を採用しない。

| 入力/事象 | 専用hostの判断 | 監督の判断 |
|---|---|---|
| 通常のrunner完了・cleanup complete | 結果を検証して1回だけ引渡し、自分の購読/timer/IPCを閉じ自然終了 | 終了確認後だけ採用。内側isError/partialは維持 |
| 最初のSIGINT/SIGTERM・停止IPC | 新規処理禁止、固定理由でroot Abort、残予算内でrunnerを待つ | 早期終了期限を固定。再送で延長しない |
| runnerがcleanup_incomplete | 結果破棄。非zeroで自分を即時終了し、非同期後始末を追加で待たない | 生存していれば所有hostへ強制停止。cleanupはincompleteのまま |
| 期限C/Hに到達 | 未完了/遅い結果を破棄、強制exit | H/Cで所有hostが未終了ならSIGKILL要求 |
| 2回目の利用者停止要求 | drainingを打ち切り、再度3秒待たず強制exit | 所有hostへSIGKILL要求。signal送信だけで終了済みとしない |
| uncaughtException/unhandledRejection | §6のfatal経路。再開/成功報告/非同期cleanup待ちなし | 非zero exitまたはfatal/無応答を失敗として扱う |
| host IPC切断 | 監督を失ったためfail-stop。自分を非zeroで終了する案 | 生存hostのIPC異常なら成功を棄却し停止 |

強制exitはhostのmain threadでの`process.exit(nonzero)`を指す。hostのIPC送信完了・stdout flush・
worker terminate Promiseを待たない。main threadが止まっていれば外部監督のSIGKILLが最終手段となる。
`process.abort()`はcore dumpを生むため使わない。signal handlerを外して同じsignalを送り直す方式にも依存しない。

正常時もIPC backpressureや残存handleでC/Hを超えれば強制経路へ移り、無期限の自然終了待ちにはしない。
監督のkill失敗/終了未確認時は成功にせず、後述の固定理由を残す。無関係なプロセスを止めて救済しない。
停止対象は自身がspawnしたChildProcess handleだけとし、exitを観測した後の遅延killを禁止する。
外部入力のPID・PID再探索・プロセス名検索・負のPID/process group・子孫一括killは使わない。

## 5. SIGINT再入力とhandlerの所有権

利用者のCtrl-Cは原則監督が1か所で数え、hostへは固定IPCを送る。1回目は`stop`、2回目は`force`。
最初がSIGTERMで次がSIGINTでも、draining中の新たな利用者停止要求は強制終了要求として扱う。
同じOS signalと、それから作ったIPCを2回として数えない。親子へのTTY同時配送を避ける構成を前提にする。
hostをPID指定で直接停止した場合はhost側で数え、対応する通知を監督が再度の利用者要求と数えない。

現runnerは自身でSIGINT/SIGTERM handlerを登録するため、host handlerをただ重ねる実装はしない。
後続実装で信頼済み内部optionとしてsignal所有者を選べるようにする案：

- 既存の直接呼出しはrunner所有を既定のまま維持し、既存テストを変えない。
- 専用host経由だけhost所有にし、runnerはprocess handlerを追加せず、外部root signalに従う。
- さらにcleanup開始を知らせる非秘密の内部hookを設け、Cの固定と残予算の伝播を可能にする。
  hookは資格情報/例外/結果本文を運ばず、失敗時も別の承認経路に進まない。
- 共有MCP/SDK/workerはhost終了handlerを持たない。`removeAllListeners`は使わず、自分のhandlerだけを解除する。

2回目が来ても終了票の送信を必須にしない。送信不能なら監督のsignal/exit観測から強制終了・cleanup未確認を報告する。
signalが合成/併合されて2回を観測できない場合も、独立期限で停止させる。キー入力回数の厳密な保証はしない。

## 6. 未捕捉例外・未処理Promise rejection

通常のrejectはトップレベルで明示catchしてrunnerの失敗に変換する。
それでも未捕捉となったものは、未知の例外値の種類にかかわらず**即時fatal**とする。

専用の最小bootstrapでfatal handlerを登録してから、runner等を動的importする設計とする。
`uncaughtException`/`unhandledRejection`は固定fatal処理へ集約し、引数を読んだり記録したりしない。
Error.message/stack/cause、String/JSON.stringify/inspect、Promise/reasonの保存、custom getterの評価をしない。
`uncaughtExceptionMonitor`だけでは既定のstack表示を抑えられないため、非出力対策の代わりにしない。

fatal処理は再入ガードと結果の採用停止、固定非zero exitだけを最小の同期処理で行う。
正常処理へ戻さず、Abort通知の任意callbackやasync cleanup・追加のIPC送信を必須処理として呼ばない。
元例外をabort reasonへ埋め込まない。後からrejectionHandledになっても復帰しない。
bootstrapより前の構文/loader失敗、handler自身の例外、native fatalは制御不能になり得るため、次の出力境界も必須とする。

## 7. 秘密非出力と監督用IPC

- hostのstdout/stderrは監督がspawn時にOSレベルで`ignore`へ向ける案。`pipe`で読み取って破棄する方式にせず、
  親がraw stack/レスポンスを取り込むこと自体を避ける。hostから直接コンソールへ結果を出さない。
  stdioは`[ignore, ignore, ignore, ipc]`固定とし、stdinやTTYも継承しない。
- 入力は固定entry・非秘密manifest pathだけ。token/code/state/verifier/認可URL/client secretをargv/env/一時ファイル/IPCへ出さない。
  Nodeの起動flag/環境はallowlistで構築し、未検証のNODE_OPTIONS・preload・inspector・診断reportを継承しない。
  OS core dump等の既存運用が秘密管理に適合するかは導入前条件で、自動で設定変更しない。
- 制御IPCはstrictな固定messageだけ：`prepared/run_grant/ready/stopping/stop/force/finished/finished_ack`。
  任意module/command/PID/endpoint・例外/headers/raw応答・sendHandleを許さない。
  spawn時に`serialization: 'json'`を明示し、advanced serializationによる型の拡張を受けない。
  順序/回数/サイズ/期限違反は停止し、部分的に受理して続行しない。
- readyには固定start URLまたは固定識別子しか含めない。auth URLは既存の一度限りの開始ページだけに置く。
- finishedにだけ既存runner終了票/許可済み0.2/0.3結果を含め、個別256KiB、run全体512KiB、制御message 1KiB以下を上限案とする。
  envelope込みで上限超過なら結果を省略して固定失敗にする。Node IPC受信後の検証だけでは先行deserializeを
  防げないため、hostを信頼済み固定codeとして扱い、侵害済みhostからの耐DoSを保証しない。
- 監督はスキーマ/固定enum/結果上限を再検証する。実秘密の一致ガードは引き続きhost内connectionが担当し、
  その検査のために秘密を監督へコピーしない。出力先やファイル保存は別承認。

正常hostはfinishedを送った後、監督の形式受理を表すfinished_ackだけを残予算内で待ち、
意図した終了状態を先に固定してからIPCを閉じる。意図したdisconnectは§4の監督喪失と区別する。
ackは結果の最終採用/人の承認ではない。監督はさらにexit/closeを待つ。
ackやsend callbackの未着、意図しない切断は予算を延長せず失敗にする。fatal/forceではackを待たない。

## 8. 終了確認と報告契約案

runnerのJSONと0.2/0.3契約は変更せず、監督の終了報告は別の`bp5-r2-host-exit-0.1`とする案。
候補field：`terminal_reason`（固定enum）、`process_termination`（confirmed/unconfirmed）、
`cleanup`（complete/incomplete/unknown）、`token_issuance`（not_attempted/possible/unknown）、
`other_account_token`（possible/not_reported/unknown）、検証済みの`runner_receipt`（任意）、`host_exit`（codeまたはsignal）。
このスキーマは今回未実装。reason/enumの網羅とJSON上限は実装前に確定する。

正常結果の採用条件は、正しいfinished 1件・runner cleanup complete・hostの期待exit・監督による終了確認のすべて。
finishedだけ、exit code 0だけ、killの戻り値や`subprocess.killed=true`だけでは成功としない。
`exit`でプロセス終了を、`close`でstdioの終端まで確認する。確認待ちは新しい実行予算を作らず、
停止後最大1秒（案）の**観測枠**で打ち切る。この枠ではhostを稼働させてよいという意味はなく、Hまでにkillを要求する。
観測期限を超えれば`process_termination=unconfirmed`、最終理由`termination_unconfirmed`とし、運用者へ引き継ぐ。

SIGKILL/強制exitはOSによる回収を要求するもので、アプリのcleanup・秘密のゼロ化・サーバーtoken失効の証明ではない。
runnerがincompleteを返した後にhost終了を確認できても、cleanupをcompleteへ格上げしない。
異常終了で信頼できる最終票がない場合、token発行はunknownとし、通知がなかっただけでnot_attemptedにしない。
not_attemptedは検証済みrunner票と整合する終了を確認できた場合に限る。自動失効・再実行はしない。

| 専用host/監督用exit code案 | 意味 |
|---|---|
| 0 | lifecycle終了・内側isError=false。partialや候補なしを安全と主張しない |
| 10 | 検証済みの通常失敗/内側isError=true |
| 70 | fatal例外/rejection。runner結果採用不可 |
| 71 | cleanup不成立/期限内にhost終了しないため強制停止 |
| 72 | 再度の利用者停止要求による強制停止 |
| 73 | 監督でも終了未確認。最優先で成功を棄却 |
| 124 / 130 / 143 | 期限切れ / SIGINT / SIGTERMで、cleanup成立を確認できた停止 |

SIGKILL時の実OS終了signalはそのまま別fieldで保持し、hostが71等を返したと捏造しない。
上表はプロジェクト独自の案で、Nodeの予約codeや既存CLIの終了契約へ今回適用していない。

## 9. 後続の合成検証・実装前ゲート

全ケース未実施。実PDIや本物の資格情報は使わず、専用子・合成値・実Worker/loopbackで試験する。

| ID | 確認する境界 |
|---|---|
| HS-01 | cleanup completeの正常終了。0.2/0.3・partial/isError維持、自然終了、stdout/stderr非露出（試験専用にpipeで起動して観測。本番の`ignore`構成とは分けて記録） |
| HS-02 | 非終了worker/遅いbind・closeでcleanup_incomplete→host停止。worker/port消滅確認とcleanup報告を分離 |
| HS-03 | 実SIGINT 1回でdrain、2回目は即force。SIGTERM→SIGINT、cleanup中の再入力、TTY二重配送も検証 |
| HS-04 | main event loopを停止させ、独立監督がHで所有hostのみ停止。kill失敗/終了未確認/監督クラッシュも切り分け |
| HS-05 | secretをmessage/stack/cause/custom toStringに含むthrow、非Error throw、unhandled rejection、後からhandledをfatal化 |
| HS-06 | 動的import失敗・bootstrap前構文失敗・fatal handler再入でもraw出力を見せず、成功を採用しない |
| HS-07 | finished送信のbackpressure・切断・過大/重複/順序違反IPC。flush待ちで予算を延長しない |
| HS-08 | kill送信成功だが未終了、exit/close順序、code0だが票なし、票はあるが異常exit、遅い成功票の拒否 |
| HS-09 | 取消/強制/fatal時のtoken発行unknown、別アカウント票、サーバー失効は未実施と記録 |
| HS-10 | ライブラリ単独の既存signal処理・全テスト・梱包のR-2非同梱を維持。共有server/親/無関係な子を終了しない |

初期実装順：signal所有者/cleanup hookと予算接続 → 専用bootstrap/host → 監督の固定起動/終了確認 →
fatal/再入力の子プロセス試験 → main停止/終了未確認の試験。各段階で別途実装承認を得る。
hostを外部監督へ接続するまで実機認可は開始しない。公開CLI/配布、Windows、実機実行は別承認。

## 10. 公式根拠と設計判断の区別

参照日2026-10-18。Node v22.23.3の公式資料を確認した。最小engine 22.12.0や他の採用版での実動作は別途試験する。
これまでのR-2合成試験はローカルのNode v24.18.0で実行した。HS試験はengine下限の22.12系と開発環境の24系の両方で実施する。
5秒/382秒/385秒/3秒/1秒、状態・IPC・exit code・POSIX限定は本プロジェクトの設計案。

| ID | 根拠URL・該当箇所 | 確認した仕様 |
|---|---|---|
| H-SRC-01 | [Process: Signal events](https://nodejs.org/docs/latest-v22.x/api/process.html#signal-events) | SIGINT/TERM handler追加で既定終了が外れる。SIGKILLはhandler不可 |
| H-SRC-02 | [Process: uncaughtExceptionの警告](https://nodejs.org/docs/latest-v22.x/api/process.html#warning-using-uncaughtexception-correctly) | 正常再開せず、同期的な後処理後に停止。別プロセスの監督を推奨 |
| H-SRC-03 | [Process: unhandledRejection](https://nodejs.org/docs/latest-v22.x/api/process.html#event-unhandledrejection)、[process.exit](https://nodejs.org/docs/latest-v22.x/api/process.html#processexitcode)、[process.abort](https://nodejs.org/docs/latest-v22.x/api/process.html#processabort) | 未処理rejectionは別イベント。exitは未完了I/Oを打ち切り得る。abortはcoreを作る |
| H-SRC-04 | [ChildProcess: killed](https://nodejs.org/download/release/v22.23.3/docs/api/child_process.html#subprocesskilled)、[exit](https://nodejs.org/download/release/v22.23.3/docs/api/child_process.html#event-exit)、[close](https://nodejs.org/download/release/v22.23.3/docs/api/child_process.html#event-close) | killedは終了確認ではない。exitとstdioのcloseは別 |
| H-SRC-05 | [Worker: Class Worker](https://nodejs.org/download/release/v22.23.3/docs/api/worker_threads.html#class-worker)、[terminate](https://nodejs.org/download/release/v22.23.3/docs/api/worker_threads.html#workerterminate) | worker内exitはそのthreadだけ。terminateのPromiseはexit時に成立 |

本文の実装案は、これらの仕様から行った設計判断であり、実装済み/安全性実証済みという意味ではない。
OS全体の停止、監督ごとの侵害/停止、core dump/メモリの完全消去、プロセス終了後のServiceNow token失効は保証しない。

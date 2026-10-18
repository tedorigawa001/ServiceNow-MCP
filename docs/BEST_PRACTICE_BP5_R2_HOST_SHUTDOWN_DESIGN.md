# BP-5 R-2：専用hostの終了・強制停止設計

Version: draft-0.5 / Date: 2026-10-18 / Status: runner・専用bootstrap/host・外部監督を内部実装・合成検証。公開CLI・実機/運用は未承認。

## 1. 範囲と前提

[runner接続設計§7・§8・§14](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)の後続案。
`runR2ApprovalManifest`はcleanup不成立を報告するが、プロセスを終了しない。
ここではその外側の**専用Node main process**の責任を定義する。workerや共有MCP serverへexitを追加しない。

telemetry調査・maint担当者への依頼は保留。runner接続は§11、専用bootstrap/hostは§12、外部監督は§13の範囲を実装した。
実機接続・登録作成・実token発行・
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
監督のない単体hostは合成試験用に限定する。§13は385秒境界を合成時計で、独立した実子停止を短縮期限で検証した。
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

runnerの既定は自身でSIGINT/SIGTERM handlerを登録するため、host handlerをただ重ねる実装はしない。
信頼済み内部optionによるsignal所有者切替・cleanup通知・残予算は§11、専用hostへの接続は§12に実装した：

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
§13で`R2SupervisorReport`の固定出力型として具体化した。外部向けJSON Schemaの公開/配布はしていない。
入力となるfinished/内側JSONはstrictスキーマで再検証する。出力フィールドとenumは§13を参照。

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
| 10 | 通常失敗/内側isError=true、起動前提・IPC違反等のfail-stop（終了票なしの場合もある） |
| 70 | fatal例外/rejection。runner結果採用不可 |
| 71 | cleanup不成立/期限内にhost終了しないため強制停止 |
| 72 | 再度の利用者停止要求による強制停止 |
| 73 | 監督でも終了未確認。最優先で成功を棄却 |
| 124 / 130 / 143 | 期限切れ / SIGINT / SIGTERMで、cleanup成立を確認できた停止 |

SIGKILL時の実OS終了signalはそのまま別fieldで保持し、hostが71等を返したと捏造しない。
上表はプロジェクト独自の案で、Nodeの予約codeや既存CLIの終了契約へ今回適用していない。

## 9. 後続の合成検証・実装前ゲート

§12・§13でHS-01/02/03/04/05/07/08/09/10の一部を専用host/監督の合成試験として実施した。
監督を含む下表全体・各行の全境界は未完了であり、HS全体完了とはしない。
実PDIや本物の資格情報は使わず、専用子・合成値・実Worker/loopbackで試験する。

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

実装順：signal所有者/cleanup hookと予算接続 → 専用bootstrap/host → 監督の固定起動/終了確認 →
fatal/再入力の子プロセス試験 → main停止/終了未確認の試験。各段階で別途実装承認を得る。
内部接続の合成試験から実機認可の承認を推定しない。公開CLI/配布、Windows、実機実行は別承認。

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

本文はこれらの仕様から行った設計判断。§11～§13に明記した実装・合成試験以外を実装済み/安全性実証済みとはしない。
OS全体の停止、監督ごとの侵害/停止、core dump/メモリの完全消去、プロセス終了後のServiceNow token失効は保証しない。

## 11. runner接続初段の実装境界（2026-10-18）

[合成検証記録](E2E_BEST_PRACTICE_R2_HOST_CONNECTION_SYNTHETIC_2026-10-18.md)を参照。
`R2RunnerOptions`に次の信頼済み同一プロセスAPIだけを追加した。CLI/MCP/manifest/envから指定する口はない。
optionsの値/関数参照は呼出し時にshallow-copyし、外側のoptions書換えで所有者・signal・callbackを替えない。

| option | 契約 |
|---|---|
| `signalOwner` | 省略/`runner`は従来どおり自身のSIGINT/TERM handlerを管理。`host`はprocess handlerを一切追加/削除せず、外部AbortSignal必須。不明値はbind前に拒否 |
| `onCleanupStart` | 同期・一度限りの通知。freezeした`{reason, remainingMs}`だけを渡す。reasonはcompleted/cancelled/interrupted/deadline_exceeded/failed。remainingMsは通知時点の残予算上限（非負整数、最大3,000）で、予約時間の保証ではない |
| `hostRemainingMs` | hostとrunnerが同じ単調時計を使う同期reader。有限numberを返す。0/負数は予算切れ、NaN/Infinity/非数値/throwは不正。Promiseは待たず拒否し、rejectも処理して秘密を含む未処理例外にしない |

通知は最初の取消し/期限/signalでroot Abortを伝播する前に行う。通常完了/通常失敗はrunnerのfinallyの入口で行う。
preflight失敗にも1回通知する。これはrunner全体のdraining開始であり、session内の段階ごとの通常cleanup完了通知ではない。
再入/重複Abort/finallyで再通知しない。通知は資格情報・例外・結果・path/本人IDを渡さず、runner結果にも追加しない。
callbackはundefinedを返す同期処理に限る。throwやundefined以外の戻り値（Promise含む）は
`cleanup_notification_failed`とし、成功結果を捨てる。ただしcleanupは続行する。
不正なPromiseのrejectは捕捉し、未解決Promiseを待たない。生の例外/戻り値を出力しない。

host予算はmanifest読込前から観測し、観測時刻+clamp(remaining, 0, 385,000)の最小値を期限として保持する。
bind開始時に、runnerの全体期限とこのhost期限の小さい方からcleanup枠を差し引いて作業期限をarmする。
各await後などの観測で短くなればtimerも短縮し、大きな値が後で返っても期限を延長しない。
作業開始前にcleanup枠を超える残りがなければbindしない。既存の385秒/3秒の上限を広げず、
manifest/C方式設定の有効余裕も引き続き385秒超を要求する。

最初のdraining時刻でcleanup期限をmin(全体期限, host期限, 現在時刻+cleanup上限)に固定する。
通知callback自身が同期的に使った時間、finally到達までの時間もこの枠から消費する。
finallyでhost予算を再観測してさらに短縮し、起動待ち/closeは残りだけを共有する。新しい3秒を付けない。
通知が失敗しても資源解放は試み、cleanup不成立の場合は`cleanup_incomplete`を優先して結果を捨てる。
予算readerが途中で不正になれば`host_budget_invalid`で停止し、cleanup予算も確認不能ならincompleteとする。

readerはpolling監督ではない。await中にhostが**絶対期限をさらに短縮**した場合は、host側で外部signalもAbortする必要がある。
通常の残秒減少は同じ期限を表す。通知/readerが同期的にevent loopを停止させる場合は中断できず、
別プロセスの独立監督が必要という留保は変わらない。runnerは終了/kill/fatal handler/IPCを追加していない。

専用bootstrap/hostは§12、外部監督は§13を参照。§9のHS全体試験・Node 22.12系での確認・実機承認は未完了。

## 12. 専用bootstrap/hostの内部実装（2026-10-18）

[合成検証記録](E2E_BEST_PRACTICE_R2_HOST_SYNTHETIC_2026-10-18.md)。公開CLI/bin/MCP登録・npm同梱は追加しない。
`r2-host-entry.ts`は最小bootstrapのfatal handlerを登録してから固定の`./r2-host.js`を動的importする。
ソース実行時は既存tsx loader、本番ビルドでは固定.js経路を使う。引数はmanifest pathのみ。
main thread・POSIX・接続済みIPCが必要で、共有MCPから呼ぶ関数ではない。
同一プロセスのテストoptionはlower-only期限・fake fetch等の信頼済み境界であり、IPC入力ではない。

- 安全なmanifest読込・破棄をpreflightし、非秘密`prepared`を送る。最大5秒の自己timerを持つ。
  runnerは一度限りの`{type:'run_grant',remaining_ms}`まで開始しない。manifestはrunnerで再検査する。
  grantは整数・cleanup超・385,000ms以下。監督の未実装をこのgrantが補うわけではない。
- `ready`は固定識別子だけ。認可URL/path/本人IDはIPCへ送らない。
- 最初のSIGINT/SIGTERM/stopでroot Abort、cleanup開始を通知し、全体残りと3秒の小さい方へ期限を固定。
  runner/終了票/ack/自然終了で同じ予算を消費する。再度の停止は72で即時exit。
- cleanup不成立または期限到達は71で即時exit。結果を送らず、追加の非同期cleanupやackを待たない。
- cleanup completeだけ`finished`にrunner終了票を送る。ackを残予算内で待ち、意図したdisconnectへ移る。
  自然終了を妨げる残存handleがあれば、unrefした期限timerで71へ移る。成功時0、通常失敗10、
  期限124、SIGINT130、SIGTERM143。内側isErrorも維持し、partialを安全性成功と読み替えない。
- 受信はJSON IPCの固定type/厳密key/順序/回数/1KiB、全体512KiBを検査する。
  finished envelopeは256KiB、送信全体512KiBまで。違反/予期しない切断/送信失敗は10でfail-stop。
  Nodeによる受信前deserializeの上限を保証しない。監督側での再検証は§13に実装した。
- fatal handlerは理由引数を受け取らず、format/保存/Abort/IPC/cleanupをせず70でexitする。
  **Node自身はhandlerより前に例外のstack getter等へ触れる場合がある**。実装内で読まないことと、
  Nodeランタイムまでgetter評価しないことは異なる。将来監督のstdout/stderr=`ignore`は引き続き必須。

§12単体の合成controllerは試験専用で、独立監督/公開launcherではない。hostの自己timerだけではevent loop停止を止められない。
外部監督は§13を参照。token失効、メモリ完全消去、Windows対応、Node 22.12確認は未達。実PDI運用は別承認。

## 13. 秘密を持たない外部監督（2026-10-18）

[合成検証記録](E2E_BEST_PRACTICE_R2_SUPERVISOR_SYNTHETIC_2026-10-18.md)。
`r2-supervisor.ts`・固定`r2-supervisor-entry.ts`・`r2-host-protocol.ts`を内部実装した。
公開bin/MCP登録・npm同梱・自動ブラウザー操作は追加しない。監督はmanifest本文を読まず、
非秘密の絶対pathだけを固定hostへ渡す。OAuth交換・本人確認・秘密比較は引き続きhost内だけ。

### 13.1 起動・独立期限・停止

- 現在の`process.execPath`と固定entryをshellなしで起動する。compiledは相対固定`.js`、
  sourceは固定tsx loaderと固定`.ts`。任意executable/module/PID/flag/envを外部から指定できない。
- `env={}`・`stdio=['ignore','ignore','ignore','ipc']`・JSON serialization・`detached:true`を固定する。
  argv/envへ秘密を追加せず、親のNODE_OPTIONS/execArgv/preload/inspector/stdio/TTYを継承しない。
  `spawnHost`は信頼済みOSテスト境界だけで、manifest/IPC/公開入力ではない。
  専用監督自身も秘密のないenv/検証済みflagで起動する前提。entryは、呼出し元から最初に注入された秘密の不在を証明しない。
  共有アプリへこの関数を組み込んだだけでは、秘密のない専用監督プロセスを設けたことにはならない。
- spawn～preparedに最大5秒。prepared一度だけでT0を固定し、**監督自身の**382秒/385秒timerをarmしてからgrantを送る。
  hostの準備やIPC配送遅延でHを延長しない。grantは送信時の残りを整数に切り下げる。
- 382秒でstop IPC、385秒で所有ChildProcess handleにSIGKILLを要求する。最初の停止/host stoppingで
  C=min(H, 今+3秒)を一度だけ固定し、結果/ack/自然終了を同じ枠へ収める。lower-onlyの合成試験optionを持つ。
- 最初のSIGINT/SIGTERM/AbortSignalは取消し。再度の利用者signalはforce IPCとSIGKILL要求へ移る。
  hostからのstoppingを利用者の2回目として数えず、detachedによりTTY由来の親子二重配送を避ける構成。
  stop IPCは既存host仕様のためhostの正常停止codeは130（SIGTERMや監督期限でも同じ）。
  監督のterminal_reasonと実際のhost_exitを別に記録し、143/124だったと捏造しない。
- force後の遅いmessageは採用しない。killは所有handleに一度だけで、exit観測/exitCode・signalCode確定後は送らない。
  PID探索・process group・他の子への停止・再起動・再認可はしない。

### 13.2 IPC・結果採用・終了確認

固定type・key・順序・重複・sendHandleを検査し、制御1KiB/finished envelope256KiB/受信総量512KiBを守る。
生のエラー/拒否フィールドを報告へコピーしない。終了票のcodeは固定allowlist、成功時の本文は
既存0.2/0.3集約スキーマまたは固定MCPエラーを再検証し、per-user・code_return_mode=noneの契約を維持する。
JSONは検証後の値から再シリアライズする。実秘密はこの検証のためにも監督へ渡さない。
信頼済みhost内の秘密一致ガードが先に働く前提であり、侵害hostが任意の自由文字列へ秘密を混入することまで保証しない。

finishedは仮の候補で、ack送信成立・cleanup complete・期待exit・exitとclose両方・期限内の全条件が揃って初めて採用する。
取消し/期限切れ後の成功票、ack後も生き残るhost、矛盾exit、票なしcode0は成功にしない。
監督側ready通知も同期undefined限定で、throw/Promiseは固定失敗へ倒し、拒否Promiseも非出力で消費する。
終端理由はforce時に固定し、SIGKILL後のdisconnectで元の期限理由を書き換えない。

kill要求またはexitから最大1秒の**観測枠**でexit/closeを待つ。killのtrue/killedだけで終了としない。
観測不能ならtermination_unconfirmedを優先し、未知のtoken状態・元のhost_exitをそのまま返す。
この場合だけ自身のIPC/参照を解除して運用者へ引き継ぐ。active中はunrefせず、観測枠でhost稼働を許可する意味ではない。
spawn失敗のcloseのみはnot_started、通常のcloseのみは終了未確認として扱う。所有signal handler/timerだけを解放する。

### 13.3 固定報告契約

`schema_version='bp5-r2-host-exit-0.1'`。次の小さな固定metadataと、採用条件を満たしたrunner_receiptだけを返す。
report自体は保存/表示せず呼出し元へ返す。専用entryは固定exit codeだけで終了し、stdoutへJSONを出さない。

| field | 値/条件 |
|---|---|
| terminal_reason | completed / review_failed / cancelled / deadline_exceeded / forced_stop / host_failed / cleanup_incomplete / fatal / protocol_error / spawn_failed / preflight_timeout / invalid_options / unsupported_platform / termination_unconfirmed |
| process_termination | not_started / confirmed / unconfirmed。confirmedはexitとclose両方を観測した場合のみ |
| exit_observed / close_observed | 監督が観測したboolean。遅い成功票で書き換えない |
| kill_request | not_requested / sent / failed。sentは終了確認ではない |
| cleanup | complete / incomplete / unknown。completeは採用済み票のみ、host code71はincompleteを維持 |
| token_issuance | not_attempted / possible / unknown。異常終了・無効票・強制停止はunknown、not_attemptedは整合した採用票のみ |
| other_account_token | possible / not_reported / unknown。採用済み票のboolean以外から推定しない |
| host_exit | OSで観測したcode/signal、観測前はnull。SIGKILLをhost code71へ変換しない |
| runner_receipt | 任意。検証・ack・整合した終了が揃った場合だけ。partial/isErrorを保持 |

completedはlifecycleの完了であって、指摘なし/安全性/analysis_completeの主張ではない。
公開JSON Schema・公開launcher/配布は別工程。保管/表示先も別承認。

### 13.4 残る制約

385秒の境界は合成時計、実プロセス停止は短縮した期限で確認した。385秒を実時間で待つ試験は未実施。
監督自身/OSの停止・signal配送遅延・監督のクラッシュとhost停止が同時に起きる場合・kill失敗は絶対停止保証の範囲外。
観測不能時に他PIDや共有process groupを止めて回復しない。サーバーtoken失効・完全メモリ消去も保証しない。
実TTYでの配送、Node 22.12、Linux/Windowsの実行、HS全ケース、実認可/実PDI操作、運用適用は未確認または未承認。

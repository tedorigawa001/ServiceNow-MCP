# worker ready／finish待ちの切り分け計画

Version: draft-0.2 / Date: 2026-11-04 / 調査基準HEAD: `c581e5c`。

draft-0.1のレビュー修正: スイート全体の負荷の仮説H5とその採取手順、`ReviewTestScope`の観測範囲外、既存JSONのworker別時刻、§6の実行順を追加した。§2〜5の現行経路と対照の内容は変更していない。

Status: **静的調査と検証計画のみ。観測実装・追加実験は未実施。** 正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。製品／試験期限・並列設定を変更せず、seal成功・実接続・実通信・設定変更・Pushは行わない。

## 1 目的と既知の証拠

[AC-B検証記録](E2E_BEST_PRACTICE_ATOMIC_STAGING_ACB_2026-11-04.md)§9〜12の未解消候補2を対象とする。adapterの取消・終了待ちは`fc910ff`で接続され、`c581e5c`でworker drain・復元順・close失敗の回帰が補強された。最新記録は287ファイル／13,773件成功（通常並列とmaxWorkers=3を各1回）。これを今回再実行した結果や、断続的失敗の完全解消とは扱わない。

過去のtarget-selection失敗9ケースでは、最後のworkerについて8件がready形メッセージ未観測、1件がready形メッセージ観測後にfinish開始約4,807ms・terminate約5,002msだった。全9件で後始末後のpending=0、worker exitedを確認済み。ただし、どのCPU／loader工程が遅れたかは未確定である。これらは当時のJSONからの知見で、新規実験ではない。

「最後のworker」だけの要約では読み取れない値を、同じJSONから次に示す。時刻はcase相対のmsで、原因の証明ではない。

| case | worker | 生成 | ready形message | finish開始 |
| --- | --- | --- | --- | --- |
| BR-005 | 1個目 | 22 | 3,687 | 4,807 |
| CL-008 | 1個目 | 5 | 2,232 | 2,336 |
| CL-008 | 2個目 | 2,438 | 3,888 | 3,979 |
| CL-008 | 3個目 | 4,006 | なし | なし |

BR-005はfinish待ちの例だが、5秒のうち約3.7秒はready形messageより前に経過している。CL-008はready未観測の8件に含まれるが、同case内で3個目のworkerまで進んでいた。

timeoutはworkerの経路だけで起きたものではない。過去2回の5秒timeout 23件のうち、target-selectionは9件である。残り14件のうち9件は`dom-client`、`ui-policy`、`http-classification-legacy`、`synthetic-*`で、これらのファイルにはworker・子プロセス・adapterの直接利用が検索で見つからない。`full`の10件でも5件は`mcp-review`、`evaluation-v2`、`new-followups-evaluation`、`worker-lifecycle`で起きている。

確認する仮説は分離する。

- H1: worker生成からreadyまでの起動／loader／import待ちがcaseの時間を消費する。
- H2: ready後のanalyze・finalize・親側decode／受理が時間を消費する。
- H3: 同case内の複数review／envelopeと親側schema・偽造対照の累積で、後段finishへ到達する余裕が小さくなる。
- H4: 製品停止後のworker終了／session解放、またはtest hookの時間が別途残る。
- H5: スイート全体またはマシン全体の負荷（CPU競合・event loop遅延等）がworkerの有無を問わず各caseを遅らせ、H1〜H4の時間も同時に伸ばす。

H1〜H5は併存し得る。単回成功／固定遅延の合成再現から自然発生時の原因を断定しない。

## 2 現行経路と費目の境界

根拠は[監督](../src/review/worker-supervisor.ts)、[adapter](../src/review/update-set-adapter.ts)、[worker](../src/review/review-worker.ts)、[test scope](../tests/review/fixtures/review-test-scope.ts)。

1. adapterはHTTP取得・release判断等の後、必要になった時点でCPU workerを生成する。生成／module・loader起動も同sessionのphase残時間に含む。
2. supervisorはreadyを待ち、同workerへanalyze／finishを送る。workerはimport完了・message listener登録後にreadyを送信する。
3. finish前にはphase予約を0へ戻すが、開始時の全deadlineを新設しない。各exchangeはその時点の残時間と外部signalで停止する。
4. analysis側のsoft期限後は、旧workerの終了を待ってから別のfinalization workerを生成する経路がある。同case内でworkerが複数あっても、直ちに漏れや重複起動としない。
5. adapterはCPU closeをawaitし、finallyでsessionをcloseし、最後に残時間／取消を確認して返す。test scopeは元reviewの終了まで待ってからmock・時計を復元する。

比較対象となる時計は別である。既存unit caseの5秒、hookの期限、sessionの全60秒とphase残時間を同じdeadlineと呼ばない。既存の短縮limitsを使う合成試験もその設定値を記録し、既定製品期限を変更したことにしない。

## 3 既存診断で分かること／分からないこと

| 現行値 | 確認できる範囲 | 不足・注意点 |
| --- | --- | --- |
| `created_ms` | worker factoryが返った後の親側経過時刻 | factory呼出し前／返却までの同期時間は分離できない |
| `ready_ms` | 親のscope listenerがready形のmessageを観測した時刻 | supervisorによるstrict検査・受理完了の証拠ではない。重複時は上書きされる |
| `analyze_started_ms`／`finish_started_ms` | 最初の該当postMessage呼出し直前の時刻 | 送信成功・worker側受信ではない。2回目以降・各replyとの対応は不明 |
| `last_reply_ms` | ready形以外の最後のmessage観測 | 要求への相関・正常受理・解析完了を示さない |
| `terminate_ms`／`exit_ms`／`exited` | terminate呼出し・OS worker exit観測 | terminate Promise完了、review finally完了とは別 |
| pending／abort／close状態 | scopeの現在の所有状態、終了後に未完了reviewがあるか | review別の開始／完了・失敗stage、case内の累積内訳はない |

§1の「ready」はこの観測上の意味で解釈する。過去の時刻や集計値を改変せず、受理済みと過大評価しない。scopeは`process.hrtime.bigint()`で経過を測るため、偽DateのUTCと混ぜない。JSON assertion配列の並びも実行開始順には使わない。

## 4 後続のtest-only観測契約（未実装）

最初の実装範囲は親側の観測追加とboundedな合成対照までとする。製品protocol・public option・runtime friend・worker選択条件を増やさない。

観測できるのは`ReviewTestScope`を通るreviewだけで、現在はtarget-selectionとadapter試験に限られる。他のファイルのtimeoutや、`full`でtimeout以外に失敗した`worker-lifecycle`・`worker-supervisor`・`r2-mcp`は、この観測の範囲外としてUnknownに残す。範囲外の失敗を、範囲内の分類へ含めない。

### 4.1 親側イベント

caseごとに同じ単調時計originを使い、数値のreview ordinal／worker ordinal／request ordinal、固定phase／event／code、経過時間、booleanだけを記録する。review開始・終了、factory呼出し前／返却、message観測、post試行／成功／throw、terminate試行／settle／exit、scope close開始／完了を分ける。同case内のworker列をreviewに対応付ける。要求の`id`は内部相関にだけ利用し、保存時は合成ordinalへ写像する。

記録上限案はcaseあたり4,096イベント。事前に固定枠を確保し、超過時は`measurement_incomplete`を保持して追加記録を止める。欠けた観測を0ms・成功・未発生とせず、製品の成否も書き換えない。出力は終了／終了待ち後にまとめ、イベントごとのconsole出力をしない。

認証値、URL、principal／sys_id、入力、script、結果本文、message全体、例外文／stackは採取しない。試験名との対応はローカルの既存test識別に限定する。元のsignal・remainingMs・戻り値・例外・factory optionsを変更せず、失敗理由を固定enumで分類する。時計採取やloggerの失敗は測定不成立として報告し、製品側失敗へ偽装しない。

### 4.2 起動／受理の詳細観測

親側だけではloader待ち・worker実行待ち・親の受理待ちを分離できない。追加が必要な場合は、別承認のtest-only bootstrapでentry到達／register前後／import前後／処理入口・出口を測る。診断は**専用MessagePort**等に限定し、製品のparentPort protocolへmarkerを混ぜない。fixture外のworkerData・環境・登録口へ持ち込まない。

worker内は同workerの単調時計で区間を測り、親のclockとoriginが同じと仮定して直接減算しない。親が受信するまでの時間には配送／親event loop待ちが含まれる。ready送信とsupervisor受理も別イベントにする。

strict受理内部の観測が必要なら、固定sourceの一時emit copy等に限定する案を別途レビューする。対象source／transformのhash・挿入点数を固定し、返値・順序・guardを変えない負の対照が必要。現段階でこの方法を実施・承認したとは扱わない。

## 5 独立対照と合成受入条件

既存[timeout回帰](../tests/review/selection-timeout.test.ts)、[worker lifecycle](../tests/review/worker-lifecycle.test.ts)、[soft期限](../tests/review/soft-deadline.test.ts)を維持する。新対照は専用fixtureに閉じ、通常suiteの名前filterへ混ぜない。

| 対照 | 注入／成立を先に確認する条件 | 期待する分類・後始末 |
| --- | --- | --- |
| 起動前停止 | factory throw、workerなし | worker_unavailableとcase timeoutを区別。後続admission回復 |
| ready待ち | 既存のstartup gateでready以前を保留 | analyze／finish未開始。取消後に旧worker exit・元review終了を待つ |
| analyze待ち | readyとanalyze受信flagを確認してからブロック | finish待ちと混同しない。未到達なら対照不成立 |
| finish待ち | ready・analyze完了とfinish受信flagを確認してからブロック | startup失敗をfinish遅延として数えない。終了未確認も成功にしない |
| 複数review | 同case内のv2／v3を同順序・同入力で実行 | review別区間とcase累積を対応付ける。結果・schema・coverageを不変に保つ |
| cleanup待ち | terminateの既知遅延と解放gate | busy中の拒否、終了後の回復、mock／時計復元順を維持 |
| late／不正reply | 取消後のreply、相関違い／重複等 | message観測を成功受理へ昇格せず、診断と元失敗を保持 |

期待値は注入したgate／flagと手書きの状態順序から生成し、観測器のphase判定をoracleとして流用しない。任意sleepで「finishへ届いたはず」としない。flag到達待ちは元review終端・取消とも合流し、finallyでgate解放／取消／終了待ちを必ず行う。admissionを強制resetしない。

意図的な実Vitest timeoutは子プロセスへ閉じ、元caseだけの失敗、後続case成功、未処理例外0を外側で検証する。既存5秒case・hook・製品期限を延長せず、製品期限の短縮対照とframework timeout対照は別caseにする。既存250ms再現の短縮capも通常試験の変更へ転用しない。

## 6 自然発生の観測計画と判定

後続実行時は、同一HEAD・Node／依存版・source worker bootstrap・観測器hash・設定hash・待受可否・実行順を保存する。観測なし／ありを交互に各3回、対象ファイル単独→通常並列全体の順に実施する案とし、build・lint・梱包監査等を重ねない。順序を固定しないのは時間帯の影響を混ぜないためである（`full`は最初のadapter case開始から終了まで約119秒、4分余り後の`full_checked`は約29秒だった）。各回は前回のchild／worker終了後に開始する。3回は打ち切りの上限であり判定基準ではない。断続的な失敗に対して3回の差だけでは観測器の負荷と判断しない。回数追加は負荷・観測結果を見て別判断し、無制限の再実行はしない。

H5の判定には§4とは別に、スイート全体の次の値を各回で保存する。

- 通常のJSONレポートのcase別duration。workerを使わないcaseの所要時間を回の間で比較する。異常時にこれらも同時に伸びていれば、H5を支持する材料になる。
- `perf_hooks.monitorEventLoopDelay`によるtest worker内のevent loop遅延の数値。
- `os.loadavg()`の開始時・終了時の数値。他プロセスの名前や引数は採取しない。

これらも負荷の存在を示す材料であり、負荷の発生元やtimeoutの唯一の原因を確定しない。採取器自体の実装は別承認とする。

通常並列は設定のまま。必要ならmaxWorkers=3等を**別の比較群**として記録するが、その成功で通常並列失敗を相殺しない。v2／v3の個別実行も診断対照であり、元の複数envelope caseを分割・置換した保証にしない。

- factory前後→ready観測→各post→対応reply→review完了→hook完了をcase相対時刻で並べる。
- worker生成より前、ready以前、analyze送信以後、finish送信以後、cleanup中を分ける。観測の欠落／相関不明ならUnknownとする。
- loader内markerの空白区間だけでCPU飽和・OSスケジューラ遅延を断定しない。CPU／I/Oの独立証拠がなければ原因未確定。
- 5秒framework timeoutとphase停止・全deadline超過、先行assertion失敗、cleanup失敗、localhost EPERMを別分類にする。
- 最初の開始、最初の失敗完了、最初のtimeout完了、case内の最初の異常を区別する。時計・観測器版が違う履歴を厳密な同条件比較にしない。
- 観測器あり／なしで結果が変われば計測負荷の疑いも残す。全回成功でも「今回再現なし」であり、修正完了としない。

既存JSONの再読だけで不足が埋まらなければ、不足を記録して次の観測実装を承認待ちにする。stdioの事前ビルド60秒の問題は別項目として保持し、今回の原因に自動合流しない。

## 7 分割とAC-Cへの関係

1. **WF-A（次の実装候補）**: 親側boundedイベント・review／worker／request相関と、ready待ち／finish待ちの独立合成対照。製品source・期限を変更しない。
2. **WF-B**: 自然発生の単独／通常並列観測、§6のH5の採取、原因候補の絞込み。必要なbootstrap内部観測は不足を示してから別途設計する。
3. **WF-C**: 根拠に応じた最小修正案とRED／GREEN。現時点では修正内容を決めない。

[atomic commit設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ATOMIC_COMMIT_FAILURE_DESIGN.md)のAC-Cは未実装・seal成功の別承認待ちのまま。本調査はAC-Cの固定abortを外さず、staged数をcommit／正常終端へ昇格しない。timeoutの原因未確定とAC-Cの所有権・線形化点の未確認は別台帳に保持する。本計画の保存は観測実装・実行・AC-C実装の承認ではない。

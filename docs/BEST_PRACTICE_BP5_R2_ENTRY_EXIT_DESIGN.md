# BP-5 R-2：専用entry接続・終了コード設計

Version: draft-0.5 / Date: 2026-10-19 / Status: check-planと承認付きrunを内部接続。公開CLI/運用・汎用最終化監督は未実装/未承認。

## 1. 範囲と現状

[launcher接続設計](BEST_PRACTICE_BP5_R2_LAUNCHER_CONNECTION_DESIGN.md)の内部実装を、
明示的な専用プロセスから呼ぶ入口と、その終了コードを定める。
内部終端契約・純粋選択器は§8、最小bootstrap・check-plan接続は§9、承認付きrun接続は§10に実装した。運用実行は未承認。
telemetry調査・maint依頼は保留。実機操作・token発行・登録/ACL/設定変更は行わない。
実manifestの作成/配置、実行許可、公開bin/MCP登録・npm同梱も対象外。

確認した現行経路：

| 現行の要素 | 動作・今回の設計との境界 |
|---|---|
| r2-supervisor-entry | pathを受けて直接superviseR2Hostへ進む。TTY承認/checker/digest結合/人向け表示は通らない。人向け入口として再利用しない |
| approveAndRunR2Plan | checker→TTY承認→承認付き監督→ready固定URL→strict限定summaryを接続する既存の内部API |
| check/approvalの失敗結果 | stage/codeを返す。entryがraw文字列として表示せず、固定契約で検証して扱う必要がある |
| displayの失敗結果 | display_failed/report_unavailableと、検証できた元の監督reportを任意で返す。表示失敗とhost状態は同義でない |
| executionの結果 | strict監督reportと限定summary。completedでも内側はpartialであり得る |
| 既存bootstrap | 無引数fatal handlerで70へ終了する。新entryの終了優先順位・最終化は別の設計が必要 |

前工程の作業ツリー変更・検証記録は保持する。本書の追加を前工程の実装検証・コミットの代わりにしない。

## 2. 新しい専用入口

r2-launcher-entryと最小bootstrapをリポジトリ内部・POSIX・compiled固定.jsに限定して追加した。
以下は内部の構文契約。公開CLIの利用例や実manifest実行許可ではない。

| 引数 | モード |
|---|---|
| 絶対manifest path 1個 | check-plan（既定）。runへ昇格しない |
| check-plan＋絶対manifest path | 明示的check-plan |
| run＋絶対manifest path | checker・専用cooked TTY承認・snapshot digest結合を必須とするrun |

引数数・モード・path構文を固定検査する。未知option、相対path、複数path、NUL、4096文字超、dot segment、
--yes/任意module/任意endpoint/port/token/digest/予算/旧protocol指定は拒否する。
不正入力の値をusageや例外へ反射しない。既定path探索・env設定・dotenv・既存auth login/tokens.jsonへの接続はしない。

- check-planはrunR2PlanCheckだけ。待受・host・SDK・browser・認可/交換は開始しない。
- runはapproveAndRunR2Planだけ。構文が有効な明示run時だけ専用run moduleを固定importし、superviseR2Hostやrunner/executorを直接呼ぶ分岐はない。
- 旧supervisor entryとフラグなしhostは既存内部試験用の位置付けを維持し、人向けモードから選べないようにする。
  将来の公開前には削除または外部到達不能な内部試験専用化を必須とする。非同梱だけで任意のローカル呼出しを禁止できるとはしない。
- sourceのtsx起動を人向け初版へ自動fallbackさせない。開発用source経路は既存の合成試験境界に残す。
- server.ts/既存CLI・HTTP/stdio・npm scripts/binへ登録しない。公開/配布は別承認。

## 3. 起動・秘密・表示の境界

専用entryは信頼済みの外側起動手順で、固定Node executable/compiled entry・非秘密引数・空envから開始する。
Node起動前にNODE_OPTIONS/preload/inspector等を継承させない。開始後のenv検査/削除だけで、事前注入を防いだとは主張しない。
この外側の安全な起動手順・実行ファイル選定も未実装/未承認であり、本書を通常shell起動の安全性証明にしない。

最小bootstrapはfatal guardを先に登録し、固定launcher本体だけを動的importする。
任意loader/JS callback/OS境界optionを引数やmanifestから指定できない。資格情報はentry/監督に渡さずhost内に限定する。
bootstrap以前の構文/loader/native障害やOS診断の完全非出力は保証できない。起動環境とdump運用が不適合なら開始しない。

初版の人向け出力は同じ専用stderr TTYに限定し、stdoutへ完全JSONを出さない。
check-planは出力TTY必須、runは入出力とも専用cooked TTY必須。非TTY時は固定非0終了とし、別出力先へfallbackしない。
check-planの表示はstrict限定確認票だけ、各write最大1秒/16KiBの同じ方針で接続する。
既存R2TerminalDisplay.showは監督report専用なので、checker票を偽の監督reportに包んで流用しない。

runの承認票/ready/最終summaryは内部launcherが既に表示するため、entryは再度表示しない。
check/approval段階の失敗だけ、固定enumのstage/codeから小さな固定診断を組み立てる（§10）。
path・origin・承認参照・ID・元例外・拒否された未知codeは出さない。ファイル保存/再認可/自動再実行なし。

## 4. entryで受け付ける終端契約

終了選択は純粋関数とし、検証済みのmode・内部結果・表示成否・entry自身の後始末状態だけを受け取る。
次のstrictな内部終端unionを§8.1の内部契約として実装した。外部から自己申告する入力口ではない。

| 結果の段階 | 検証・扱い |
|---|---|
| check-plan成功 | r2PlanCheckSchemaでoffline_validを確認し、限定票の表示完了も確認 |
| check/approval失敗 | 既存checker固定codeとTTY固定codeだけ。未知stage/extra field/codeはreport_unavailable扱い |
| execution | strict監督reportとsummaryの両方を検査し、reportから再投影したsummaryとの一致を確認。stage名だけで成功にしない |
| display | codeはdisplay_failed/report_unavailableだけ。任意reportはstrict検証できた場合だけ保持して終了優先順位へ使用 |
| entry内部失敗 | 固定fatal/usage/entry_cleanup_incomplete等。raw exceptionやstackを終端契約へ含めない |

意味は分離する：host_exitはOSで観測したhostの状態、terminal_reasonは監督の判断、display codeは表示の成否、
entry exitは次節の優先順位による最終制御状態。どれかを他のfieldへコピーして帳尻を合わせない。
strict検証は報告の真正性やIPCの履歴を単独で証明しない。生成元の信頼済み監督の確認が前提。

## 5. 終了コード案

プロジェクト独自の制御契約案。Node/ServiceNowの標準コードや、一般的なsysexitsの意味を採用したものではない。
既存host/監督のcodeは変更せず、新しい人向けentryだけへ適用する。使用値は0〜255に収める。

### 5.1 優先順位（上から最初に成立するもの）

| 優先 | entry code | 条件・意味 |
|---:|---:|---|
| 1 | 73 | 検証済みreportのtermination_unconfirmed、または固定checker_termination_unconfirmed。表示失敗より優先 |
| 2 | 71 | 検証済みreportのcleanup incomplete/cleanup_incomplete、またはentry自身の所有資源の後始末不成立 |
| 3 | 70 | fatal/未捕捉例外・rejection・固定module読込失敗。結果は成功として採用しない |
| 4 | 72 | 検証済みのforced_stop。再度の停止要求による強制終了 |
| 5 | 80（新設） | report_unavailable。strict終端検証・再投影照合ができない。元の状態は未確認として扱う |
| 6 | 81（新設） | display_failed。実行/終了が正常でも、必要な表示の成立を確認できない |
| 7 | 124 | checker_timeout、approval_timeout、preflight_timeout、または監督deadline_exceeded。各段階を固定理由で区別して保持 |
| 8 | 130 | checker_cancelled、approval_cancelled、または監督cancelled。初版ではSIGINT/SIGTERMの制御取消しを区別しない |
| 9 | 82（新設） | approval_denied。host未起動の明示否認/EOF/不正確認入力。未発行等の報告を捏造しない |
| 10 | 64（新設） | 起動構文不正。そもそも処理を開始せず固定usageだけ。usage表示に失敗すれば上位81 |
| 11 | 10 | その他の既知失敗。manifest拒否/期限不足/approval_unavailable/spawn_failed/host_failed/protocol_error/review_failed等 |
| 12 | 0 | check-planのoffline_valid＋表示成立、またはrunの検証済みcompleted＋cleanup/終了確認＋限定summary表示成立 |

0は「検査/呼出しの制御が完了した」だけ。review status=partial、analysis_complete=false、候補あり、
source_approval_pendingでも0になり得る。適合・安全・全件解析を意味しない。
release gate等によるinner isErrorはreview_failed/10であり、partialと混同しない。

check-planの0は承認や実機成立の証拠ではない。denyやtimeoutを0に変換しない。
不正なraw reportのfieldを拾って73/71を推測しない。検証不能なら80＋状態未確認の固定案内とする。
同時に報告検証・表示が失敗した場合は80を優先し、別出力先やraw reportを使って理由を復元しない。

**新設値は内部実装で80/81/82に再選定した。** 旧案74/75/77はsysexitsの範囲（64〜78）と重なる。
特に75は`EX_TEMPFAIL`（一時的失敗）として、メール配送・ジョブ管理等の外側ラッパーが自動再試行の合図に使う慣例がある。
本設計は表示失敗後の再実行を禁止しており、この慣例と衝突し得る。74（`EX_IOERR`）・77（`EX_NOPERM`）も別の意味に読まれ得る。
sysexitsの意味を採用しない方針に合わせ、report_unavailable=80、display_failed=81、approval_denied=82に固定する。
64は`EX_USAGE`と意味が一致するため維持した。既存host/監督の70〜73等は変更しない。
番号だけで外側の再試行を防げるとは主張せず、表示失敗後の自動再実行は禁止する。

### 5.2 競合時の例

| 同時に起きた状態 | entry code | 保持する意味 |
|---|---:|---|
| host終了未確認＋表示失敗 | 73 | 終了確認が最優先。表示失敗も内部固定状態に残す |
| cleanup incomplete＋reportの表示失敗 | 71 | hostが終了してもcleanup completeへ変更しない |
| completed/partial＋summary write失敗 | 81 | 元のcompleted/partialは保持するがentryを成功にしない |
| cancelled＋summary write失敗 | 81 | 取消しと表示失敗を両方保持。再実行しない |
| strict報告不正＋固定report_unavailable表示も失敗 | 80 | 未確認状態を81だけで覆わない |
| checker成功＋確認票表示失敗 | 81 | runへ進まない。offline_validを実行許可にしない |
| cleanup確認済みの期限停止 | 124 | OSで観測したhost_exitが130でも、監督deadlineのentry codeは124 |

143は既存hostの直接SIGTERM終了等に残すが、新entryの制御取消しから推測して付けない。
現在の監督はSIGINT/SIGTERMを同じcancelledへまとめるため、初版は双方130。
将来143を区別するにはsignal源を秘密を含まない固定metadataとして保持する契約変更・別試験が必要。
OSがentryをSIGKILL等で直接終了した場合は、実OS signalとshell側の扱いを観測し、正常なentry票があると捏造しない。

**`$?`だけでは制御された停止を証明しない。** shellはsignalで終了したプロセスを128+signal番号で表し、
SIGINTによる終了も130になる。124はcoreutils `timeout`が時間切れ時に返す値でもある。
entryはSIGINT handlerを登録するため通常は制御された取消しだけが130になるが、bootstrapのhandler登録前のsignalや、
`timeout`等で包んだ実行では外側から区別できない。130/124は「制御された停止・cleanup確認済み」の証拠とせず、
entryが最終化を完了した場合の検証済み状態（限定summary・内部終端状態）と併せて判断する。

## 6. signal・最終化・失敗時停止

- check-plan実行中とrunのchecker/TTY段階は、入口/launcherのどちらか1者だけがsignalを所有する。
  現行runはlauncher→監督の引継ぎを持つため、entryが追加handlerを重ねない。check-planは専用の所有者を設ける。
- 表示失敗で稼働hostを止める処理は既存launcher/監督へ委譲する。entryは完了を待たずにprocess.exitしない。
  終了確認/最大1秒の観測後だけ終端選択する。kill要求成功を終了確認にせず、他PID/process groupへ操作しない。
- 新entry自身の終了は、検証・表示・所有資源の終了を確認した後に制御する。表示確認は既存最大1秒、hostの385秒/cleanup3秒は延長しない。
- native writeのerror通知guardを解放する1 turnだけ、最大100msのentry最終化枠を置く案。
  新しいI/O/認可/再表示は始めず、期限が来たら専用entry自身を確定した非0 codeで終了する。
  解放確認不能を0で強制終了して成功扱いにせず、entry_cleanup_incomplete/71として扱う。
  表示timeoutでnative callbackが来ない状態は81を基本とし、guardの保持自体を追加のhost cleanup失敗とは推定しない。
  既存のより高い73/71/70/72は維持する。どの状態を最終化不成立とするかは実装時に明示的な所有資源表で固定する。
- 期限内に最終化できれば確定codeを設定して終了する。自然終了を待つ場合にも独立した短い最終化監督をarmし、
  未解決handleで居残らない。共有アプリやhostをentryの終了処理で強制終了する設計にはしない。
- fatal経路は例外理由を読まず、format/保存/通常処理への復帰をしない。
  新bootstrapが終端優先状態を扱うなら固定整数のみとし、既知の73/71を一律70で上書きしない契約が必要。
  現行のhost用fatal guardへ無断でこの変更を適用しない。

監督であるentryのfatalとhost event loop停止が同時に起きる場合の終了保証は未解決。
IPC切断だけで停止できると仮定せず、HS残境界・外側の監督方針を実機開始前に確認する。
entryが73で終了しても、未知のhostが終了済み/資格情報破棄済み/サーバーtoken失効済みとは報告しない。
固定案内が表示不能ならexit codeで停止を示し、対象特定・封じ込めは承認済み担当へ引き継ぐ。

## 7. 実装順と合成試験の受入条件

| 順 | 別途承認後の実装 | 必須試験 |
|---|---|---|
| 1 | 終端union・純粋なexit選択器 | 全stage/全code・未知field/enum・優先順位の組合せ。0への誤変換なし、host_exit不変 |
| 2 | 最小bootstrap/固定entry・check-plan接続 | 空env/固定flag、引数拒否、既定はoffline。成功/拒否でhost/bind/network/SDK/browser 0回、表示不能は非0 |
| 3 | run接続 | checker/TTY/承認付き監督だけを使用。旧経路・任意digest/予算/--yes指定を拒否。否認はhost 0回 |
| 4 | entry表示/終了監督 | summary二重表示なし、writeエラー/timeout/遅延native error、最終化枠、出口ごとのcode/stdout空/秘密非出力 |
| 5 | 専用OS子の一連の試験 | 0.2/0.3・partial/isError、SIGINT/TERMと再入力、表示失敗＋終了未確認/cleanup不成立、bootstrap/fatal、signal所有者引継ぎ |

実PDI/実tokenは使わず、一時合成manifest/fake fetch/合成TTYと所有子プロセスだけで実施する。
Node下限22.12系・実PTY/TTYの配送・他OS・dump/起動環境の確認は別に必要。
合成試験の通過だけでG2/G4や実manifest配置を許可しない。telemetry調査も再開しない。

## 8. 今回の到達点

`src/review/r2-entry-terminal.ts`に終端union・exit選択器を内部実装した。
[合成検証記録](E2E_BEST_PRACTICE_R2_ENTRY_TERMINAL_SYNTHETIC_2026-10-19.md)を参照。
第1段階時点では新entry、check-plan表示接続、最終化監督は未実装だった。前2者の後続実装は§9を参照。
100msの汎用最終化監督は引き続き未実装の提案である。
既存の表示/launcher/host実装を変更せず、前工程のdirtyな差分も保持した。
専用entryを実行した際のOS終了コード、実TTY、G2/G4、実PDIの成立を今回の内部試験から主張しない。

### 8.1 内部終端契約0.1

`schema_version=bp5-r2-entry-terminal-0.1`。modeはcheck-plan/run/entryのstrict union。
全modeでdisplay=confirmed/failed、finalization=complete/incomplete、fatal=booleanを必須にする。
既定値による成功補完はしない。entry自身の状態は信頼済みcallerだけが生成する内部metadataであり、公開入力ではない。

- check-plan: resultは既存r2PlanCheckSchema（offline_valid/rejected）。offline_validは実行承認ではない。
- run: resultはcheck/approval/display/executionのstrict union。stageごとの固定失敗enumを分け、checker codeをapprovalとして受理しない。
- execution: 既存strict report/summaryを検証し、reportから再投影したsummaryと構造的な完全一致を必須とする。JSON key順序は問わない。
- display: display_failed/report_unavailableだけ。任意reportも全検証必須、display=failed以外は拒否する。
- entry: fatal/usage/report_unavailableのみ。例外・path・stack・自由記述を保持しない。

`parseR2EntryTerminal`は拒否時undefined、`selectR2EntryExitCode`は不正snapshotに80だけを返す。
全snapshot検証に失敗した後、raw fieldからfatal/終了未確認/cleanup不成立を救済しない。
全体が有効な場合だけ§5の優先順位を適用する。selectorは入力不変で、表示・signal・process.exit・通信・再試行を行わない。
check-planの既知codeとfatal guardの固定通知による接続は§9を参照。
runの統合は§10を参照。表示実体/終了観測の真正性の確認は信頼済み生成元・運用の責任である。

## 9. 第2段階：最小bootstrap・check-plan接続

[合成検証記録](E2E_BEST_PRACTICE_R2_CHECK_PLAN_ENTRY_SYNTHETIC_2026-10-19.md)を参照。
§8の「新entry/表示未実装」は第1段階の到達点であり、本節でオフライン部分だけを追加した。

- r2-launcher-bootstrapはruntime importなし。理由を受け取らないfatal handlerを最初に登録し、例外/rejectionをformat・保持しない。
  保持するのは固定整数だけで、73＞71＞70。checker終了未確認は表示前に固定通知し、後続fatal/表示失敗で73を上書きしない。
- r2-launcher-entryはcompiled `.js`・POSIX・追加execArgvなし・継承envなし・IPCなしを検査してから固定bodyを動的importする。
  macOSがenv={}にも自動付与する`__CF_USER_TEXT_ENCODING`だけは、3要素のhex形式に限って許可する。他のキーや不正形式は拒否する。
  検査前に実行されたpreload/loaderを無害化したという主張ではなく、信頼済み外側起動手順は依然必要。
  この早期起動条件の拒否は64・無出力。起動後のusage表示は64、表示できなければ81とする。
- bodyは既定/明示check-planだけを受け付け、構文不正はcheckerを起動せず固定usageのみ。非TTY・表示予算不正もcheckerより前に拒否する。
  認証/login/設定探索/旧supervisor/runへのfallbackはない。起動する子は既存固定checker1個だけ、env={}・shell=false・出力ignore・IPC固定を維持する。
- checker結果を再検証し、限定確認票だけを同じstderr TTYへ1回表示する。完全終端report・path・接続先・対象ID・コード・資格情報は表示しない。
  outputが使用不能ならstdout/ファイル/別TTYへfallbackしない。checker拒否は理由を含む限定票と非0 codeで返す。
- noticeは最大1秒・16KiB、拡張不可。callback/throw/error/close/timeout/取消しは表示不成立。
  callback成功後の通知turnも確認し、失敗なら81。遅延native error用の非formatting guardはcallback決着と通知turnまで保持する。
  callback未決着ならguardだけを保持し、非0の専用entryを終了させる。部分的に送った文字列の巻戻しや人が読んだことは保証しない。
- check-plan中のSIGINT/SIGTERMはbodyが1者で所有し、checkerへ同じAbortSignalを渡す。終了時は所有listenerを解除する。
  checkerが既に取消しを観測した場合は、最大1秒の固定最終noticeを1回試す。表示成立なら130、不成立なら81（終了未確認73は優先）。
- 正常時はwrite確認/通知turn後にexitCodeを設定して自然終了する。非0は確認済みcodeで専用entryだけを終了し、未決着sinkで居残らない。
  汎用の100ms最終化監督・任意handleの終了保証・runのsignal引継ぎはまだ追加しない。

今回の最終化completeはentryのchecker観測/表示観測の後始末を表す。checker自身の終了未確認をcompleteに変換しない。
Node自身が非Error例外のtoStringに触れる場合があり、handlerが理由を読まないだけで任意getterの副作用非発生を保証できない。
bootstrap以前の構文/loader/native障害、OS/TTYの記録・dump、外側の停止保証は引き続き留保する。
server/既存CLI/bin/package.json/MCP登録は変更せず、R-2非同梱を維持する。

## 10. 第3段階：承認付きrunへの固定接続

[run接続の合成検証記録](E2E_BEST_PRACTICE_R2_RUN_ENTRY_SYNTHETIC_2026-10-19.md)を参照。
§9の「run未追加」は第2段階時点の記録であり、本節は内部runだけを追加する。

- r2-launcher-argsは副作用のない共通構文検査。省略時はcheck-planのまま。明示run＋絶対path1個以外にrunへ進む入力はない。
  --yes/自己申告digest/legacy/任意module・URL・予算などのoptionは受け付けない。
  無効runを含む未知構文は固定usageだけで、run module/hostを読み込むdispatchへ進まない。
- r2-launcher-runは同じ専用output TTYと、非raw・未終了・未バッファ・他のreaderがいないinput TTYを検査する。
  不適合はchecker/hostより前に固定拒否。別input/outputや非対話承認へfallbackしない。
- 実行はapproveAndRunR2Planだけ。既存checker1回→期限/信頼/binding付き確認票→完全一致のAPPROVE行→
  checkerのdigestをapprovedDigestとして固定→--approval-bound hostへ接続する。
  callerが内部optionsへapprovedDigestを混ぜても、checker値を上書きする経路にはならない。
- 否認・開始時期限切れ・確認timeoutはhostを起動しない。承認後の変更/期限切れは、hostのprepared照合やgrant消費時再検証で停止する。
  preflight hostの起動と業務実行のgrantは区別する。変更時にhostが起動しても、必ず認可/待受/HTTPへ進んだとは解釈しない。
- 実行結果は終端契約へstrict検証してから解釈する。executionのsummaryはlauncherが表示済みなので再表示しない。
  check/approvalの拒否だけ、schema_version=bp5-r2-run-notice-0.1・stage=check/approval・固定codeを同じstderrへ1回表示する。
  このnoticeは公開MCP契約ではなく、本文/ID/path/元例外を持たない内部固定投影である。
- 不正な終端は固定report_unavailableだけ。表示不能81、否認82、timeout124、取消し130等は既存exit選択器を使用する。
  検証済みreportの73/71をsummary表示前に内部通知し、固定優先状態を後続の表示失敗/fatalで上書きしない。
  通知は同じ優先状態で重複せず、73の後に71へ下げない。raw reportのfieldから通知しない。
- checker/TTY/host中のsignal所有者は既存launcher→監督の引継ぎに委ね、entryはhandlerを重ねない。
  launcherが終了した後の固定拒否notice中だけentryが所有し、表示上限1秒でfinally解除する。
  全体385秒/cleanup3秒、製品解析60秒、checker/TTY上限を変更・延長しない。

今回の合成試験では実認可・実token・実PDIを使わない。正常なdigest結合の先は合成peerのauthorization_deniedで終了する。
承認後変更の一部は実hostコード＋bind/fetch禁止fixtureを用い、prepared後再検証は既存bound-host回帰にも依存する。
実TTY/Node下限/他OS、外側の安全な起動手順・任意handleの終了保証・100ms最終化監督・G2/G4実行許可は引き続き未確認/未実装。
公開bin/MCP登録・npm同梱・自動browser/再認可/再試行/ファイル保存は追加しない。

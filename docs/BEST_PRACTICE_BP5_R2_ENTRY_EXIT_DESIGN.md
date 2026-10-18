# BP-5 R-2：専用entry接続・終了コード設計

Version: draft-0.1 / Date: 2026-10-19 / Status: 未承認・未実装の設計案。

## 1. 範囲と現状

[launcher接続設計](BEST_PRACTICE_BP5_R2_LAUNCHER_CONNECTION_DESIGN.md)の内部実装を、
明示的な専用プロセスから呼ぶ入口と、その終了コードを定める。
本書はMDのみ。telemetry調査・maint依頼は保留。実装・実機操作・token発行・登録/ACL/設定変更は行わない。
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

仮称r2-launcher-entryと、最小bootstrapを新設する案。初版はリポジトリ内部・POSIX・compiled固定.jsに限定する。
以下の構文は実装契約案であり、現在実行できるコマンド例ではない。

| 引数 | モード |
|---|---|
| 絶対manifest path 1個 | check-plan（既定）。runへ昇格しない |
| check-plan＋絶対manifest path | 明示的check-plan |
| run＋絶対manifest path | checkerとTTY承認を必須とするrun |

引数数・モード・path構文を固定検査する。未知option、相対path、複数path、NUL、4096文字超、dot segment、
--yes/任意module/任意endpoint/port/token/digest/予算/旧protocol指定は拒否する。
不正入力の値をusageや例外へ反射しない。既定path探索・env設定・dotenv・既存auth login/tokens.jsonへの接続はしない。

- check-planはrunR2PlanCheckだけ。待受・host・SDK・browser・認可/交換は開始しない。
- runはapproveAndRunR2Planだけ。entryがsuperviseR2Hostやrunner/executorを直接呼ぶ分岐を設けない。
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
check/approval段階の失敗だけ、固定enumのstage/codeから小さな固定診断を組み立てる案。
path・origin・承認参照・ID・元例外・拒否された未知codeは出さない。ファイル保存/再認可/自動再実行なし。

## 4. entryで受け付ける終端契約

終了選択は純粋関数とし、検証済みのmode・内部結果・表示成否・entry自身の後始末状態だけを受け取る。
実装前に次のstrictな内部終端unionを確定する。外部から自己申告する入力口ではない。

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
| 5 | 74（新設） | report_unavailable。strict終端検証・再投影照合ができない。元の状態は未確認として扱う |
| 6 | 75（新設） | display_failed。実行/終了が正常でも、必要な表示の成立を確認できない |
| 7 | 124 | checker_timeout、approval_timeout、preflight_timeout、または監督deadline_exceeded。各段階を固定理由で区別して保持 |
| 8 | 130 | checker_cancelled、approval_cancelled、または監督cancelled。初版ではSIGINT/SIGTERMの制御取消しを区別しない |
| 9 | 77（新設） | approval_denied。host未起動の明示否認/EOF/不正確認入力。未発行等の報告を捏造しない |
| 10 | 64（新設） | 起動構文不正。そもそも処理を開始せず固定usageだけ。usage表示に失敗すれば上位75 |
| 11 | 10 | その他の既知失敗。manifest拒否/期限不足/approval_unavailable/spawn_failed/host_failed/protocol_error/review_failed等 |
| 12 | 0 | check-planのoffline_valid＋表示成立、またはrunの検証済みcompleted＋cleanup/終了確認＋限定summary表示成立 |

0は「検査/呼出しの制御が完了した」だけ。review status=partial、analysis_complete=false、候補あり、
source_approval_pendingでも0になり得る。適合・安全・全件解析を意味しない。
release gate等によるinner isErrorはreview_failed/10であり、partialと混同しない。

check-planの0は承認や実機成立の証拠ではない。denyやtimeoutを0に変換しない。
不正なraw reportのfieldを拾って73/71を推測しない。検証不能なら74＋状態未確認の固定案内とする。
同時に報告検証・表示が失敗した場合は74を優先し、別出力先やraw reportを使って理由を復元しない。

### 5.2 競合時の例

| 同時に起きた状態 | entry code | 保持する意味 |
|---|---:|---|
| host終了未確認＋表示失敗 | 73 | 終了確認が最優先。表示失敗も内部固定状態に残す |
| cleanup incomplete＋reportの表示失敗 | 71 | hostが終了してもcleanup completeへ変更しない |
| completed/partial＋summary write失敗 | 75 | 元のcompleted/partialは保持するがentryを成功にしない |
| cancelled＋summary write失敗 | 75 | 取消しと表示失敗を両方保持。再実行しない |
| strict報告不正＋固定report_unavailable表示も失敗 | 74 | 未確認状態を75だけで覆わない |
| checker成功＋確認票表示失敗 | 75 | runへ進まない。offline_validを実行許可にしない |
| cleanup確認済みの期限停止 | 124 | OSで観測したhost_exitが130でも、監督deadlineのentry codeは124 |

143は既存hostの直接SIGTERM終了等に残すが、新entryの制御取消しから推測して付けない。
現在の監督はSIGINT/SIGTERMを同じcancelledへまとめるため、初版は双方130。
将来143を区別するにはsignal源を秘密を含まない固定metadataとして保持する契約変更・別試験が必要。
OSがentryをSIGKILL等で直接終了した場合は、実OS signalとshell側の扱いを観測し、正常なentry票があると捏造しない。

## 6. signal・最終化・失敗時停止

- check-plan実行中とrunのchecker/TTY段階は、入口/launcherのどちらか1者だけがsignalを所有する。
  現行runはlauncher→監督の引継ぎを持つため、entryが追加handlerを重ねない。check-planは専用の所有者を設ける。
- 表示失敗で稼働hostを止める処理は既存launcher/監督へ委譲する。entryは完了を待たずにprocess.exitしない。
  終了確認/最大1秒の観測後だけ終端選択する。kill要求成功を終了確認にせず、他PID/process groupへ操作しない。
- 新entry自身の終了は、検証・表示・所有資源の終了を確認した後に制御する。表示確認は既存最大1秒、hostの385秒/cleanup3秒は延長しない。
- native writeのerror通知guardを解放する1 turnだけ、最大100msのentry最終化枠を置く案。
  新しいI/O/認可/再表示は始めず、期限が来たら専用entry自身を確定した非0 codeで終了する。
  解放確認不能を0で強制終了して成功扱いにせず、entry_cleanup_incomplete/71として扱う。
  表示timeoutでnative callbackが来ない状態は75を基本とし、guardの保持自体を追加のhost cleanup失敗とは推定しない。
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

上記は設計のみ。新entry、終端union/exit選択器、check-plan表示接続、最終化監督は未実装・未検証。
既存の表示/launcher実装を変更せず、前工程のdirtyな差分も保持した。
74/75/77/64や100msは今回の提案値であり、現行コードの動作・外部仕様として記載したものではない。

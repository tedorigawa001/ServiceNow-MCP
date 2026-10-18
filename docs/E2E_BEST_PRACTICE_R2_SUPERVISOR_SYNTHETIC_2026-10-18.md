# BP-5 R-2 外部監督：合成検証

Date: 2026-10-18 / telemetry調査は保留。実PDI操作・実token発行・実設定変更なし。

## 対象と境界

`r2-supervisor.ts`、固定`r2-supervisor-entry.ts`、`r2-host-protocol.ts`。
[host終了設計§13](BEST_PRACTICE_BP5_R2_HOST_SHUTDOWN_DESIGN.md)の内部実装。
監督はmanifest本文や認証情報を読まず、固定hostへ非秘密pathと固定制御IPCだけを渡す。
空env・ignored stdio・JSON IPC・shellなし・detachedを固定し、親のsecret/Node起動設定を継承しない。
公開CLI/MCP登録/npm同梱・結果ファイル保存・自動ブラウザー操作は追加していない。

試験用のOS spawn境界だけ、固定された合成peerへ置換する。任意entryを公開入力として選択する口はない。
CPU停止試験には実Node子のmain loopを無限loopにする固定fixtureを使う。
実host接続には従来の一時合成manifestとfake fetchを使い、実OAuth交換・実ServiceNow通信を行わない。
固定loopback portを使う2件は既存の単一loopbackテストへ集約した。一時manifestは既存hookで削除する。

## 確認内容

| 境界 | 確認 |
|---|---|
| 標準385秒・3秒reserve | 合成時計で381,999msまではstopなし、382,000msでstop、385,000msで所有handleへSIGKILL要求。grant前に両timerをarm |
| 独立した実子停止 | host main loop停止でも監督は応答し、400msの短縮期限でSIGKILL要求、実OSのexit/closeを確認 |
| killと終了の分離 | kill=true/false/throw、exitのみ、closeのみを検証。両方不明なら1秒観測でunconfirmed。遅いexit後に再killしない |
| 専用監督processへのsignal | SIGINT→SIGTERMで最初はdrain、次は即force。hostのSIGKILL終了・監督の終了・出力空を確認 |
| 実host/runnerとの接続 | readyから取消し、正常closeでは整合した終了票採用。遅いOS closeでは結果非採用・token unknown |
| 終了票・ack | strictな終了票、ack callback、期待exit、exit+closeを満たす場合のみ採用。票なし/矛盾exit/無効code/秘密風extra fieldは非採用 |
| 0.2/0.3 | 検証済みpartial JSONを保持し、lifecycle completedを安全性/analysis completeと混同しない。isErrorも維持 |
| 中断の不可逆性 | 取消し後の成功票を拒否。ack済みでもhostがcleanup期限を超えて生存すれば結果破棄 |
| IPC | 重複prepared/ready/stopping、不明type、過大制御、sendHandleを拒否。拒否内容/例外は出力へコピーしない |
| 予算・非同期通知 | preflight上限、lower-only option、遅延timer時の単調時刻照合、ready Promise拒否の非出力・消費を確認 |
| 非同梱 | R-2コードは引き続きnpm梱包除外。固定compiled entryも合成値でsmoke確認 |

TDDのRED→GREENを実施した箇所：未実装の固定host監督、385秒grant/timer、終了票ack/採用、
async ready consumer、取消し後の成功票拒否。後二者は合成値による不正結果採用/未処理rejectionを先に再現した。
原因切り分けで、force後のdisconnectが元のdeadline理由をprotocol_errorへ上書きすることも確認し、最初のforceを固定した。
初回固定hostのsource importが5秒のテスト上限を超えたため、外側のテスト観測枠を15秒にした。
実装のpreflight上限は5秒を維持し、遅い起動ではfail-closed。制限を緩めて成功扱いにはしていない。

## 検証結果

| コマンド | 結果 |
|---|---|
| `bdo proxy npx vitest run tests/review/r2-supervisor.test.ts tests/review/r2-loopback.test.ts --maxWorkers=1` | 2ファイル146件成功（58.01秒） |
| `bdo proxy npm test -- --maxWorkers=1` | 110ファイル2,889件成功（254.85秒）。コミット前再実行でも全件成功（62.00秒） |
| `bdo npm run type-check` | 成功 |
| `bdo npx eslint`（今回の3実装・4テスト/fixtureファイル） | エラー/警告なし |
| `bdo npm run test:pack` | build・361ファイルの本番依存のみのworker/解析/集約/MCP smoke成功。R-2非同梱を維持 |
| compiled `dist/review/r2-supervisor-entry.js`をenv={}・合成の不正manifest pathでspawn | 固定.js hostを起動しfail-closedでexit10、stdout/stderr空 |
| `bdo git -c core.fsmonitor=false diff --check` / ローカル文書リンク確認 | 成功 |

追加42件（監督専用40件、既存host/runnerへの監督接続2件）。

### 初回全体回帰の失敗と切り分け

`--maxWorkers=2`の初回全体回帰は110ファイル中109成功・1失敗、2,875件成功・14件失敗（133.17秒）。
失敗は今回未変更の`target-selection.test.ts`内で、最初に3回連続のレビューを行うテストが5,000msを超え、
後続に`review_busy`が連鎖した。失敗を除外/成功扱いにはしていない。
同ファイル単独・`--maxWorkers=1`では35件すべて成功（7.83秒）。
今回の追加モジュールは当該実装経路へ登録されていない。並列負荷/実時間依存による起動・終了待ち遅延を疑うが、原因を確定したとはしない。
製品の385秒/60秒/cleanup期限やVitest設定・既存テスト上限は変更せず、単一workerで全体を再検証して2,889件成功した。
並列時の再現性/起動・後始末待ちのタイミング依存は残課題として保持し、初回失敗を撤回しない。

## 留保

ローカルNode 24.18.0/macOS。385秒は合成時計で確認し、6分25秒待つ実時間試験は行っていない。
実CPU子での試験は短縮期限であり、OS全体の停止や配送遅延までの絶対保証ではない。
kill失敗/終了未確認は運用者への引継ぎ。観測枠はhost稼働の延長枠ではない。
認証秘密が監督へ来ないことは信頼済みhostの秘密一致ガード/固定IPC設計が前提で、侵害hostからの秘密混入や受信前deserialize DoSは保証しない。
異常終了・無効票ではtokenをunknownとし、未発行/失効済み/cleanup済みとは推定しない。
監督クラッシュとhost main loop停止の同時発生、native fatal/core dump、メモリ完全消去、サーバーtoken失効は未解決。
実TTY配送・Node 22.12・Linux/Windows・HS全ケース・実PDI/実認可・公開/配布/運用承認は残課題。

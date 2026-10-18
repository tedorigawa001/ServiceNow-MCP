# BP-5 R-2：専用entryの承認付きrun接続・合成検証

Date: 2026-10-19 / 内部接続のみ。telemetry調査は保留。
実PDI操作・実token発行・アカウント/登録/ACL/設定変更・Pushなし。

## 1. 対象と境界

[entry設計draft-0.5 §10](BEST_PRACTICE_BP5_R2_ENTRY_EXIT_DESIGN.md#10-第3段階承認付きrunへの固定接続)を参照。
共通の固定argv parserとrun adapterを追加し、compiled entryを承認付きlauncherへ接続した。
既定check-planは維持する。構文不正/未知optionの段階でrun moduleやhostへのdispatchはしない。
run adapterからsupervisor/runner/executorを直接呼ぶ分岐、legacy grant、自己申告digest、非TTY承認、--yesは追加しない。
server/既存CLI/bin/MCP登録・npm同梱・自動browser・結果保存は変更しない。

承認付きlauncherの前工程の表示/summary実装は作業ツリーに存在しており、それを保持したまま利用する。
今回そのファイルに加えたのは、検証済みの終了優先codeを表示前に固定通知するinterface/通知だけ。
前工程分の実装・テスト・記録を今回コミット済みとみなすものではない。

## 2. 実行契約

1. compiled `.js`/POSIX/追加Node引数なし/空env（既存macOS native encoding例外のみ）/IPCなしを検査する。
2. 共通parserで既定check-plan、明示check-plan、明示runだけを特定する。絶対path1個、長さ・NUL・正規化条件は従来どおり。
3. runは同じ専用cooked input TTY/output TTYを検査する。raw/非TTY/他reader/バッファ済み入力などはcheckerより前に固定拒否する。
4. 既存approveAndRunR2Planだけを呼ぶ。checker成功→確認票/digest→完全一致のAPPROVE行→checker値をapprovedDigestとして固定する。
5. supervisorは--approval-bound hostとprepared_v2/run_grant_v2だけを使う。内部optionsへ別digestを混ぜてもchecker値を上書きしない。
6. 結果は内部終端契約でstrict検証し、既存exit選択器へ渡す。raw fieldを一部だけ救済しない。

checker/TTYの失敗は固定stage/codeだけの`bp5-r2-run-notice-0.1`を一度表示する。
executionのready/summaryはlauncherが表示済みなのでentryは再表示しない。
診断に本文・path・接続先・ID・client設定・資格情報・元例外・完全reportを含めない。
表示不能は81、不正結果は80、否認82、timeout124、取消し130等の既存優先順位を維持する。

検証済み終了未確認73/cleanup不成立71はsummary表示より前に固定値でbootstrapへ伝える。
entry側は同じ通知を重複せず、73から71へ下げない。表示失敗/fatalで既知の上位状態を上書きしない。
checker/TTY/host中のsignal所有者はlauncher→supervisorに委譲し、entryは二重登録しない。
launcher終了後の固定notice中だけentryが所有し、最大1秒の表示観測後にfinally解除する。
全体385秒・cleanup3秒・製品解析60秒・既存checker/TTY予算は変更しない。

## 3. 合成試験

今回追加31件（新規run adapter試験24件、既存compiled entry試験へ7件追加）。
対象4ファイル・82件成功を確認した。既存bound-hostのprepared後再検証も全体回帰に含める。

| ケース | 確認した停止位置 |
|---|---|
| NOで否認 | 実checker・合成TTY確認は行い、host 0回、82 |
| 最初から承認期限切れ | checkerで拒否、prompt/host 0回、10 |
| TTY承認timeout | host/grant 0回、124。試験用の短縮値だけ使用 |
| pre-cancel | checker/prompt/host 0回、130。外部Abortの理由はコピーしない |
| 確認中の変更/期限切れ | 実hostコード＋bind/fetch禁止fixture。prepared不一致/拒否でgrant 0回、readyなし |
| APPROVE受理後・prepared前の変更/期限切れ | spawn境界で合成manifestを変更。preflightのみ、grant 0回、readyなし |
| prepared後の変更/期限切れ | 既存bound-host試験でmanifest_changed/approval_expired、bindなし、tokenMayHaveBeenIssued=false |
| 正常な結合 | 実checker→合成TTY→固定digestのv2 grantが1回だけ。合成peerはauthorization_deniedで終了し、実認可は行わない |
| callerの別digest/legacy/未知option | checker digestを維持。prepared digest不一致はgrantなし。argvの--yes/--digest/--legacy等はchecker/host前に拒否 |
| TTY不適合 | raw/非TTY/他reader/バッファ済み入力でchecker/host 0回、既存readerは奪わない |
| 最終notice失敗 | 81、再試行/host起動なし |
| cleanup不成立＋summary失敗 | summaryより前に71通知、通知は1回、71を保持 |
| ready/summary | 固定URLと限定summary各1回、完全contentやコード/秘密を出さない |

compiled試験は既存の一時ビルドを使い、専用entryそのものからrunをdispatchする。
parent/checker/合成host peerでsocket connect/listen・HTTP(S)/DNS/fetch・任意子/workerをtrapする。
許可するのは固定checker1個と、--approval-boundを確認した固定host位置の合成peerだけ。
grant digestはTTY確認票のdigestとも照合し、legacy grantはfixture自体の失敗とする。
manifest所有者/ACLの読み取りに必要な固定ls/getfaclだけは許可する。

正常経路のpeerは実host/auth/session/MCP bridgeを起動せず、ready→authorization_deniedの固定合成receiptで終了する。
ここでのtoken not_attemptedは合成条件下の結果であり、PDIのOAuth設定や実tokenの証拠ではない。
変更/期限切れの別試験は実hostコードを使用するが、bindとfetchは禁止し、業務grant前の停止を確認する。
TTYはPassThrough/Writableの合成境界で、人の承認や実PTYの配送確認ではない。
一時manifestは合成値のみ、検証後に削除する。実設定/既存アカウント/ACLは変更しない。

## 4. RED/GREENと検証の意味

TDDでrun module未実装のREDを確認し、実checker＋TTY否認の経路から追加した。
compiled entryのrun未接続でもREDを確認し、固定parser/dispatchを追加してGREENを確認した。
内部launcherや承認判定をmockして成功を返す試験は使わず、OS child境界・合成TTY・合成時刻/manifestだけを制御した。
承認前/確認中/受理後/prepared後を区別し、単に「変更時host 0回」とまとめない。
特にpreflightで止まる場合のtoken unknownをnot_attemptedへ格上げせず、grantを出していない事実と分けて扱う。

## 5. 検証結果

| 検証 | 結果 |
|---|---|
| run/check-plan/compiled entry/approved-launchの対象回帰 | 4ファイル・82件成功、14.01秒（新規31件） |
| `npm test -- --maxWorkers=1` | 121ファイル・3,120件成功、76.48秒（既存bound-host回帰4件を含む） |
| `npm run type-check` | 成功 |
| 変更したrun/compiled entryテストの明示strict TypeScript検査 | 成功 |
| 対象5実装・2テスト・fixtureのESLint | エラー・警告なし |
| `npm run test:pack` | build・361ファイル・production-only導入・解析/集約worker・MCP smoke成功、R-2非同梱維持 |

verification-before-completionに従い、上表はコマンドの実出力を確認して記載した。
作業ツリーの検証には前工程の未コミット表示/launcher差分を含む。コミット対象だけの隔離検証とは区別する。

## 6. 残る境界・コミット時の注意

公開CLI/配布や実manifest配置は未承認。実TTY/Node下限22.12/他OS、G2/G4・実PDI・本人ACL・C方式検証は未実施。
外側の安全な起動手順、100ms汎用最終化監督、任意handle/OS event loop停止時の絶対終了保証は今回追加しない。
bootstrap前のloader/native/OS診断、Node自身が非Error throwのtoStringを読む場合などの既存留保を維持する。
終了票/exit codeはサーバーtoken失効や安全性の証明ではない。自動再認可/再実行/telemetry再開は行わない。

runは前工程の未コミットr2-terminal-displayとapproved-launchの表示接続へ依存する。
コミットする場合は前工程の必要な実装/テスト/記録と、今回のrun接続/固定優先通知を分離し、各候補だけで検証する必要がある。
今回の検証範囲にステージ・コミット・Push・npm公開は含めない。

## 7. 最終summary中のsignal所有権の回帰修正（2026-10-19）

監督は返却前にSIGINT/SIGTERMを解除するが、launcherは最終表示中に再取得していなかった。
そのため実OS signalではNodeの既定終了が既知の73/71を迂回し得た。
またroot Abortだけでは表示クラスのpending writeを止めないため、handler追加だけでは不十分だった。

監督の返却直後・次のawait前にlauncherが両signalを再取得する。
この表示段階のcancelはroot Abortとdisplay.closeを行い、表示失敗として返すが、既知の73/71は維持する。
finallyで所有listenerを解除する。監督中の二重所有や、認可前取消し後のsummary表示の一律抑止は追加しない。

回帰は実checker・合成TTY・OS child境界のpeerを通す2ケース（71/73）。
未決着のsummary書き込み中にprocess.emit('SIGINT')でNodeのsignal listenerへ配送し、
1者の所有・表示timeoutを待たない中断・表示失敗・優先コード・通知1回・両listenerの解放を確認する。
RED時にtest worker自身を終了させないため、OSのkill送信や実Ctrl-C/PTY配送を検証した試験とは区別する。

| 検証 | 結果 |
|---|---|
| 修正前run回帰 | 24成功・新規2失敗（表示中の所有者なし） |
| 修正後run/approved-launch/display/compiled entry回帰 | 4ファイル・66件成功、13.46秒（即時中断の追加assert前） |
| 最終全体回帰 `npm test -- --maxWorkers=1` | 121ファイル・3,122件成功、77.42秒（即時中断assert含む） |
| `npm run build` / 追加テストの明示strict型検査 | 成功 / 成功 |
| 対象実装・テストのESLint | エラー・警告なし |

製品期限・表示1秒上限は変更しない。telemetry保留、実機操作・token発行・設定変更・Pushなし。

# BP-5 R-2 専用bootstrap/host：合成検証

Date: 2026-10-18 / 実PDI接続・実token発行・設定変更なし。telemetry調査は保留。

## 対象

`r2-host-bootstrap.ts`・`r2-host-entry.ts`・`r2-host.ts`を追加。
固定entry→fatal登録→固定host import→manifest preflight→一度限りgrant→実runnerを接続する。
公開CLI/共有MCP server/npmへの接続は追加しない。外部監督は未実装。
設計は[host終了設計§12](BEST_PRACTICE_BP5_R2_HOST_SHUTDOWN_DESIGN.md)を参照。

## 方法と確認項目

作成した合成manifestだけをローカル一時領域に置き、終了後に削除する。
子はenv={}・固定entry・shellなし・JSON IPC。観測用stdout/stderr pipeは試験専用であり、
将来の運用launcherはOSレベルignoreを必須とする。ネットワークfetchは必ず失敗する合成境界へ置換し、実OAuth交換を行わない。
固定127.0.0.1:18765を使う試験は既存loopbackファイルへ集約し、ポート競合を避ける。
runner/session/listenerをmockせず、OSのHTTP closeだけを遅延/throwさせる。

| 検証 | 観測 |
|---|---|
| 未捕捉Error、未処理rejection、getter付きrejection | 70、出力なし。getterの副作用markerもなし |
| 固定source entry・IPCなし / 不正manifest | 10、出力なし。ready以前に停止 |
| SIGINT / SIGTERM | 実listener起動後に停止、cleanup complete票とack、130 / 143 |
| 所有listenerのOS close確認がthrow | runnerのcleanup不成立を受け71、finishedなし、元例外なし |
| OS close未決着 | 共有cleanup期限で71、追加の3秒待ちなし、finishedなし |
| draining中SIGINT再入力 | 72、finishedなし |
| grantなしstop / grant重複 / 未知IPC / oversized | fail-closed。grantなしではreadyなし |
| 予期しないIPC切断 | 10。exitとstdout/stderrのcloseをそれぞれ観測 |
| ackなし / force IPC | 71 / 72。ackで期限延長しない |

TDDではfatal/bootstrapと未実装hostのテストを先に実行し、不足による失敗を確認してから実装した。
初回loopback実行はsandboxのbind EPERMで失敗したため、ローカル合成待受を許可した実行で検証する。
IPC切断試験ではNode 24.18.0の親ChildProcess集約closeが届かない一方exit=10を観測したため、
exitと両pipeのcloseを個別に待つ（exitだけで出力完了と推定しない）。

## 実行結果

| コマンド | 結果 |
|---|---|
| `bdo proxy npx vitest run tests/review/r2-loopback.test.ts tests/review/r2-host.test.ts --maxWorkers=1` | 2ファイル109件成功（後続の最終変更も全体回帰で再確認） |
| `bdo proxy npm test -- --maxWorkers=2` | 最終実行：109ファイル2,847件成功、27.26秒 |
| `bdo npm run type-check` | 成功 |
| `bdo npx eslint`（今回の実装3ファイル・test/fixture/casesの3ファイル） | エラー/警告なし |
| `bdo npm run test:pack` | build成功、361ファイル。本番依存のみのworker/解析/集約/MCP smoke成功。R-2の非同梱を維持 |
| build済み`dist/review/r2-host-entry.js`をenv={}・IPCなしでspawn | exit=10、stdout/stderr空。固定.js経路を確認 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |

追加した合成試験は17件（専用bootstrap/entry 5件、実runner接続host 12件）。
childの終了確認は所有handleのexit/closeまたはexit+両pipe closeで行い、kill要求だけで成功としない。
テストのwatchdogも生成したchild handleだけを対象とし、外部PID/共有process groupを探索しない。

## 留保

Node 24.18.0/macOSの合成試験。Node 22.12/Windowsは未検証。
Node自身がuncaught値のstack getterをhandler前に評価する例を観測した。
host handlerは引数を読まないが、このランタイム挙動を防げないためstdio ignoreが必要。
loader失敗/native fatal・OS core dump・event loop停止まで防げるとはしない。
外部監督、独立385秒watchdog、監督側JSON再検証/起動環境allowlist/終了報告契約は未実装。
preflight/grant/合成試験は人の実行承認を代替しない。強制exitはcleanupやサーバー側token失効の証明ではない。

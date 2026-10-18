# BP-5 R-2：host接続初段（signal所有者・cleanup通知・残予算）の合成検証

Date: 2026-10-18 / Result: 合成試験PASS / 専用host・実PDI: 未接続

## 1. 範囲

[専用host終了設計§11](BEST_PRACTICE_BP5_R2_HOST_SHUTDOWN_DESIGN.md)に沿い、
`src/review/r2-runner.ts`の信頼済み内部optionsを実装した。
専用host/bootstrap/監督、IPC、force/process.exit、fatal handlerはまだ実装していない。
telemetry調査・maint担当者への依頼は保留。本物のtoken発行・実機操作・登録/ロール/ACL/設定変更はしていない。

合成manifest・架空issuer応答・localhost・実workerを使う。manifestは一時fixtureのみで後始末する。
本物のブラウザーや資格情報を使わず、実運用の設定ファイルを作成/更新していない。

## 2. 実装した契約

| API | 実装した動作 |
|---|---|
| `signalOwner?: 'runner' \| 'host'` | 省略/runnerは従来のSIGINT/TERM処理。hostは外部AbortSignal必須で、process handlerを追加も削除もしない |
| `onCleanupStart(notice)` | 最初の全体drainingで同期的に1回通知。freezeしたreason/remainingMsだけ。資格情報・結果・例外・pathなし |
| `hostRemainingMs()` | 同一プロセス/同一単調時計の残予算reader。manifest読込前から期限を固定し、短縮だけを許す。後の大きな値で延長しない |

optionsは入口でshallow-copyし、呼出し元による所有者・signal・callbackの差替えを反映しない。
これらはCLI/MCP/manifest/envの入力ではない。公開tool/schema/0.2/0.3/runner終了票は変更していない。

通知のreasonはcompleted/cancelled/interrupted/deadline_exceeded/failedの固定enum。
remainingMsは通知時点で計算したcleanup残予算上限（0〜3,000の整数）で、hostが必ずその時間を利用できる保証ではない。
通常完了/失敗はfinally入口、取消し/期限/signalはroot Abortの伝播前にdrainingを開始する。
preflight失敗も一度だけ通知し、再入/重複Abort/finallyで二重通知しない。

最初のcleanup期限をmin(runner全体期限, host期限, 最初のdraining時刻+cleanup上限)に固定する。
通知自身の同期実行時間とfinallyまでの時間を含め、起動待ち/closeに残りだけを渡す。
host期限を再観測して短くすることはできるが、新しい3秒や385秒を与えない。
読込前/開始前にcleanup枠を超える残りがなければbindしない。
上限385秒/cleanup3秒、取得件数・受信量・段階上限、manifest/C設定の385秒超の有効余裕は維持する。

通知は同期・undefined返却のみ。throw/非undefined（未解決/拒否Promiseを含む）は待たずに
cleanup_notification_failedとして成功結果を捨て、cleanup自体は続行する。
不正Promiseのrejectは捕捉する。予算readerも有限number以外/throwを拒否し、誤った非同期readerの
rejectが未処理にならないよう捕捉する。raw例外・callback戻り値・拒否理由を出力しない。
途中の予算不正はhost_budget_invalidで停止し、cleanup予算も確認不能ならcleanup_incompleteを優先する。

## 3. 合成試験とTDD

`tests/review/r2-runner.cases.ts`に21ケース相当を追加（成功経路のrunner/host両モード化を含む）。
固定portの競合を避けるため、既存どおり`r2-loopback.test.ts`から同一の逐次suiteで実行する。

| 分類 | 確認したこと |
|---|---|
| signal所有権 | hostが持つ既存handlerが動作中/終了後とも同じで、runnerが追加/削除しない。外部Abortは正常伝播 |
| 既定互換 | 既存の実SIGINT/SIGTERM子試験を維持。省略時の385秒/3秒・bind取消競合・秘密一致ガード・worker終了も再実行 |
| 通知の時点/回数 | 取消しの呼出し内で同期通知、freeze、正確に2キー、重複Abort後/finallyでも1回。秘密マーカーなし |
| 正常MCP | runner/host両モードで同じmanifest→HTTP callback→本人確認→SDK list/call→実worker解析。completed通知1回、既存JSON/非出力を維持 |
| host期限の固定 | 短いhost予算で停止。後の大きな値でも延長せず、fake timerで1,159msは待機→1,160msで作業停止（予算1,200ms、cleanup40ms） |
| cleanup予算 | host残り30msで取消し、通知が20ms消費するとclose待ちは10msだけ。9ms未終了→10msでcleanup_incomplete、timer残数0 |
| 通知失敗 | throw/拒否Promise/未解決Promiseを固定理由にし、待ち続けずcleanup complete。完成済みMCP結果も返さない |
| 不正/尽きた予算 | NaN/±Infinity、0/負値/cleanup枠と等値はbind前に拒否。途中のreader例外はhost_budget_invalidで停止、issuer通信0回 |
| 非同期reader | Promise.rejectを返す不正readerを拒否し、未処理rejectionもraw診断も出さない |
| 不正option/差替え | hostでsignalなし/未知所有者を拒否。実行中にoptionsを書換えても元の所有者・signal・通知を維持し購読を解放 |

TDDで次の失敗を確認してから実装した：hostモードでもhandlerが増える、取消し時に通知されない、
hostの短い期限が反映されず未終了になる、不正なasync readerのrejectが未処理になる。
最後のケースは型どおりでないJS呼出しを想定したOS/時計境界のテストであり、本物の秘密を使っていない。
systematic-debuggingではNumber.isFiniteによる拒否だけではPromiseのrejectを消費しないことを確認して対処した。

## 4. 実行結果

| コマンド | 結果 |
|---|---|
| `bdo npm test -- tests/review/r2-loopback.test.ts` | 92件PASS（既存loopback46+runner46） |
| `bdo npm test -- --maxWorkers=2` | 108ファイル、2,830件PASS |
| `bdo npm run type-check` | PASS |
| `bdo npx eslint src/review/r2-runner.ts tests/review/r2-runner.cases.ts` | エラー/警告0 |
| `bdo npm run test:pack` | build・361ファイル梱包・production-only導入・worker/MCP smoke PASS。R-2非同梱を維持 |
| `bdo git diff --check` | PASS |

環境はmacOS / Node v24.18.0。時間境界はfake timer/信頼済み単調時計と、短縮した実時間の試験で確認した。
実385秒待機、Node 22.12系、Linux/Windows、専用host/監督の動作試験ではない。
梱包はnpm cacheのsandbox制約を避けたローカル検証で、npm公開ではない。

## 5. 留保と次段階

- callback/readerは信頼済みの同期処理。同期無限ループの強制中断はできず、独立した監督はまだない。
- hostRemainingMsはpolling監督ではない。await中の絶対期限短縮にはhost側で外部Abortも送る必要がある。
  通常の残秒減少は同じ期限を表す。別プロセスの時計値をそのまま渡さない。
- 通知は「runner全体のdraining開始」であり、session内の通常cleanup完了や資源解放の証明ではない。
  cleanup通知に成功しても最終cleanup_incompleteを成功へ格上げしない。
- host所有モードは実装済みhostの存在や人の実行承認を検査しない。内部APIの成功から実機認可へ自動的に進まない。
- 専用bootstrap/host・IPC/ack・force/exit・再入力時の強制終了・fatal handler・外部監督・HS試験は未実装/未実施。
  既存のメモリ内保持・token失効とは異なるcleanup・完全ゼロ化できない留保も継続する。
- telemetry調査は保留。実機/発行/設定変更をせず、G2/G4・最小権限・Public Client/S256等の実証にも数えない。

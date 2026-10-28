# AU-BR-006：fake試行期限・中断・終了確認

Date: 2026-10-28 / Scope: fake clock／absolute scheduler／Promise依存限定、正式発行口閉鎖。

設計：[draft-0.5 §17](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#17-draft-05fake試行期限中断終了確認)。
実装：[監督factory](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[同ReadState](../src/review/abort-scope-evidence-closed-read-state.ts)、[body lane](../src/review/abort-scope-evidence-closed-body-candidate.ts)、[閉鎖gate](../src/review/abort-scope-evidence-closed-body-gate.ts)。
試験：[42件の合成検証](../tests/review/closed-attempt-supervisor.test.ts)。

## 1. 実装範囲

専用factoryがprivateにfake gate・run・transport・ReadState・body portを一度生成し、同purposeからのreadだけを監督する。外部session／既存transportの採用口や、生attempt／candidate／本文の返却口はない。ReadStateのdispatch時に絶対windowを固定し、guard／pending body／最終checkpointまで結合した。

fake policyはtimeout最大10000ms、cleanup予約最大250msかつ試行残量の1/4以内、empty-readは1試行の総数最大16。非emptyで総empty数をresetしない。全体t0／60秒、通常50秒・整合55秒を維持し、retryでC/G/P/Eや時計を新規生成しない。top-level policyとsession内のpolicy二重設定は拒否する。

## 2. RED→GREENと互換性

最初のtracerは監督module未実装でRED。9.75秒のI/O cutoff→fake cancel→10秒未満での終了確認・一度限りreleaseを接続してGREEN。

次の境界をそれぞれ追加REDで確認し、固定契約を実装してGREENとした。

- cleanup開始時点を取消のlinearization pointに固定し、waiting continuationの再開時刻で予約を延長しない。
- closed getterは一度だけcaptureする。停止後の新要求で未確認cleanup診断を消さない。
- release callback後の時計で再検査し、cleanup期限を越えたreleaseをconfirmedにしない。
- 最新の`ae307f8`互換性を維持。確認済みcancel終端のtimeoutは同purposeのretryableとし、genuine cross-realm Uint8Arrayをnative内部slotで受理する。
- body参照を破棄した後のpost-consume checkpointでも操作開始時の試行deadlineを保持し、期限等号でsummaryを出さない。
- EOF後のrun取消とreader.cancel完了を区別し、cancel操作なしにcleanup kindをcancelledへ書き換えない。
- 二重policyによる低減値のdefault上書きを受付前に拒否する。

既存のlengthイベントと未監督bytesモードは既定のまま。実session・public MCP input/result・本番capは変更していない。

## 3. 主な観測

| 観点 | 結果 |
|---|---|
| 試行window | 10000msならD_io=9750。400msならreserve=100、D_io=300、cleanup等号400で未確認。残り100msの通常phaseならD_io=49975、D_attempt=50000 |
| 全体clock | 成功readを複数回しても元60秒のまま。soft cutoffでC=0拒否してfinal予約を残す。finalは元55秒へclip、retry予約も同slotで消費 |
| empty-read | 16回は受理、17回は停止。途中の非emptyデータで数をresetせず、Gは受信byte分だけ |
| retry | cleanup confirmedのtimeoutは局所理由を返し、同purposeの2回目だけを許可。3回目はdispatchしない。新session／新counterなし |
| 停止・終了確認 | pending read／cancel／closedを別々に待ち、releaseを一度だけ行う。read/cancel/closed/release/abortの失敗を固定理由で保持 |
| late応答 | 取消後のbytesはcleanup予約内に届いてもGへ採用しない。期限後settlementでbest-effort releaseできてもunconfirmed終端・失敗結果を修復しない |
| scheduler | throw／早期発火／disposer失敗で停止。owned wait数は0へ戻り、stale callbackで後続処理を停止・再開しない |
| 再入・取消 | concurrent readを拒否し、fake取消callbackからのclose再入でもabort/cancel/releaseを二重実行しない |
| 時計失敗 | 逆行・非有限・例外はpending I/Oを停止。時計が不明なcleanupをconfirmedにせず、秘密Errorを露出しない |
| 単一会計 | table下位枠失敗後はcleanup確認と理由付きfinal skipを維持。G累計超過は確認済みcleanupでもglobal失敗。C/G/Eに返金なし |
| 閉鎖 | 固定summaryと診断だけ。formal_issuance=disabled。実source／ReleasePermit／workerに昇格しない |

## 4. 検証結果

| 確認 | 結果 |
|---|---|
| 新supervisor合成試験 | 1 file／42 tests成功 |
| supervisor＋body＋ReadState＋gate | 4 files／184 tests成功 |
| `npm run build` | 成功 |
| 変更した実装・試験のESLint | 成功 |
| `vitest run --maxWorkers=3` | 172 files／5,196 tests成功、31.10秒 |
| offline `package-worker.mjs` | production-only install・解析・集約成功、377 files |
| 更新MDの相対参照・行末空白 | 4 files／73 links確認、問題なし |

全体試験は既存のローカル合成通信を含むが、実ServiceNow・外部サービスへの通信ではない。新moduleは既存の`!dist/review/abort-scope-evidence*`で梱包除外する。

## 5. 未確認・未接続

コミット分割時にも、HEAD＋前工程だけの一時コピーでbuild・ESLint・全体172 files／5,196 tests成功（55.39秒）を再確認した。最初の制限付き実行はローカル待受を含む試験の終了待ちとなり中断（130）。ローカル合成通信を許可した再実行が上記の成功結果であり、期限は変更していない。

このdraft-0.5の検証はfake schedulerとfake Promiseの契約に限定した。後続の[注入Web Streams検証](E2E_BEST_PRACTICE_CLOSED_STREAM_ADAPTER_2026-10-28.md)でnative read/cancel/reader.closed/releaseLockを接続したが、実HTTP transportは未接続。body laneの保守的owner_stopped診断は保持し、supervisorが観測した後続cleanupを候補復活の根拠にしない。

未決着Promiseの強制決着や、event loop停止・非協力的OS I/Oの実時間終了を証明していない。disposer失敗時の外部timer消失も保証しない。同期JSON.parse／hashを途中で強制中断する機能、全体work／heap上界、実host終了policyは未接続。これらを監督上の固定失敗・未確認として扱い、正常receiptや受付継続へ格下げしない。

実HTTP status／OAuth／fixed source／ReleasePermit、選択window／payload receipt／worker job、上位正式JSONへの診断写像、本番cap承認、全体受付は未接続・無効。正式発行口閉鎖、Unknown、VM／監視／telemetry保留を維持。実transport・実機操作・トークン発行・設定変更・本番cap投入は行っていない。

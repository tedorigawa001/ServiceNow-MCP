# AU-BR-006：注入Web Streamsの合成接続検証

Date: 2026-10-28 / Scope: メモリ内native Web Streams・fake clock／scheduler限定。正式発行口閉鎖。

設計：[draft-0.6 §18](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#18-draft-06注入native-web-streamsの合成接続)。
実装：[同module内のprivate監督と注入adapter](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)。
試験：[native stream 25件](../tests/review/closed-stream-adapter.test.ts)、[既存fake監督42件](../tests/review/closed-attempt-supervisor.test.ts)。

## 1. 実装と所有権

同じprivate coreがdispatch・window確認を済ませた後だけstreamを取得する。fixture専用WeakSetで一度だけclaimし、locked・再利用・Proxy・偽receiverを拒否する。soft cutoffでdispatch前に停止した場合はreaderを取得しない。dispatch後の取得拒否で試行数Cを返金しない。

captured native intrinsicによるdefault readerのread／cancel／releaseLockと、一度だけ取得したclosedを同attemptへ接続した。stream側の同名overrideは呼ばない。元のReadState・時計・予約・会計を維持し、課金と解析には同じprivate bytes snapshotを使う。reader・本文・正式receiptは返さない。新しいfactoryも開発専用で梱包除外範囲内にある。

## 2. RED→GREENと調査結果

最初のtracerはfactory未実装で失敗し、native EOF・closed・releaseLock接続で成功した。その後の回帰試験で次の2点を確認した。

- Nodeのnative locked getterだけでは本物のstreamを包むProxyを拒否できず、初回試験が5秒でtimeoutした。最小再現で`isProxy=true`かつ`native_locked=false`を確認し、取得前の明示的Proxy拒否を追加した。回帰試験は予期しないpending時もfake clockを進めて終端へ到達する。
- errored streamではread・closedに加えcancelもrejectする。初回の期待理由closed_rejectedを実APIの観測と照合し、既存の固定優先順位cancel_rejectedを維持した。一次失敗invalid_responseとcleanup失敗の両方を確認した。秘密のError内容は出さない。

## 3. 主な検証条件

| 観点 | 確認結果 |
|---|---|
| 正常EOF | 分割JSON・同bytesの課金／解析、closed captureとrelease各1回、lock解放 |
| timeoutとretry | pending readを取消し、cancel／closed確認後だけfresh streamで同purposeをretry。以前の断片は混ぜずGは累積 |
| cleanup未確認 | pending／rejectしたcancelを区別。reader解放だけでcancel完了とせず、未確認では継続拒否 |
| receiverと所有権 | locked・二重採用・別監督が所有中のstream・Proxy・偽prototypeを拒否し、他のreaderを取消／解放しない |
| native操作 | 同名overrideを使わず、byte streamもdefault readerで処理。BYOBは使わない |
| chunk | empty総数16／17境界、cross-realm Uint8Array受理、偽装した別TypedArray拒否、取消後late chunk不採用 |
| 会計と再入 | payload P・table E・Gを同snapshotから計上、局所失敗後final skip。cancelからcloseへ再入しても二重解放なし |
| 閉鎖・非露出 | global fetchを呼ばず、本文・資格情報・生resource・正式receiptを返さない |

## 4. 検証結果

| 確認 | 結果 |
|---|---|
| native stream追加試験 | 25 tests成功 |
| native＋supervisor＋body＋ReadState＋gate | 5 files／209 tests成功 |
| 全体合成試験 `vitest run --maxWorkers=3` | 173 files／5,221 tests成功、37.83秒 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| `npm run build` | 成功 |
| 変更したsupervisor・native stream試験のESLint | 成功 |
| 関連MDの相対参照 | 5 files／83 links、参照先存在確認成功 |
| `git diff --check` | 成功 |

全体試験には既存のローカル合成通信が含まれるが、PDIへの通信ではない。文書参照検査は相対参照先ファイルの存在確認であり、見出しanchorの自動検証ではない。

## 5. 未確認・未接続

コミット分割時に、HEAD＋前工程＋今回分だけの一時コピーでbuild・ESLint・全体173 files／5,221 tests成功（39.18秒）とoffline package-worker smoke（377 files）を再確認した。無関係な作業中ファイルはコピーへ含めていない。

native Web Streams操作の確認であり、HTTPの出所や認証sessionへの結合の証明ではない。adapterの`abort`は要求回数の記録だけで、fetch／signalへは接続していない（中断はnative cancelのみ）。clock／schedulerはfake依存で、未決着Promiseの強制決着・非協力的OS処理やevent loop停止の実時間終了は保証しない。native release失敗の注入は既存fake監督試験で扱う。

実session・ReleasePermit・固定source・選択payload・worker jobとの正式binding、全体work／heap上界、本番cap承認は未接続。正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持する。実transport・実機操作・設定変更は行わない。

## 6. レビュー修正：未接続AbortControllerの削除（2026-10-28）

adapter内の`AbortController`はsignalをどこにも渡さず、`abort()`は何も中断していなかった。§18.2／§5の「取消通知」「中断通知」という記述と実態が合わないため、controllerを削除し、`abort`を要求回数の記録だけと明記した。中断はnative cancelだけが担い、挙動・counter・試験結果は変わらない。関連5 files／209 tests、build、ESLint、全体試験を再確認。

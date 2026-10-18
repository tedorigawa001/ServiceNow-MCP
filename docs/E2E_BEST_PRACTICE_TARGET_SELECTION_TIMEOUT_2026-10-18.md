# BP-5 target-selection：テスト期限超過とreview_busy連鎖の切り分け

Date: 2026-10-18 / telemetry調査は保留。実PDI操作・実token発行・実設定変更なし。

## 1. 結論と未確定事項

**期限超過後の連鎖は、テストからレビューへキャンセルを渡さず、テスト終了時にも完了を待たない経路で再現した。**
製品のadmissionはworker終了後まで同じprincipalの枠を保持する。レビューを残したまま後続を始めれば
`review_busy`になるのは正しいfail-closed動作であり、ロックの強制解除やtoken変更で回避しない。

一方、[初回の並列実行](E2E_BEST_PRACTICE_R2_SUPERVISOR_SYNTHETIC_2026-10-18.md#初回全体回帰の失敗と切り分け)で
なぜ最初のテストが5秒を超えたか（source worker起動・集約・終了待ちのどこが遅かったか）は、当時の段階別計測がなく**未確定**。
今回の再現はworker readyを合成的に遅らせたもの。元の高負荷状態そのものを再現したとは主張しない。

## 2. ソースから確認した経路

| 層 | 確認した動作 |
|---|---|
| インストール済みVitest 5.0.3 | `TestContext.signal`はテスト期限超過/取消しでAbortされる。ローカルの`run.BTlFXlnv.js`の`withTimeout`→`abortContextSignal`、型の`TestContext.signal`を照合 |
| 旧target-selectionテスト | context.signalをレビューへ渡さず、afterEachはmock/global/envを戻すだけ。3種類の不正metadataを1個のテスト内で順次レビューしていた |
| adapterの不正metadata経路 | payloadは取得しないが、失敗結果のJSON検証・集約にも`finish(run)`からworkerを起動する。軽い入力拒否だけでは終わらない |
| source worker | 各レビューで新規workerを起動し、tsx登録と`review-worker.ts`読込後のreadyを待つ。3入力のループはworker起動/終了も3回含む |
| adapterのfinally | `cpu.close()`の完了後に`session.close()`で取得枠を解放する。CPU終了確認より前にadmissionを返さない |
| bounded session | 同じ接続先・認証モード・token由来のprincipal keyが残っていれば`review_busy`。テスト同士が同じ合成principalを使うため後続も衝突する |

Vitestの別ファイルはisolated worker/moduleで実行される。外の並列実行は負荷の誘因候補だが、
別ファイルが同じSetを直接奪ったとする証拠はない。再現できた衝突は**同じモジュール内に残った前のレビュー**とのもの。
元のログの14件失敗のうち、最初は5,000ms超過、後続にはreview_busyが含まれた。元の失敗記録は保持する。

## 3. 再現テスト

`tests/review/selection-timeout.test.ts`が独立した子Vitestを起動する。
再現専用の`selection-timeout.config.ts`は通常のnpm test設定からは読み込まず、`.cases.ts`だけを対象にする。
最初のテスト期限だけを250msに**短縮**し、実workerのready前をSharedArrayBuffer/Atomicsで止める。
実ServiceNow通信や実OAuth交換は行わない。childはenv={}、結果/未処理エラー**件数**だけを一時領域で読み、削除する。
再現専用childはthreads poolとし、外側watchdogが所有childを終了した場合にも、別OS forkを孤立させない。

| ケース | 観測・採点 |
|---|---|
| 未管理 | 最初のテストは実際にVitestの250ms超過で失敗。context.signalはAbortされるがレビュー用signalは未Abort。後続はreview_busy。元のレビューを明示的にAbortし、worker終了/完了を待つと再利用できる |
| 管理あり | 最初のテストは同じ250ms超過で**失敗のまま**。signal転送とafterEachのdrain後、元worker.threadId=-1を確認。後続は正常に取得枠へ入り、意図したmetadata_unavailableの結果まで到達 |
| OS終了遅延 | 実Worker.terminateの完了を合成gateで遅らせる。終了待ち中の同principalはreview_busyを維持。gate解放・元のレビュー完了後だけ新規sessionを取得できる |

再現用の子プロセスは両モードともexit=1、最初のテスト1件失敗を要求する。
外側のテスト成功は「意図した失敗と後続の違いを確認できた」という意味で、内側の期限超過を成功へ変換したものではない。
標準JSON reporterは未処理エラーを含めないため、専用reporterで件数を別に記録し、0件も検査する。

TDDでは、管理用scopeがない状態/数値診断がない状態での失敗を確認し、追加後に再実行した。
実worker・adapter・admissionを使い、製品内部の関数/モジュールはmockしない。遅延はOS worker境界だけに入れる。

## 4. テスト側の変更（製品期限は不変）

- `ReviewTestScope`がテストのcontext.signalを固定理由のAbortへ転送し、呼出し元独自のsignalとも結合する。
- afterEachでAbortし、追跡中の実レビューを待つ。workerのthreadId=-1を確認してからmock/fetch/時計/envを戻す。
- タイムアウトしたasync関数が後から続いても、閉じたscopeから新しいレビューは開始させない。
- MCP dispatchのケースも既存context.signal経路で追跡する。公開APIやdispatchの製品実装は変更しない。
- 3種類のmetadata検証はit.eachで独立させ、1ケースの期限内に3回のworker起動/終了を詰め込まない。
  各ケースの既存テスト上限自体は変更しない。単発で期限を超えれば、引き続きそのテストは失敗する。
- 取得枠のSet/counterをリセットしない。principalの変更、workerの使い回し、製品deadlineの延長もしない。

`src/**`、既存`vitest.config.ts`、package/lock、実接続設定は未変更。
BOUNDED_LIMITSの全体60秒・request 10秒・byte/request上限、解析/集約の期限・cleanup、R-2の385秒は緩めていない。

## 5. 次回失敗時の段階別証拠

テスト用scopeの診断は`process.hrtime.bigint()`由来の相対ms・boolean・件数だけ。
製品側のperformance.nowを使う合成deadlineテストとは独立して計測する。

`created_ms / ready_ms / analyze_started_ms / finish_started_ms / last_reply_ms / terminate_ms / exit_ms / exited`、
`pending_reviews / aborted / close_requested`を記録する。URL・token・sys_id・payload・コード・message本文・例外は含めない。
通常はtest.metaの`bp5_review_lifecycle`だけへ入れ、失敗時だけ同じ固定shapeを`BP5_REVIEW_TEST_LIFECYCLE`として出す。
これはローカル合成テストの診断であり、保留中のServiceNow telemetry調査を再開するものではない。

- ready_ms=null：ready前の起動/loader/scheduling待ち。
- finish_started_msあり・last_replyが後続しない：集約要求後の待ち。
- terminate_msあり・exit_ms=null：OS worker終了確認待ち。
- exit済み・pending_reviews>0：adapter/finallyの完了待ち。

これらは段階の証拠であり、CPU負荷・I/O・OS scheduling等の内訳まで単独で証明するものではない。

## 6. 検証結果

| 検証 | 結果 |
|---|---|
| `npm test -- --maxWorkers=2`（独立に2回） | 両方とも111ファイル・2,894件成功。53.44秒 / 29.86秒 |
| target-selection + selection-timeout + R2 supervisor（2 workers） | 80件成功 |
| 最終のtarget-selection + selection-timeout（2 workers） | 40件成功、6.64秒。target-selection 37件、外側の再現検査3件 |
| `npm run type-check` | 成功（通常のプロジェクト型検査） |
| 新規再現driver・scope・cases・configの明示的strict TypeScript検査 | 成功 |
| 変更したテスト・fixture 6ファイルのESLint | 成功 |
| `npm run test:pack`（sandbox制約外で再実行） | 成功。361ファイル、production-only install・worker解析・集約・MCP smokeを確認 |
| `git diff --check` | 成功 |

上記の全体回帰は、製品上限や通常テストの5秒を変更せず実行した。
最終の型確認でTaskMetaへの追加情報は`Object.assign`にし、Reporter型の参照は
インストール済みVitestの公開`vitest/node`へ訂正した。その後の対象40件・型検査・lintも成功。

補足：既存target-selectionを含めてテストを明示的strict検査した初回は失敗した。
今回追加したTaskMeta/Reporter型の問題は上記で解消したが、従来のfetch mock推論、
SDKのJSON Schema型、BoundedReadOptionsのliteral型とテスト値の不整合は別課題として残る。
通常の型検査はtestsを対象にしないため、通常の型検査成功を「全テストのstrict型検査成功」とは扱わない。

梱包検査の初回はsandboxからnpmキャッシュへのアクセスがEPERMで停止した。
npmが表示した所有権修正は実行せず、設定・ファイル権限を変えないsandbox制約外での再実行は成功した。

systematic-debuggingの手順で最初の遅延と後続衝突を分離し、TDDで実期限超過を伴う再現を先に確認した。
verification-before-completionに従い、並列回帰・型・lint・梱包の実出力を確認して記録した。

## 7. 留保

テスト自体の期限超過は今後も起こり得る。今回確認したのは、キャンセル未伝播による連鎖と、安全なテスト後始末の効果。
OSがworker終了を確認できない場合はhookも失敗し得る。その場合に取得枠を強制解放して成功扱いにはしない。
元の並列負荷の再現性・最初の単発遅延の内訳は未確定のまま保持する。

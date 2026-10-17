# BP-5：同期解析・集約のworker化と強制中断

Version: bp5-workers-0.2 / Date: 2026-10-18。
内部アダプターと合成テストの記録。MCP登録・npm梱包変更・実機操作は対象外。
規則/根拠の承認、独立人手評価、製品公開の承認は引き続き未実施。

## 1. 実行境界

BP-5のreviewBoundedUpdateSetは、HTTP取得を親スレッド、XML/AST解析・1件契約検証・集約/省略・
集約契約検証・結果のJSON文字列化をNode worker_threadsへ分離する。
同期解析を親で呼ぶフォールバックは設けない。旧オフライン入口と固定評価プロファイルは同期APIのまま維持する。

| 部品 | 責務 |
|---|---|
| bounded-read.ts | 認証固定・HTTP制限・単調時計の残り時間remainingMs()・同時実行枠 |
| update-set-adapter.ts | source/workerの所有、行の処理順、固定失敗、worker終了後の枠解放 |
| worker-supervisor.ts | 固定worker起動、1件ずつのRPC、期限/abort監視、強制終了・exit待ち・後始末 |
| review-worker.ts | 既存V2解析器、1件結果検証、CPU側集約の呼出し。本文を実行しない |
| aggregate-finalize.ts | 従来の集計・結果単位省略・coverage/由来/容量検証をCPU側へ移設 |

workerは遅延起動し、通常は1個を再利用する。[内部期限](BEST_PRACTICE_BP5_SOFT_DEADLINE.md)で
解析を中断した場合は終了確認後に集約用を起動する。同時生存は最大1個で、複数RPCも同時に送らない。
release不明で解析しない場合も、集約が必要なら同じ停止可能なworker境界で組み立てる。
正常終了時もworkerを終了させ、共有poolや結果キャッシュを残さない。

## 2. 同じ60秒予算の伝播

BoundedReadSessionの開始時点からperformance.now()で測定する既存の最大60秒を利用する。
worker起動、解析、最終照合、集約、終了待ちを含め、工程ごとに60秒をリセットしない。
内部テスト用の短縮制限もそのまま伝播する。上限を増やす利用者入力は追加しない。

各RPCは開始時の残り時間だけをtimerに設定し、応答到着時にも期限・外部abortを再確認する。
返答が遅れた場合、timerと返答のどちらが先に届いても成功へ戻さない。
HTTP側の401/403や容量停止後に暫定集約する場合も、元のremainingMs()と外部signalを使う。
HTTPの停止を、新たなCPU予算を開始する許可にしない。

期限切れ/cancel時は協調的なメッセージ応答に依存せずWorker.terminate()を呼び、exit完了をawaitする。
その後でHTTPセッションをcloseし、認証キー単位/プロセス全体の同時実行枠を解放する。
終了待ちを含めた最後の期限/abort照合でも遅い成功を拒否し、固定エラーのみ返す。
60秒後の集約を救うための時刻の切詰めや、部分指摘の返却はしない。

### 保証の範囲

これは停止不能なJavaScript解析を親から切り離し、中断要求後にworkerの生存を残さない実装である。
OSのスケジューリングやterminateの完了待ちを含め、返答が厳密に60.000秒以内になる実時間保証ではない。
期限に達した時点で終了を要求し、終了確認が済むまでは枠を保持する。
親に残る有界HTTP JSONデコード、メタデータ処理、structured clone、最大256KiBの応答デコードや、
既存の同期設定ファイル/ACL検査を任意の命令位置で中断する保証もない。
親のイベントループを別のコードが無期限に塞ぐ環境や、OS/Node自体の停止は対象外。

## 3. 失敗・資源解放

| 状態 | 処理 |
|---|---|
| 正常 | RPCのtimer/abort/message listenerを外し、次の仕事で同じworkerを再利用。最後に終了をawait |
| 全体期限切れ | deadline_exceeded、workerをterminate/await、指摘を返さない |
| 解析の内部期限 | workerをterminate/await。受領済みの結果を保持して同じ全体予算内で照合/集約する。[内部期限記録](BEST_PRACTICE_BP5_SOFT_DEADLINE.md)参照 |
| 外部キャンセル | cancelled、abortのreasonは表示/worker転送しない。終了をawait |
| 起動不能・ready前のerror/予期しないexit/messageerror | worker_unavailable。固定理由のみ返し、親で再解析/別workerへ自動再試行しない |
| ready後のerror・予期しないexit・messageerror | internal_review_error。原診断を返さない |
| 不正なRPC/JSON・worker側契約不整合 | internal_review_error。本文/stack/パーサー原文を返さない |
| HTTP失敗後の暫定集約中に期限切れ | 暫定指摘を捨て、output段階の固定期限エラーのみ |

closeは冪等。終了時にworkerのerror/exit listenerとstdout/stderr streamも解放する。
workerが入力のコードを実行したり、入力由来のファイル/URLをimportしたりする機能はない。
既存アダプターのエラー/省略状態や、C方式の証拠・制限は維持する。

## 4. 情報・容量境界

- ビルド済みsupervisorは固定のreview-worker.jsを使う。ソース/tsxへのフォールバックはしない。
- workerへ渡すのは解析用payload/識別子/証拠、または本文を含まない集約データのみ。
  client、URL、OAuth/per-userトークン、運用者の私有証跡参照は渡さない。
- env={}、argv/execArgv=[]で起動し、親の資格情報付き環境やデバッグ/loader引数を継承しない。
  stdout/stderrは捕捉して破棄し、親のログへ転送しない。
- V8 resourceLimitsはold generation 128MiB、young generation 16MiB、stack 4MiB。
  これは総RSSやArrayBufferを含む全メモリの厳密な上限ではなく、OS sandboxでもない。
- 解析結果はworker内で1件契約を検証し、単体でも応答予算を超える場合はresult_omittedにする。
  集約は既存の最大100指摘/256KiB・結果単位省略を維持する。
- RPCの返答は最大256KiBのJSON文字列。親はID・成功フラグ・型の識別子・容量を照合してデコードする。
  完全な契約検証は固定の信頼されたworker側で実行する。任意workerの結果を信頼するAPIではない。

ReviewAdapterOptions.workerFactoryはOS境界のテスト注入専用で、MCP入力/設定には接続しない。
ソース実行は次節の開発用bootstrapを使う。停止動作の注入には別のテスト専用bootstrapを用いる。
本番のworkerへtsx依存やテスト用の停止動作を持ち込まない。
dist/reviewの同梱対象・本番依存の現行方針は後続の[梱包記録](BEST_PRACTICE_BP5_PACKAGING.md)を参照。

### 4.1 開発モードと起動確認

supervisor自身のimport.meta.urlのpathnameが`.ts`のときだけ、固定の
`dev-worker-bootstrap.mjs`を起動する。bootstrapはdev依存`tsx/esm/api`を明示登録し、
tsconfigを読み込まず固定の`review-worker.ts`をimportする。`npm run dev`と同じtsxソース実行で
利用できる。開発にはdev依存を含む`npm ci`が必要となる。

ビルド済みモジュールは、NODE_ENV・呼出し引数・ファイルの有無によらず固定の`.js`を選ぶ。
本番入口が欠けていても隣の`.ts`や開発bootstrapを探さない。bootstrapはtscでコピーされないが、
ビルド済み入口からは参照しない。worker/依存の同梱と隔離検証は[梱包記録](BEST_PRACTICE_BP5_PACKAGING.md)を参照。

workerは依存のimportと受信listenerの登録が終わってから、固定のready通知を1回送る。
親はこの通知まで解析入力を送らず、起動の同期例外、入口欠落、import失敗、ready前の異常終了を
`worker_unavailable`へ統一する。原例外・パス・stack・標準出力/エラーは返さない。
ready後の解析/RPC失敗は従来どおり`internal_review_error`となる。
ready待ちも元の残り時間・cancel監視に含め、期限/cancelはそれぞれ既存の固定コードを優先する。
起動不能時もworkerの終了をawaitしてから認証枠を解放する。同期解析への代替実行はしない。

変更は内部アダプターの固定エラー列挙の追加であり、1件/集約の結果JSON契約、固定評価セットは変更しない。

## 5. 合成検証

実Workerを使い、応答せずCPUを回すfixtureで解析中/集約中の中断を試す。
ループに到達したことはSharedArrayBufferのフラグで確認する。レビュー対象コードは実行しない。

- worker-supervisor.test.ts：正常集約、再利用、期限/cancel、開始前拒否、起動失敗、throw/exit/不正応答、
  遅い返答の抑止、冪等close、listener/診断出力の解放。
- worker-lifecycle.test.ts：解析/集約中のdeadline/cancel、取得で消費済みの予算の引継ぎ、
  同じ認証主体/全体2枠の保持と終了後の再利用、資格情報/URL非転送、入力拒否の優先順位。
- 既存アダプター42テストも実Worker経由で再実行する。workerには親のfake Dateが伝播しないため、
  時計異常のテストは親の開始時刻を未来にした後に巻き戻し、workerの実時計で契約拒否される形へ調整した。
  検出器・固定評価ケース・契約の変更ではない。

最初の結合試験では、fixtureがMessagePortの未提供メソッドprependListenerを呼んで起動に失敗した。
エラーを読み取り、OS境界のラッパーへ変更して解消した。テスト制限時間の延長では回避していない。
初回の終了確認テストでは、worker停止前にPromiseが拒否される実装を検出し、terminateのawait後に
拒否する形へ修正した。不正なworker応答の拒否、入力拒否とcancelの優先順位も失敗→修正→成功を確認した。

### 2026-10-18 検証記録

- 新規2ファイル・19テスト成功（supervisor 12件、lifecycle 7件）。実Workerと合成HTTPを使用。
- `bdo npm test`：94ファイル、2,349テスト成功。既存2,330件を含む。
- `bdo npm run build` / `bdo npm run type-check`：成功。
- 対象実装/テスト/fixture計13ファイルのESLint：エラー/警告0。全体lint：エラー0、既存警告374。
- `bdo node tests/review/fixtures/compiled-worker-smoke.mjs`：ビルド済みの標準入口で解析/集約成功。
  このコマンドも通信は合成fetchだけで、実設定・実機に接続しない。
- `git diff --check`と新規ファイルの末尾空白確認：成功。
- 既存解析器・スコープ/定数評価、結果スキーマ・可搬契約・合成JSON例・固定評価器、固定fixture、
  server/ツール登録、package/lockはHEADから変更なし。
- 検証環境はmacOS/Node v24.18.0。最低対応版Node 22.12、Linux/Windows実機は今回未検証。

新規19件はライフサイクルの機能回帰テストであり、非公開の人手本試行48件や独立した検出性能評価ではない。
MCP登録、実機操作、公開処理は実施していない。

### 2026-10-18 開発モード起動対応の検証記録

- ソース標準入口の失敗、起動例外/入口欠落/ready前throw・exitの固定エラーについて、失敗→修正→成功を確認した。
- 起動関連7件を追加。関連3ファイル計26件で、標準ソース入口、Nodeの`--import tsx`による
  合成アダプターの解析/集約、ビルド済み形式で`.js`欠落時にソースへ代替しないこと、
  起動失敗後のworker/listener/認証枠解放を確認した。
- 全体初回は2,366成功/2失敗。既存の短縮期限テストが、残り500msで必ず処理まで到達すると
  仮定していた。全体実行のCPU競合で起動中に期限へ達したため、起動中/処理到達後を区別する
  検証へ変更した。期限や上限は延長していない。処理到達必須の中断検証は別の既存テストで維持する。
- `bdo npm test`：95ファイル、2,368件成功。
- `bdo npm run build` / `bdo npm run type-check`：成功。
- `bdo node tests/review/fixtures/compiled-worker-smoke.mjs`：本番標準`.js`入口で解析/集約成功。
- 変更対象10実装/テスト/fixtureのESLint：エラー/警告0。全体lint：エラー0、既存警告374。
- `git diff --check`：成功。結果JSON契約、固定評価セット、MCP登録、package/lockは変更なし。
- macOS/Node v24.18.0で確認。Node 22.12、Linux/Windowsは未検証。

合成fetchだけを使用し、実機/実設定へは接続していない。開発サーバー自体の起動やMCP登録、
npm梱包変更は対象外。soft cutoff/partial救済は未実装で、hard deadline時の固定エラー方針は維持する。
本検証は機能回帰であり、人による規則承認/独立評価の代替ではない。

後続のworker同梱・本番依存の隔離検証は[梱包記録](BEST_PRACTICE_BP5_PACKAGING.md)参照。
後続の早期打切り・partial返却は[内部期限記録](BEST_PRACTICE_BP5_SOFT_DEADLINE.md)参照。
上記の「梱包変更は対象外」「package/lock変更なし」は各段階の検証記録であり、現在の梱包状態は同記録に従う。

残課題：MCP登録、許可済み読み取りE2E、運用上の上限/権限の承認、独立評価と品質/公開審査。

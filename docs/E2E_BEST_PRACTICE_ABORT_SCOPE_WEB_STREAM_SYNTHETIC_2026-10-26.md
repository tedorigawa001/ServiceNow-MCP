# AU-BR-006 実Web Streams read／cleanup接続の合成検証

Date: 2026-10-26 / Runtime: Node v24.18.0 / Scope: fixture session＋注入Response。

## 1. 実装範囲

[transport設計draft-0.6 §16](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)に沿い、`abort-scope-evidence-web-stream.ts`を追加。実際のResponse・ReadableStream・reader.read／cancel／closed／releaseLockを使い、既存の開発専用state machine・単一fixture会計へ接続した。global fetchやURL／認証headerは追加せず、PDIへ通信していない。

fixtureと本物のsessionの登録・owner・claim台帳は分離したまま。生のBoundedReadSessionを渡しても新adapterは拒否し、通常GETに影響しないことを確認する。正式な証拠発行口・本番のsource/issuer/worker接続は未実装／閉鎖。Unknown・全体受付無効、VM／監視／telemetry保留を維持する。

## 2. 接続した境界

- 用途permitでCを一度消費した直後、注入sourceを同期的に一度呼ぶ。同期throw／Promise rejectでも返金しない。descriptorにURLや秘密は持たせない。
- statusとbody参照を受領時に一度捕捉。後続でgetterを再評価して別bodyをcancelしたり、401等の本文を開いたりしない。既にlocked／再利用されたbodyのreaderを横取りしない。
- reader.closedのPromiseをrelease前に捕捉して成功・拒否を即座に観測する。pending readは最大1件、正常EOFだけではcleanupを確認済みにしない。
- 各採用chunkを既存ownerへ一度課金。超過分も保持し、コピー前に止める。失敗statusは課金するがscratchへ保持しない。Content-Lengthを課金や受付の代用にしない。
- scratch容量は同ownerが渡す通常4MiB／table16KiBと低減responseBytesの最小値。無制限なchunk配列を作らない。EOF後にfatal UTF-8 decodeし、cleanup／JSON／byte数・digest／時刻の検査後だけfake body handleを返す。
- D_ioとD_attemptはstate machineからの絶対値を使う。取消時刻から新しい期限を作らない。revocation後のclock-only観測はcleanupに限定し、dispatch／chunk／body発行を再開しない。
- cancelは所有reader、reader未取得なら捕捉済みunlocked bodyへ一度だけ。cancel決着・pending read決着・closed fulfilled・lock解放成功を分けて確認する。
- 未確認はsticky。late Responseのbest-effort cancelや終了後のlock解放で既存cleanup票を書き換えない。cancel拒否・read拒否・background pump例外は観測し、生の例外message／stackを戻り値へ出さない。
- 未消費body／同時runは既存制約で拒否する。retryは同permitで明示的に行い、前試行のcleanup confirmedが前提。自動retry/backoffのsource orchestrationは未接続。
- payloadのG/SはJSON応答bytes、payload枠はsource境界のdecoded payload文字列を一度課金する。fixture callerの文字列申告と実source/schemaの由来を結合したとは主張しない。

## 3. 新規テスト35件

`tests/review/abort-scope-evidence-web-stream.test.ts`は本物のWeb Streams APIを使う。時刻・source応答・障害だけを合成し、PDIの資格情報やコード本文を扱わない。

| 分類 | 確認した動作 |
|---|---|
| 正常 | EOF・closed・release、split UTF-8、byte/digest検査、opaque handle、本文非出力 |
| 空read | 非空chunkを挟む場合も合計16回まで。17回目はinvalid_response、cleanup後もretry不可 |
| cancel | pending／fulfilled／rejectedを区別。readとclosedだけが決着していてもcancel未完了なら未確認 |
| 時間 | I/O cutoffでabort、元のcleanup期限で終了、最後のabortが期限を越えればbodyなし |
| HTTP | 401／403／404をreadせずcancel。503のbodyは課金のみで保持せず、cleanup確認後に同permit retry |
| 受信 | G/S超過、table下位枠超過、低減cap、偽Content-Length、overshootを課金した後にコピー前拒否 |
| 不正応答 | no_body、UTF-8／JSON不正、errored reader、locked body、releaseLock失敗、異常chunk例外 |
| late／競合 | timeout後のResponse、cancel／close、stopとchunk採用の前後、再入取消、同時run拒否 |
| 所有権 | body/status getter差替え、別streamのcancel禁止、release/cancelの一度限り、実session登録拒否 |
| 後始末 | run終了後のadapter timerゼロ・scratch参照解除。fixture close後に全test timerゼロを確認 |

## 4. 初回失敗・訂正履歴

1. 最初の正常EOFケースはmodule未実装で失敗し、接続後に成功した。
2. 2件中1件で、空readが非空chunkごとにresetされることを再現。1試行合計16回へ修正し、17回目を非retryの局所invalid_responseにした。
3. 24件中1件でreleaseLock障害テストが5秒timeout。テストが先にreaderを取得しforeign lockとして拒否されていたため、adapter自身のgetReader後にreleaseだけを失敗させるfixtureへ修正。製品・テストの期限は変更していない。
4. 25件中1件で異常chunkのgetter例外がbackground pumpの未処理拒否になり、upstream_unavailableへ誤分類された。拒否handlerを付けて固定理由で停止し、raw例外を戻さないよう修正した。
5. 32件中1件でResponse.body再評価により別streamをcancelし得た。受領時の同一body参照だけを使うよう修正した。
6. 33件中1件でstatus getter再評価により401本文を1回readし得た。statusを一度捕捉して全判定に使うよう修正した。
7. 34件中1件で低減responseBytesに対しscratchだけ標準4MiBを確保していた。同ownerの低減capを内部試行情報へ結び、確保容量にも適用した。
8. 35件中1件で、abortするとbodyがerroredになるstreamの局所table不足が全体停止になった。局所不足はcancel／closed／releaseの後でcontrollerを終端化し、取消・全体失敗・I/O期限だけは即abortする順序へ修正した。

これらは注入fixture内での不整合の再現であり、外部HTTP攻撃や本番sessionでの悪用を実証したものではない。

## 5. 検証結果

すべて`bdo`経由。

| 検証 | 結果 |
|---|---|
| 新規Web Streams単体 | 35件成功 |
| Web Streams＋既存transport state/accounting | 3ファイル・142件成功 |
| `npm run build` | 成功 |
| `npm test` | 152ファイル・4,466件成功、38.59秒 |
| ESLint全src/tests（インストール済みAPIで集計） | エラー0件、既存警告374件で増加なし |
| `node tests/review/package-worker.mjs`（オフラインcache使用） | 本番依存のみの再インストール・compiled worker/MCP/fixture境界検証成功。377ファイル、開発専用prefixは非同梱 |
| 差分・文書検査 | `git diff --check`成功、4文書のローカルリンク26件が存在し末尾空白なし |

## 6. 残る制約

- API上のcleanup確認であり、socket／TLS／native bufferの消失、OS資源回収、物理ゼロ化の証明ではない。
- statsのretained_bytes／peak_retained_bytesはadapter所有scratch容量だけを示す。private JSON receipt・Response・native stream queue等を含む総メモリ上界ではない。
- 既に渡された巨大chunkのメモリ、sourceが先にenqueueしたqueue量を受信cap内に制御したとは主張しない。保持／control work／bootstrapを含む全体受付証明は未完了。
- 非協調fetch／read／cancel Promise自体を強制終了することはできない。期限でrunを未確認として止め、late rejectionを観測する。未確認resourceを抱えたprocessの隔離／次run受付policyは承認待ち。
- 同期decode／JSON.parseや任意source callbackをtimerだけでpreemptできない。post-operation clock検査による期限後発行拒否であり、厳密wall-clock返却上限は未確認。
- 最低対応Node 22.12・他OS・実HTTP・OAuth bootstrap・実worker・実source/ReleasePermit/plan・本番cap承認は未確認。fixture成功を正式receipt／sealへ昇格しない。

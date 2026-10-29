# RT-B03：typed cleanup・同bytes candidate・一度限りackのfake I/O検証

Date: 2026-10-29 / Scope: constructor固定の孤立fake context・同lease／停止・fake read／cancel／closed／release・元期限。

設計：[接続差分draft-0.4 §12](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md#12-rt-b03typed-cleanup同bytes-candidate一度限りのackfake-io限定)。
実装：[body lane](../src/servicenow/review-bootstrap-body.ts)、[bootstrap](../src/servicenow/review-bootstrap-contract.ts)。
試験：[body契約](../tests/review/real-typed-body.test.ts)、[連続bootstrap](../tests/review/real-typed-cleanup-bootstrap.test.ts)、[梱包境界](../tests/review/fixtures/compiled-fixture-boundary.mjs)。

## 1. 実装した範囲

RT-B02の孤立contextへtyped_body=trueをconstructor時に固定した場合だけ、fake resourceのread・cancel・closed Promise・releaseを同attemptへ結び付ける。新規body laneはruntime依存として同梱される内部contractだが、実BoundedReadSessionは依存を渡さず、private #runOwnerやbody／ackのgetterも公開しない。既存legacy処理・単一完了イベントのnot_observed・正式発行閉鎖は維持する。

chunkをprivate copyして同canonical Gへ一度課金し、cleanup確認済みEOFだけが不透明candidateへ進む。同private bytesから一度JSON decode／SHA-256を行い、同attemptのdraftをasync handoff後に一度だけackする。callbackによる元bufferの変更、foreign／copy／replay、途中停止では成功値を公開しない。ack後・失敗時は保持するchunks／parsed value／digestの参照を捨てる。

HTTP cleanup診断と最初の停止理由を分離し、cancelledだがcleanup confirmed、上限超過でcancel cleanup confirmed、cleanup自体unconfirmedを区別する。元attempt最大10秒の内側に最大250msのcleanup枠を確保し、同leaseの期限で待つ。cleanupは停止後も観測できるが、readyやbody authorityを復活させない。

## 2. RED→GREEN・途中の失敗

- body契約tracerはmodule未実装のimport失敗から開始。次にtyped_bodyの連続tracerは既存bytes応答を前提とするためinvalid_responseで失敗した。private laneとopt-in bootstrapを接続して成功させた。
- S=3へ4 byteを渡す試験は例外が出ずRED。native長さを読み、超過分もGへ課金してから拒否し、巨大copyを確保しないようにした。
- pending readの取消試験でcancel／releaseが各0となるREDを確認。read決着・cancel Promise・closed・releaseを同resourceで観測し、元deadlineまでだけ後始末を待つ処理を接続した。
- ack最後のguard失敗で保持量20 byteが残るREDを確認。pre/post検査失敗でもdraftの保持参照を落として失効をstickyにした。再要求の期待値はinvalid_stateではなく、先行cancelledを維持する契約へ合わせた。
- 空17件／非空4097件が受理されるREDを確認。空は合計16、非空保持は4096を上限にした。超過chunkのG課金は残す。
- 同じfake resourceを二度releaseしてしまうREDを確認。参照のWeakSetで再採用を拒否し、第二read／releaseを開始しない。
- closedがundefined、cancelがPromiseを返さない試験がconfirmedになるREDを再現。missing値は完了の証拠にせず、それぞれreader_owner_unknown／cancel_rejectedとして拒否した。
- pending dispatch失効後のcleanupがnullになるREDを確認。未実行／no_response／fetch_pending／未採用応答を区別して固定し、late bodyのbest effort cancel／releaseで結果を修復しないようにした。不正statusの応答がfetch_pendingに分類されるREDも、reader_owner_unknownへ分離した。
- releaseが元attempt期限の等号に到達する試験を再現。release後も同leaseを再検査し、cleanup_deadlineをunconfirmedとして保持する。
- 消費済みdraftのasync ack待ちで時計を元attempt期限へ進めると、第二dispatchが始まるREDを確認。typed body採用後は、confirmed EOF cleanup・ack済みのHTTP 429／5xxだけをretry可能に限定した。ack失効／read timeout／cleanup不成立では再試行しない。JSON.parseの試験spyは本物のparse結果を返し、直後のmicrotaskでfake clockだけを進める。実装内のparseや期限を迂回していない。

製品／試験の期限やcapを緩めずに修正した。失敗したREDを成功実績へ数えていない。

## 3. 主な観測

| 観点 | 確認 |
|---|---|
| 連続成功 | per-userはparent→releaseでC=2、各bodyにread2／release1、candidate消費2／ack2。exchangeは認証を含めC=3／ack3。prepared_only／disabledを維持 |
| 同bytes | 元byte変更の影響なし。UTF-8分割chunkを正しくdecodeし、試験側の独立byte長合計・SHA-256と一致 |
| 一度限り | 二重consume／ack、foreign attempt／candidate／draftを拒否。foreign ownerは消費せず利用できる。失敗後の新openも拒否 |
| ack失効 | cancel／close／期限切れ・最後のguard失敗でack成功数0、保持量0。async handoff期限切れはC=1、追加dispatchなし |
| cleanup確認 | EOF＋closed fulfilled＋release成功だけcandidate。確認済みcancelはcandidateなし。停止理由cancelledは残す |
| cleanup不明 | pending read／cancel、cancel拒否、closed待機／拒否、release失敗、missing Promise、元期限到達を固定理由で保持。late fulfillmentで修復しない |
| 会計 | S/G超過chunkの4 byteを一度だけGへ課金。P=0・C保持・同resource cancel／release各1。二重課金・返金なし |
| bounded保持 | 空read合計16、非空chunk保持4096、S≤4MiB／G≤16MiB。SharedArrayBufferを拒否。候補を作れないraw bodyを結果へ返さない |
| 期限 | I/O cutoffは9750ms、cleanupは元attempt10000msまで。新しい10秒枠を起こさず、等号での確認を拒否。各経路のtimerは終了時0 |
| retry | settledなHTTP 503のbodyはcleanup／ack後だけ一度retry可。C/Gを戻さない。pending read・ack失効・cleanup不明はretryなし |
| 遅い応答 | pending dispatchの失効はfetch_pending。late bodyをreadせずG=0、best effort cancel／release各1。先行診断は不変 |
| 梱包／秘密 | 実sessionにbody consume／ack取得口なし。結果・固定診断にtoken／本文／raw例外／source／permitを出さない |

## 4. 最終検証

前段の全体runは184 files／5,585 tests成功（33.17秒）だったが、その後にack待ち期限切れの拒否と追加回帰テストを加えたため、下記の最終runとは区別する。

| 確認 | 結果 |
|---|---|
| 新規RT-B03契約・連続bootstrap | 2 files／46 tests成功 |
| RT-B03＋既存RT-B01／02 | 4 files／119 tests成功 |
| 最終全体 `vitest run --maxWorkers=3` | 184 files／5,588 tests成功、31.89秒、skipなし |
| `npm run build` | 成功 |
| 変更実装・新規試験・梱包fixtureのESLint | 成功 |
| offline package-worker smoke | production-only install・解析・集約・private境界成功、385 files |
| 関連MD相対参照先 | 5 files／94 links存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

全体回帰には既存のローカル合成待受・fake I/O・worker試験を含むが、外部ServiceNow／実OAuthへの通信ではない。無関係な`.vscode/`・`CLAUDE.md`は変更していない。新規の検証コードは実資格情報を使わない。RT-A01〜16の全体合格・実PDI検証完了を意味しない。

### コミット対象のみの再検証

2026-10-29、HEAD（f10d225）へ今回の11ファイルだけを重ねた一時snapshotで確認した。無関係な`.vscode/`・`CLAUDE.md`は除外した。build・変更実装／新規試験／梱包fixtureのESLint・全体184 files／5,588 tests（32.61秒、skipなし）・offline package-worker smoke（385 files）が成功。関連5文書の相対参照94件と行末空白検査も成功した。検証後はこの結果の文書追記だけで、検証した実装・試験・依存設定は変更していない。

## 5. 未接続・未証明

- resourceはconstructor固定のfake操作object。同じobjectの操作結果を観測しており、native Response／default readerの所有権・getReader失敗・stream wrapper間の同一性を証明する試験ではない。実adapterをまだ接続していない。
- 実BoundedReadSessionのcanonical更新点移行・実URL／Authorization snapshot・固定source bootstrap caller、実ReleasePermit／C方式設定の起源・bindingは後工程。
- candidate／draft／digest／ackから正式BoundedBodyReceipt／SourceRunEvidence／選択window／payload receipt／worker job／sealを発行しない。親の初回／最終安定性証拠も本経路では未接続。
- 参照の破棄は物理秘密消去・GC／allocatorの証明ではない。同期parse／hash途中の強制中断、全体work／heap受付、非協力的I/Oの物理終了・OS実時間保証は未証明。late cleanupのbest effortは終了確認ではなく、unconfirmedを保持する。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実資格情報を読み込まず、実通信・実機操作・トークン発行・設定変更・Pushは行っていない。本番cap・正式生成経路・公開MCP登録を有効化していない。

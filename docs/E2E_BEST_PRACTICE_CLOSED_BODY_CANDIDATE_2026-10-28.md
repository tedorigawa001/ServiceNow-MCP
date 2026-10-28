# AU-BR-006：同attemptのbody候補・typed cleanup・一度限りconsume

Date: 2026-10-28 / Scope: fake依存限定、正式発行口閉鎖。

設計：[draft-0.4 §16](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#16-draft-04同attemptのprivate-bytes候補とtyped-cleanup)。
実装：[body lane](../src/review/abort-scope-evidence-closed-body-candidate.ts)、[同ReadState](../src/review/abort-scope-evidence-closed-read-state.ts)、[閉鎖gate](../src/review/abort-scope-evidence-closed-body-gate.ts)。
試験：[追加50件](../tests/review/closed-body-candidate.test.ts)（初回45件＋レビュー境界回帰1件＋§7の4件）。

## 1. 接続した範囲

fake constructorの`accounting.body_mode=bytes`で、同attemptにprivate chunks・typed cleanup terminal・opaque candidateを結合した。同じReadStateのC/G/S/P/E/R/Tとclockを使い、課金用counterやsessionを作り直していない。既定のlengthモードと既存回帰は維持した。

bytesモードではscalar chunk／cleanup confirmed申告／payload長の直接課金を拒否する。native内部slotで検査・private copyしたbytesだけを採用し、そのsnapshotから課金・UTF-8 decode・JSON固定射影・hashを行う。任意consumer callbackや本文getterは追加していない。

## 2. TDDと途中の不成立

最初のtracerは未対応のbody_mode入力でRED、接続後GREEN。未消費のfinal bodyが次のslot操作を許す境界、非payload候補がsoft期限後にdecodeを開始する境界も、それぞれ追加RED→修正→GREENで確認した。前者はfinal open／skipのpending guard、後者は同clockのdecode前checkpointへ結合した。

途中のbuildでは、finishの候補なし分岐からcandidate型がnullだけへ推論される型エラーを確認した。型境界を調査し、nullable candidateを含む明示genericへ揃えた。失敗codeや上限を緩めていない。最終buildは成功。

## 3. 合成検証の観測

| 観点 | 観測 |
|---|---|
| 同bytes | caller bytesをappend後に破壊しても解析件数・digestは元snapshotと一致。採用時clock callback内の書換えでも一致。Gは入力snapshotのbyte数だけ |
| 入力memory | getter／speciesを持つUint8Array subclassでcaller getterを呼ばない。shared buffer／Proxy／detached bufferは課金前に拒否 |
| 受信上限 | S/Gの超過chunkも一度課金し、保持参照を破棄して停止。保持nonempty chunksは4096まで、4097番目を課金後body_limitで停止 |
| typed cleanup | pending read、cancel pending／rejected、closed pending／rejected、lock未解放／不明、EOFもcancel完了も無い状態をunconfirmedとして拒否。固定理由と先行診断を保持 |
| 成功以外 | cleanup confirmed/cancelledでも候補なし。retryable終端はbytesを破棄し、次attemptのSだけreset、C/Gは累積。OAuth成功bodyは一般consumerへ渡さず拒否 |
| 一度限り | decode前にconsume claimを消費。二重consume／discard／finishを拒否し、二重課金・decodeなし。terminalをcandidateへcastしても拒否 |
| 所属 | foreign attempt／candidate、clone、別realm terminalを拒否し、外国ownerの候補・診断は不変 |
| 解析失敗 | 不正UTF-8／JSON、追加フィールド、102件の行、空bodyを固定invalid_responseで停止。再consume不可、本文・raw parser errorなし |
| P | 同JSONのpayload文字列からUTF-8長を導出し一度だけPへ課金。Gへ再加算なし。単体超過はlocal payload_limitとしてPを保持 |
| 取消 | EOF前の取消はcleanup owner_stopped/unconfirmedを保持。EOF後の取消は既知confirmed cleanupを維持し、consumeを拒否。解析後checkpoint取消ではP=0、summary非公開 |
| 期限 | 非payloadもsoft cutoffでdecode前拒否、consumes=0／保持0。hard期限後はdeadline_exceeded、候補失効・保持0 |
| 保持・進行 | pending candidateが次final操作を拒否。固定discardは解析せず保持参照を破棄し、同tokenの再利用不可 |
| 閉鎖・秘密 | `refuseBody`はdeny-only、正式発行数0。不透明handle・freeze済み固定summary／diagnosticだけ。synthetic payload・Errorの本文を出力しない |

## 4. 最終結果

以下はレビュー修正前の初回実装の結果。空chunk境界の修正と再検証は§6を参照。

| 確認 | 結果 |
|---|---|
| body lane＋ReadState＋gate | 3 files、137 tests成功（45＋52＋40） |
| `npm run build` | 成功 |
| 変更した実装・試験のESLint | 成功 |
| `vitest run --maxWorkers=3` | 171 files、5,149 tests成功、31.10秒 |
| offline `package-worker.mjs` | production-only install・解析・集約成功、377 files |

既存の`!dist/review/abort-scope-evidence*`により新body laneも梱包除外される。全体試験はローカル合成通信を含むが、実ServiceNowや外部サービスへの通信ではない。

## 5. 証明していないこと

cleanup primitiveはfake依存の観測入力であり、実read／cancel／reader.closed／releaseLockの実行証拠ではない。実HTTP／workerは未開始で、fake cleanupを別のbody診断として表示する。返すterminal／candidate／summaryは正式receipt、実認証・release・source所属・版・scope・worker jobの証拠ではない。

固定JSON schemaは合成の用途別射影で、ServiceNow実record全体を受理・検証する一般parserではない。実status／bootstrap順序／source／ReleasePermit／選択window／payload receipt／workerには未接続。試行10秒・empty-read・cleanup予約の実監督も次工程。

byte captureはSと4096 nonempty chunksで有限だが、同期JSON.parse／schema／hash／文字列の全体work・heap上界やOS強制中断は未証明。参照破棄は物理zero化ではない。本番capの投入・全体受付は有効化していない。

正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持。実transport・実機操作・トークン発行・設定変更・本番cap投入は行っていない。

## 6. レビュー修正：保持上限での空chunk（2026-10-28）

保持4096個の上限検査を空chunkにも適用していたため、保持数が増えない入力で`body_limit`となり、正常な本文を破棄していた。判定を`length > 0`の場合だけへ限定し、上限値・受信課金・連番検査は変更していない。

- 有効なJSONを4096 byteへ空白paddingし、1 byteずつ4096個のchunkで採用。その後の空chunk3個を受理し、G=4096／保持4096／primaryなしのままEOF・consume・digest一致まで検証する回帰を追加。
- 修正前は最初の空chunkで`body_limit`となりRED、修正後はGREEN。
- 既存の4097番目の非empty chunkは、Gへ一度加算後に`body_limit`で停止し、保持参照を破棄する試験を維持。
- 関連3 files／138 tests成功（body46＋ReadState52＋gate40）。`npm run build`と変更実装・試験のESLintも成功。
- 全体`vitest run --maxWorkers=3`は171 files／5,150 tests成功、29.85秒。実transportを使わないローカル合成検証。

## 7. レビュー修正：cancel後のretryとUint8Array検査（2026-10-28）

本番[`bounded-read`](../src/servicenow/bounded-read.ts)の`attempt()`と照合し、2点を修正した。

- cleanup confirmed/cancelledの終端は、`outcome`を一律`unavailable`へ書き換えていた。本番では試行timeoutのlocal abortが`upstream_unavailable`として1回retryされるため、`retryable`は維持し、`success`申告だけを`unavailable`へ落とす。候補は従来どおり作らず、table下位枠超過後は`unavailable`のまま。
- `instanceof Uint8Array`はprototype chainの判定で、prototypeを偽装した`Int16Array`等を受理していた。`set`の要素変換により課金長とprivate copyの内容が元bytesと一致しなかった。`%TypedArray%.prototype[Symbol.toStringTag]`のgetterで内部slotの`Uint8Array`を確認し、Proxyもcaller trapを呼ばず拒否する。
- 追加4件（cancel後retry＋success申告は候補なし・retry不可、偽装prototypeのInt16／Float64／Uint8Clamped）。旧実装では4件とも失敗。関連3 files／142 tests成功（body50＋ReadState52＋gate40）。

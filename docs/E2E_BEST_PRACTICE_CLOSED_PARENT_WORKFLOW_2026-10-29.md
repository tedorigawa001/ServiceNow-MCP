# CD-03／CD-04：private parent workflow・停止・final slotの合成接続検証

Date: 2026-10-29 / Scope: 注入dispatcher・Response／Web Streams・fake clock／scheduler限定。

設計：[親安定性draft-0.4 §13](BEST_PRACTICE_ABORT_SCOPE_PARENT_STABILITY_DESIGN.md#13-cd-03cd-04private-owner停止final-slot接続fake依存)。
試験：[40ケース](../tests/review/closed-parent-workflow.test.ts)。
実装：[Reader／private core](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)、[fake gate](../src/review/abort-scope-evidence-closed-body-gate.ts)、[ReadState](../src/review/abort-scope-evidence-closed-read-state.ts)、[body lane](../src/review/abort-scope-evidence-closed-body-candidate.ts)。

## 1. 接続した範囲

固定parent Readerのtargetを同private core／fake gate／ReadStateへ渡し、body lane内のprivate workflow ownerを一度生成する。既存の同attemptの受信・cleanup・JSON解析から初回snapshotを受理し、既存parent final slotで取得した最終observationを同ownerで一度比較・確定する。callerにrecord／draft／snapshot／comparison handleを返さない。

返却summaryの形は変えず、親だけのstable_observation／changedはbody内の固定診断に保持する。changed_during_reviewの仮のinvalid_state写像を撤去し、差分時は同gateのprimaryとして停止する。本番の暫定結果処理・公開JSON・MCP dispatchは変更していない。

transportの初回success mapだけではfinalを開けず、受理済みprivate snapshotも必要とする。retryは同logical request／parent slot内だけで、C/Gは同ReadStateで継続。最終transient失敗を2回使い切った場合は元の理由で停止し、baselineを破棄する。

ordinary closeを終端revokeから分け、受理済み初回baselineを予約済みfinalへ残す。snapshotの時計検査には同gateの停止・phase／保持attempt期限を渡し、ordinary refuseを終端として記憶させない。cancel・close・認証／schema失敗・cleanup未確認・期限切れは同期revokeする。

consume中はbytesを捨てた後もpendingと同attemptのdeadlineを保持する。async返却の継続を越える際は同成功attemptをprivateに一時保持し、Readerが返す直前に一度だけacknowledgeする。settle・role・snapshot／比較状態・final slotと元のattempt期限を前後guardで確認し、取消／期限切れ後に成功summaryを返さない。

## 2. RED→GREENと途中の失敗

1. 最初のtracerは初回成功後にprivate parent診断が存在せず失敗。固定Readerから同ReadStateの専用body laneへ接続し、初回snapshot→同final slot→stableまで成功した。
2. ordinary closeを起こすと、primaryは無いのにbaselineがrevoked／保持0となる試験を再現。ordinary closeでaccepted baselineを保持し、元の50秒境界後でも55秒内の予約済みfinalへ進めるよう分離した。
3. bodyをdiscardしただけのtransport successでもfinal slotが開ける試験を再現。private snapshot受理を別に要求し、final GET前に拒否。skip経路はinitial_unavailableとして予約を返す。
4. 最終HTTP retry2回後もbaseline1・primaryなしの状態を再現。元のupstream_unavailableで停止し、3回目をdispatchせずbaselineを破棄した。
5. async returnのmicrotask境界で取消／attempt期限切れが起きても成功summaryが返る試験を再現。同成功attemptの一度限りのacknowledgementをReader返却直前へ接続して拒否するようにした。初回・finalの両方で確認した。finalの過去のstable観測は履歴として残すが、liveはfalseとなり成功を返さない。
6. 秘密非出力の追加試験で、counter文字列`"3"`を部分文字列として検索し、hash内の数字に一致する誤判定が1件あった。出力と比較条件を照合し、JSON文字列値の完全な表現を検査するようfixtureを訂正した。秘密検査を取り除かず、対象ID・5列の値・URL・global fetch非使用を再確認した。

製品・試験の期限、C/G・response上限、retry回数は緩めていない。

## 3. 観測と独立oracle

| 観点 | 結果 |
|---|---|
| 初回／final | snapshot受理1回、比較確定1回。通常成功でC=2、parent予約0／done、metadata予約2／idle、保持record0 |
| 差分15組合せ | state／application／更新日時／counterの非空全maskを試験側で生成し、固定順の期待field名を照合。changed_during_reviewを保持し追加GETなし |
| 意味とbytes | key順・整形・digestが異なっても5列一致ならstable。対象ID違いはinvalid_responseでchanged扱いにしない |
| final retry | CD-04の429／5xx後は同baseline1のまま同URL／auth／slot・ordinal2へ。成功後保持0。C=3、残予約2、課金は巻き戻さない |
| ordinary close | primaryなし・baseline1を維持し、同final予約を使用。終端stopと区別 |
| snapshot未受理 | transport success後discardではfinalを拒否。skipはinitial_unavailableで予約を返す |
| 時計 | 55秒のfinal phase期限・parse中の保持attempt期限・比較post-guard・async acknowledgement期限を検査。新しい期限を作らない |
| 同期停止 | cancel／close／final401・403／schema不正／retry上限でraw record0。先行primaryを保持 |
| cleanup | final native cancel未完了はunconfirmed。遅い完了でも診断・観測を修復せず、次のreadを許可しない |
| one-shot／混入 | final先行・二重final・外国request、ackの二重消費・外国attemptを拒否。外国ownerは不変 |
| 非露出 | 5列の値・対象ID・URL・認証を結果／診断へ追加しない。global fetch呼出し0 |

oracleは試験側の固定row・変更maskとfield順、dispatch一覧、独立した期待C／予約数・終端状態から構成し、製品比較器で期待値を生成していない。HTTP／cleanup試験は注入したnative Response／Web Streamsだけを使う。返却後のロック解放とfake timer残数0も確認している。

## 4. 最終検証

| 確認 | 結果 |
|---|---|
| 新規接続試験 | 40 tests成功 |
| 新規＋parent／body／ReadState／supervisor／CD-01〜04関連 | 10 files／411 tests成功 |
| 全体 `vitest run --maxWorkers=3` | 180 files／5,469 tests成功、32.30秒 |
| `npm run build` | 成功 |
| 変更した4実装module＋新規試験のESLint | 成功 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| 関連MDの相対参照先 | 4 files／76 links存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

全体合成テストは既存のローカル待受だけを許可して実行した。PDI・外部サービスへの通信はしていない。追加された入口は既存の`abort-scope-evidence*`梱包除外対象内に留まり、梱包smokeも同prefixの非同梱を確認した。

### コミット対象のみの再検証

2026-10-29、HEAD（50529f9）へ今回の10ファイルだけを重ねた一時snapshotで再実行した。無関係な`.vscode/`と`CLAUDE.md`は含めていない。build・変更4実装module／新規試験のESLint・全体180 files／5,469 tests（34.46秒）・offline package-worker smoke（377 files）が成功した。関連4文書の相対参照76件の存在と`git diff --check`も確認した。製品／試験の期限は変更していない。

## 5. 未接続・未証明

この結合は同じfake constructor／private closure内のtarget・ReadState・停止・時計・成功attempt・final slotによるもので、実sessionのAuthSnapshotIdentity／ReleasePermit／選択window／payload receipt／worker jobの正式証拠ではない。fixture auth contextを実認証へ昇格させていない。

stableは親5列だけの観測で、metadata・payload・レビュー結果を含むUpdate Set全体の整合性を認定しない。slotのdoneはtransport予約消費の履歴であり、単独で検証成功とはしない。ack後に停止した過去のstable履歴も現在の権限にはしない。本番sourceのchanged→provisional_resultsの方針は変更せず、閉鎖fakeのfail-closedとの違いを維持する。

追加projection／guard／ack claim・参照保持の全体work／heap上界への包含・本番capは未証明。論理record0を実heap消去・GC・OS終了保証と同一視しない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。実通信・実機操作・トークン発行・設定変更・Pushは行っていない。

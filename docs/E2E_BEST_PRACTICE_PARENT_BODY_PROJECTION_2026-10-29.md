# 親レコード：同body bytesのprivate projection・post-guard受理

Date: 2026-10-29 / Scope: fake BodyHooks・合成issuer限定。実transport・PDI接続なし。

設計：[draft-0.3 §12](BEST_PRACTICE_ABORT_SCOPE_PARENT_STABILITY_DESIGN.md#12-同body-bytesのprivate-projectionpost-guard受理fake依存限定)。
実装：[共有body coreと合成factory](../src/review/abort-scope-evidence-closed-body-candidate.ts)。
試験：[21ケース](../tests/review/parent-body-projection.test.ts)。

## 1. 実装

既存のprojectionなしfactoryと専用の合成factoryを同じbody内部coreへ分岐させた。正式ReadState／CD-03／04の生成は従来factoryのままで、実接続や正式発行口を開いていない。

appendでコピー・課金した同attemptのbytesを結合し、一度だけJSON.parseする。その固定parent分岐でstrict5列を検査し、内部生成したissuerへprivate draftを渡す。hashは同bytes、受信課金は既存hookで、projectionに伴う二重GET・二重JSON解析・chunk再課金はない。raw recordを公開結果やcaller callbackへ渡さない。

bodyの最終checkpointとguard全体のpost-checkを通過してから、初回snapshotを受理する。issuerの受理前後も同checkpointへ戻る。本文guard後に取消・期限切れになった場合も受理しない。最終観測はprivate comparison_pendingまで進み、両recordを破棄する。stable／changedの確定は未接続である。

失敗時はbody bytes・draft・baselineを破棄し合成issuerを閉じる。外側の元のprimaryを返し、issuerの局所closed理由で上書きしない。診断には固定状態・論理計数だけを追加し、5列の値・対象ID・URL・認証を返さない。

## 2. 試験と独立期待値

| 観点 | 確認 |
|---|---|
| 同bytes | 2chunkでコピー後、元bufferを0で上書き。返却digestを試験側createHashの独立値、課金を送信byte数で照合 |
| 一度の解析 | consume期間のJSON.parse呼出し1回。schema検査やprimitive再検査はJSON再解析ではない |
| 初回受理 | body post-guard中はdraft1／snapshot0、終了後だけsnapshot1 |
| 最終観測 | state変更を含むfinalでcomparison_pending、5比較、保持record0、committed0、公開changed_fields空 |
| body post-guard | 初回／最終の取消・期限切れ。snapshot未受理または比較未準備、bytes／draft／baselineを破棄 |
| 受理post-guard | 同checkpointの最後の観測で取消・期限切れ。snapshot0を維持し原理由を返す |
| 入力 | 余剰列・対象ID違い・欠落列・counter型違い・配列result・余剰envelopeを拒否 |
| decode | 不正UTF-8／JSONを一度consumeし、例外本文や秘密を出さない |
| 混入／順序 | 外国／コピーcandidate、replay、final先行、caller target上書きを拒否。外国laneは不変 |
| cleanup／解放 | closed未確認ではsnapshotなし。revokeで初回baseline参照を破棄 |
| retry | 未完のfragmentは破棄し、次attemptと合成しない。受信bytesはretry分を含め累積 |

独立期待値は試験側の元byte snapshot・固定schema違反fixture・期待する状態と操作数から構成する。製品parser／比較器の結果をoracleに流用しない。

## 3. 途中の失敗と切り分け

- 最初のbuildは、狭いClosedAccountingCodeへsession全体のdeadline_exceeded等を渡そうとしたため型検査で停止した。境界を確認し、既存会計stop契約を拡張せず、合成factory専用stopProjectionと元のcheckpoint失敗理由の保持へ分離した。その後build成功。
- retry試験の追加時、fixtureがBodyLaneのstartだけを呼び、fake chunk hook側の同attempt登録を更新していなかったため、evidence_binding_mismatchで1件失敗した。fixtureに共通start helperを設け、bodyとfake会計が同じattemptを参照するよう修正。製品のbinding検査は弱めていない。新規21ケースと関連試験、全体試験を再実行した。
- 製品／試験の期限・上限は緩めていない。

## 4. 最終検証

| 確認 | 結果 |
|---|---|
| 新規＋既存parentモデル＋body candidate | 3 files／136 tests成功（新規21件を含む） |
| 全体 `vitest run --maxWorkers=3` | 179 files／5,429 tests成功、31.17秒 |
| `npm run build` | 成功 |
| 変更した実装／新規試験のESLint | 成功 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| 関連MDの相対参照先 | 4 files／71 links存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

全体試験の既存ローカル合成待受だけを許可した。PDI・外部サービスへの通信はしていない。新factoryと合成issuerは既存のabort-scope-evidence梱包除外に入り、package smokeでも当該prefixの非同梱を確認した。

## 5. 限界・次段階

fake hookは実C/G/E/R台帳・実session・ReleasePermitの証拠ではなく、cleanup observationも合成fixtureである。同bytes由来のprivate draftとpost-guard受理までを確認したもので、実HTTP readerのclosed／releaseLockや実認証snapshotを証明していない。

CD-03／04の固定初回／最終slot、同ownerの同期停止、最終changedの写像、metadata／payload／workerと上位JSONへの統合は未接続。接続時の確定事項として、未到達の`changed_during_review→invalid_state`写像の是正と、ReadStateのordinary close（`refuse`）を合成issuerの終端停止と区別する写像を[設計§12.3](BEST_PRACTICE_ABORT_SCOPE_PARENT_STABILITY_DESIGN.md#123-費目と未接続範囲)に記録した。合成issuerの時計検査は外側checkpointへ従属するが、実sessionへの新しいclaim／leaseを発行していない。

追加schema検査・primitiveコピー・guard・比較・参照破棄の費用を、既存の全体work／heap予算へ包含済みとは認定しない。論理record保持数は実heap量・GC／秘密消去の保証ではない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。実通信・実機操作・設定変更・Pushは行っていない。

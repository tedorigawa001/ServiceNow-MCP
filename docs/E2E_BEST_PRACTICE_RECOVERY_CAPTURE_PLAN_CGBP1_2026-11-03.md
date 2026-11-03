# CG-BP1 accepted／plan・同receipt capture結合 検証記録

Date: 2026-11-03 / 基準HEAD: `1e1e78d`。

## 1 範囲

[内容gate設計draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)§13の、別constructorから既存合成kernelへの結合を実装した。旧root・旧accepted／sealの後付け昇格は行わない。公開JSON、ServiceNow取得処理、runtime workerは変更していない。

- `createSyntheticCapturedRecoveryRoot`の同じ生成継続でfinish pinsとCG-B ownerを作る。新rootは旧structure-only sealを公開せず、別brandのcontent sealだけを公開する。
- 合成イベント列は最大100件のown-data。pure context projectionの後、同じprivate receipt object／accepted_outcome・固定順・ID・T_i・retrieved_at・元expected_contextに照合する。本文はresponse文字列からのみ受理し、descriptorから補完しない。
- 新sealの開始claimを先に消費し、既存kernelの同accepted／plan検査と2 guard、CG-Bの一度限りmanifest移譲と2 guardを完了した後だけ、新しい空handleを返す。
- 途中失敗・hard・source／cleanup開始・close・固定discardで両方の期待値／captureを失効させる。正常解放ではacceptedのterminal-only責務を残し、元のsource終了・worker cleanup証拠とaccepted discardを必要とする。
- 旧rootのsurface／diagnostic、元時刻・C/G/P prefix・世代数を維持する。新診断は固定scalarだけで、本文・receipt参照・target hashを含めない。

## 2 RED／GREEN・初回失敗

新constructorの未存在をREDで確認して正常seal→source／worker解放→accepted discard→closeを実装した。その後、CG-B transfer guardの取消が一般エラーへ置き換わるケースと、既存receive budget停止が同じく失われるケースをそれぞれRED→GREENで修正した。共通check由来の固定停止理由をkernelへ渡し、既存の先行hardを優先する。準備の非実行discardでcaptureがpreparedのまま残るケースもRED→GREENで即時参照解放へ接続した。

拡張試験の初回は40件成功・3件失敗。2件はhard後にcleanup開始を省いて終了を記録していた試験手順の誤りで、既存のbegin→record順へ合わせた。もう1件は0.3 header limitationsへのpushが、fixtureで共有されていたasset contextのlimitationsまで変更していたため、header側へ別配列を割り当てた。製品の期限・停止条件・検証契約は緩めていない。

2件のreviewed fixture追加後のstrict型検査で、completed inputのexpected_contextがnullable unionのままになっているエラーを検出した。fixtureの前提を明示的に検査してからcopyする形へ直し、製品型をcastで回避していない。

## 3 最終検証

| 検証 | 結果 |
| --- | --- |
| 新規capture binding | 46件成功 |
| CG-BP1／CG-B／RD-B04／CG-A／RD-B03関連 | 5ファイル・439件成功 |
| 全体合成回帰 | 261ファイル・12,644件成功、失敗0・pending 0。最終参照解放／fixture型明示後も同数成功 |
| build | 成功 |
| 新試験と旧seal試験のstrict TypeScript単独検査 | 成功 |
| 変更TS・梱包試験のESLint | 問題なし |
| 梱包 | 441ファイル。新constructor・content seal・scope／brand・pure context projectionは非同梱。固定import監査とseeded runtime／I/O／clock／worker／漏出の負の対照成功 |

旧root・旧accepted・copy・別owner・別plan／handoff／summaryの混入拒否、4 guard各点の取消／再入、constructor停止、固定2 receiptの順序と逆順拒否、二重seal、同期失効、遅延cleanupの診断保持、0.2／0.3、旧会計／世代不変を確認した。source／cleanup開始後もacceptedの終端責務を保持し、元の固定discard／closeまで検査した。全体回帰は既存localhost合成試験だけを許可し、外部サービスへ接続していない。

## 4 未保証・残課題

今回の発行元は合成イベントであり、実session／実IPC／実worker由来の証拠ではない。新rootは少なくとも1件のreviewed captureと、既存recovery条件に必要な未処理inputを持つ範囲を扱う。元omitted等の受領物は未対応として拒否し、本文を捏造しない。

追加費目はcontext projection／再projection・正規化copy、最大100件のreceipt linksと照合、analyze受理の各2 guard、sealの4 guard、索引／handleと同期解放。本文graphの再cloneや元会計の更新はしないが、これを総work／heap受付済みとは呼ばない。

次はAcceptedNonReviewed／親省略証拠・合法omission、finish jobと同新frameの通信相関、full集約／元本文比較と候補終端が残る。content_gateはfalse、authorityはnone。旧handleのUnknownも維持する。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Push・本作業のコミットは行っていない。

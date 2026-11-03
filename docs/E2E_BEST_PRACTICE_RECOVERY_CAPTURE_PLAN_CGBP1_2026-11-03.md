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

## 4 レビュー修正（2026-11-03）

§3の46件・12,644件は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包441ファイル、全体合成261ファイル／12,644件成功・失敗0を再確認した。

- 実装：applicable ruleを元pinと照合していなかった。contextと本文の両方を要求rule（`AU-BR-001`）と異なるapplicable rule（`AU-BR-002`）にすると、rootが構築されcaptureされた。workerは常にapplicable＝requestedを送り、集約schemaとRD-B03もこれを要求するため、finishで後段失敗する値である。receipt照合へ`applicable_rule_ids`と元`requested_rule_ids`の完全一致を追加し、[内容gate設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_CONTENT_GATE_DESIGN.md)をdraft-0.6へ改版した。
- 試験：constructorの失敗試験はcontextだけを変えていたため、CG-Bのcontext／本文照合が先に拒否し、private pinとの照合はどれも唯一の検出点になっていなかった。本文とcontextを一緒に変えてpinとだけ食い違わせると、reviewed_at、target.retrieved_at、record_updated_at、Update Set、release、ID（input／outcomeの両判定）、件数の各判定が唯一の防御だった。件数判定を外すと、not_processed inputへの余分なイベントがreceiptに結ばれないcaptureとして保持される。整合したイベントの正常対照1件、各pin不一致7件、余分イベント1件を追加した。
- 試験：非実行summary終端の後、kernelは`consumed`で`failed`／`closed`ではないため、summary経路の失効を外すとcaptureが`prepared`のまま残った。同期失効1件を追加した。constructor中の既存予算停止を保持する1件も追加した（引継ぎを外すと`internal_review_error`へ変わる）。

上記の各変異は追加した試験だけを失敗させた。input completed判定、input／outcome ID判定の片方、`used`、`ownPlan`／`ownAccepted`、seal時のreceipt再照合、constructor／invokeのRecoveryCaptureError分岐は、pinsの不変条件・前段の拒否・先に設定される`captureStop`と重なる等価変異として扱う。要求rule判定も、整合する本文ではapplicable＝requestedが必要なため今回のapplicable照合とschemaが先に拒否し、等価変異として扱う。世代・未束縛plan・束縛plan・accepted contextの固定discardは、probeした呼出し点ではいずれもkernel側で失敗し、失効は失敗経路で起きる。新規capture binding試験は57件。修正後も全体合成261ファイル／12,655件成功・失敗0。

[RDB設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_VALUES_RDB_DESIGN.md)の後続節は改版のたびに古いdraft表記が残っていたため、RD-C／内容gateへのリンクから版数表記を外し、実装状態は内容gate設計のStatusを参照する形にした（リンク表記のみで版数は変更しない）。

## 5 未保証・残課題

今回の発行元は合成イベントであり、実session／実IPC／実worker由来の証拠ではない。新rootは少なくとも1件のreviewed captureと、既存recovery条件に必要な未処理inputを持つ範囲を扱う。元omitted等の受領物は未対応として拒否し、本文を捏造しない。

追加費目はcontext projection／再projection・正規化copy、最大100件のreceipt linksと照合、analyze受理の各2 guard、sealの4 guard、索引／handleと同期解放。本文graphの再cloneや元会計の更新はしないが、これを総work／heap受付済みとは呼ばない。

次はAcceptedNonReviewed／親省略証拠・合法omission、finish jobと同新frameの通信相関、full集約／元本文比較と候補終端が残る。content_gateはfalse、authorityはnone。旧handleのUnknownも維持する。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Push・本作業のコミットは行っていない。

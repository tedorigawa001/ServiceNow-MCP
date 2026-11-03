# NB-02 同pins kernel・CompletedMixedContent・BoundAdoption 合成検証

Date: 2026-11-03 / 基準HEAD: `7141221`。実PDI E2Eではない。
対象: [接続設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)、[共通core](../tests/support/review/synthetic-recovery-kernel.ts)、[新試験](../tests/review/synthetic-normal-adoption.test.ts)、[梱包監査](../tests/review/package-http-classification.mjs)。

## 1 範囲

NB-01の同private coreを使う別fresh合成rootを追加。同pinsのseed refs／元receipt／windowをkernel準備へそのまま渡し、全行完了後のpost guardでCompletedMixedContentを確定する。同kernelの旧終了・固定no-verify・新ready・plan／handoff・context発行／accepted受理を通し、private viewとpost guard再検査からBoundAdoptionを一度だけ保持する。外部pins／accepted／plan等の採用・summary昇格口はない。

plan封印は既存の非実行準備段階であり、finish expectation／移譲先seal・本文比較・finish job／候補の成功ではない。新facadeにこれらの操作を公開せず、finish seal件数0を検査する。実verify／worker／transport・clock・本番sessionは使わない。元C/G/P・開始UTC／全deadlineは変更しない。

開始時に作業中ファイルはなく、前回の2テスト変更はHEADの`7141221`へ既に保存されていた。そのunknown stop試験と非同梱markerを維持し、監査markerを追加した。

## 2 RED／初回失敗と修正

1. 最初の採用成功1試験はfactory未実装でRED。実装後、新旧normal 2ファイル48件成功。
2. source／cleanup失効の2試験がRED。外側busy区間でbase公開失効入口を再度呼んだため再入拒否となっていた。同保護区間の固定失効処理へ直し、kernel側pins／期待値もprivateに失効。新旧2ファイル50件成功。併せて厳密型検査で未使用stageを検出し、固定失敗stageの選択へ使用した。
3. reentry拡張時34件中1件がRED。kernel生成後discardのstate拒否がbusy判定より先だったため、swallowed再入理由がstateになった。先に共通live検査を通し、再入の先行診断を保持した。検査の拒否自体はどちらでも成立していた。
4. 最初の梱包監査はローカル変数名`window`を禁止参照名として検出。ブラウザglobalの利用ではないが監査規則を緩めず、変数だけ`pinnedWindow`へ変更して再実行成功。member propertyのwindowと参照一致検査は維持。

## 3 受入

| 条件 | 結果 |
| --- | --- |
| 同origin | pins生成1回、正常bindingと完了内容が同pins、private accepted slot／元plan／handoff、window一致 |
| 一度限り | kernel開始・採用を重複拒否し、停止後の再利用なし。completion／adoptionはpost guard前に公開しない |
| 混入 | 正しい待機状態で別rootのstart／ready値を拒否。同cleanup sink・外部root／DATAのaccepted／pins等も拒否し、他rootは不変 |
| 順序 | 準備前／終了証拠前／ready前を拒否。7種類のsoft観測点で固定no-verifyの同予算prefixを保持 |
| 行対応 | reviewed・親省略の元reviewed・worker omitted・全retained／reviewedゼロ、1／100行・0.3選択を保持 |
| 停止 | content／adoption pre/postの取消・期限・throw・unknown・swallowed再入、成功経路の全kernel checkpointで取消を検査 |
| 失効・責務 | source close／同cleanup開始で内容／ticketを失効。解放成功は補完せず、normal discardを拒否して先行診断とcleanup責務を保持 |
| 非出力 | 診断に本文・行ID・findings・opaque receipt／accepted-outcome・raw例外なし |
| 閉鎖境界 | 内容比較・移譲／finish sealなし、実接続・正式発行口・全体受付は無効。旧NB-01／FB等のAPIを維持 |

## 4 検証結果

最終再実行はいずれも成功。期限・上限は変更していない。

- 新NB-02試験: **41件成功**。
- `bdo npx vitest run tests/review/synthetic*.test.ts`: **39ファイル3,281件成功**（全リポジトリ全件ではない）。
- `bdo npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --skipLibCheck --target es2022 --module esnext --moduleResolution bundler tests/review/synthetic-normal-adoption.test.ts tests/review/synthetic-normal-owned-supply.test.ts`: helperを含む厳密型検査に成功。
- `bdo npx eslint tests/support/review/synthetic-recovery-kernel.ts tests/review/synthetic-normal-adoption.test.ts tests/review/package-http-classification.mjs`: エラー・警告とも0。
- `bdo npm run build`: 成功。製品srcのビルドであり、上記のhelper型検査と区別する。
- offline `package-http-classification.mjs`: **441 files成功**。NB-02のfactory／内部型markerを加え、実行コード・宣言・mapへの漏出を検査。固定import／runtime・I/O・clock・worker禁止とseeded負の対照、compiled fixture群も成功。
- offline `package-worker.mjs`: **441 files成功**。製品依存だけのinstall・compiled worker／MCP smoke・fixture境界を確認。

追加費目・全work／heap・copyピーク・中断粒度は未導出。未確認のtransport終端・実worker exit・予算leaseを確認済みにしない。PendingBoundTransfer／PayloadClearedReceipt・同上位custody移譲／固定最終discard・正常終了はNB-03以降へ残す。実通信・実機操作・設定変更・Pushは行わない。

## 5 レビュー修正（2026-11-03）

修正前の新規41件は記録として残す。本記録は全リポジトリの合成テストを実行していなかったため、レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査、全体合成274ファイル／13,460件成功・失敗0を確認した。

- 実装：kernel生成後にroot自身が検出した失敗が、custodyで全てstage=`internal`と記録されていた。root `fail()`が`kernel.revoke`を先に呼び、revoke経由のkernel失敗通知が`revoke`→`internal`の写像で先にslotを占有していたためで、操作ごとの`failureStage`は無効になっていた（外しても結果が変わらなかった）。rootの失敗はrevoke前に同rootのstageで占有するよう修正し、[OB-02設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)をdraft-0.5へ改版した。closureのkernel checkpointでの取消が`cleanup`、adoption preでの取消が`transfer`になること、kernel自身が検出した失敗（generation_startへの別ticket）は従来どおりkernel phase由来の`prepare`のままで通知1回であることを検査する3件を追加した。
- 試験：`startKernel`の余分な引数の拒否、startKernel不一致より`content_post`停止を優先、adopt不一致より`adoption_post`停止を優先の3判定は、いずれも唯一の防御なのに未検証だった（判定を外すと成功、または`binding`へ置換された）。3つをまとめて検査する1件を追加した。

修正の取消・操作stage写像の除去・kernel phase写像の変更・上記3判定の除去の各変異は、それぞれ追加した試験だけを失敗させた。採用readのowner／window／bound・post後の再読込比較・`current()`の整合（root自身の値への内部検査）、二重startKernel／adopt（他の判定が先に停止）、kernel payload失効（inspectに現れず、kernelの`beginSourceClose`も`invalidateFinish`を呼ぶ）は等価変異として扱う。新規試験は45件。修正後も全体合成274ファイル／13,464件成功・失敗0。

## 6 コミット候補だけの再検証

対象8ファイルだけをindexへ登録し、`git checkout-index`でHEAD＋その変更の一時コピーを生成した。既存node_modulesを参照し、distをそのコピー内で新規ビルド。製品ビルド、合成recovery **39ファイル3,281件**、NB-01／02とhelperのstrict／noUnused型検査、変更箇所ESLint、offlineの梱包監査・製品依存限定スモーク（ともに**441 files**）がすべて成功した。元作業ツリーの未登録変更には依存せず、期限緩和・実通信・設定変更・Pushは行っていない。

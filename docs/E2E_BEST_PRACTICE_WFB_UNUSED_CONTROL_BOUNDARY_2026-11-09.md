# WF-B：unused control・停止継続・明示payload関係検査の合成検証

Date: 2026-11-09 / 基準HEAD: `c91c7d7` / 対象：[停止・所有境界設計draft-0.3 §11](BEST_PRACTICE_WFB_TRANSFER_TAKING_BOUNDARY_DESIGN.md)。

Status: 第1段階の合成依存だけ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。claim消費・detach・holder公開・C実行・実source／期待値pin・S発行・core／実接続・実通信・設定変更・Pushは行っていない。

## 実装境界

composition内の新診断factory `createSupplyBoundaryFake`と薄い入口`supply-boundary-fake.ts`を追加。private anchor／payload wrapper、別brandの未消費claim、同sourceと新ownerで共有するSupplyUseControlを生成する。controlはunused／stoppedだけで、consume／taking／resetはない。旧4factory・旧5薄い入口のexport・facadeを維持し、compositionのexport集合だけ5factoryへ増える。

元sourceはcontrolを一度だけbindする。check／begin／prepare／prepareSupply／capture／従来matchesと、新ownerのnormal gateが同controlを確認する。元rootがopenのままcontrolだけ停止する固定対照で、rootのcloseに依存せずsource側も拒否することを確認した。元ownerにcontrolをbindしない旧経路は従来の挙動を維持する。

別のprivate `boundaryStop`は同sourceへbindした正規controlだけを受け、control停止と同rootのclose／既存lifecycle理由写像だけを実施する。供給準備ownerのclose／fail／clear／finishは呼ばない。失敗時にも元registry／table／view・発行参照・borrow／Snapshotは保持中、discardPasses／supply_references_cleared／borrow退役／Snapshot退役は増えない。同値copy混入の拒否時も、停止は発行時にpinした正規controlから行う。

private helperはanchor＋明示payloadの関係だけを検査し、元field・live context・Borrow.matches・clockを読まない。停止後も関係照合可能だが、normal gateは拒否する。診断のokは通常利用権・post受理・下位claim消費ではない。関係診断は不変入力で一度だけ計算し、反復してもrelationChecks≤1。原順序とfile／source／binding／declarationの参照対応を維持し、actual長=宣言長は追加していない。

## テストと独立対照

新規47件。正常、close／failure後の参照保持、controlだけの停止、sourceの停止後begin／prepare／prepareSupply拒否、control copy・重複bind・二重prepare、8種の上位identity差、短いactualの受付、22種の局所値不正と有効基点、first順序、hook非実行、非公開facade・秘密非出力を含む。

局所値対照は固定`value_*` scriptだけで、別の合成anchor／payload組を構築し、狙う条件以外を整合する。これらは元source／control／正規発行slotへ採用せず、valueOnlyProbe=trueとauthority=noneを保持する。有効な再構築値がhelperを通っても、正規の発行物参照一致や実証拠へ昇格させない。source側の生成計数は元4record／1table／1viewのままだが、値対照の追加確保を実heap／workへ計上したという意味ではない。

checkNormal／checkRelation／close／failの全3操作列（4³=64通り）を別記述の停止oracleで照合した。停止の有無から通常利用可否を算出し、関係検査は停止と独立、下位claim消費・sourceDetach・holder公開・discard・open／read／hash／resource cleanupは全0、borrowは保持中であることを確認する。本体のgate式や係数を期待値としてimportしない。

compiled ESMの新しい負対照は経路／停止／上位identity14種と局所関係19種、計33種。close／failureで元clearを呼ぶ、live-context依存を関係検査へ戻す、copy側へ停止を送る、sourceの同control gateを外す等を検出した。envelope／table／declarationsのcopyには複数のalias条件が働くため、それぞれ条件群を除去して検出する。局所19種は単一条件除去と固定不正値の組で、関係検査が誤って通ることを確認した。

件数不正3種の拒否はunit試験で確認するが、最大32file／rows12の全境界走査、bind前提の未到達条件全部の単独変異、実確保費は今回の保証に含めない。detach後に実slotを空にする試験もまだ行わない。現在の関係helperが元fieldを読まないことと、将来のdetach全体が安全であることは別である。

## RED／GREEN記録

1. 最初の1件は新しい薄い入口moduleが未作成のため失敗。最小の正常経路を追加して成功した。
2. control copy拒否の追加試験は、localではbinding_mismatchでもsourceNormalAllowed=true・root.lifecycleFirst=noneで失敗。候補copyを停止継続へ渡しておりsourceの同一性検査で止まっていたことが原因。発行時の正規controlを別private slotへpinして停止を依頼し、再実行で成功した。
3. 準備後close→後着failureの追加試験は、上位reasonがbinding_mismatchへ変わり失敗。closeが上位firstへ記録されていないことが原因。開始後closeを先行firstとして保持し、開始前closeはstopだけに分け、47件すべて成功した。

旧試験の削除・既存期限の延長・Bのcap／D_stop900／D_end1000／guard131,524の変更は行っていない。

## 最終検証

| 項目 | 結果 |
|---|---|
| 新入口unit | 47件成功 |
| 関連回帰 | 23ファイル・1,512件成功（旧preflight57件を含む） |
| build | npm run build成功 |
| strict型検査 | 変更TS fixture／testのnoEmit・noUnused成功 |
| lint | 変更TS／MJSのESLint成功 |
| compiled保証 | sourceGrid75、B変異8・供給6・preflight24＋退役7を維持、新境界14＋局所19を全検出、薄い入口6 |
| 梱包 | offline dry-run441ファイル、既存compiled対照と新factory／fixtureのseeded漏洩負対照成功 |

```sh
bdo npx vitest run tests/review/supply-boundary.test.ts tests/review/canonical-supply-transfer.test.ts tests/review/canonical-supply-view.test.ts tests/review/snapshot-read-composition.test.ts tests/review/read-hash-declared-actual.test.ts tests/review/read-hash-kernel-extraction.test.ts tests/review/snapshot-read-start.test.ts tests/review/read-hash-capacity.test.ts tests/review/read-hash-fake.test.ts tests/review/read-ops-fake.test.ts tests/review/source-map-supply.test.ts tests/review/source-map-values.test.ts tests/review/carrier-coverage.test.ts tests/review/seed-bootstrap.test.ts tests/review/bridge-work.test.ts tests/review/value-admission.test.ts tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts tests/review/raw-json-boundary.test.ts tests/review/raw-json-syntax.test.ts tests/review/store-recorder-persistence.test.ts tests/review/store-recorder-binding.test.ts tests/review/fixed-evidence-store.test.ts
bdo npm run build
bdo node tests/review/fixtures/compiled-declared-actual.mjs
bdo node tests/review/package-http-classification.mjs
```

全repository回帰ではなく、上記23ファイルの関連回帰である。梱包検査は実sourceの内容hash照合ではない。

## 未実装・保持責務

新入口にfinish／回収機能はまだない。retirement=not_started、retainedAnchor／retainedPayload=true、元borrow／Snapshot保持を報告し、clear・cleanup成功・退役確認へ補完しない。参照保持の寿命はこの合成construction内であり、GCや物理ゼロ化は証拠にしない。

次はpending／failureのprivate active slot・固定回収／未確認保持・finish gateと有限schedule。その安全性確認までclaim消費・pending記録・normal slot集約／detachを接続しない。root finish→retireFailedによる失敗Snapshot退役とdiscard計数分離は設計だけのまま。全work／heap・実E／S・OOM時の診断必着はUnknownである。

## コミット対象だけでの再検証（2026-11-09）

今回の11ファイルを明示してstageし、indexだけを一時ディレクトリへ展開した。既存node_modulesを参照し、作業treeの未stage内容を含めず、上記の関連23ファイル・1,512件、build、変更TSのstrict noEmit／noUnused、変更TS／MJSのESLint、compiled-declared-actual、offline梱包確認を再実行してすべて成功した。compiledは旧8＋6＋24＋7と新14＋19、梱包441ファイル、文書のローカルリンク31件も確認した。検証後の追加は本段落の記録だけとし、それ以外のstage内容が検証済みの展開内容と一致することを再照合した。全体回帰・claim消費・実通信等は追加せず、Pushは行わない。

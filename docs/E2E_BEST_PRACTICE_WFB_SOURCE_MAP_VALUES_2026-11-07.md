# WF-B 固定source辞書／SourceMapDraft：純粋値検査の合成記録

Date: 2026-11-07 / 実装基準HEAD: `c3b3b03` / [設計契約§9](BEST_PRACTICE_WFB_FIXED_SOURCE_COVERAGE_DESIGN.md#9-strict内部型純粋検査の実装境界)。

## 実装範囲

新規`tests/review/fixtures/source-map-values-core.ts`に、strict内部型、辞書・SourceMapDraftの純粋検査を実装した。実ファイル辞書や承認済みhashを供給するmoduleではない。試験は存在を要求しない`synthetic/*`のpathと模擬hashを使い、実source hashを採取／pin／計算／照合しない。

- 辞書32件・path256文字・各file1MiB／総和8MiB、SC12行・行あたり32 binding／32 missing・bindingあたり8 test参照の表現上界。
- 複数source・test／oracleのroleと存在参照、順序、重複、同じ費目の複数所有を検査。
- unimplemented／partial_referenceではmissingを保持し、mapped_unverifiedも実装証明にしない。reference_onlyだけで完成を主張した行や空bindingの完成を拒否。
- strict DATA入力・hook非実行、nested出力の切離し／freeze、固定失敗分類と秘密非出力。
- CHANGELOG・設計契約・親設計の参照を更新。既存carrier・coverage値、K0/E fake・旧bridge model・raw parserは変更しない。

## RED／GREEN・初回失敗

辞書の最初の試験はmodule未作成で失敗し、実装後1件成功。複数file／未実装行の試験はSourceMapDraft検査未実装で1失敗／1成功となり、接続後2件成功。stepだけ変えた重複referenceの試験は23成功／1失敗のREDを確認し、行内の同file／symbol／site／role重複を拒否して24件成功した。

初回strict TypeScript検査で、prefixesのgeneric推論が`string[]`へ広がり、`readonly Prefix[]`と不一致の型エラー1件が出た。値の選択肢は既に有限だったため、呼出し元で`choice<Prefix>`と型引数を明示した。型検査を再実行して成功。runtime制限・期限は変更していない。

## 最終検証

| 検証 | 結果 |
|---|---|
| 新規source-map-valuesの合成試験 | 52件成功 |
| 関連12ファイルの合成回帰 | 1,142件成功、失敗0 |
| `npm run build` | 成功 |
| 新規試験を入口とするstrict TypeScript検査 | 成功 |
| 新規試験／fixtureのESLint | エラー・警告なし |
| `npm pack --dry-run --ignore-scripts` | 441ファイル。tests／docs／新module・carrier・K0/E fakeの混入0 |

関連対象はsource-map-values／carrier-coverage／seed-bootstrap／bridge-work／value-admission／value-core-detailed／snapshot-value／raw-json-boundary／raw-json-syntax／store-recorder-persistence／store-recorder-binding／fixed-evidence-storeの`tests/review/*.test.ts`。全repository回帰は今回実施していない。

独立対照として、実装からimportしないSC01〜12一覧、24組のstatus truth table、30組のBigInt容量／件数oracleを使用した。これは値・局所関係のoracleで、実sourceの意味・実費用・全prefixイベントの独立証明ではない。梱包は一時cacheを使うdry-runで、生成script・公開・設定変更を行っていない。

## 未確認と閉鎖境界

hashはnot_checked、mappingはshape_only、implementation・runtimeCoverage・nativeCost・実E／S要求量はunknown、readyはfalse、authorityはnoneに固定する。mapperの返値と既存coverageのsourceRevisionを照合する接続もない。既存5 gapsは全項目必須のまま。

実sourceの意味対応・hash・安全読取、未列挙fileの網羅性、owner／費目の真偽、固定schedule／pool供給、native費・OOM／heap／CPU／GC・物理解放は未対応。排他的経路に複数implementation ownerを割り当てる表現は初版では受理しない。S pending／handoff・S発行・core接続・実接続・実通信・実機操作・設定変更・Pushは行っていない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。今回の変更は未コミット。

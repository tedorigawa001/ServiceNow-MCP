# BP-5 R-2 OL-03 MA-02A：固定recipe/coverage合成検証記録

Date: 2026-10-24 / Source baseline: `433fe96` / Scope: offline合成のみ。実layout認証・実機E2E未実施

## 1. 範囲とauthority境界

[MA-02詳細設計draft-0.2 §9](BEST_PRACTICE_BP5_R2_OL03_MA02_MODULE_PROJECTION_DESIGN.md)に従い、[private recipe検査器](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/management/recipes.rs)と[合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources/management/recipes/tests.rs)を追加した。

runtimeのLayoutKnowledgeはUnmodeledのみ。固定recipeが一致してもsource/build/allocatorの証拠ではない。実receipt/budget/profileへのprojection・保護claimはMA-02Bに残し、今回はModuleRecipeReviewにCatalog借用と不足項目だけを保持する。実4軸/ApprovedCaps/完成parts/ResourceInput/Quotas/cleanup証拠への変換口はない。

## 2. 独立literal oracleと拒否条件

production tableを呼び直して期待値にせず、以下をテスト側literalとして照合した。

| site | 内容 | phase/lifetime | allocation prefix |
|---|---|---|---|
| Counts | normal entries最大100000/u64、profile/collect.rs | B2 / BuildTemporary | 0〜1 |
| Keys | group1/nonce3、draft/slots.rs | B3 / UntilDraftDrop | 0〜4 |
| InlineMap | session-round32/local21、caps/allocation_view/cap_map.rs | B3 / WithDraft | 0〜0 |

実layoutは3件ともUnmodeled、不足項目はCountsLayout・KeysLayout・InlineParent・ControlOwners・ParserNested・Collector・Discard・WholeLifetimeの8件。inline heap数0を親領域coverageの確認済みにしない。完全性要求は必ずUnavailable。

- 各siteのsite/revision/source/storage/phase/lifetime/prefix最小/最大の8種類の改変と、3通りの入替えを拒否した。
- recipe mask欠落/余剰、実layout確認済みclaim、whole-management claim、旧model、不正件数0/1/2/4を拒否した。
- exact件数は走査前2 workで拒否、coverage claimは3 workで拒否する。必要work23に対する等号/1不足を確認し、不足なら入口3の後で走査を開始しない。

感度確認：固定Keysのprefix最大を4→3に一時変更したところ、literal oracleの期待(0,4)に対して(0,3)となり失敗（exit101）した。変異を復元して対象試験を再実行した。これは計画した変異試験で、未解決の不具合ではない。

## 3. 模擬layoutと実証拠を混ぜない試験

MockLayout/MockCheckとその検査関数はcfg(test) moduleの中だけ。架空payload8＋overhead24=32、架空Rc overhead24等のliteralで検査した。Rust標準libraryの実layout値ではない。

capacity/nested/owner模擬条件の欠落、Rc overhead0、総量0、非2冪/過大alignment、checked加算overflow、inline mapをheap layoutとして扱う試行を拒否する。MockCheckが成功してもruntime Catalogのlayout maskは0以外を受け付けず、実layout3件Unmodeled・不足8件・完全性拒否が変わらない。

結果とMockCheckは非Clone/Copy/serde、Debugは固定opaqueである。実証拠への共通constructor/enum variant/変換traitを追加していない。

## 4. 費用・停止・非接続

recipe検査は入口3＋各6 row×3＋coverage/publication2＝23 work。runtimeに汎用文字列parser・N件走査・layout bytes計算はない。固定descriptor配列/結果のサイズ上限をテストした。work以外のI/O/metadata/topology/共有retry・session/policy/bridge/Draft allocation claimを変更しない。

全23 work位置のLimit/Cancelled/Deadline、最初のHashMismatch等の保持、再検査でspentが増えないことを確認した。Limitの事前検査で一部の位置は同じ入口guardに止まる。通常strict/source/allocatorへ実接続しない。

純粋検査は再実行でき、別budgetで同じCatalogを検査してもよい。この成功はreceipt/budget/profile結合の証拠ではなく、その検査を実装済みと主張しない。MA-02B用のone-shot claimや双方停止を先取りしていない。

## 5. 実行結果

| 検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml recipes::tests` | 9 test functions成功、既存1009件filter。変異復元後に再実行 |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 全1018件成功、5 suites（既存1009＋新規9） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| 差分check・更新3文書の相対リンク/末尾空白 | 通過、15リンク |

全commandは指定の`bdo`を付けて実行した。意図的なprefix変異の失敗は§2に保持し、復元後の最終結果とは分ける。実allocator/実機やMA-02Bの検証結果は含めない。

## 6. 維持した停止状態・未対応

5項目Unknown・finalize発行不能・全体受付無効・telemetry保留、APPROVED_REGISTRY=None・通常v2 Unavailable/gate92・DER/absence停止を維持する。本番cap・完成parts・実機操作/token発行/設定変更/permit/Pushは行わない。

実n=0/1/上限の必要量、実layout/容量・全費目寿命上界、保護された同receipt/budget/profile projection/claim・MA-02B、compile-failによるその寿命検証、実allocator/実機性能は未対応。MA-02AのCatalog borrow検査だけをその代わりにしない。

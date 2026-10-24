# BP-5 R-2 OL-03 MA-02B：実型の寿命compile-fail検証

Date: 2026-10-24 / Source baseline: `6e64f5c` / Scope: offline型検査のみ。製品関数/実機操作は実行しない

## 1. 目的・実装変更の境界

[設計draft-0.4 §11](BEST_PRACTICE_BP5_R2_OL03_MA02_MODULE_PROJECTION_DESIGN.md)の、scope外projection持出しと借用中estimate移動を検査する。[integration harness](../native/r2-outer/tests/ma02b_lifetimes.rs)が実srcの一時コピーへfixtureを追加し、製品のprivate module内で実ManagementProjection/ScanWorkEstimateを型検査する。製品sourceの可視性/実装/claim/work/停止条件は変更していない。

模擬型・privateアクセスの失敗では代替しない。compiler JSONのcodeとfixture内primary span、および対応するpositive controlの成功を要求する。fixture関数は未呼出しでもbodyが型検査される形式で、with_round等の実runtime処理は走らない。

## 2. 正常/拒否ケース

| fixture | 結果の契約 |
|---|---|
| [scope_pass.rs](../native/r2-outer/tests/fixtures/ma02b_lifetimes/scope_pass.rs) | 実pipelineを同scope内で完結しコンパイル成功 |
| [scope_fail.rs](../native/r2-outer/tests/fixtures/ma02b_lifetimes/scope_fail.rs) | 外側Optionへprojectionを保存、E0521が必須。付随E0597/E0515以外は許容しない |
| [move_pass.rs](../native/r2-outer/tests/fixtures/ma02b_lifetimes/move_pass.rs) | projection消費後にestimateをmoveしコンパイル成功 |
| [move_fail.rs](../native/r2-outer/tests/fixtures/ma02b_lifetimes/move_fail.rs) | projectionを後で使うのにestimateを先にmove、E0505だけを許容 |

negativeは単にexit非0なら合格ではない。指定codeがfixture内primary span付きで存在し、すべてのerror codeが許容集合内であることを確認する。private/name解決・依存/コンパイラ不備・timeout・空診断は失敗とする。

## 3. 隔離・上限

Unix用test-only harness。専用0700 tmp dir、srcはsymlink拒否/深さ64/項目4096/合計16 MiB、manifest/lockは各64 KiB。固定4ケース、専用Cargo target-dir、offline/locked。compiler wrapper/追加flagsを除去し、製品sourceを直接書き換えない。

compileごとの90秒・stdout/stderr各8 MiB監視で、超過はkill/waitして試験失敗。unwind時のchild kill/waitとscope終端の一時dir削除はbest-effortの後始末であり、製品のcleanup証拠にしない。通常のcompiler/依存buildは実行するが、fixture自体の呼出し・OAuth/ネットワーク・PDI・OS backend/permitの操作はしない。ログは固定case名/成否/標準診断codeのみ。

## 4. 実行結果

観測compiler：`rustc 1.98.1 (48a229cea 2026-09-01)`。compilerごとの診断文全体/行番号をsnapshot固定せず、code/primary spanとpositive controlで判定する。

対象試験で観測した診断は次のとおり。補助codeの数はcompiler版に依存し得るためテストの契約へ固定しない。

| case | 観測結果 |
|---|---|
| scope_pass | success=true、error codeなし |
| scope_fail | success=false、E0521が5件、すべて許容した寿命code |
| move_pass | success=true、error codeなし |
| move_fail | success=false、E0505が1件 |

4 compileケースは1 integration test内で実行される。最終結果：

| 検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml --test ma02b_lifetimes` | 1 test成功（正常2/拒否2の4 compileケース） |
| 同targetの`-- --nocapture` | 上表の成否/codeを確認。`bdo proxy`でcompiler出力の有限summaryを取得 |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 最終1031件成功、6 suites（既存1030＋新規integration1） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| 固定4fixtureの`rustfmt --edition 2024 --check` | 成功。整形後に全体testを再実行 |
| git diff check・更新3文書の相対リンク/末尾空白 | 通過、22リンク |

すべて指定の`bdo`経由で実行した。製品側sourceに変更を加えず、試験harness/fixture・文書だけを追加/更新している。ここでのcompiler子processはローカルoffline型検査であり、製品の実機OS接続の試験ではない。

## 4.1 実行範囲・所要時間（レビュー後追記）

- **CIでは実行されない**：`.github/workflows/`のjobはNode系のbuild/test/coverageだけで、`cargo`/`native/r2-outer`を実行しない（2026-10-24時点で確認）。本harnessを含むRust testはローカル検証でのみ動く。寿命境界の回帰は、`native/r2-outer`の変更時に`cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`をローカルで実行して確認する。CIへのRust job追加は別途の判断事項で、本記録では行わない。
- **所要時間**：レビュー時の実測では本harness 1件が約8秒（4ケース、専用target-dirでの依存crate再check込み）、Rust全体は約58秒だった。1ケース90秒の上限には十分な余裕がある。上限超過は「期待した借用拒否」ではなくpanicとして失敗させるため、高負荷/cold cacheで時間切れになった場合は再実行して区別する。所要時間は補助情報で、上限値の根拠や性能保証ではない。

## 5. 保証範囲と残課題

実型を使う具体的な2寿命違反の回帰試験であり、全APIの寿命安全性・PC-04安定owner/Initial継続・実layout/全管理coverage・RSS/実OS停止の証明ではない。未来のcompilerで別の補助codeが出た場合、private失敗へ判定を緩めず原因確認する。

全5項目Unknown・全体受付無効・telemetry保留、APPROVED_REGISTRY=None・通常v2 Unavailable/gate92・DER/absence停止を維持する。本番cap投入/完成parts発行/通常strict差替え・実機/token/設定変更・permit/Pushは行わない。

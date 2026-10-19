# BP-5 R-2 OL-03：closure index parser・全集合照合の共有予算検証

Date: 2026-10-20 / Status: pure検証・合成observedのみ。実scan/revalidate/permitなし。

## 1. 範囲

[接続設計draft-0.5 §12](BEST_PRACTICE_BP5_R2_OL03_RECORD_PARSER_CLOSURE_DESIGN.md)に対応する。
共有予算JSON coreをclosure indexのstrict decode/hash-first/全宣言/全集合比較へ接続する。
telemetry調査は保留。実機/PDI操作・API実接続・token発行・設定変更・本番policy投入・実署名/permit発行は対象外。

## 2. 実装

- 新しいclosure::sharedのdeclared/checkはsize/件数guard→64KiB chunk raw hash→strict JSONの順。16MiB/depth16/container100,000を維持する。
- schema/header・path/mode/hash/native suffix・宣言順/case衝突/必要entry/親directory・全集合比較は旧public経路と同じ内部意味検査を使用する。
- expected/actualのaggregate比較を要素ごとの比較にし、各entry/parent prefix/集合要素に共通checkpoint/workを適用。index自身もexact path/mode/size/hashと出現1回を要求する。
- Declarationは宣言整合だけ、Comparisonは呼出側observedとのpure集合一致だけ。非Clone/非serialize・固定Debugで、実filesystem/identity/鮮度/authorityの証拠を生成しない。
- Json/Closure/Budgetの型付き理由を保持。意味検査後にも元checkpointを通し、SharedBudget bridgeはLimit/Changed/Binding/Deadline/Cancelledを既存first failureへラッチする。
- declare→check/次roundでも元start/json_workをresetしない。payload2GiB・予約・metadata/topology/EINTR等は変更しない。宣言総量2GiBと実I/O課金を区別する。
- 公開check/既存declaredのdecode-first失敗契約は維持する。未認証不正JSONに対する新shared経路のBindingと、旧public経路のInvalidは意図して区別する。公開関数自体のhash-first化は別の承認待ち候補。

## 3. 追加22テスト

| 群 | 確認したこと |
|---|---|
| pure17件 | 正常/順不同observedで旧countsと一致、宣言と観測の区別・固定Debug |
| hash/strict JSON | 新sharedのhash-first、pin済み不正JSONと旧失敗順序、未知/欠落/重複/UTF-8/末尾拒否 |
| 全宣言/集合 | schema/release/generation、path escape/native suffix/mode、親欠落/case/順序/重複/self index/固定entry、非Node資産とindexのextra/missing/type/size/hash差 |
| 上限 | 宣言総量にindexを含めて2GiB等号/超過、16MiB等号/超過、観測100,001超、depth/container型付き上限、path深さ64/超過 |
| generic予算matrix | declaration/check各正常経路の全checkpointへ期限/取消を個別挿入。workの初回/途中/最終/累積/overflow、既存失敗優先 |
| SharedBudget bridge5件 | declare/check間のwork共有・他台帳不変、期限/取消/既存理由、実行途中fake clock、capと再呼出し、typed size/hash/JSON/集合差のラッチ |

pure17＋bridge5＝22。closure filterは既存unit1件を含む23件。
fixtureのobservedは架空の比較入力で、実配備を独立走査した証拠ではない。

## 4. コマンドと途中経過

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml closure
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 初回pure試験は16成功/1失敗。Node指定を固定entryへ変えたケースをBindingと期待したが、既存mode検査が先にInvalidを返す。public経路と照合し、実装の拒否順序を変えずテストを既存結果へ合わせた。
- 修正後、closure関連23件成功、Clippy指摘なし。
- 感度確認：raw hash比較を一時無効にするとhash-first試験が失敗。各Entry比較を一時無効にすると非Node hash差が誤成功し、集合試験が失敗。両比較を復元して全体検証を行い、一時変更が残らないことを確認した。
- 全体490件（5 suites）成功、release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、4文書のlocal link/コードフェンス/行末空白、git diff --checkも成功。

## 5. 未接続・限界

同session/roundの全件観測producer、root/Node/indexのrecord/registry binding、実filesystem scan/metadata/path/clock/lease、再検証pipelineは未接続。
100,000件と宣言2GiBは形式上限で、暫定1,000,000 work cap・実10秒/受信2GiB/call枠に収まる保証ではない。pure検証はI/Oを行わず、payload台帳は増えない。
Value/typed/mapsのallocation/RSS、serde内部の長いtoken/型変換・BTree/文字列比較・解放のhard中断は未対応。前後・要素ごとの協調checkpointはhard timeoutやABA/原子性の証明ではない。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止、公開JSON/exit codeを維持する。

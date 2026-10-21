# BP-5 R-2 OL-03：estimate消費型bridge・固定collectorの一体接続

Date: 2026-10-21 / Scope: private Rust合成source。実PDI/OS/実署名のE2Eではない。

## 1. 実装範囲

[詳細設計draft-0.5 §14](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)に従い、`scan_ops/collector.rs` に `consume_and_collect` を追加した。estimateとsourceを値で受け、既存guard7→無課金checkpoint→固定collect（入口guard1→private kernel）→無課金checkpointを同SharedBudgetで実行する。可視性はscan_ops内までで、ScanOps/Quotas/Outcomeやestimate fieldの公開範囲は広げていない。

先行失敗時もestimateが所有する元Inputsの試行を先に消費する。guard/入口で停止した場合はNotStartedを返し、cleanup完了票を作らない。sourceは事前handleなし・constructor/Dropが外部操作をしない合成契約であり、guard失敗時にはそのままdropする。

collectorを呼んだ場合は既存Outcomeをmoveする。resultの先行Errを元budgetへラッチしてから終端checkpointを実行し、最初の理由を維持する。遅い成功の後で取消/期限を検出した場合、Observationだけを破棄し、元のcleanup summaryを同じOutcomeに保持する。summary再走査・再seal・retry残の事後一致要求・source再実行は追加しない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。通常strictのClosureSource経路は切り替えていない。

## 2. 新規6テスト

| 試験 | 確認内容 |
|---|---|
| 3種roundの成功 | Initial/BeforeM4/AfterM4で観測entries一致、live/pending_cleanup/unconfirmed=0、source操作876、準備込み1991 work |
| bridge入口前の6拒否条件 | work上限、取消、期限、r変更、budget origin違い、先行Unavailable。NotStarted・source操作0・先行理由保持・再collect拒否 |
| collector後の9拒否条件 | quota未提供、hash不一致、短読取、余剰entry、EINTR枯渇、FS取得不能、cleanup不明、source取消/期限。元のErrとsummary、handle解放、後続停止を保持 |
| 遅い成功後の期限 | kernel自身の成功終端を通過した後、追加checkpointだけでDeadline。成功を返さず、取得済みcleanup summaryは保持 |
| 遅い成功後の取消 | kernelの最終成功clock呼出しで取消flagを立て、bridgeの追加checkpointでCancelled。成功を返さず、cleanup証拠を保持 |
| 3round後続phase | 合法EINTRを含む同start/共有retry残7を維持。成功後のみborrowを解放し、既存AfterScan/FinalIndex・全handle解放を確認 |

成功・collector失敗・guard失敗では、呼出し前後のsource状態のRc所有数も照合し、bridge/sourceの所有権が返却結果へ残っていないことを確認する。これは一般のOS resourceに対する証明ではなく合成sourceの所有確認である。

終端試験はprivate test clockを使い、元の分割経路（guard→collect）のclock呼出し数と単一bridgeを比較する。基本fixtureでは6135に対して6137、正確に前後2回が追加される。期限は6137回目だけを期限切れにし、取消は6136回目でflagを立てる。with_round自身の後続checkpointより前、bridge返却直後にresult/summary/budgetを検査する。clock回数はこのfixtureと検査順序の照合値であり、処理時間や運用workモデルではない。

## 3. 費目と予算

| 基本fixture | work |
|---|---:|
| 元kernel S | 1902 |
| O.use / O.dispatch | 7 / 1 |
| 単一bridge（estimate取得後） | 1910 |
| O.profile / O.calculate | 61 / 20 |
| profile・計算込み | 1991 |

前後checkpointはworkを課金しない既存helperだけを使用する。既存Sの費目モデルや上界、共有work100万・payload・期限・retry上限を変更しない。collector中の正当なEINTRは共有rを消費でき、処理後のrを元estimateと一致させて誤拒否しない。

## 4. 開発中の確認と修正

1. テストを先に追加した段階では、未定義 `consume_and_collect` によるE0425を確認した。単一bridge接続後に新規6テストが成功した。
2. 終端checkpointだけを一時除去すると、正確な追加clock数を要求する期限/取消の2テストが失敗した（4成功/2失敗、6136対期待6137）。復元後に6テスト成功。存在しないcheckpointに合わせて期待位置を自動的にずらす試験にはしていない。
3. 初回全体740テストとrelease buildは成功したが、Clippyの警告禁止実行でtest clockの入れ子ifに `collapsible_if` が1件出た。同じ条件をlet-chainへ整理し、警告抑制や製品ロジック変更はせず再検証した。

## 5. 再現コマンド・結果

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml collector::tests::entry::bridge
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終結果：全体740テスト成功（従来734＋新規6、5 suites、9.39秒）。Clippy全targets警告禁止・release build・rustfmt check・diff check成功。更新5文書の相対リンク先59件、code fenceの対応・末尾改行を確認した（節anchor内容の自動照合ではない）。npm全体、PDI、OS source、実署名試験は再実行していない。

## 6. 未対応・限界

全体work事前受付・other上界・3round operation/name/live/cleanup配賦・承認quota producer・通常strict接続・OS source・運用host終了報告への統合は未対応。単一bridge成功をpermitや運用受付の成功に変換しない。固定scalarブロックの独立監査、専用compile-fail、hard期限/CPU/RSS/OS処理時間の保証も今回の試験には含めない。

OS接続・実機操作・トークン発行・設定変更・permit発行は実施していない。telemetry調査は再開していない。

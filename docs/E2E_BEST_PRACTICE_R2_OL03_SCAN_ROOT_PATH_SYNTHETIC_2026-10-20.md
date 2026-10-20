# OL-03 root / 絶対祖先path再照合：内部契約の合成検証

Date: 2026-10-20 / Status: 合成subset。OS接続・実機E2E・実行authorityではない。

## 1. 対象

`round_declaration/scan_inputs/root_path.rs`へ、receipt/round限定のScanInputsと保持root resourceのorigin・root snapshotを固定するRootBinding、および固定anchorからの再探索を実装した。本番producer/constructorはない。§17の入力結合は先行コミット `03e3248` に分離した。

合成経路は保持root観測 → `/`取得/観測 → `sealed`取得/観測 → `runtime`取得/観測 → 全temporary解放 → 保持root再観測。absolute pathの全edgeを省略しない。各Stat/namesは同receiptの初期値と比較し、新値でbaselineを更新しない。

## 2. テスト

8テスト関数を追加した（各関数内で複数ケースを反復）。

- 正常経路の固定操作順・42 work・peak owner2・temporaryの全件一度だけ解放・保持rootの外側所有を確認。payload/予約/target metadata/topology消費なし。
- 保持root前後/anchor/各祖先の5観測点×13変化（inode/device・before/after差・names/ACL/FS/permission/timestamp/Unknown等）を拒否し、以後のsourceを呼ばない。
- 全8取得点×Unavailable/Interrupted/WouldBlockで停止。retry・skip・別path fallbackはせず、元EINTR残8を維持する。
- 全8取得点の遅延成功に取消と10秒期限切れを注入。取得成功handleがpost-guard前にowner化され、解放されることを確認。
- 残work0〜42の全prefixで元100万上限とcleanupを確認。42だけ完全成功、0〜41はLimit。
- 異なるorigin、コピーしたbaseline、使用済みbinding、新round、同内容の別入力view、別budgetはsource呼出し前にBinding。
- 解放不明は成功せずUnavailable。先行Changedを解放不明で上書きしない。

receipt Stat比較を一時的に無効化すると、差替え検知テストが「拒否を期待したが成功」で失敗した。比較を復旧して最終再検証した。

## 3. 初回実行で判明した点

- productionの初回cargo checkはBudget trait import漏れで失敗。既存work課金と照合してimportを追加しcheck成功。
- 初回テストcompileはfixtureのprivacy/import pathで失敗。既存の合成setupだけを同module内で共有するvisibilityへ変更し、正確なfixture moduleをimportした。
- 拒否テスト1件が、先行Bindingを保持するwith_roundの終端checkpointにもかかわらず成功を期待して失敗。製品の停止動作は変更せず、同budgetを失敗させた場合の終端期待値をBindingへ修正した。
- 初回clippyはテスト内のnested if 3箇所をcollapsible_ifとして拒否。同じ条件をlet-chainへまとめ、抑制属性や検査の緩和なしで再実行した。

## 4. 最終検証

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終再実行結果：**655 passed**（追加8、既存647）。clippy全targetsは警告なし、release build・cargo fmt check・diff checkも成功した。655はRust package全体のテスト関数数であり、本件の独立評価ケース数や実OS操作の網羅率ではない。

## 5. 制限・未対応

Observationは固定サイズの合成比較値であって、native syscallやscan_opsの単発metadata実装ではない。42 workをmetadata18係数や全体受付の証明に流用しない。最大132 source試行・peak2・cleanup prechargeは内部subsetの有限性であり、OS sourceの真実性・blocked I/O・hard期限や解放実証ではない。

system祖先の0555/0755・ACLなし・APFS等はsynthetic subsetで、macOS全祖先の承認済みpolicyではない。receipt producerの信頼、runtime root以下の相対祖先/file再照合、scan_ops/collectorの実接続、更新lease/ABA防止、全closure seal/全体受付、hostの終了票連携は未対応。

telemetry調査は保留。OS接続・API実接続・実機操作・トークン発行・設定変更・本番policy投入・実行permit・Pushは行わない。既存gate92/通常v2 Unavailable/DER・absence停止を維持する。

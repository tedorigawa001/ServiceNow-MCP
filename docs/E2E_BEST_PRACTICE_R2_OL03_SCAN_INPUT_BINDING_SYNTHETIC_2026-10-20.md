# OL-03 scan入力結合：合成検証

Date: 2026-10-20 / Scope: receipt/round限定のimmutable宣言・親子view内部契約。PDI E2Eではない。

## 1. 実装

`round_declaration/scan_inputs.rs`を追加し、IndexPhasesのReadyから1回だけprojectionを生成する。宣言は既存decodeを再利用する。scopeの元receipt/target/context/lineage/token/round/budget origin、親viewのidentity、canonical entryのidentityを要求する。virtual indexのsize/digest/pathとdeviceはreceiptから導出し、任意入力へ置き換えない。

root/index snapshotは受理済みreceipt内でpolicyのsubsetを検査する。合成fixtureのrootは既存0755から明示的に0555へ変更した。実rootの信頼性、現在のACL/FSやpathの観測を証明したものではない。

## 2. 回帰テスト

10テスト関数（複数の拒否ケースを各関数で反復）を追加した。

- rootとnested direct-child、canonical file参照、receipt device、virtual indexの元bytes長/hash。追加index decodeなし、payload/予約/metadata/topology消費なし。生成8/root expected15 workを実計数。
- Entryコピー、同pathの別親、別階層の親、二重projection、fileをdirectoryに指定、絶対/上位/未知path、directoryをfile化する入力を拒否。
- 新round token（同enumを含む）、別budget、nonceをコピーした別receipt/target/contextを拒否。
- root/indexのowner/mode/type/device/names/nanoseconds不適合、scan後の非Ready phaseを拒否。
- 実際の取消フラグ、clockの10秒到達、work100万到達、および各入力境界のsticky失敗保持。
- indexには適合する512MiB超の宣言をscan file入力ではLimitで拒否。

## 3. 検証コマンド

リポジトリrootから、offline/lockedで実施する。

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終再実行結果：全Rustテスト **647 passed**（追加10、既存637）。clippy全targetsは警告なし、release build・cargo fmt check・diff checkも成功した。合成テストであり、実resource/OS backendの成功を示すものではない。

## 4. 未接続・停止条件

expected viewは宣言順＋virtual index末尾である。sorted scan child APIへのadapter、物理root/祖先/path再照合、open後のresource identityとの結合、全closureの観測sealはまだ実装していない。declared bytesを実際に読んだ観測として出力しない。

利用ごとに線形membership検査を課金する。完全探索の上界へ旧定数lookupを流用しない。計算器ID/capを変更せず、全体受付は無効。新規依存、OS接続、API接続、実機操作、トークン発行、設定変更、実行permit、Pushは行っていない。telemetry調査は保留、DER/absence停止・本番policy未投入を維持する。

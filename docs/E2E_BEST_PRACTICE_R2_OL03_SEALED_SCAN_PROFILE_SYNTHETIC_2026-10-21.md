# BP-5 R-2 OL-03：sealed profile・count-only統計の合成検証

Date: 2026-10-21 / Scope: Rust private internal subset。実PDI/OS sourceのE2Eではない。

## 1. 範囲・停止状態

[詳細設計draft-0.2](BEST_PRACTICE_BP5_R2_OL03_SEALED_SCAN_PROFILE_DESIGN.md)のScanShapeProfileとcount-only統計収集・requireだけを実装した。profileは同ScanInputs/RoundScopeをborrowし、元budget origin/started/retry残に結合する。scalar/identityに外部constructor・setter・serdeを設けず、Debugは固定labelのみとした。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持。collectorのgroupsを省略せず、通常strict・OS source・APIには接続しない。OS接続・実機操作・トークン発行・設定変更・permit発行・Pushは実施していない。

## 2. 実装と費用

`scan_inputs/profile.rs` と `profile/collect.rs`。ScanInputsへprivate Cell<bool>を追加。claimは最初のfallible workより先に消費し、既存失敗や未知modelで止まっても戻さない。draft-0.1の固定7 workの総数は変えず順序を変更した。

通常N slotの一時Vec<u64>とroot scalarだけで子数を数え、通常entry＋virtual indexを一度ずつ処理する。親は同宣言sliceのbinary searchで特定。component走査で最後のseparator位置も保持し、親prefix取得のための別走査は加えない。root/Directory fold後、配列はprofileへ保存せずDropする。JSON再decode・child vector・cached directory・OS resourceの生成はない。

成功費：`11+2N+5E+K+B+M+D`、上界：`11+2N+5E+K+M*(ell(N)+1)+D`。既存Inputs構築費は含めない。requireはInputs.guard3＋model/identity1＋retry1で5 work。課金は既存SharedBudgetへ加算し、返金・新期限・新retryを作らない。

| 基本fixture | 値 |
|---|---|
| N/E/D/F/T/h | 4 / 5 / 2 / 3 / 3 / 2 |
| K/P/k_v、M/B | 8 / 3 / 1、2 / 5 |
| c_0/c_v/c_max/J | 3 / 3 / 3 / 8 |
| C/C_v/r | 3 / 1 / 8 |
| 収集実費 / 上界 / require | 61 / 62 / 5 work |

workは明示された有限ブロックの課金であり、CPU時間・RSS・allocator時間の証明ではない。profile作成成功を受付成功・scan権限に変換しない。

## 3. 合成試験

新規9テスト。profile専用実sourceやOS fixtureは使用しない。

- 基本fixtureの全scalar・61 work・秘密を含まないDebugを確認。
- 7 shape×Initial/BeforeM4/AfterM4を独立BTreeMap oracleと照合。幅128、相対深さ64、空file/Directory、先頭/末尾/nested index、64KiB境界、512MiBを含む。512MiB超の宣言はLimit。
- 同内容の別Inputs、同fieldsの別scope、別round/token/receipt/target/context、別budget origin/started、未知model、retry増減を拒否。最初の失敗をcheckpointへ保持。
- 同Inputsの再profile・同roundのInputs再構築を拒否。成功後・未知model失敗後・collection失敗後・既存sticky failure後ともclaimを戻さない。
- 収集のwork残0〜60を全拒否、61で成功。requireの残0〜4は全拒否。返金せず部分profileを返さない。
- 61箇所の各課金直後に取消と10秒期限切れを別々に注入（122条件）。test-only observerは総課金と注入点の観測に限り使用。製品のscalar/oracleの代替にしない。
- Clone/Copy/Serialize/Deserialize追加で曖昧になる型推論guardを置き、現型にこれらのtraitがないことをコンパイル時に検査。

TDDの初回tracerはstubのUnavailableで失敗し、実装後に成功した。tracer準備中のmodule import誤りは既存階層と照合して修正した。clippy初回はtest用trait guardの不要な`?Sized`を3箇所指摘し、除去後に再実行した。合成試験以外の実操作へ回避しなかった。

## 4. 未実施・次工程

実allocator失敗の注入・最大100,000 entry/16MiBを実量で処理する試験・Ready遷移の専用compile-fail試験・各固定ブロック最大32演算の独立監査は未実施。配列解放はRust所有権/RAIIに依存し、解放回数やRSSを外部測定したものではない。

profile消費型15-row計算器（require込み20）、ScanWorkEstimate、利用guard7、3round resource台帳・通常strict bridge・全体受付は未実装。固定評価セット・旧契約は変更しない。

## 5. 再現コマンド

作業ディレクトリはrepository root。すべてoffline/lockedで実行する。

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml scan_inputs::profile
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終結果：新規profile 9テスト成功、全体698テスト成功（従来689＋9、5 suites、9.36秒）。clippy全targets警告禁止・release build・rustfmt check・diff check成功。これはRust crateの検証であり、npm全体/PDI/実署名試験を再実行したものではない。

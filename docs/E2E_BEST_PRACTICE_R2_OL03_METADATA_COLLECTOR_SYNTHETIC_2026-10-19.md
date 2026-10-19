# BP-5 R-2 OL-03：metadata collector・単発Ops合成検証

Date: 2026-10-19 / Scope: Rust内部境界の合成試験。OS/PDI E2Eではない。

## 1. 対象と停止状態

[実metadata source設計draft-0.2](BEST_PRACTICE_BP5_R2_OL03_METADATA_SOURCE_DESIGN.md)§13のReadScope collectorを、単発MetadataOpsの合成sourceへ接続した。
従来の一括Observation sourceと固定M0〜M4/A/BのFlowは維持する。telemetry調査は保留。
OS実source・新規metadata syscall/probe・Security API実接続・実artifact/PDI操作・トークン発行・設定変更・本番policy/registry・permit発行・Pushは行っていない。
既存Rust回帰のfixture検査を、今回の新規OS metadata sourceが実機適合した証拠には数えない。

## 2. 実装

- [collector.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/collector.rs)：単発typed Ops、順序固定collector、ACL guardと解放枠、共有100呼出し・名前640KiB台帳。各観測64KiB以下。
- [metadata.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata.rs)：一括/collectorの取得方法をprivate closureで共通Flowへ接続。Stat/名前の純粋検査を共有。
- [positioned_read.rs](../native/r2-outer/src/signature_boundary/positioned_read.rs)：SharedBudgetにmetadata呼出し・解放予約・名前返却bytesを追加。payload予算のreset/緩和なし。
- [合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/collector/tests.rs)：架空bytes・型付きstat/FS・ACL handle・clock/cancelだけを使う。root File/ACL/xattrを作らない。

正常時は各phaseでBefore/FS/Init/ACLStat/Query/Size/Names/Confirm/After/Freeの10回、5phaseで50回。
Init成功handleはpost-checkpoint前にguardが所有し、以後の失敗・期限/cancel・unwindでも同じsourceのfreeを1回呼ぶ。Init失敗はfree0回で予約を解放。
free後のcheckpointもあり、解放が終わるまで結果を返さない。解放そのものは時間超過でも省略しない。

## 3. 新規20テストの確認範囲

| 群 | 合成確認 |
|---|---|
| 正常/接続 | 空/provenance、全5phaseの10操作順、名前copy容量非0、A/B実payload課金が従来値のまま、固定Debug |
| 取得失敗 | 各phase×各取得操作×Unavailable/Interrupted。失敗後は必要free以外0操作、retryなし |
| Stat/FS/ACL | 各phaseのfstatx/After差、初回Stat不適合の早期停止、非local/Unknown/非APFS/ownership無視/noexec、ACL present/不正sentinel |
| 名前 | 負長/65537/i64最大は確保前拒否、空でもcopy/requery、短読取/過大/ERANGE/再照会差、NUL/重複/未知/quarantine/ResourceFork/64KiB不適合 |
| 時刻/cancel | 全phase×10操作×遅延成功/遅延エラー/取消。成功handle/解放後もcheckpointで拒否し、残解放予約0 |
| 共有budget | role相当2比較で100回、新scopeでも枠resetなし。Init前に解放分不足なら停止、途中枠枯渇でもfree1回 |
| 名前課金 | 640KiB台帳残枠不足は確保/copy前に停止、遅延成功も計数、不正過大returnはslice長まで保守的計数、payload予約/8再試行枠を消費しない |
| latch/解放 | 先行失敗/早期cancelは操作0回、後続policy不適合はChangedをラッチ、ACL handle生成/明示free/Drop件数一致、unwindでも1回 |
| gate/非出力 | markerを有限理由へ混ぜない、XML/DER/absenceの既存停止をcollector接続後も維持 |

テスト数はRustのtest関数数。上記matrixの組合せを独立したケース数やOS適合件数として報告しない。

## 4. 初回失敗と対応

1. 最初のcollector testコンパイルは、既存テストmoduleのprivateなobservation関数参照でE0603。エラーの定義/参照位置を照合し、既存可視性を広げず新しい合成Stat fixtureをテスト側に定義した。
2. 追加15件の初回成功後、Clippyの-D warningsでテストevent helperのcollapsible_ifを1件検出。条件をlet-chainにまとめ、lint抑制は追加しなかった。
3. 15件時点の全体343件成功後、後続policy latch・途中枠枯渇時の解放・名前上限・unwind・gate維持の5件を追加し、最終20件/全体348件を確認した。

## 5. 最終確認

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml metadata::collector` | 20 passed、既存328 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 348 passed（5 suites） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| cargo fmt check / exec_probe.rs rustfmt check | 成功 |
| 変更MDのlocal link/code fence/行末空白・git diff check | 成功 |

実行時のshellコマンドはAGENTS.mdに従いbdoを前置した。依存/Cargo.lock/TypeScript/MCP登録は変更していないため、TS/MCP/PDIテストは再実行しない。

## 6. 未証明・次工程

typed Opsは実syscall結果の真正性を保証しない。実FD/ABI/errno変換・ACL不存在/可視性・不可視xattr・filesec内部割当・FS適合・hard timeoutは未検証。
trait実装内の隠れretryを本境界だけで排除したとは主張しない。今回のsourceは合成実装だけ。
OS sourceがなく、trusted opener/祖先/path/record/leaseも未接続。native API/raw整合/DER/absence/permitへの昇格経路を追加しない。
RAII unwind試験はhandle解放の証拠であり、backend panicの秘密非出力・panic後の運用再開を保証しない。

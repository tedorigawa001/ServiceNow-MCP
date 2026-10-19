# BP-5 R-2 OL-03：open snapshot/M0結合の合成検証

Date: 2026-10-19 / Scope: private移譲契約・合成MetadataOpsの結合。実OS/PDI E2Eではない。

## 1. 対象と停止範囲

[移譲設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)§13の内部結合を追加した。
telemetry調査は保留。実opener・実File移譲・macOS SystemApiの起動、実機操作・API実接続・トークン発行・設定変更・permit発行・Pushは行っていない。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、XML/DER/absence停止を維持する。

## 2. 実装

- [transfer.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer.rs)：private ResourceOrigin、receipt/scopeのinitial origin、attachの同一resource検査、所有scopeを消費するreview_opened_target、非authority OpenBoundComparison。
- [collector.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/collector.rs)：open snapshot確認後のpolicy変化をChangedにしてからラッチする内部メソッド。従来のunbound M0分類は維持。
- [新規合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/tests/m0.rs)：FDを持たないLive resource/合成stat/ACL/xattr/bytes。既存移譲18件にもoriginを追加した。

ReadScopeはHeldTargetScopeの同じ所有leafを借用し、期待hash/device/sizeとopen snapshotはscope内部からだけ取得する。別source/snapshotの上書き引数はない。
M0の単発collector結果とopen Snapshotが一致してから既存Flowへ渡すため、正常化はしてもM0を2回取得しない。
open後にUID/mode等のpolicyが不適合になればChanged。取得エラー/不正ACL presentはMetadataUnavailableであり、失敗snapshotを「初期状態」として受理しない。
resource/snapshot originはopaque Rcの対応確認で、OSのFD同一性証明ではない。

## 3. 新規14テスト

| 群 | 合成確認 |
|---|---|
| 正常 | M0〜M4各1回、metadata50回、payload実課金が`32+48+2*N`、固定Debug、XML gate停止 |
| snapshot差 | 12種のStat field差をopen後に注入。Changedをラッチしpreflight/payload0回。move後のinode差も同様 |
| 名前/policy | 許可provenanceの追加/削除でもChanged。ACL present/FS不適合/未知名はChanged、不正queryはMetadataUnavailable |
| resource混入 | 同じmetadataの別resourceへmove前/後に交換、別snapshot origin移植。Binding/SourceMismatchでmetadata/read0回 |
| phase中の混入 | 全5phaseのcollector中にoriginを変更し、post-checkでSourceMismatch。M0ならpayload0回 |
| 失敗/期限/取消 | M0取得不能はopen snapshotへfallbackせず停止。遅延/cancel/既存失敗でもbaselineを固定せず資源と予約を解放 |
| 本文改変 | metadataが一致していてもmove後のbytes改変はpinされた期待hashによりHashMismatch |
| unwind | M1取得中のpanicでもleaf/祖先・作成済ACLが1回解放。panic後の運用再開を保証しない |

合成resourceの生成/Drop数、ACL生成/free数、共通budgetの予約0と最初の理由ラッチを確認する。14はtest関数数で、matrixの組合せや実OS試験数ではない。
最初の12件成功後、本文改変とunwindの2件を追加した。新しいOpenBoundComparison型で未結合のComparedM0M4と区別し、最終検査を実行した。

## 4. 最終検査

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml metadata::transfer::tests::m0` | 14 passed、380 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 394 passed（5 suites） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| cargo fmt check / exec_probe.rs rustfmt check | 成功 |
| 変更MD local link/code fence/行末空白・git diff check | 成功 |

shellコマンドはbdoを前置。依存/Cargo.lock・TS/MCP登録は変更せず、TS/MCP/PDIテストは再実行しない。

## 5. 未確認事項

M4前の祖先snapshot/namespace再walk・record再読・lease最終確認・topology台帳は未実装。成功名にpendingを残し、返却前に資源をdropした診断を後のAPI/execで有効なFD証拠にしない。
実openerから同じ保持Fileにsnapshot/originを結び付けるproducerや実macOS sourceへの接続も未実装。
originは協調的な所有型の結合で、虚偽のsource/producerやABA、実FD/OS identity、不可視xattr、blocked I/Oのhard timeoutを証明しない。
raw Observationを偽造できる内部producerの侵害は保証対象外で、合成snapshot比較をroot承認/署名validityへ昇格しない。

# BP-5 R-2 OL-03：同resourceのstreaming hash・宣言digest比較

Date: 2026-10-20 / Status: 内部subset・合成source検証。OS/実filesystem E2Eではない。

## 1. 範囲・停止状態

[設計draft-0.7 §15](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#15-同resourceのbytesによるsha-256宣言digest照合)と[declared_read.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/declared_read.rs)が対象。[digest.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/tests/digest.rs)へ7件を追加した。既存のsize/metadata/低水準read拒否の18件も、成功fixtureのdigestと現行work費用を更新して維持した。

全体受付無効・telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。OS接続・実機操作・token発行・設定変更・実行permit発行・Pushは行っていない。sha2は既存依存を使用し、新規依存はない。

## 2. 契約

bind時に同File entryの64桁小文字hexを固定32-byteへ復号し、hasherを内部保持する。不正digestはBindingでmetadata/read前に拒否する。Entryの型だけでは信頼済み宣言の証拠にならず、accepted indexと親path/receipt/roundへの結合は未対応。

完全data readのfresh outputを、返却前に最大64KiB単位でhash updateする。hash対象bytesをcallerから別に受け取る口はない。同resourceへの宣言経路を使い、2 resourceのhasherを共有しない。EINTR/short/過大count/EOF bufferをhashへ入れず、成功retryだけ一度反映する。short等は従来どおり即停止し、部分結果を完了扱いにしない。

EOF0＋同resourceのpost-stat一致後にだけhasherを一度消費してfinalizeし、宣言digestと比較する。差はHashMismatchでpendingを残し、次の通常source呼出しを停止する。元期限/取消/sticky理由を保持し、cleanupはprechargeで一度だけ行う。update/finalize/比較の前後に元SharedBudgetのcheckpointを置く。hash処理は協調中断であり、OS/CPUのhard停止の実証ではない。

hasherは非Cloneのbinding内部だけで保持し、data全体を蓄積せず定数量状態を使う。digest・内容をログや成功値へ返さない。部分検証の成功は全closure完了seal/実行authorityではなく、ABA/検査後改変・完全metadataを証明しない。

## 3. テストと開発中の失敗

| 追加テスト | 確認結果 |
|---|---|
| digest不一致 | size/statが一致してもHashMismatch。pending1、後続metadataは元理由でsource前停止。実消費3 bytes、全owner解放 |
| 独立golden vectors | 空とabcの固定既知SHA-256で成功。返却bufferのzzzへの変更で結果不変、EOF bufferをhashしない |
| 不正digest | 空/63/65桁、uppercase、g、UTF-8の64-byte文字列をmetadata/read前Binding |
| EINTR/probe除外 | Interrupted応答のzzzとEOF bufferをhashせずabc成功。data/EOF位置不変、共有retry8→6、29 work |
| 2 resourceの分離 | abc/xyzを別のheld resourceから交互に読む。resource ID/offset/長さ履歴を照合し、両方digest一致、pending0 |
| 複数chunk | 64KiB＋5-byte tailを順にupdateし、独立one-shot SHA-256と一致。payload65,541、28 work |
| hash phaseの期限/取消 | 正常実行でbind/decode/init、data後、post-stat後のclock checkpoint位置を収集し、各位置へfake deadline/cancelを注入。成功を返さず元理由を保持、実bytes上限・全owner一度解放。sleep/OS通信なし |

実装前にdigest不一致の回帰テストを実行し、期待HashMismatchに対してOk(Complete)となって失敗することを確認した（0 passed / 1 failed）。hash実装後に同テストは成功した。

初回Clippyは新規digest decodeの `chunks_exact(2)` に固定長配列APIの使用指摘を出した。デバッグ手順で確認し、同じ64-byte入力・32組の変換を `as_chunks::<2>()` に置換した。上限や受入形式は変えていない。最終Clippy/全体テストを再実行した。

既存のsize/short/stat/取消/低水準迂回試験を維持し、成功fixtureに実bytes（x列）のdigestを設定した。大きいsizeのcap試験では宣言に応じた巨大buffer/hashを生成せず、valid hexと未完了拒否を使う。work枯渇試験は残0〜23へ広げ、すべての停止prefixで解放と上限不変を確認した。

## 4. 現行workと共有予算

| 費目 | 実work |
|---|---|
| bind | 5（従来3＋digest decode1＋hasher init1） |
| 完全data chunk | 5（従来3＋hash update1＋進行更新1） |
| EOF0/post-stat/finalize/比較 | 7（従来5＋finalize1＋比較1） |
| data/EOF Interrupted | 各3。hashは更新しない |
| standalone成功 | `18+5C`。空18、1 chunk23、2 chunks28 |
| 1-child照合内の1 chunk成功 | 38（従来32＋追加6） |

元origin/start/work/payload・既存予約・retryをresetしない。golden caseではorigin object一致、既存target metadata/name/topology/予約台帳不変も確認した。量上限や既存モデルIDを増額/変更していない。hash/stat/lookup/producer費の所有表、全体work上界・独立resource受付への接続は未対応。従来17/32や `bp5-r2-scan-work-0.1` を現行実装の検証済み上界として使わない。

## 5. 残課題

完全metadata/祖先path前後照合、accepted宣言と親path/receipt/roundを結ぶtrusted producer、全closure観測構築・seal、lookup/stat/hash/producerの全体workモデル・独立resource配賦、OS backend/cleanup hard期限。size/stat/digest一致だけで、実行安全性・完全filesystem状態・ABA排除・検査後変更の防止を証明したとは扱わない。全体受付は無効のまま維持する。

## 6. 最終実行結果

各shellはbdo経由、cargoはoffline/locked。

| コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml scan_ops::tests::digest` | 7 passed、619 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | **626 passed、5 suites、6.84秒** |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --check --edition 2024 native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |
| `git diff --check` | 成功 |

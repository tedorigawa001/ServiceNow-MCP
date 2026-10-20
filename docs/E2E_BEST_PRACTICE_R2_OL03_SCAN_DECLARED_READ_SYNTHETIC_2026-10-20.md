# BP-5 R-2 OL-03：宣言sizeへのread / EOF結合の合成検証

Date: 2026-10-20 / Status: 同resourceのsize/進行位置/stat照合subset。OS・実filesystem E2Eではない。

## 1. 対象・停止状態

[設計draft-0.5 §14](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#14-宣言sizeへのread--eof位置結合部分実装)、[declared_read.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/declared_read.rs)、[declared.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/tests/declared.rs)が対象。

全体受付は無効、telemetry調査は保留。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持した。OS接続・実機操作・token発行・設定変更・permit発行・Pushは行っていない。保護された宣言producer、通常ClosureSource/運用入口への接続は追加していない。

## 2. 内部契約

- `DeclaredFile`はimmutable File entryと同scopeの生存resourceをborrowする非Clone/非serde型。sizeだけを投影して保持し、fileを途中解放/置換できない。同resourceへの二度目のbind、異なるsource/ledger、File以外を拒否する。
- 宣言sizeは0〜512MiB。開始statがRegularかつ同sizeでなければ、read前にChanged。取得不能はMetadataUnavailable、宣言のDirectoryはBinding、size上限超過はLimit。
- 読取はoffset0から連続。要求長は残bytesと64KiBの小さい方に完全一致させ、要求回数をceil(size/64KiB)に保つ。skip/rewind/overlap/tiny chunk/空要求/範囲外はsource前にInvalidRange。次位置は完全成功時だけ更新する。
- read/EOFは既存の1試行境界を呼ぶ。shortはChangedで補完せず、過大countはReadFailed。実bytesは遅延成功も課金し、既存payload予約を保護する。EINTRは同位置で元共有残を消費し、呼出し側が明示的に再試行する。
- EOF probeは全data完了後の宣言size位置に限り、要求長1で結果0だけを許す。結果1はChangedで停止しprobe byteも課金する。空fileも位置0のEOF検査が必要。
- EOF0後に同resourceのstatを1回取得し、beforeの全Statと比較する。size/type/device/inode/owner/mode/links/mtime/ctimeの差をChangedとし、取得不能なら停止。ACL/xattr/FSの完全metadata policyではない。
- 完了はEOF0＋post-stat一致だけ。未完了bindingのDropは台帳に放棄を記録し、次の通常primitiveをsource前に止める。scope終端のpendingも拒否する。cleanupは独立prechargeで一度だけ実行し、元の失敗理由を維持する。完了後の再read/EOF/rebindはBinding。

Entryという型自体はaccepted宣言の証明ではない。Entryと期待child/親path/receipt/roundの信頼結合は未実装であり、今回のhelperがそのpath対応を検証するものではない。固定Debugはpath/内容を表示しない。digest比較や全closure完了seal/実行authorityは返さない。

## 3. 追加16テスト

| 群 | 確認結果 |
|---|---|
| 正常サイズ | 0/1/4/65,536/65,539 bytes。data要求とEOF位置を合成source履歴で完全照合。payloadは宣言sizeだけ消費 |
| 不正範囲/早期EOF | offsetずれ/上限overflow相当、長すぎる/短すぎる/空buffer、全data前のEOFをread source前拒否 |
| short/過大応答 | 0/1/3 byte短読取・5 byte過大countを1試行で停止。実bytesを保守課金、後続read/EOFなし |
| 開始時差 | size3/5、Directory/Symlinkを宣言size4に対し拒否。read0、pending0 |
| 終了時差 | size3/5、inode/mtime/mode変更でEOF0後も未完了、Changed |
| EOFでの増加 | EOF1をChanged。probe byte課金、post-statへ進まない |
| data/EOF EINTR | 各1回のInterrupted後、同じresource/offset/長さで再試行。共有残8→6、進行を重複更新しない |
| 未完了/再利用 | read前・read後の放棄、再bind、完了後のEOF/readを拒否。放棄後metadataもsource前停止 |
| 宣言不正/上限 | Directory、512MiB+1、u64::MAXをstat前拒否。512MiBちょうどはbind可能だが未読放棄を成功扱いにしない |
| 各I/O直後中断 | anchor/file/before-stat/data/EOF/after-statの6点でCancel/Deadline。元理由と実bytes保持、全owner一度だけ解放 |
| data後の不正位置 | rewind/位置3/5/u64::MAXのEOFを追加readなしで拒否 |
| 複数chunk末尾short | 64KiB完全＋末尾要求3に結果2。補完/EOFなし、65,538 bytesを課金 |
| stat取得不能 | before/postの取得不能をMetadataUnavailable。metadata Interruptedでretry残を減らさない |
| work境界 | 残0〜17。17だけ成功、すべての枯渇prefixでcleanup漏れなし、元100万上限不変 |
| bindingの混入 | テスト専用の異なるsource/ledgerを持つ同寿命境界でもBinding、source0。通常の別generative scope混入は型で拒否される（下記） |
| child照合との接続 | expected/seen visitorで同fileをbind→read→EOF。open3/enum2/read2/stat2/cleanup3、pending/live0、32 work |

### 開発中の失敗・感度確認

追加テストで通常の別generative scopeへresourceを渡そうとしたところ、RustのE0521でコンパイルが停止した（テスト/Clippy両方）。`bind_declared`がresourceのscope寿命と一致を要求するためであり、製品側の寿命制約は緩めていない。実行時ガード試験は、テスト内で同じmarker寿命・異なるsource/ledgerを持つprivate境界を意図的に構築する方式へ変更した。この経路は運用constructorではない。最終全体テスト/Clippyは成功した。

早期EOFの検査から `next == declared_size` 条件だけを一時的に外す感度検証では、`invalid_range_or_early_eof_never_calls_read_source` が失敗した（期待InvalidRangeに対し、source呼出し後のChanged）。変異を復旧し、最終全体テストを再実行した。変異は最終ソースに残していない。

## 4. work・共有予算

bind3、data/retry3、EOF0＋post-stat5、EOF retry3。standalone成功は `14+3C`（anchor/file取得・cleanup precharge4、scope2込み）、4-byteは17 work。既存1-child helper内でのsize4成功は32。すべて元SharedBudgetを使い、deadline/work/payload/予約/retryをresetしない。resourceとpendingは定数量で、内容を蓄積しない。

従来のscan候補式へguard/stat費・retry係数を割り当てる作業、完全snapshotとの重複排除、hash費と各quota配賦は未接続。数量計算器 `bp5-r2-scan-work-0.1` を本経路の検証済み上界として使わない。全体受付を無効のまま維持する。

## 5. 実行結果

各shellは`bdo`経由、cargoはoffline/locked。

| コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml scan_ops::tests::declared` | 16 passed、601 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`（最終） | **617 passed、5 suites、8.34秒** |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --check --edition 2024 native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |
| `git diff --check` | 成功 |

## 6. 残課題

hash計算/宣言digest比較、完全metadata/祖先path前後照合、protected expected/size producer、accepted宣言と親path/receipt/roundの結合、全closure観測構築・seal、実消費に合うworkモデル/独立resource配賦、OS backend/cleanup hard期限。stat前後一致だけで同size改変・ABA・検査後変更・実filesystem完全性を排除したとは扱わない。

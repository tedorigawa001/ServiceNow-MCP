# BP-5 R-2 OL-03：scan単発操作内部契約の合成検証

Date: 2026-10-20 / Status: 内部subsetのみ実装・合成検証。実filesystemのE2Eではない。

## 1. 範囲と停止条件

[設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#12-単発操作の内部契約合成source運用未接続)に対応する。[scan_ops.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops.rs)をprivate moduleとして追加し、[tests.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/tests.rs)の合成sourceだけを接続した。

全体受付・実行permitは無効。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止、telemetry保留を維持する。OS接続・実機操作・token発行・設定変更・Pushは今回の検証対象外であり実施していない。運用呼出し・承認quota producer・protected root/scope producerは追加していない。

## 2. 内部契約

- `ScanOps`の各呼出しは1試行だけ。open/ACL init成功時だけowned handleを返し、Error時は所有権を渡さない。隠れたretry/skip/refill/path置換・無制限allocation loop・panicを禁止するsource契約である。native backendが守ることは未検証。
- 操作前後は元SharedBudgetを使う。元start/origin・100万work・2GiB・EINTR共有残8を維持し、既存payload予約を保護する。target metadata/name・topology枠は流用しない。
- 取得前にdispatch1＋cleanup1をprechargeし、独立操作/live/cleanup枠を確保。成功rawは取消/期限のpost-guard前にowner化する。失敗時もspentは返さない。
- ownerは非Clone・非serdeでraw getterなし。同source/ledgerを検査し、別scope resourceを拒否。cleanupは所有handleを一度だけ消費し、sticky stop後も試みる。cleanupの再試行はしない。
- cleanup不明は元の失敗と別に件数を残し、新規操作を止める。未解放live/予約・未完了retryも終端拒否。host終了報告への接続は未実装。
- readは1試行。EINTR時は共有残を1減らしInterruptedを返す。明示的な次呼出しは同resource/offset/長さ/EOF種別のみ許す。shortはChanged、WouldBlock等はReadFailed。遅延成功bytesもpost-guard前に課金する。
- metadataは各primitiveの型/サイズ/ACL sentinelを確認するが、完全snapshotのpolicy正規化や前後同一性の認定はしない。列挙はframe/nameの限定構造検査であり、expected/seen比較ではない。

scope setup/terminal guardの固定費は2 work。成功flow（open3、enum1、read2、metadata2、cleanup4）は17 work、payload4 bytes。metadataの通常9 primitive（ACL init込み）＋ACL free、anchor/fileの取得/解放を含むflowは16 work。これらは単発境界の計数で、collector固定16/完全snapshot18の証明ではない。

## 3. 合成15テストの結果

| 群 | 確認内容 |
|---|---|
| 正常系 | 種別別の試行数、peak live、終端live/予約0、cleanup重複0、既存予約/target区画不変 |
| 開始前停止 | quotaなし・既存sticky理由・各操作quota0・live/cleanup/name/work/payload不足で対応sourceを呼ばない |
| 取得失敗 | open/ACL initのInterruptedを隠れて再試行しない。存在しないhandleを解放しない。prechargeは返さない |
| 遅延成功 | 正常flowの全12通常呼出し直後でCancel/Deadlineを注入。成功handleを含め一度だけ解放、元理由保持 |
| read | 0/1-byte短読取、過大count、WouldBlock/取得不能、EOF0/1、範囲/空buffer拒否。遅延bytes課金 |
| EINTR | 残8を同budgetで使い切り、別file/次scopeで補充しない。同resource/offset/長さ/EOFの不一致や他操作、retry放置を拒否 |
| enum | ErrorをEOF化しない。0/256-byte count、slash/NUL/不正UTF-8を拒否 |
| metadata | 型違い、不正ACL sentinel、name size/copy境界・取得不能。遅延コピーの独立name課金。EINTR残を消費しない |
| 解放 | cleanup不明後の新規操作停止、元Cancel保持、callback unwindのRAII、owner忘却時の終端拒否、別scope混入拒否 |

忘却テストのhandleは合成番号だけでOS資源ではない。`mem::forget`されたhandleを実際に回収できるとは主張しない。sourceのcleanupはnon-panickingが前提であり、OS非復帰・hard期限・FD再利用・source内部allocationの安全性は未証明。

## 4. 実行結果

すべてローカル・offline/locked。新規15件＋既存574件。

| コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml strict::scan_ops` | 15 passed、574 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 最終589 passed、5 suites、6.79秒 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 最終成功 |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --check --edition 2024 native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |
| `git diff --check` | 成功 |

実際のshellでは各コマンドを`bdo`経由で実行した。初回Clippyは新規テスト補助のcollapsible_if/type_complexityの2件で失敗した。入れ子条件の統合とFixture型aliasで動作を変えずに修正し、Clippy・全テスト・fmtを再実行した。初回全テストも589成功で、製品期限や既存上限の緩和はしていない。

## 5. 残課題

1. expected child/seen/余剰entryのopen前拒否、missing判定・全観測構築を行う内部collector。
2. 宣言sizeへのread/EOF位置結合、完全metadata policy/正規化・前後比較、祖先/path再照合。
3. 承認済みscope/receipt/roundとscan quotaのproducer・3roundを通じた配賦。現行合成quotaは1scope内の枠に限る。
4. collectorの固定16/metadata18、plan/allocation・scope固定費2の所有表と全拒否prefix計数。上界計算器への自動接続はない。
5. OS単発backendのSDK/ABI/hidden buffering検証、nonpanic/cleanup hard期限、外側hostへのcleanup不明報告。
6. 既存の実閉包規模試算が100万workを超える問題の方針承認。今回capは増額せず、全体受付を無効に保つ。

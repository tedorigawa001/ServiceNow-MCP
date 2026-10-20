# BP-5 R-2 OL-03：同resourceのACL / xattr / FS正規化・前後照合

Date: 2026-10-20 / Status: 内部snapshotとfile経路の合成検証。OS/実filesystem E2Eではない。

## 1. 範囲・停止状態

[設計draft-0.8 §16](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#16-同resourceのacl--xattr--fs正規化前後照合)、[normalized_metadata.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/normalized_metadata.rs)、[normalized.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/tests/normalized.rs)が対象。既存bind/EOFのstat取得を前後snapshotへ置き換えた。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。OS接続・実機操作・token発行・設定変更・実行permit発行・Pushは行っていない。既存署名対象collectorはmin size32/固定mode0555/target quotaという別条件のため、そのままscanへ流用していない。

## 2. 内部契約と正規化

expected deviceを `bind_declared` の内部引数で明示し、宣言modeも検査する。FileはRegular・root owner・指定device・宣言size・mode0444/0555・links1、Directory/cursorはDirectory・root owner・mode0555・指定deviceを要求する。特殊bitをmaskせず、timestamp nanosecondsも検査する。gidは固定値を要求しないが前後のStat一致へ含める。system anchorのpolicyは対象外。

deviceと宣言がtrusted root/receipt/roundに由来することを示すproducerは未実装である。合成引数device=1は運用の信頼証拠ではなく、型付きpolicyだけで実行authorityを作らない。

1 snapshotはstat前→FS→ACL init/stat/query→names size/read/size再確認→stat後の9単発操作とACL解放1回。ACL statはfile statと完全一致を要求し、query0だけをAbsentとする。Unknown/取得失敗を空ACLやLocalへ変換しない。FSはLocal/APFS、ownership ignored=false、noexec=falseだけ許可する。

xattrはnamesだけを取得する。最大64KiB、scan name allowanceを割当前に検査し、空一覧でも1-byte bufferで1回照会する。宣言size/copy count/再確認sizeの差はChanged。空または `com.apple.provenance\0` の21 bytesだけ許可し、quarantine/ResourceFork/未知名/重複/NUL欠落/不正bytesを拒否する。許可provenanceのvalueは取得・比較せず、value不変性は保証しない。

snapshotは生存resourceをborrowし、同Statでも別resourceなら等しくない。Fileのbind前とEOF後に同resourceを正規化し、Statと許可names状態を比較する。post-snapshot一致後だけhashをfinalize/比較してpendingを解除する。初期の既知policy不適合はMetadata、後の不適合はChanged、kind/宣言size差やsnapshot内部raceもChanged、Unknown/取得失敗はMetadataUnavailable、quotaはLimit。元期限/取消/sticky理由を保持する。

## 3. 共有予算・解放・費用

元SharedBudgetのorigin/start/work/payload/予約/retryをresetしない。target用100 metadata calls/640KiBやtopology枠は流用せず、scan ledgerのoperation/live/cleanup/name枠を消費する。ACL成功handleをpost-guard前にowner化し、取得前cleanup prechargeを維持する。失敗/取消後も一度だけ解放し、解放不明はUnavailable、元失敗理由は上書きしない。

| 費目 | 実計数 |
|---|---|
| 1 snapshot | dispatch9＋ACL cleanup precharge1＋正規化/比較/割当guard8＝18 work |
| 同fileの2 snapshotのみ | anchor/file取得4＋scope2＋36＝42 work |
| bind / EOF完了 | 22 / 24 work。各stat1をsnapshot18へ置換 |
| 完全data / Interrupted | 完全chunk5、data/EOF Interrupted各3 |
| standalone | `52+5C`。空52、1 chunk57、2 chunks62、data/EOF各1 retryの1 chunk63 |
| 1-child照合visitorの1 chunk | 72 work |

許可namesのcopyは1回21、前後で42 bytes。空一覧は実copy0だが要求buffer1のallowanceを検査する。1 snapshotはscan metadata9・cleanup1を消費し、live枠へACL handle1を加える。内部program workであってnative syscall/CPU/RSSの上界ではない。全体モデル/独立resource受付への接続は依然未対応で、旧18/23/38や数量計算器を現行実装の受付証拠として使わない。

## 4. 追加11テストと既存試験の更新

| 群 | 確認内容 |
|---|---|
| 正常空/provenance | 同resourceの2 snapshot一致、42 work、metadata18/cleanup4、name copy量、元target/name/topology/payload/retry不変。ACLと元resourceの照会IDも照合 |
| policy不適合 | owner/device/mode/特殊bit/links/timestamp、NonLocal/non-APFS/ownership ignored/noexec、ACL present、quarantine。初期Metadataと後期Changedを区別 |
| Unknown/取得失敗 | 8照会点のInterrupted、FS Unknown、不正ACL sentinel、負/過大names sizeをMetadataUnavailable。retry消費なし、全handle解放 |
| snapshot内race | ACL stat差、empty probeでnames出現、再確認size差、stat後のinode差をChanged。baseline上書きなし |
| xattr拒否 | ResourceFork/未知/終端NULなし/重複provenance/不正bytes/64KiBの未知一覧を拒否。実copy量は拒否時も課金 |
| 前後names差 | 空↔許可provenanceでもChanged、pending1、payload3、metadata18/cleanup4 |
| resource/directory | 同Statの別resource snapshotは不一致。runtime Directory mode0555/size未指定を正規化 |
| 独立quota | metadata8/9境界、live不足、cleanup不足、name量1不足/等号、空一覧のallowance0で未確保I/O前停止 |
| 遅延成功 | snapshotの全12イベント（anchor/file/各primitive/ACL解放）直後へCancel/Deadline。late names copy21も課金、全owner一度だけ解放 |
| ACL初期化/解放 | init Interruptedは再試行せず、不明freeもsnapshot成功にしない。retry不変、解放重複なし |
| 元理由優先 | post ACL/FS差をChangedとし、同時に存在するdigest不一致のHashMismatchで上書きしない |

既存size/digest/低水準迂回の試験も維持した。synthetic sourceへresource別StatとACL-parent対応、順序付きmetadata応答を追加し、size3/空file等を全snapshotで一貫して返す。前後のACL handleは別ownerとして数え、全取得点の取消/期限、hash phaseのcheckpoint、残work0〜57の全枯渇prefixを更新した。新しいbind引数deviceはテストでは明示1とし、推測/defaultの運用policyは追加していない。

### 開発中の失敗と感度

追加テスト3件が一度失敗した。テストがprovenanceを20 bytesと見積もっていたため、実copy21との件数差とquota等号の誤りが生じた。デバッグ手順で終端NULを含むbyte列を照合し、fixtureの期待値/上限をliteralの実 `.len()` から計算する形へ修正した。製品の課金/上限は緩めていない。

noexec拒否を一時的に外す感度検証では、policyテストが期待Metadataに対しOk(())となって失敗した（0 passed / 1 failed）。条件を復旧し、全体テスト・Clippyを再実行した。変異は最終ソースに残していない。

## 5. 残課題

trusted device/宣言と親path/receipt/roundの結合、system anchor/root/全祖先再照合、全closure観測構築・seal、全体workモデルと3roundのresource配賦、OS backend/ABI/hidden buffering/cleanup hard期限。許可属性のvalue・ABA・検査後改変・更新lease・実行安全性は本snapshotだけでは証明しない。全体受付・実行permitは無効のまま維持する。

## 6. 最終実行結果

各shellはbdo経由、cargoはoffline/locked。

| コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml scan_ops::tests::normalized` | 11 passed、626 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | **637 passed、5 suites、12.58秒** |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --check --edition 2024 native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |
| `git diff --check` | 成功 |

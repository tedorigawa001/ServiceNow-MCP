# BP-5 R-2 OL-03 MA-02B：同estimate部分projection・専用claim合成検証

Date: 2026-10-24 / Source baseline: `3927c4e` / Scope: offline合成のみ。実機/allocator/運用producer接続なし

## 1. 対象と非実行境界

[MA-02設計draft-0.3 §10](BEST_PRACTICE_BP5_R2_OL03_MA02_MODULE_PROJECTION_DESIGN.md)と[部分projection](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/management_projection.rs)、[合成テスト](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/management_projection/tests.rs)を対象とする。

全5項目Unknown、全体受付無効・telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92・DER/absence停止を維持する。実cap/実layout/完成parts/通常strict差替え・OS/実機・token/設定変更・permit/Pushは含めない。

## 2. 実装とoracle

- 元ProtectedBridgeClaimの専用状態はFresh/Started/Issued/Consuming/Consumed/Stopped。生成/消費の試行を最初のwork前に消費し、Drop/forget/別estimateで再生成できない。reset遷移を拒否し、共有stop/失敗合流で第一理由を元ownerと提示budgetへ保持する。
- 同ScanWorkEstimateを実borrowし、profile/inputs/scope/receipt/origin/started/retryと同bridge ownerを既存guardへ結合する。resource projectionのclaimと独立で、どちらを先に生成しても双方を保持できる。
- MA-02Aの固定recipe23 work＋facts所有コピー1を使い、Unmodeled3/missing8を維持。模擬layout型は接続しない。
- base fixtureのliteral oracleはnormal entries4・要素payload32・key allocation sites4・inline scalars53。要素payloadは実Vec/Rc allocation bytesではなく、4軸/全体管理必要量を出力しない。
- 純粋scalar helperでn=0/1/100000→payload0/8/800000、100001/u64::MAXを拒否。これは全域のaccepted profileを生成した試験ではない。実profile由来の幅/深さfixtureは(0,0)/(1,0)/(12,8)/(64,0)で独立した宣言件数oracleと比較した。
- 生成35 work、消費13 workを実計数し、元I/O/reserved/retry/metadata/topologyは変更せず、session/PolicyCaps/bridge/partsを生成しない。借用を閉じた後に元estimateをmoveできる。

感度確認：要素payloadの係数8を一時的に7へ変異させ、base oracleが期待32に対し28で失敗（exit101）した。変異を復元して対象試験を再実行した。production係数/helperを期待値へ再利用していない。

## 3. 拒否・中断・第一理由

1. Drop/forget/消費/unknown model失敗後の再生成、同budgetの別estimateからの再生成、テスト専用の偽wrapperによる二重消費を拒否。
2. 元と同じoriginを写した別budgetでもcanonical ownerが異なれば生成/消費を拒否し、双方のcheckpointがBindingで停止することを確認。
3. 別estimate・別receipt/profile・同receiptのfresh scope、retry/started/model変更、開始済みsession/generated/used bridge、後続roundを拒否。
4. Started/Issued/Consuming/Consumed各状態で外部Cancelled/Deadline/HashMismatchを与え、ownerにStopped(first_reason)を保持。再begin/別Bindingで上書きしない。
5. 生成35/消費13の全work位置でLimit/Cancelled/Deadlineを注入し、再試行でspentが増えないことを確認。MA-02Aの残量precheckで複数位置が同guardで停止する場合を含む。
6. 部分shape各値/modelの改変を拒否。結果は非Clone/Copy/serde・固定opaque Debug。rawコード/path/pointer/資格情報を出力する口を追加していない。

compile-failによるscope外持出し等の独立試験は今回未実施。上の実borrow/不一致拒否・借用終了後move成功や型trait試験を、compile-fail試験済みと読み替えない。

## 4. 実行結果・途中の問題

初回コンパイルは新規テストの補助関数importが1階層ずれていたためE0432で失敗した。既存resource projectionテストの参照経路と照合し、テスト側import2行だけを修正した。製品のbinding/停止条件は緩めていない。意図的な係数変異の失敗は§2に分離して記録した。

初回clippyにはテスト中のdrop_non_drop/forget_non_drop計4指摘があった。通常の借用終了はスコープで表し、budget-owned claimのabandon/forgetを意図的に調べる2文だけに理由付きallowを付けた。製品型へ空のDropを追加したり、lint全体を無効化したりしていない。その後に全体テスト/clippy/build/整形を再実行した。

| 検査 | 最終結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml management_projection::tests` | 12 test functions成功（既存1018件filter）、係数変異復元後に再実行 |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 全1030件成功、5 suites（既存1018＋新規12） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 最終指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| git diff check・更新3文書の相対リンク/末尾空白 | 通過、19リンク |

commandには指定の`bdo`を付けた。初回import不備・初回lint指摘・意図的変異の失敗を最終結果と分けて記録し、実機/実layout/compile-failを実行済みにしていない。

## 5. 残課題

実layout/容量/allocator由来、全module/拒否prefix/寿命・全4軸と全体coverage、BootstrapCaps・全体work/payload/resource受付、PC-04/運用producer、実cap/clock/失効・完成partsは未対応。projection成功/消費済みは限定された部分検査であり、allocation/scan/実行/cleanupの権限や完了証拠ではない。

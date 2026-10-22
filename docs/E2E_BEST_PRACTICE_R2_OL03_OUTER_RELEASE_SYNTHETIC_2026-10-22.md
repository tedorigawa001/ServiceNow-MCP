# BP-5 R-2 OL-03：外側固定解放・PendingBody消費・最終合流の合成検証

Date: 2026-10-22 / Baseline: `44051c5` / Scope: native private subsetのみ

## 1. 範囲

[外側orchestrator設計draft-0.4 §14](BEST_PRACTICE_BP5_R2_OL03_OUTER_STRICT_ORCHESTRATOR_DESIGN.md)に従い、既存bodyを値所有の外側sectionへ接続した。合成のRecordSource/TopologySource/MetadataOps/ScanOpsとtest-only ResourceInput/Quotasだけを用いる。実署名、PDI、資格情報、コード本文を使った検証ではない。

通常strict.rsとrecords_v2.rsは変更しない。全体受付無効・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止・telemetry保留を維持する。本番policy生成口・OS source接続・実機操作・token発行・設定変更・permit発行は対象外である。

## 2. 実装

- `connection_owner/release.rs`：元source/held/receiptを所有し、既存bodyの借用終了後に固定順でdropする。外側解放sectionに早期return用の`?`は置かない。
- 所有receiptへの参照正規化：入口で元lineage Rc identityとbinding完全一致を要求する。bind済みcomponent一覧だけをコピーし、source・祖先・snapshot・originをそのままmoveする。既存topology ownerの参照同一性検査は緩めない。
- private ReleasePosition：通常drop列が戻った位置でだけ生成する。origin/claim/startedをPendingBodyと元budgetに照合し、値消費で比較結果を取り出す。失敗なら元pending claimと提示budgetを停止する。
- 同budgetの最終checkpointと既存結果合流器を固定接続する。成功結果はcheckpoint成功後だけRecordComparisonへ包む。先行OuterStrictFailureのprimary/phase/innerを理由だけへ縮退させない。
- test-onlyのReleaseWatch/Watchedは実際のfield破棄を観測するためのもので、本番には存在しない。これを本番のcleanup証拠に変換する口はない。

準備費は1＋K work、解放前に払う固定制御費は1 work（K=chain_names数）。既存coupling33と合わせ35＋Kで、既存R/I/collector/typed tail費とは別である。identity消費・最終checkpoint・失敗診断のmoveに新しいworkやheap/I/Oは要求しない。component copyは既存bindの段数/長さ制約下で行い、必要workの不足や取消ではbodyを開始しない。全体受付用上界や運用capの承認を意味しない。

## 3. 新規6テスト

| テスト | 確認内容 |
|---|---|
| `fixed_release_success_and_post_release_cancellation_deadline` | 正常、最後のrecord receipt破棄時の取消、10秒への時刻進行。正常では最終record破棄後のclock観測が1回。取消/期限ではpending成功を拒否 |
| `failures_keep_diagnostics_and_always_run_fixed_release` | receipt hash、外側clock、M4、M4後の解放中取消/期限、binding/lineage不一致、入口work不足、policy未提供。失敗しても固定解放列を通り、phase/primary/inner有無とcheckpoint観測を保持 |
| `actual_scan_completion_diagnostics_survive_release_and_late_cancel` | 全3roundで操作失敗/cleanup未確認を注入。実CompletionFailure、元round、非空summaryとcleanup診断を解放後も保持し、解放中の取消で先行理由を上書きしない |
| `canonical_binding_preparation_and_release_control_reject_every_work_prefix` | 準備1＋K＋固定制御1の全work不足prefixと各課金位置の取消。scan未開始・固定解放を確認 |
| `real_pending_body_requires_matching_position_and_original_budget_identity` | 実bodyから得たPendingBodyを使用。正常消費、position側origin/claim/started破損、budget側origin/claim/started破損の計7条件。破損ではBindingで元claimと提示budgetを停止 |
| `release_position_is_move_only_small_and_not_serializable` | ReleasePositionの非Clone/非Copy/非Serialize/非DeserializeOwned、64 bytes以下。PendingBodyの同種制約は既存テストも継続 |

解放watchは、RecordSource→TopologySource→held resource全解放済み→TopologyReceipt→RecordReceiptの順を確認する。最後のwatchはpinsより後のfieldにあり、scanのlive handleが空であることも確認する。component bufferはheldの後・receiptの前に明示dropする。caller所有のbound/context/registry/groupsまで解放したとはしない。

stickyなbody失敗がある場合、最終checkpointは先行理由で短絡し得る。その場合はStopped(primary)と記録し、取消/期限を別原因として観測したことにはしない。既存結果合流器テストのsummary前後完全一致確認も継続する。

## 4. 初回失敗・変異検証

1. 最初の正常owningテストはTopologyPrepare/Bindingで拒否された。所有receiptのmoveにより、caller側の同値bindingと所有receiptのアドレスが異なっていた。元lineage/valueを先に検査して所有receiptへの参照だけを正規化し、既存のポインタidentity guardは維持した。修正後は正常系が到達した。
2. テスト拡張時、summary_attemptsのOption配列を整数として扱ったためコンパイルに失敗した。型どおりの非空summary検査へ訂正し、全テストを再実行した。
3. 最終合流/checkpointを省略する変異を一時適用すると、最終clock観測を要求する正常/遅延結果テストが失敗した（終了コード101）。
4. PendingBodyのidentity照合を省略する変異では、identity破損を拒否するテストが失敗した（終了コード101）。

両変異は復元し、以下の最終検証は復元後のソースで行った。失敗を成功件数へ算入していない。

## 5. 最終検証

| コマンド | 結果 |
|---|---|
| `bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 884 passed / 5 suites、失敗0（baseline 878＋新規6） |
| `bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功、指摘なし |
| `bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |
| 通常strict.rs / records_v2.rsの差分 | なし |

## 6. 限界と残課題

SequenceReturnedは通常drop呼出しが戻った診断であって、実OS close成功・bounded Drop・全メモリの消去証明ではない。panic/abort/kill/停止しないDropの終了報告は保証しない。合成のRecordComparisonもUnverifiedXmlのentitlement gateを維持し、実行許可ではない。

次工程は、通常strictの保護入力bridgeと上位structured診断所有先、追加O費を含む全体work/resource上界・3round配賦の整合確認である。本番policy供給・OS source・明示解放確認は別途設計/承認が必要であり、今回の合成成功で自動解除しない。

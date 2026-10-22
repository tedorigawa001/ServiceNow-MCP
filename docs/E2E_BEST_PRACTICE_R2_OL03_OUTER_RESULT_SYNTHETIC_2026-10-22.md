# BP-5 R-2 OL-03：OuterStrictFailure・診断保持結果合流器 合成検証

Date: 2026-10-22 / Design baseline: `526f6d3` / Kind: ローカル合成検証。実orchestrator・OS/PDI検証ではない。

## 1. 範囲

[外側orchestrator設計draft-0.2 §12](BEST_PRACTICE_BP5_R2_OL03_OUTER_STRICT_ORCHESTRATOR_DESIGN.md)の実装順①として、診断型・限定観測enum・結果合流器だけを実装した。

- `connection_owner/outer_result.rs`：OuterStrictFailure、OuterPhase、DropObservation、PostReleaseCheckpoint、merge_after_release。
- `collector/tests/session_bridge/outer_result.rs`：実kernel由来の診断と合成の時計/取消/Dropを使う6テスト。
- 通常strictのorchestrator、receipt/外側clock/解放sectionの接続、上位の戻り値は変更しない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。OS接続・実機操作・token発行・設定変更・本番policy投入・permit発行は行わない。

## 2. 実装上の不変条件

OuterStrictFailureは非Clone/非Copy/非serde、private fieldとopaque Debugを持つinline診断。plainは元budget.stopの先行理由を採用する。from_innerはStrictInspectionFailureを理由だけに変換せず、roundと実CompletionFailureごと一度moveする。限定accessorはread-only。

合流器はbodyがErrでも元budget.checkpointを一度評価し、元診断を失わず観測を追記する。body ErrはcheckpointがPassedでもErrで、元理由を再通知する。body Okは解放観測SequenceReturnedとcheckpoint Passedの両方が必要。取消/期限等で止まればpending値を破棄し、innerなしのPostReleaseCheckpoint失敗にする。解放未到達はRelease/Unavailableで拒否する。

失敗作成・移動・合流は新work/I/O/heap確保を要求しない。診断の利用者が後でformat/保存するときの確保まで不要と主張しない。既存collector/tail/ack/追加30 workのmodelを変更していない。

## 3. 新規6テスト

| テスト | 確認内容 |
|---|---|
| `outer_result_rejects_late_success_after_release_and_drops_pending_value` | 元時計を10秒境界へ進めた後に合流し、DeadlineとPostReleaseCheckpoint起点を記録。pending値のDropを一度だけ観測、架空のinnerを生成しない |
| `outer_result_success_requires_returned_release_and_a_passing_checkpoint` | 正常Tの通過、解放未到達の拒否、合成resourceのDropが取消を立てた後の成功拒否、round=Noneを確認 |
| `outer_plain_failure_latches_original_reason_and_never_needs_work_credit` | 全12phase×解放2状態で、元HashMismatchとphaseを保持。work上限100万のまま合流し、取消/別理由で上書きしない。既にExpiredが先行する場合もplainのChangedで置換しない |
| `outer_result_moves_real_kernel_failures_without_losing_round_cleanup_or_summary` | 全3round×操作失敗/hash不一致/解放未確認/Quotas欠落の12組＋InitialのResourcePolicy欠落。実kernel由来のConfirmed/Incomplete/NotStartedとsummary、DeclarationIncomplete/ReleaseUnconfirmedを保持。owner停止通知の戻り値で置換せず、owner/source/record破棄後も保持。work上限・取消・期限追加後も主理由/phase/roundを維持 |
| `outer_failure_remains_failure_even_if_an_inconsistent_checkpoint_passes` | cfg(test)でのみ失敗latchを故意に消す不整合を作り、Passed観測でも元Changed/Receiptを保持して再latch。製品にreset APIは追加しない |
| `outer_failure_is_bounded_opaque_and_not_clone_copy_or_serializable` | Clone/Copy/serdeの非実装、inline size384 bytes以下、Debugが固定文言だけであることを確認 |

実kernel診断試験のBeforeM4/AfterM4 slot取得はtest-only口を使用する。M4実施を主張するものではなく、既存の固定位置/M4結合テストとは分ける。合流器は新たなcleanup/round証拠を作らない。

## 4. TDD・変異検証

1. 遅延成功拒否テストを先に追加し、outer_result module未実装のコンパイル失敗を確認した。
2. 最小の内部型と合流器を実装し、当該テストを成功させた。その後、4通りの結果合流、実診断保持、型/サイズ等へ拡張した。
3. from_innerで構造化frameを捨てる一時変異は、実kernel診断テストがround欠落を検出して失敗した。
4. 最終checkpointを実行せずPassedとする一時変異は、遅延成功拒否テストが失敗した。
5. 両変異を復元して全体検証を行った。変異は保存していない。

## 5. 最終検証

```bash
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git diff --check
```

- Rust全体：**871 passed、0 failed、5 suites**（baseline865＋新規6）。
- Clippy（警告をエラー扱い）、release build、rustfmt、diff check：成功。
- 通常strict.rsとrecords_v2.rs：差分なし。

## 6. 残る契約

合流器は汎用Tと解放観測を受ける診断部品であり、RecordComparison/permitを生成せず、解放やreceipt/budget identityの証拠を検証しない。元budgetを保持して実解放後に呼ぶ固定callerの接続は次工程。今回のenumを実解放証拠、汎用Tの通過をstrict成功と扱ってはならない。

未接続：ownerのbody完了helper、receipt/外側clockからのorchestrator、実解放section/解放後checkpointの順序結合、上位のstructured診断所有先、新O費/resource上界、OS close確認。全体受付無効・telemetry保留を維持する。

# BP-5 R-2 OL-03：scan_ops型付きcleanup終端証拠の合成検証

Date: 2026-10-21 / Baseline: `f59f412` / Scope: offline synthetic only

## 1. 実装範囲

[終了証拠設計draft-0.3 §13](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)に従い、OutcomeへCleanupDispositionを追加。NotStarted、Confirmed(ClosedScanResources)、Incomplete(有限診断)を区別する。主ResultとSummaryを置き換えず、失敗時にも保持する。constructor/fieldはprivateで、数値Summaryからの再構築やserde/Clone/Copyはない。

元local Ledger/budget由来、one-shot終了claim、実Owner/予約/宣言/retry残、取得成功serialとcleanup試行、session mirror/累積保存則を照合する。Connection/slotを退役し、seal後の新dispatchを禁止する。確認できたcleanupはscan成功・strict成功・全ownerのOS解放を意味しない。

全体受付無効、telemetry保留、運用policyなし。通常strict接続、OS接続、実機操作、token発行、設定変更、permit発行は行わない。

## 2. 新規10テスト

| ケース | 内容 |
|---|---|
| cleanup_distinguishes_no_boundary_from_started_and_closed_zero_owner_boundary | 未開始と、開始後に取得0で閉じた境界を区別。source操作0でも開始identityが必要 |
| main_failure_and_cleanup_status_are_independent_and_diagnostics_survive | 主HashMismatchを保持し、cleanup確認/未確認を別表示。取得/解放各1回 |
| late_acquire_cancellation_and_deadline_keep_cleanup_and_first_reason | 遅延成功handleのRAII化後に取消/期限停止。cleanup状態2通り×2理由、元理由維持 |
| prepaid_terminal_report_survives_work_exhaustion_without_fabricating_start | 残work0/1はNotStarted、2は主Limitだがcleanup確認、3で正常。payload予約17/retry残8維持 |
| pending_retry_abandoned_declaration_and_forgotten_owner_never_become_confirmed | 実EINTR pending、実DeclaredFile放棄、forgotten Owner、合成live予約残を拒否 |
| finalizer_claim_is_one_shot_and_zero_summary_cannot_replace_acquisition_history | 終了の二重発行拒否。Summary全0でも成功取得履歴と不一致なら拒否 |
| evidence_debug_is_opaque_and_types_are_not_clone_copy_or_serializable | 固定Debug label。Clone/Copy/Serialize/DeserializeOwnedを実装しないことを型の曖昧性検査で確認 |
| sealed_local_attempt_rejects_a_new_dispatch_before_source_io | privateな同Ledger alias fixtureからの新取得を、source操作前に拒否 |
| fixed_bridge_moves_typed_cleanup_for_success_failure_and_no_boundary | 固定bridgeを通す7ケース。失敗Outcome、未開始、late stopでもtyped情報とSummary保持 |
| terminal_mirror_and_cumulative_corruption_never_issue_closed_evidence_or_hide_first_error | round mirror/累積だけの破壊×正常/先行Changedの4条件。証拠拒否、元Failure維持 |

既存session bridgeの3round成功/9種失敗にもtyped診断を検査するassertを追加。試験用のraw resourceは数値descriptorではなく、OSへの操作はない。正常3roundの進行は引き続きcfg(test) ackであり、本番ackの試験ではない。

## 3. 費目と互換性

終端用prepay1をboundary開始時に追加し、停止後は追加課金せず分類/照合/sealを行う。元のdispatch/cleanupのprepayと終端workは維持し、試行/bytesの二重加算はない。型付き証拠は取得したresourceの解放後、元source所有の破棄後に発行する。

work/entry/session-entry modelを0.2へ改版、cleanup submodel0.1を照合。calculator controlの固定費37→38、独立oracleの同項も変更した。実費はkernel1903、単一bridge1992、session1994（最初のEINTR round1997）。上界はr=8で2042、base2015、残3round6072。resource数量0.2の操作式は不変でkernel bindingだけ更新する。

新費目追加後の初回全体試験では、低水準の旧work期待値/不足prefixに12件の失敗が出た。課金経路を確認し、scopeごとの追加1 workによる差と切り分け、成功境界と全不足prefixを1ずつ更新した。source操作数・bytes・snapshot1回の18 workは変更していない。limitを緩める対応ではない。

## 4. 最終検証

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 最終状態で793 passed、5 suites、10.92秒（新規10件） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |
| 文書検査 | 設計/親2文書/本記録の4文書、相対リンク28件、fence対応・末尾改行/空白を確認（節anchor内容は未自動照合） |

最初に未実装のtyped APIに対する小さな試験を追加し、Outcome.cleanup/型の不存在による失敗（E0609/E0433）を確認してから実装した。解放未確認の拒否guardを一時的に外す変異では、`main_failure_and_cleanup_status_are_independent_and_diagnostics_survive` がexit 101で失敗した。guardを復元後に全体を再検証し、診断reasonの読取専用コードも含めた最終状態で上記を確認した。変異は残していない。

783件は基準時点の成績であり、今回の結果は新たに実行した793件である。通常strict本体、MCP実装、package/依存設定に差分がないことも確認した。通常strict/実機の検証成績を主張するものではない。

## 5. 残課題

- RoundScanSuccess/round完了/strict acknowledgementのproducerと通常strict接続は未実装。
- Closedのbudget/実行/session bindingを後続消費へ接続する際の寿命/one-shot/late stop試験。
- 管理allocation、outer held owner、運用policy、全体I/R/O、host終了報告/OS真実性は未承認。
- 本試験のConfirmedをpermitや全体cleanup成功へ変換しない。

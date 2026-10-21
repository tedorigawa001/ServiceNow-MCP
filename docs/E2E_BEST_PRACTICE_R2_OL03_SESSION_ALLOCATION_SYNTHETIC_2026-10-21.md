# BP-5 R-2 OL-03：session累積配賦・返却の合成検証

Date: 2026-10-21 / Scope: offline synthetic only

## 1. 対象

[3round台帳設計§18](BEST_PRACTICE_BP5_R2_OL03_THREE_ROUND_RESOURCE_LEDGER_DESIGN.md#18-session累積枠予約返却の内部実装draft-06)に従い、session/resources.rsへ内部ResourcePolicy、累積/round会計、取得予約、Ownerの一度限りcleanupを追加。policyの本番constructorはない。既存sessionのclaim・receipt/round/budget結合を維持する。

全体受付無効、telemetry保留、運用policy未投入。OS接続、実機操作、token発行、設定変更、permit発行、Pushは実施しない。これはsource callbackを合成resourceで動かした試験であり、ScanOps/完全collectorの強制接続やOS FDの検証ではない。

## 2. 新規13テスト

| ケース | 確認 |
|---|---|
| three_round_cumulative_counts_names_and_peak_are_not_reset_or_summed | test専用ackで3round。各1 Open/Enum/Read、2 Metadata/cleanup、総7ずつ、累積21。names63、peak2、cleanup6、既存payload/retry/start不変 |
| every_round_and_session_cap_blocks_before_the_source_and_never_partially_commits | session/roundそれぞれ分類、Cleanup、総数、live、names不足の10条件。source 0回、片側commitなし |
| session_exhaustion_in_second_round_is_not_refilled_by_fresh_round_capacity | 2round目はround枠が余っていても累積Read上限で停止、既消費1を保持 |
| source_failure_returns_only_unused_reservations_not_attempts_or_work | handleなし失敗、予約だけ返却。Open1/work2を保持、架空cleanupを加算しない |
| prepaid_cleanup_runs_for_all_owners_after_cancel_deadline_or_work_failure | 取消/期限/work上限/先行HashMismatchの4条件。2ownerを各1回解放、未確認1を別保持、先行理由維持 |
| late_success_is_owned_then_released_before_returning_cancellation | acquire callback内取消でも成功resourceは先に所有、cleanup1、live/予約0 |
| pure_candidate_overflow_and_total_cleanup_reservation_are_fail_closed | 5種類のchecked overflowと、予約済cleanupを押し退ける通常試行を拒否 |
| no_policy_unknown_model_reconfiguration_and_leaked_owner_never_allow_success | 未設定/未知model/再設定/forgotten Ownerを拒否。残をresetしない |
| held_owner_exhausts_peak_and_cleanup_capacity_without_refunding_consumption | session/roundのlive/Cleanup上限4条件。2個目のsource呼出しなし、最初のOwnerは一度解放 |
| precharge_failure_never_commits_reservations_or_calls_source | acquireの残work0/1。dispatch0、予約/消費0、spent workは保持 |
| unconfirmed_cleanup_is_sticky_and_blocks_reuse_even_with_zero_live | cleanup未確認後、live0でも次acquire拒否。再解放/容量回復なし |
| malformed_and_late_name_copies_keep_bounded_actual_bytes | 不正65537応答と遅延21byte応答。実消費65536/21を保持し停止 |
| operation_boundary_rejects_another_budget_and_nonowning_open | 別budgetと非所有Openをsource前にBindingで拒否 |

## 3. 費用・失敗理由

policy設定1 work、scope require1、通常試行1、acquire2（cleanup prepayを含む）。round/session両側候補の全検査・課金後だけcommit。Owner Dropは追加work不要で元予約を実Cleanupへ変換。境界のcancel/deadline/work失敗と既存理由は共有claim/budgetに残る。新session、round切替、summary加算による満額補充はない。

policyとaccountingの管理allocation/外側保持resourceは全体受付に未統合。retryは元SharedBudgetから補充せず、payloadを第二の台帳へ再課金しない。量モデルからpolicyを発行せず、正常終了のfixtureはcfg(test)だけ。本番strict ack/完了setterは追加していない。

## 4. 検証結果

テスト対象はnative/r2-outer。以下はいずれもexit 0（意図した変異試験を除く）。

| コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml session::resources` | 新規13 passed、既存762 filtered |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 変異復元後775 passed、5 suites、11.83秒 |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |
| 文書検査 | 設計書/本記録2文書、相対リンク9件の存在、fence対応、末尾改行/空白を確認（節anchor内容は未自動照合） |

session capの候補検査だけをround capへ置換する変異を一時適用した。`session_exhaustion_in_second_round_is_not_refilled_by_fresh_round_capacity` がexit 101で失敗し、累積枠を失う退行を検出した。元のsession cap検査へ復元後、上記の全体775テストを再実行した。変異は残していない。

## 5. 残課題

- 固定collector/scan_opsの各試行・予約・summaryとの接続と、二重会計防止。既存scan_ops::Boundary::beginと本prepareはどちらもdispatch1＋cleanup prepay1を課金し、scan単位Ledgerとsession Usedが同じ試行を別々に数えるため、設計§18.4の(a)置換／(b)scan_ops正・session検査のみのいずれかを選んでmodelを改版する。
- sourceからのtyped cleanup証拠、strict acknowledgement、AfterM4完了の本番producer。
- 会計費を含むwork model更新、保護されたresource policy、role外側owner/管理allocationを含む全体受付。
- 実sourceの契約、OS内部の挙動、実機/permitは別承認。telemetryは保留。

# BP-5 R-2 OL-03：固定round kernel・owner完了処理 合成検証

Date: 2026-10-22 / Kind: ローカル合成検証（PDI・OS source・署名APIの実接続ではない）

## 1. 範囲

[接続設計draft-0.5 §12](BEST_PRACTICE_BP5_R2_OL03_NORMAL_STRICT_CONNECTION_DESIGN.md)の固定round kernelを実装した。RoundSlotを消費して元source/ledgerから実collector・型付きtail・実ackへ接続し、with_round末尾checkpointとowner完了guardの両方が成功した場合だけ進む。

通常strict.rs全体の差替えやproduction topology成功口の接続は行わない。全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。本番policy・OS接続・実機操作・token発行・設定変更・permit発行は含まない。

## 2. 実装

- `scan_ops/connection_owner/kernel.rs`：non-testの固定callee。ownerが保持するsourceとslotだけを使用し、成功callback・test ack・台帳再生成は使わない。
- `collector::collect_owned_round`：元private completion calleeへのscan_ops限定bridge。既存calleeの可視範囲を広げず、任意Outcomeからの成功生成を認めない。
- topologyのcfg(test) fixtureは重複kernelを削除し、同じ実kernelへ委譲した。non-test compareはBeforeM4位置でUnavailable停止する従来のまま。
- typed stageのCompletionFailureを元round・cleanup・summaryとともに保持。ack後の停止には新しいcleanup証拠を作らない。
- `O.kernel_complete=2 work/round` を追加。with_round末尾の後の時刻観測は6回。既存collector/tail/ack modelに吸収せず、全体受付には使用しない。

## 3. 新規4テスト

対象：`collector/tests/session_bridge/round_kernel.rs`。

| テスト | 確認内容 |
|---|---|
| `fixed_round_kernel_requires_real_ack_for_each_owned_slot` | 合成の同ownerで3slotを順に消費し、各実ackを元台帳で確認。元RecordSourceの再読cycle6、record handle数と解放数の一致、scan resource残存0。Before/AfterM4の取得はtest-onlyのslot口であり実M4成功の主張ではない |
| `fixed_round_kernel_terminal_checkpoint_rejects_success_after_actual_ack` | 正常系の時計観測数から末尾境界を特定。ack内の最後のcheckpoint失敗ではConfirmed診断保持、次のwith_round末尾失敗では診断なしでDeadline停止。直前に取消を立てた場合もCancelled停止。後続6観測点の期限切れでも再開不可 |
| `fixed_round_kernel_preserves_precheck_collector_and_policy_failure_diagnostics` | precheckのReadFailedはcleanup票なし。policy未提供はUnavailable/NotStarted/summaryなし、scan操作0。digest不一致はHashMismatch＋DeclarationIncomplete、解放未確認はUnavailable＋ReleaseUnconfirmed、いずれも元summary保持。失敗後の再取得と別理由による上書きを拒否 |
| `fixed_round_kernel_owner_completion_guards_charge_two_units_and_reject_late_stop` | owner完了の2課金それぞれの不足でLimit、各課金後の取消でCancelled。実費を返金せず、ack後なのでcleanup票を再構築しない |

index decodeはkernel内の `scope.decode` 1箇所と、with_roundのone-shot decode契約で1回/roundを維持する。本テストで独立したdecode計数器を追加したわけではない。record厳密検証は前後の既存固定stageを呼び、既存の検証器・上限を変更していない。

## 4. TDD・変異・初回失敗

1. 正常系テストを先に追加し、`run_fixed` 未実装のコンパイル失敗を確認した。fixtureの存在しないmade/freed参照は既存alive集合の確認へ訂正した後、未実装だけで失敗することを再確認した。
2. 固定kernel接続後、正常系成功を確認した。
3. 失敗検証の初回は、digest不一致をChanged/Confirmedと期待して失敗した。既存collector契約を照合し、実際はHashMismatchで、未完了宣言を残すためcleanupはDeclarationIncompleteであることを確認して採点側を訂正した。製品側の失敗分類・cleanup判定は変更していない。
4. 実ack呼出しを一時的にdropへ置換した変異では正常系テストが失敗した。変異を復元し全体テストを再実行した。変異は保存していない。
5. 初回ClippyはprivateなScanOps/Quotasに対してkernelの可視範囲が広いとして拒否した。型を公開せず、methodをscan_ops限定、trait boundをmethod側へ移し、再実行した。

## 5. 最終実行結果

いずれもローカルで既存lockfile・offlineを使用。Cargoのtargetへのビルド出力は作成するが、実ServiceNow/OS接続は行わない。

```bash
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git diff --check
```

- Rust全体：**862 passed、0 failed、5 suites**（前工程858＋新規4）。
- topology adapter既存11テスト：実kernelへの委譲後も成功。全体862件に含む。
- Clippy：警告をエラーとして成功。
- release build、rustfmt check、diff check：成功。

## 6. 残る境界

通常strictの固定topology callback/AfterM4完了口、外側clock・解放後checkpoint・上位診断引渡しは別工程。今回の3slot成功は合成sourceによる内部kernelの確認であり、M4/実OS/実機の成功や運用permitではない。元予算・retryを維持し、本番ResourcePolicy/Quotasを生成しない。全体受付に向けた全費目上界と運用cap承認も未実施。

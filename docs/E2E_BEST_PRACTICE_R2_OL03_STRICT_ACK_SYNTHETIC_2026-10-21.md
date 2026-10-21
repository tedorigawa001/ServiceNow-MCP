# BP-5 R-2 OL-03：strict acknowledgement 合成検証

Date: 2026-10-21 / Baseline: `801adcd` / Scope: 内部typed遷移、合成sourceのみ

## 1. 対象と停止範囲

[終了証拠設計draft-0.9 §19](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)に基づき、FinalClockRoundを消費してprivate StrictAcknowledgementを発行し、同呼出し内でsessionへ一度だけ消費する。元lease/Closedと同Finished phaseを要求し、数値・bool・任意callbackから証拠を作らない。

全体受付は無効、telemetry調査は保留。通常strict orchestrator・M4 owner・OS sourceへは接続せず、実機操作・token発行・設定変更・本番policy投入・permit発行は行わない。これは署名済み本番配備や実PDI検証の成績ではない。

## 2. 実装

- sessionのslot別ack_startedを最初のfallible処理前に消費し、失敗でも戻さない。
- complete/AfterScan/record/FinalIndex/最終clock claim、AwaitStrict、元budget/origin/開始時刻、同Closed/session/receipt/round、同scopeのFinished phaseを照合。
- privateな非Clone/非Copy/非serdeのackがlease・ScanTailData・固定modelを所有する。producer/consumerは独立literal `bp5-r2-strict-ack-0.1` を照合し、await/外部handoffなしで即時消費する。
- 最終checkpoint成功後だけExpect(BeforeM4)/Expect(AfterM4)/Finishedとcompletedを設定する。失敗時はStopped、元FailureとConfirmed cleanup/summaryを保持する。
- O.strict_ack=3 work/round、3round追加9。既存kernel/phase上界は不変。新しい操作/bytes/retry/resource予約・Observation保持・record/index decodeは追加しない。
- FinalClockRoundのtest-only ackを削除し、既存最終clockの3slotテストも実ackへ置換。前段component試験のcfg(test) bypassは別扱い。

## 3. 新規6テストと確認範囲

| テスト | 確認 |
|---|---|
| 実typed ackの3slot | 実固定collector→AfterScan→record厳密検証→FinalIndex→最終clock→実ack。fixture ack不使用。各ack3 work、最後だけFinished |
| 重複とbinding | 重複claim、別origin/claim/開始時刻、別Finished phase、既存Changedを拒否。追加source操作なし |
| work/取消 | 残work 0/1/2、全3課金後の取消で停止し、claim・主理由・cleanup診断を保持 |
| checkpoint | 全8checkpointで期限切れ、事前取消/期限で停止。8箇所は固定期待値とし、実装がcheckpointを省いても試験範囲を縮めない |
| 外側の失敗 | Initial後のExpect状態とAfterM4後のFinished状態の両方で、with_round末尾の取消/期限を成功へ変換しない。sticky budgetにより次beginを拒否 |
| 型の制約 | private ackがClone/Copy/Serialize/DeserializeOwnedを実装しないことをコンパイル時に照合 |

成功/拒否時ともsource時計・record操作、scan操作、共有bytes/retry/操作枠、record検証回数の不増を確認する。別phaseを準備する拒否fixtureだけindex decodeを1追加するが、新ack自身のdecodeではない。ObservationはAfterScanで1回破棄され、その後増えない。receipt/round identityは実Closedと元leaseの照合を経由し、別receiptを受理する新しい入力口はない。

## 4. 変異検証

1. consumerのsession状態更新を一時的に省略した。3slotテストは次roundのBindingで失敗（exit 101）。元の更新へ復元した。
2. consumer最後のcheckpointを一時的に省略した。8番目で期限切れを注入するテストは `unwrap_err()` が `Ok(())` を受け取り失敗（exit 101）。checkpointへ復元した。

いずれも一時変異であり、恒久的な省略やfallbackは導入しない。合成fixtureとテストを再利用した内部契約試験で、独立した未使用ケースによる性能評価ではない。

## 5. 復元後の検証

- `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`：836 passed、5 suites（基準830＋新規6）。
- `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings`：指摘なし。
- `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml`：成功。
- `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` と `git diff --check`：成功。
- 更新4文書・相対リンク47件のリンク先、コードフェンス・末尾改行・行末空白を検査。

## 6. 残課題

通常strictの固定3箇所への接続・同RecordSourceの連続借用・M4 ownerとの結合、全体work/resource受付・運用capの承認、OS source接続は別工程。内部Finishedはinspection全体の成功、外側cleanup完了、M4実施、実行permitの代用ではない。外側bodyはwith_roundの戻り値と元budgetの失敗を必ず伝播する必要がある。

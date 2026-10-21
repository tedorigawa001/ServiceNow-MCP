# BP-5 R-2 OL-03：最終clock／checkpoint stage合成検証

Date: 2026-10-21 / Baseline: `8f5e35c` / Scope: offline synthetic only

## 1. 範囲

[終了証拠設計draft-0.8 §18](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)に従い、FinalIndexRoundを消費して実clock_check(source, receipt, budget, 450000)と終端work/checkpointを実行し、成功後だけFinalClockRoundを返す。元session/slotのfinal_clock_startedをfallible処理前に消費し、AwaitStrict・前段claim・元budget/Closed・同scopeのFinished phaseへ結合する。

ClockReadingはhelperで破棄し、数値時刻/検証済みboolをcaller入力や成功証拠にしない。新stageは元lease/ScanTailDataだけを保持し、Observation/JSON/record bytes/ClockReadingを持たない。private constructor、非Clone/非Copy/非serde、opaque Debugを維持する。失敗では主理由とConfirmed cleanup/summaryを残し、claimを戻さない。未ack drop/forgetでは次roundを拒否する。

通常strictの呼出し順序とclock_check本体は変更していない。全体受付無効・telemetry保留・運用policyなし。通常strict/OS接続・実機操作・token発行・設定変更・permit発行なし。production strict acknowledgementは未実装である。

## 2. 新規7テスト

| ケース | 検査 |
|---|---|
| actual_final_clock_and_terminal_checkpoint_issue_only_ack_pending_stage | 実collector→AfterScan→record再検証→FinalIndexから最終clockへ到達。旧clock費0に対し追加control3、source.clock1回。未ack drop/forget後の次round拒否 |
| final_clock_binding_and_claim_fail_before_clock_source | 重複claim、別scopeの実Finished phase、別origin/claim/started、先行Changedでsource操作0の拒否/元理由保持 |
| final_clock_work_and_post_charge_cancel_prefixes_keep_cleanup | 残work0/1/2、各3課金の直後の取消で成功stageなし、cleanup/summary保持 |
| every_time_sample_and_checkpoint_failure_stops_before_publication | 全11 budget.now読取境界と開始前取消/期限で停止。最終checkpointも対象。elapsed直接読取のExpiredは既存仕様として区別 |
| clock_source_error_skew_and_late_result_keep_first_failure | source ReadFailed、late取消/期限、wall/mono skewを拒否。late成功やcleanup診断で主理由を上書きしない |
| final_clock_stage_is_not_clone_copy_or_serializable | FinalClockRoundのClone/Copy/Serialize/DeserializeOwned不実装を型検査 |
| three_slots_run_one_final_clock_each_without_a_production_ack | 同inspection/budgetの3slotで各1 clock試行/3 workを確認。ackのみcfg(test)で模擬 |

既存の正常record fixtureとRecordFakeを再利用した内部契約試験で、実OS clock/実機の測定ではない。別scopeのphaseはtest-only Observationで実AfterScan/finishを通してFinishedにし、状態名だけではなく正確なscope照合を検査する。Source ownerはborrowのまま生存し、最終clockで新規handle/byte読み取りは発生しない。

## 3. 費目と時間分類

固定submodel `bp5-r2-round-final-clock-0.1` をstageとhelperの独立literalで照合する。O.final_clock_stage=3 work（claim/owner/phase binding1、helper/model1、終端1）。旧最終clockと同じsource試行1を元topology_callsへ計上し、bytes/retry/scan試行/予約を増加・返金・再発行しない。3round追加controlは9。既存kernel/phaseの費目/上界を緩めず、全体work/resource受付は無効のまま。

fixture成功経路はbudget.now読取11回：checkpoint由来10回とclock_check内のelapsed直接読取1回。7番目の直接読取で10秒ジャンプを観測した場合、既存clock整合性がExpiredを先に返す。その他のcheckpoint境界はDeadlineとなる。今回この分類は変更せず、どちらも新stageを返さず停止することを確認した。wall/monotonic skewのExpiredとも原因を区別し、hard期限/CPU/RSS/OS trustの証明とはしない。

## 4. 実行履歴・最終検証

初回の新規6テストは成功し、3round試験を加えて7件とした。固定helperの実clock_check呼出しだけを一時的に省く変異では、clock source errorの拒否試験がexit101で失敗し、誤ったFinalClockRound発行を検知した。呼出しを復元後、全体を以下のとおり再実行した。変異は残していない。

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 830 passed、5 suites、13.42秒（基準823＋新規7） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功、警告なし |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |
| 文書検査 | 設計/親2文書/本記録の4文書・相対リンク44件、fence対応・末尾改行/空白を確認（節anchor内容は未自動照合） |

## 5. 次工程

実tail由来のStrictAcknowledgement producer/consumerが残る。FinalClockRoundだけでsessionをFinished/次Expectへ進めず、ack消費時の元budget checkpointと、with_round末尾checkpoint失敗を成功へ変換しない所有順序が必要。通常strict固定位置/source供給接続・運用policy/全体受付・OS sourceは未対応。telemetryは保留のまま。

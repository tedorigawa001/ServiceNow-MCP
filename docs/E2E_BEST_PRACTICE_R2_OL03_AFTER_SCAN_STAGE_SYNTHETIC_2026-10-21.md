# BP-5 R-2 OL-03：AfterScan後のObservation破棄stage合成検証

Date: 2026-10-21 / Baseline: `d0116b3` / Scope: offline synthetic only

## 1. 範囲

[終了証拠設計draft-0.5 §15](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)に従い、PendingStrictRoundを消費して実IndexPhases::after_scanを実行し、Observationを明示dropしてからAfterScanRoundへ移す。新stageはleaseとScanTailData（Closed/数値summary）だけを保持し、Observation/Vecやそのborrowを持たない。bool/既実行申告/任意callbackを成功producerにしない。

同session/slotのafter_scan_startedをfallible処理前に一度だけ消費する。AwaitStrict・元budget・元Closed/session binding、同RoundScope objectと固定submodelを照合し、既存AfterScanのidentity/index再認証/全集合照合を省略しない。破棄後にも元budgetの終端work/checkpointを通し、失敗は元Failureを保持してStoppedへ移る。

全体受付無効、telemetry保留。通常strict接続・OS/API接続・実機操作・token発行・設定変更・permit発行なし。production strict acknowledgementは未実装。新stageのdrop/forgetでも次round権限はない。3round試験のackのみcfg(test)で明示的に模擬する。

## 2. 新規6テスト

| ケース | 検査 |
|---|---|
| after_scan_stage_drops_observation_before_return_and_preserves_phase_finish | stage生存中にObservationが1回だけdrop済み、Inputsをdrop後にphaseをmutable使用/finish可能。未ack drop/forget後は次round拒否。旧経路との実費差は3 work |
| duplicate_claim_compared_phase_wrong_phase_and_changed_set_are_rejected | 重複claim、既にCompared、同値だが別scopeのphase、Observation集合破壊、別budget originを拒否。Confirmed cleanup/summary診断保持 |
| all_work_shortage_and_post_charge_cancel_prefixes_stop_and_release_observation_once | 実測成功費を基準に全不足prefixと各課金直後の取消を網羅。stageを返さず、元理由とdrop回数1を維持 |
| late_stop_including_after_observation_release_keeps_closed_diagnostics | 開始前およびObservation破棄後の取消/期限切れを拒否。終端guardが成功stageの公開前に効く |
| after_scan_stage_is_not_clone_copy_or_serializable | AfterScanRoundのClone/Copy/Serialize/DeserializeOwned不実装を型検査 |
| each_round_releases_its_observation_before_test_only_acknowledgement | 3slotごとに実Closed→Pending→実AfterScan→drop→新stage→FinalIndexを確認。ackだけはtest-only。source試行合計2628は不変 |

既存合成fixtureを再利用した内部所有/契約試験であり、未使用の人手評価ケースや実OS上のメモリ測定ではない。test-only probeは実OwnedObservationのDropを数え、関数が返った後もstageが生存している時点で1回破棄済みであることを確認する。probe/集合破壊/claim破壊/ack補助はcfg(test)だけに置く。

## 3. 費目・互換性

固定submodel `bp5-r2-round-after-scan-0.1` をstage呼出しとphaseの独立literalで照合する。追加control費O.after_scan_stageは3 work（claim/binding1、phase owner/model1、Observation破棄後の終端1）。実AfterScanの既存費を全て課金し、旧経路費＋3を比較する。3round分の追加controlは9。既存kernel/bridge/round-completion/phaseの上界やoperation/bytes、retry、reservedを変更/返金しない。

Observationの既存Rust field dropを早い位置へ移す。payload copyや新規allocationはなく、破棄後の失敗診断にもObservationを残さない。implicit field dropのCPU/RSS/allocator保証や全体work受付の証明ではない。固定長CompletionFailureの既存result_large_err局所allowは維持し、新しいstage遷移にも同じ理由を記載した。

## 4. 実行履歴と最終検証

最初の新規5テストは成功し、3round試験を加えた初回全体も808件成功した。初回release buildには不要なmut selfの警告が1件あり、clippy -D warningsはその1件で失敗した。該当する新遷移メソッドの指定だけを除去し、警告抑止やcap緩和は行わなかった。

Observationのdropを一時的にforgetへ置き換える変異では、破棄試験がexit101で失敗（drop回数0、期待1）した。元の明示dropへ復元し、以下を再実行した。変異は残していない。

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 808 passed、5 suites、11.09秒（基準802＋新規6） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功、警告なし |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `git diff --check` | 成功 |
| 文書検査 | 設計/親2文書/本記録の4文書・相対リンク35件、fence対応・末尾改行/空白を確認（節anchor内容は未自動照合） |

## 5. 残課題

- strict tailのrecord再読/厳密検証→FinalIndex→最終clock/checkpointとtyped acknowledgement。
- 通常strictへの固定位置/source供給接続、全体work/resource受付、運用policy。
- OS上の所有/解放の真実性、実機操作、permit発行は今回の証明対象外。

AfterScanRoundだけでstrict成功や実行可能と判断しない。telemetry調査は保留のまま。

# BP-5 R-2 OL-03：準備claim・同budget結合・生成前停止伝播の合成検証

Date: 2026-10-23 / Baseline: `bd73802` / Scope: private準備claim subsetのみ、実機E2Eではない

## 1. 実装

[生成入口設計draft-0.3 §11](BEST_PRACTICE_BP5_R2_OL03_PRODUCER_CREATION_DIAGNOSTICS_DESIGN.md)に従い、既存ProtectedBridgeClaimへpreparation_startedを追加した。run_creationはbegin_slotのowner確認/最初のworkより前に元/提示budgetの準備claimを消費する。generated/used/session.startedを先取り消費しない。

非Clone/非Copy/非serdeのPreparationAttemptはfresh・供給seal・budget origin/bridge claim/session claim/startedを保持する。slot確保後、completeはattemptを値消費し、freshと同budget/Envelopeの結合・未generated/未used・inspection/checkpointを1 workで検査する。拒否位置はSupply(InspectionEntry)で、元固定discard/診断保持へ進み、create/scanは開始しない。

SharedBudget::stopのbridge記録条件をpreparation_started OR generatedへ拡張した。生成前でも第一理由がshared claimへ伝わり、待機slotの放棄診断が元理由を保持できる。prepared=false/generated=falseの旧budgetや既存生成済みbundle経路の費用は維持する。

## 2. 新規4テストと拡張回帰

| 新規テスト | 確認内容 |
|---|---|
| `preparation_claim_is_consumed_before_even_owner_begin_failure` | 残work0でownerが失敗しても準備claimは消費済み。生成・scanなし、元Limitと固定解放を保持 |
| `preparation_claim_rejects_abandoned_attempts_even_with_a_fresh_result_owner` | 準備attemptを放棄した後、新ownerから開始してもInspectionEntry/Bindingで拒否。同budgetと別budget提示による事前消費の双方を確認 |
| `preparation_failed_attempt_cannot_resume_through_a_new_owner` | 部分入力欠落・ownerのwork不足・先行HashMismatch後、新Envelope/新ownerでも同budgetは元理由で停止。追加work/scanなし |
| `prepared_budget_stop_reaches_a_waiting_slot_before_generation` | prepared=true/generated=false/session未開始で停止すると、保持したclaimへHashMismatchを即伝播。slot dropも同じ理由・SlotAbandonedを保存し、後続Bindingで上書きしない |

既存生成callerテストを次のように拡張した。

- 残work0〜17、課金後取消1〜18、開始前/課金後期限0〜18で、owner→新entry→complete→create→利用→移譲→Outer入口の各位置と理由を照合。
- 別budgetは同じclock/start値でもSupply(InspectionEntry)で拒否し、元/提示の準備claimを消費・両方を停止。既存生成claimもentryで早期拒否。
- 非Empty ownerへの再開始でも準備flagが先に消費され、new ownerへ替えても再開できない。先行の保存済み/消費済み診断は置換しない。
- 13単独欠落/13累積欠落を含む各失敗後、空の合成再試行Envelopeを新ownerへ渡しても第一理由を保持し、spentを増やさない。
- 固定field順/一度だけ破棄、held解放がtopologyより前、解放後取消/期限の実Outer保持を継続確認。
- InputLocationのprojectionは新InspectionEntryを加えた19位置を確認。attemptの非Clone/非Copy/非serde・96 bytes以下、claimの64 bytes以下を確認。

## 3. 費目・保持量

新O.supply_entry=1を課金し、新生成経路の成功は固定release直呼びより17 work（slot2＋entry1＋complete1＋create2＋利用10＋移譲1）。同fixtureの既存生成済みbundle経路との差は2であり、旧経路の差分15は維持する。新しい予算/予約を作らず、spent/retry/bytesを払い戻さない。

claimは既存Rc allocation内のprivate状態拡張で、attemptは既存Rcの参照5本をcloneするだけ。新しいheap allocation/FD/sourceを作らない。追加状態/inline保持量/参照数ピークを全体管理resourceへ統合済みとは扱わず、producer全体の8候補/動的費を認証しない。

## 4. 初回失敗・変異検証

- tracerは未実装preparation_startedを参照してコンパイル失敗した。準備claimと固定callerの前置消費を実装して通過した。
- stopの条件を旧generatedだけへ戻す変異では、生成前のclaimにHashMismatchが記録されず伝播テストが失敗した（終了101）。
- attempt.freshの検査を外す変異では、放棄済み準備をnew ownerで再利用でき、再準備拒否テストが失敗した（終了101）。
- いずれも元実装へ復元して全検証を再実行した。上限緩和・fallback・本番constructor・任意token発行口は追加していない。

## 5. 最終検証

| コマンド/確認 | 結果 |
|---|---|
| `bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 919 passed / 5 suites、失敗0（baseline915＋新規4） |
| `bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功、指摘なし |
| `bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |
| 更新MDのローカル参照 | 存在確認 |
| 通常strict.rs / records_v2.rsの差分 | なし |

## 6. 未対応・停止境界

本番producer/承認cap、context/receipt/source/policy/slot等の実供給証拠、独立resource/全体R/I/S/O受付、OS source/明示close保証は未対応。Envelope受領前の失敗や入口へ渡さないEnvelopeの放棄、panic/forget/abort/killの回収を保証しない。SequenceReturnedは通常drop列から戻った観測であり、OS close/Closed/ack/permitではない。

全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行は行わない。

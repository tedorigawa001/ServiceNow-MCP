# BP-5 R-2 OL-03：InputRejected/Outerを保持する上位結果ownerの合成検証

Date: 2026-10-23 / Baseline: `8d1b061` / Scope: private結果保持subsetのみ

## 1. 実装と停止境界

[対設計draft-0.3 §12](BEST_PRACTICE_BP5_R2_OL03_PROTECTED_BRIDGE_DIAGNOSTICS_DESIGN.md)に従い、InputRejected、StrictBridgeFailure、StrictBridgeResult、StrictResultOwnerと値消費するResultSlotを追加した。通常strict.rs・records_v2.rs・保護入力の生成/利用claim・固定releaseの呼出し経路は変更しない。固定bridgeや本番producerからの自動呼出し口はない。

ownerはEmpty→Awaiting→Retained→Consumedを一方向に進む。beginは最初のfallible work前に開始を確定し、保持済み/消費済み/待機中の再開始は新workなしで拒否する。返却後のretainはslotと結果を値消費し、追加のfallible guard/clock/checkpoint/heap確保を挟まない。takeも結果を一度だけmoveする。

InputRejectedはprimary・7種のstage・既存の解放/checkpoint観測だけで、origin/lineage Rc・参照/ポインタ値・path・raw bytes・token等を持たない。Outerは実OuterStrictFailure全体をmoveし、有限projectionとしてcleanup分類とsummary全項目をコピーできる。コピー値はClosed/ack/permitへ変換できない。

## 2. 新規9テスト

| テスト | 確認内容 |
|---|---|
| `upper_owner_stores_input_rejection_once_and_preserves_it_on_duplicate_begin` | 一度限りのslot格納、二重開始で先行primary/stage/観測を保持、一度だけtake、消費後再開始拒否 |
| `upper_begin_guard_failure_is_retained_and_cannot_restart` | work不足0/1、取消/10秒期限、先行HashMismatch、課金後取消1/2、未知modelで開始失敗をowner内へ保存。再開始でも新work/診断置換なし |
| `input_rejection_keeps_stage_observations_and_first_reason_without_post_return_work` | 全7stage＋SlotAbandoned（後続修正で追加）で先行Expired優先。release/checkpoint観測を保持し、work枯渇・取消・期限切れ後もretain/takeが元診断を失わない |
| `upper_owner_retains_real_outer_round_cleanup_and_full_summary_after_source_destruction` | 全3round×操作/hash/cleanup未確認/Quotas欠落の12条件＋Initial policy欠落。実kernelのround/phase/cleanup/全summaryが元owner/source/receipt破棄後も一致。late post-release期限失敗ではround/frameなしを保持 |
| `upper_owner_moves_only_genuine_success_and_does_not_revalidate_during_storage` | 固定releaseから得た実RecordComparisonだけをmove。一度だけ取得でき、既存UnverifiedXml gateを維持。格納に新work/checkpointなし |
| `upper_debug_output_is_fixed_and_never_contains_supplied_secret_or_diagnostic_fields` | 合成の秘密markerを未知modelへ渡してもowner/slot/InputRejected/FailureのDebugは固定文字列。待機slotのRc cloneは格納後に解放される |
| `abandoning_an_awaiting_slot_stops_original_budget_without_claiming_release` | 未格納slotのdropで元budgetを停止し、stageはowner専用のSlotAbandoned（beginのModelInputUnavailableと区別）、解放/checkpoint観測はNotReachedのまま |
| `forgetting_an_awaiting_slot_does_not_allow_another_begin` | forget後のAwaitingから再開始を拒否。格納/drop成功は主張しない |
| `upper_ownership_is_inline_move_only_and_not_serializable` | owner/slot/InputRejected/Failureの非Clone/非Copy/非serde。InputRejected≤48 bytes、Failure/owner各≤512、slot≤64 |

実kernelのCompletionDiagnosticはattempts全5区分、live、pending_cleanup、unconfirmed、retry_pending、names、peak、declared_pendingとcleanup分類を前後完全一致で比較する。元診断を理由だけで再構築していないことを確認し、未開始のCompletionFailureを新しく作らない。

実成功の格納後に取消/期限を立てる試験は、結果保持が新しい時刻検証を行わないことの確認である。過去の比較結果から現在の実行権限を与える意味ではなく、元entitlement gateや上位の必要検証を解除しない。

## 3. 費目・保持量

O.result_ownerは開始guardの2 work（不可逆開始/model1＋slot公開前1）。newのinline初期化、retain/take、有限projection、先行理由保持に追加workはなく、新規heap allocationも不要。待機slotは既存bridge/session claimのRc cloneだけを持ち、完了後に解放する。保存済みInputRejectedにはRcを持ち込まない。実Outerの既存closed会計identityは元frameの一部としてそのまま所有する。

生成/利用の既存12 work、coupling35＋K、configure1、R/I/S/typed tailと別費目であり、全体上界を認証した値ではない。projectionは固定長のコピーで、無制限な表示/外部JSON生成の費用まで証明したとはしない。

## 4. 初回失敗・変異検証

- 最初のtracer testは未実装result_ownerのimportでコンパイル失敗し、型と保存経路を追加して通過した。
- 未格納slotの放棄テストは、元budgetが停止しない状態で失敗した。待機中の元claimを保持し、drop時に元bridge claimへ停止を通知する実装で通過した。実際のOuterは必ずretainする契約であり、未提出のframeをdropから回収するものではない。
- ClippyはInputRejectedとOuterのサイズ差をlarge_enum_variantとして拒否した。Box化は失敗後allocationを要求するため、サイズ上限試験と理由付きallowを当該enumだけへ限定した。全体の警告抑制は追加していない。
- 二重開始guardを省く変異で、先行InputRejectedのReceiptBinding stageが別stageへ置換され、保持テストが失敗した（終了101）。変異を復元後、全検証を再実行した。

## 5. 最終検証

| コマンド/確認 | 結果 |
|---|---|
| `bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 902 passed / 5 suites、失敗0（baseline893＋新規9） |
| `bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功、指摘なし |
| `bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |
| 通常strict.rs / records_v2.rsの差分 | なし |

## 6. 未接続・限界

同inspectionの保護入力から固定releaseへ値移譲し、返された実結果をこのslotへ渡す固定callerは未接続である。owner単体は結果の由来や実解放を新しく証明せず、InputRejectedの観測enumも解放証拠ではない。保護producer、policy承認、全体work/resource上界、運用cap、OS source/明示解放保証は別工程。

放棄時はclaimに既に記録された先行理由を優先するが、callerがretainしなかったOuter frameや未提出の結果を回収することはできない。forget/abort/kill・戻らないDropの診断保存/解放も保証しない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行は実施しない。

# BP-5 R-2 OL-03：生成前owner・型付きcreate拒否・部分入力discardの合成検証

Date: 2026-10-23 / Baseline: `67355d8` / Scope: privateな生成失敗保持subsetのみ、実機E2Eではない

## 1. 実装範囲

[生成入口設計draft-0.2 §10](BEST_PRACTICE_BP5_R2_OL03_PRODUCER_CREATION_DIAGNOSTICS_DESIGN.md)に従い、InputLocation、CreateStage、SupplyStageとInputRejectedのlocation保持、create_typed、PreparationEnvelope/PartialPayload、生成前slot確保のrun_creationを追加した。

同budgetでslot確保→部分入力complete→型付きcreate→既存into_release→実結果retainを行い、任意callback/外部結果/別calleeを受け取らない。二重beginを避け、低水準begin_slot/retain_resultはprivateのまま。旧理由だけのcreateはcfg(test)委譲口となる。

部分入力の欠落はSupply、生成claim/modelとinspection/publicationはCreate、既存利用guardはUse、take前はTransferCommit、未提出slotの放棄はSlotAbandonedとして区別する。Supply/Createでは旧input_stage射影がNoneになり、新input_locationで位置を取得する。Noneを拒否なしと解釈しない。

型付きcreate失敗はsupplyの固定破棄後にcheckpointを観測する。partial入力も存在する値だけを固定field順で破棄し、元primary/locationを保持する。失敗後の格納/破棄観測/停止通知に新work/heap確保は要求しない。実Outerはframeをそのままmoveし、未開始round/summaryを捏造しない。

## 2. 新規8テスト

| テスト | 確認内容 |
|---|---|
| `creation_caller_reserves_owner_before_create_and_retains_real_success` | 新callerから実固定kernel/releaseまで通過し、実成功を一度take。元heldの全解放、checkpoint、旧生成済みbundle経路より1 work多いことを確認 |
| `creation_partial_inputs_are_discarded_before_a_typed_rejection_is_retained` | context/records/topology/held/source/topology source/policy/Quota3個/scan3個の13単独欠落と13累積欠落。Supply分類、生成claim未消費、scan未開始、残所有値の順序・一度だけ破棄、held解放がtopologyより前であることを確認 |
| `creation_each_guard_budget_boundary_retains_its_location_and_sticky_reason` | 残work0〜16、課金後取消1〜17、先行HashMismatch。OwnerBegin/complete/Create2点/Use10点/TransferCommit/Outer入口の正確な位置と第一理由を照合 |
| `creation_deadline_at_each_committed_guard_never_publishes_late_success` | 課金観測に結合した合成clockで、開始前〜17点目に10秒期限へ到達。正確なlocation/phaseで停止し遅延成功なし |
| `creation_foreign_inspection_and_duplicate_claim_never_start_the_release` | 別budgetはCreate(InspectionPublish)、消費済み生成claimはCreate(ClaimModel)で拒否。元/提示budget停止、scan未開始 |
| `creation_duplicate_owner_discards_new_partial_inputs_without_replacing_prior_diagnostics` | 保持済み/消費済みownerへの再開始で新入力だけを破棄。新work/生成claim消費/scan開始なし、先行ReceiptBinding/HashMismatchと観測を保持 |
| `creation_late_release_cancel_and_expiry_retain_actual_outer_failure` | records解放時の取消/期限切れを実OuterのPostReleaseCheckpointとして保持。3round完了後でも成功を返さない |
| `input_location_distinguishes_creation_and_preserves_legacy_projection_and_first_reason` | 全18位置の新/旧projection、先行Expiredの優先、work枯渇後も格納/take、固定Debugを確認 |

既存の固定caller guard回帰はUse(stage)を明示照合するよう拡張した。Envelopeの固定opaque Debugと、非Clone/非Copy/非serdeを確認する。既存InputRejected≤48 bytes、Failure/owner≤512 bytes等のサイズ試験も維持した。固定済み評価セットの入力/期待値は変更していない。

解放watchは観測だけを記録し、破棄後にassertする。単独/累積欠落のfixtureでは入口受領前に取り除いた値と、入口が所有して破棄した残りの値を分けて照合する。入力欠落を理由に同じ値を二度破棄しない。

## 3. 費目と未対応範囲

新O.preparation_complete=1 workは、固定数のOption存在検査だけである。slot2を前へ移し、create2/利用10/移譲1は維持する。既存生成済みbundle経路の実費との差1と、既存固定release直呼びとの差15を組み合わせ、今回の成功差分は16 workと確認した。元spent/retry/bytesの払い戻しはしない。

これは設計§7の8段階producerではない。準備claim、実producerの供給証拠、動的費、承認cap/本番ResourcePolicy、管理allocation/独立resource/全体work上界は未対応。Envelopeのconstructor/欠落操作はcfg(test)だけで、本番OS sourceは存在しない。completeの存在検査をregistry/context/OS identity/policyの承認証拠にしない。

## 4. 初回失敗・変異検証

- tracerは未実装preparation/run_creationのためコンパイル失敗し、最小の固定経路を追加して通過した。次の部分入力試験も未実装PartialField/removeで失敗し、合成fixture境界を追加して通過した。
- 拡張fixtureのPartialField::Scanと合成Scan型が名前衝突してコンパイル失敗した。型の参照をsuper::Scanに限定して解消した。製品側の契約変更はない。
- Clippyはand_thenの実Outer返却closureへresult_large_errを指摘した。固定match分岐でmoveし、Box化・新しいallow・診断縮退なしで解消した。
- create拒否位置をUse(ModelInputUnavailable)へ潰す変異で、境界テストが失敗した（終了101）。Create(stage)へ復元し、全検証を再実行した。

## 5. 最終検証

| コマンド/確認 | 結果 |
|---|---|
| `bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 915 passed / 5 suites、失敗0（baseline907＋新規8） |
| `bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功、指摘なし |
| `bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `bdo git -c core.fsmonitor=false diff --check` | 成功 |
| 更新MDのローカル参照 | 存在確認 |
| 通常strict.rs / records_v2.rsの差分 | なし |

## 6. 停止状態・限界

全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。通常strict差替え、OS接続、実機操作、token発行、設定変更、permit発行は行わない。

Envelope受領前の取得失敗は上流所有者の責務で、本入口が全起動失敗を回収するわけではない。外部context/registry/groups/BoundTarget/binding保持領域は上流が結果格納/returnまで保持する。SequenceReturnedはRustのdrop列から戻った観測であり、OS close成功/Closed/ack/permitではない。panic/abort/forget/killや戻らないDropの解放/診断保持を保証しない。

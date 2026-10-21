# BP-5 R-2 OL-03：private owner・3slot・継続RecordSource借用の内部契約合成検証

Date: 2026-10-21 / Baseline: `2905075` / Scope: 内部owner subset、合成sourceのみ

## 1. 対象・停止範囲

[通常strict接続設計draft-0.2 §10](BEST_PRACTICE_BP5_R2_OL03_NORMAL_STRICT_CONNECTION_DESIGN.md)の最初の実装subset。元RecordSourceをinspection全体でborrowするStrictSessionOwner、固定3slot/排他的RoundSlot、one-shot record precheck、外側停止とStrictInspectionFailureの診断移動を追加した。

全体受付は無効、telemetry調査は保留。通常strict.rsのorchestratorは差し替えず、M4 owner/位置handoff・OS sourceへは接続しない。実機操作・token発行・設定変更・本番policy投入・permit発行を行わない。実PDI・実FDやインストール済みruntimeの検証成績ではない。

## 2. 実装境界

- 唯一のsession claimを先に消費し、owner model `bp5-r2-strict-owner-0.1` と元budget identityに結合。同sourceの&mut borrowを保持し、production getter/setter/factoryを設けない。
- 3slotは固定長Option配列。利用試行前にtakeし、失敗・drop後も補充しない。ownerはCを保持するだけなので不要なScanOps boundや実操作型の公開範囲拡大はしない。inertなCの生成/Dropは前提条件。
- production-facing内部口はInitialの未完了slotまで。BeforeM4/AfterM4の位置口・正常進行setter・全体成功証拠は未提供。
- cfg(test)だけで既存の実collector→AfterScan→record厳密検証→FinalIndex→最終clock→実ackへ接続する。次slotへの遷移は同ledgerの実ack claim/状態が必要で、callbackのOkだけでは進まない。test-onlyの自由なround指定はM4実施証拠ではない。
- slot.precheck_recordsは元sourceだけで実再読・clock・厳密JSON/意味検査を実行し、最後のcheckpoint後に成功とする。
- 外側の明示停止はExpected/Taken/Finishedを含めてStoppedへ移し、先行Failureを保持する。slot中の実原因はdrop前にstop_inspectionへ渡す。単なる放棄dropではUnavailableとなり、未記録の原因を復元しない。
- StrictInspectionFailureはreason・pending/active round・実CompletionFailureのOptionをinlineに保持する。実Closed/summaryをmoveするprivateな診断口は成功/permit producerではなく、外側失敗で過去のcleanup証拠を再構築しない。

## 3. 新規11テスト

| テスト | 確認範囲 |
|---|---|
| same_record_source_and_three_inert_slots_survive_actual_ack_pipeline | 同じreader instanceの全操作、実ackを通す3slot、record再読cycle6、一時handle取得/解放の一致、inert各slotの一度だけのDrop。借用元readerはowner後まで生存 |
| outer_failure_after_finished_and_actual_tail_diagnostics_are_preserved | Finished後のReadFailedを停止し二次Changedで上書きしない。実tail失敗のConfirmed cleanup/summaryを移動。外側失敗には偽cleanupを付けない |
| synthetic_callback_ok_cannot_substitute_for_typed_ack | 未実行のcallback OkをBindingで拒否 |
| unprovided_policy_never_turns_into_default_operational_caps | 合成policyをconfigureしない場合はUnavailable/NotStarted、scan操作0、summaryなし。運用capを自動生成しない |
| creation_model_and_each_work_prefix_stop_without_record_io | model不一致、残work 0〜3。unique claimは消費済み、source I/Oなし、3slot破棄 |
| every_creation_checkpoint_and_post_charge_cancel_consumes_unique_claim | constructor全10checkpointの期限、全4課金後取消、別sourceを使う重複生成の拒否 |
| slot_binding_order_and_each_budget_boundary_fail_closed | 別origin/claim/started・誤round・先行Changed、残work 0/1、全2課金後取消、全6checkpoint期限。拒否後の再開/source I/Oなし |
| unconsumed_slot_drop_forget_and_record_precheck_failure_block_restart | slot drop/forget、二重precheck、clock取得失敗/遅延取消/期限、slot保持中の明示停止。先行理由と再開拒否 |
| outer_stop_before_slot_consumption_preserves_first_failure | Initial前の明示ReadFailed、後続取得の拒否 |
| owner_slot_and_diagnostics_are_opaque_noncopy_nonserde_values | owner/slot/診断がClone/Copy/Serialize/DeserializeOwnedを実装しない。診断inline sizeは256 bytes以下 |
| owner_precheck_adds_only_two_guard_work_to_the_actual_record_path | 同じ実R関数を呼ぶ基準経路との差分2 work、共有bytes/操作/retryの非二重計上、最終課金後取消で停止 |

record fixtureは架空の厳密activation/ledger/registryと既存の合成source。instance計数と借用構造は同じRecordSource値の継続使用の検証であり、実装内部の物理FD同一性・実OSの解放証明ではない。opaque Debugの固定値も確認し、動的な資格情報/コード本文を診断へ付けない。

forget試験はinert slotを意図的に忘却するため、そのslotのDropは0回、未使用2slotは各1回となる。解放確認済みとは判定せず、Taken状態とunique claimにより再開できないことを確認する。実OS handleを忘却する試験ではない。

## 4. 費目

既存session_create=2 workにO.connection_create=2を追加しconstructor計4。O.slot_take=2/round、O.owner_record_guard=2/roundで、3roundなら本subsetの追加分は14 work。既存R/scan_ops/typed tail/ack費は維持し、操作/byte/retryをownerで二重課金しない。停止/放棄には新しいwork/I/Oを要求せず、枠枯渇後も元理由を保持する。

通常kernel・M4位置/handoff・全体終了guardの費用は含まない。これは全体受付に使える確定上界ではなく、CPU時間やRSSの保証でもない。未承認capをこの差分から作らない。

## 5. 初回の問題・変異検証

初回checkではprivate ScanOpsよりowner型の可視性が広い警告が出た。保持subsetに不要なScanOps boundを除き、trait/操作型を広げずに解消。最初のtest compileではscan側Kindとrecord側Kindが衝突したためRecordKind aliasで明示した。clippyはtest-only take wrapperの大型Errを検出したが、失敗後にheap確保しない既存方針に合わせて局所allowと固定サイズ検査を使用した。

1. owner.stop_inspectionでledger/budgetの停止を一時的に省略した。Finished後の失敗試験で `Ok(())` と `Err(ReadFailed)` の不一致を検知（exit 101）。停止処理へ復元した。
2. owner-bound record再読を一時的に省略した。同source/3slot試験で再読cycleが3となり期待6に反して失敗（exit 101）。実再読へ復元した。

一時変異は恒久コードへ残さず、復元後の全テストを実行した。これらは既存合成fixtureを使用した契約試験で、独立した人手評価や未知コードへの検出性能試験ではない。

## 6. 復元後の検証

- `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`：847 passed、5 suites（基準836＋新規11）。
- `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings`：指摘なし。
- `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml`：成功。
- `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check`、`git diff --check`：成功。
- 更新4文書・相対リンク43件のリンク先、コードフェンス、末尾改行、行末空白を確認。

## 7. 未対応

固定BeforeM4Position／AfterM4Handoff、B/topology recheck/M4の実位置との結合、通常strictの固定kernelと同source/3slot供給の本接続、上位診断結果の契約、接続用O費を含む全体work/resource上界・運用policy/cap承認は別工程。今回のconstructorはvalidate_receipt/外側clock成功や実運用の信頼元を認証した証拠ではない。全体受付・OS source・permitを有効にしない。
